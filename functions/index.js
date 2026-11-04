const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });
const db = admin.firestore();
const FS = admin.firestore.FieldValue;

const digits = (s) => String(s || '').replace(/\D/g, '');
const driverEmail = (phone) => `${digits(phone)}@driver.mishloach.app`;
const newCode = () => String(crypto.randomInt(100000, 1000000));
const money = (n) => '₪' + Number(n || 0).toLocaleString('he-IL');

async function requireManager(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'not signed in');
  const m = await db.collection('managers').doc(req.auth.uid).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'not a manager');
}

// החשבון הראשון שנרשם הופך למנהל; אחריו אי אפשר להירשם כמנהל
exports.claimFirstManager = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'not signed in');
  const lock = db.collection('meta').doc('managerClaim');
  await db.runTransaction(async (t) => {
    if ((await t.get(lock)).exists) throw new HttpsError('already-exists', 'manager-exists');
    t.set(lock, { uid: req.auth.uid, at: FS.serverTimestamp() });
    t.set(db.collection('managers').doc(req.auth.uid), { email: req.auth.token.email || '', at: FS.serverTimestamp() });
  });
  return { ok: true };
});

exports.createDriver = onCall(async (req) => {
  await requireManager(req);
  const { name, phone, areaId } = req.data || {};
  const num = digits(phone);
  if (!name || !/^\d{9,10}$/.test(num) || !areaId) throw new HttpsError('invalid-argument', 'bad input');
  const code = newCode();
  let user;
  try {
    user = await admin.auth().createUser({ email: driverEmail(num), password: code, displayName: name });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'exists');
    throw e;
  }
  await db.collection('drivers').doc(user.uid).set({ name, phone, areaId, createdAt: FS.serverTimestamp() });
  return { code };
});

exports.resetDriverCode = onCall(async (req) => {
  await requireManager(req);
  const code = newCode();
  await admin.auth().updateUser(req.data.id, { password: code });
  await admin.auth().revokeRefreshTokens(req.data.id);
  return { code };
});

exports.deleteDriver = onCall(async (req) => {
  await requireManager(req);
  const id = req.data.id;
  const open = await db.collection('orders').where('driverId', '==', id).where('status', '==', 'sent').limit(1).get();
  if (!open.empty) throw new HttpsError('failed-precondition', 'open orders');
  await admin.auth().deleteUser(id).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  await db.collection('drivers').doc(id).delete();
  await db.collection('tokens').doc(id).delete();
  return { ok: true };
});

async function pushTo(uids, title, body, path) {
  const docs = await Promise.all(uids.map((u) => db.collection('tokens').doc(u).get()));
  const owners = [];
  docs.forEach((d) => (d.exists ? d.data().list || [] : []).forEach((t) => owners.push({ uid: d.id, token: t })));
  if (!owners.length) return;
  const host = process.env.GCLOUD_PROJECT + '.web.app';
  const res = await admin.messaging().sendEachForMulticast({
    tokens: owners.map((o) => o.token),
    notification: { title, body },
    android: { priority: 'high', notification: { channelId: 'deliveries', sound: 'default' } },
    webpush: {
      notification: { icon: `/${path}/icon-192.png`, dir: 'rtl', lang: 'he' },
      fcmOptions: { link: `https://${host}/${path}/` }
    }
  });
  // ניקוי מכשירים שכבר לא רשומים
  await Promise.all(res.responses.map((r, i) => {
    const c = r.error && r.error.code;
    if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') {
      return db.collection('tokens').doc(owners[i].uid).update({ list: FS.arrayRemove(owners[i].token) });
    }
    return null;
  }));
}

// מנהל שלח הזמנות: פוש לנהג
exports.onDispatch = onDocumentCreated('dispatches/{id}', async (event) => {
  const d = event.data.data();
  const orders = await Promise.all(d.orderIds.map((id) => db.collection('orders').doc(id).get()));
  const total = orders.reduce((s, o) => s + (o.exists ? o.data().amount : 0), 0);
  await pushTo([d.driverId], `${d.orderIds.length} משלוחים חדשים`, `${money(total)} לגבייה`, 'driver');
});

// נהג סיים משלוח: פוש למנהלים
exports.onOrderDone = onDocumentUpdated('orders/{id}', async (event) => {
  const b = event.data.before.data(), a = event.data.after.data();
  if (b.status !== 'sent' || !['paid', 'failed'].includes(a.status)) return;
  const managers = await db.collection('managers').get();
  const title = a.status === 'paid' ? `נמסר ושולם · ${money(a.amount)}` : 'לא נמסר';
  const body = a.status === 'paid' ? `${a.driverName} מסר ל${a.customer} ב${a.city}` : `${a.driverName} · ${a.customer} · ${a.failReason || ''}`;
  await pushTo(managers.docs.map((m) => m.id), title, body, 'manager');
});
