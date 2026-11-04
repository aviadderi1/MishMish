// שרת הפוש של MishMish: רץ ב-Cloudflare Workers ושולח התראות דרך Firebase Cloud Messaging.
// צריך משתנה סודי אחד בשם SERVICE_ACCOUNT: התוכן המלא של קובץ המפתח מ-Firebase.
const API_KEY = 'AIzaSyCwdsW_MKfKDXvRLIlfRiA4Zn52Qpg0iCc';
const BUSINESS_EMAIL = 'business@mishmish.app';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const money = (n) => '₪' + Number(n || 0).toLocaleString('he-IL');
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlText(JSON.stringify({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore'
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claim}.${b64url(sig)}`
  });
  if (!r.ok) throw new Error('google token ' + r.status);
  return (await r.json()).access_token;
}

// רק מי שנכנס עם חשבון העסק יכול לבקש שליחה
async function isBusiness(idToken) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
  });
  if (!r.ok) return false;
  const u = (await r.json()).users;
  return !!(u && u[0] && u[0].email === BUSINESS_EMAIL);
}

const val = (f) => (!f ? undefined : f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : f.doubleValue));

async function pushTo(ctx, key, title, body) {
  const base = `https://firestore.googleapis.com/v1/projects/${ctx.project}/databases/(default)/documents`;
  const auth = { Authorization: `Bearer ${ctx.token}` };
  const doc = await fetch(`${base}/tokens/${encodeURIComponent(key)}`, { headers: auth });
  if (!doc.ok) return 0;
  const f = (await doc.json()).fields || {};
  const tokens = ((f.list && f.list.arrayValue && f.list.arrayValue.values) || []).map((v) => v.stringValue);
  let sent = 0;
  for (const t of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${ctx.project}/messages:send`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: t, notification: { title, body }, android: { priority: 'HIGH', notification: { channel_id: 'deliveries', default_sound: true } } } })
    });
    if (r.ok) sent++;
    else if (r.status === 404) { // מכשיר שכבר לא רשום
      await fetch(`${base}:commit`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes: [{ transform: { document: `projects/${ctx.project}/databases/(default)/documents/tokens/${key}`, fieldTransforms: [{ fieldPath: 'list', removeAllFromArray: { values: [{ stringValue: t }] } }] } }] })
      });
    }
  }
  return sent;
}

async function readOrder(ctx, id) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${ctx.project}/databases/(default)/documents/orders/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${ctx.token}` } });
  return r.ok ? (await r.json()).fields || null : null;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return reply(200, { ok: true, service: 'mishmish-push', configured: !!env.SERVICE_ACCOUNT });
    try {
      const id = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
      if (!id || !(await isBusiness(id))) return reply(401, { error: 'unauthorized' });
      const sa = JSON.parse(env.SERVICE_ACCOUNT);
      const ctx = { project: sa.project_id, token: await googleToken(sa) };
      const d = await req.json();
      if (d.kind === 'dispatch') {
        const ids = (d.orderIds || []).slice(0, 100);
        const orders = await Promise.all(ids.map((o) => readOrder(ctx, o)));
        const total = orders.reduce((s, o) => s + (o ? val(o.amount) || 0 : 0), 0);
        const title = ids.length === 1 ? 'משלוח חדש' : `${ids.length} משלוחים חדשים`;
        return reply(200, { sent: await pushTo(ctx, d.driverId, title, `${money(total)} לגבייה`) });
      }
      if (d.kind === 'done') {
        const o = await readOrder(ctx, d.orderId);
        if (!o) return reply(404, { error: 'order not found' });
        const paid = val(o.status) === 'paid';
        const title = paid ? `נמסר ושולם · ${money(val(o.amount))}` : 'לא נמסר';
        const body = paid ? `${val(o.driverName)} מסר ל${val(o.customer)} ב${val(o.city)}` : `${val(o.driverName)} · ${val(o.customer)} · ${val(o.failReason) || ''}`;
        return reply(200, { sent: await pushTo(ctx, 'manager', title, body) });
      }
      if (d.kind === 'report') {
        const r = await fetch(`https://firestore.googleapis.com/v1/projects/${ctx.project}/databases/(default)/documents/reports/${encodeURIComponent(d.reportId)}`, { headers: { Authorization: `Bearer ${ctx.token}` } });
        if (!r.ok) return reply(404, { error: 'report not found' });
        const f = (await r.json()).fields || {};
        const expected = val(f.expected) ?? val(f.collected);
        const diff = val(f.counted) - expected;
        const tail = diff ? ` · ${diff < 0 ? 'חסרים' : 'עודף'} ${money(Math.abs(diff))}` : '';
        return reply(200, { sent: await pushTo(ctx, 'manager', `דוח יום מ${val(f.driverName)}`, `להעברה ${money(expected)} · נספרו ${money(val(f.counted))}${tail}`) });
      }
      return reply(400, { error: 'unknown kind' });
    } catch (e) {
      console.error(e);
      return reply(500, { error: String(e.message || e) });
    }
  }
};
