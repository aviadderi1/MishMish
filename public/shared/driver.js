// אפליקציית הנהג
(function (g) {
  const { esc, money, prod } = g.UI;
  const REASONS = ['הלקוח לא נמצא', 'הלקוח לא ענה', 'הלקוח סירב', 'כתובת שגויה', 'אחר'];

  g.mountDriver = function (root, db) {
    root.classList.add('app', 'drv');
    const ID_KEY = 'mishmish-driver-id';
    const readId = () => { try { return localStorage.getItem(ID_KEY); } catch (e) { return null; } };
    const st = { user: undefined, driverId: readId(), drivers: [], me: null, orders: [], reports: [], routes: {}, routing: null, settings: false, startDraft: null, open: null, close: null, cash: null, password: db.demo ? '123456' : '', err: '', busy: false };
    let unsub = [];

    const DEFAULT_START = 'ציפורן 4, עפולה';
    const startOf = () => (st.me && st.me.startAddress) || DEFAULT_START;
    const store = {
      get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* עד הסגירה */ } }
    };
    const routeKey = (day) => `mishmish-route-${st.driverId}-${day}`;
    const routeOf = (day) => st.routes[day] || (st.routes[day] = store.get(routeKey(day)));
    const openOf = (day) => {
      const os = st.orders.filter((o) => o.day === day && o.status === 'sent');
      const r = routeOf(day);
      if (!r) return os;
      const rank = (o) => { const i = r.ids.indexOf(o.id); return i < 0 ? 1e6 : i; };
      return os.sort((a, b) => rank(a) - rank(b));
    };
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    let lastGeo = 0;
    async function geocode(address) {
      const cache = store.get('mishmish-geo') || {};
      if (cache[address]) return cache[address];
      const wait = 1100 - (Date.now() - lastGeo); // שירות המפות מאפשר בקשה אחת בשנייה
      if (wait > 0) await sleep(wait);
      lastGeo = Date.now();
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&accept-language=he&q=${encodeURIComponent(address)}`);
      if (!r.ok) throw new Error('geo ' + r.status);
      const j = await r.json();
      if (!j.length) return null;
      cache[address] = [Number(j[0].lon), Number(j[0].lat)];
      store.set('mishmish-geo', cache);
      return cache[address];
    }
    async function planRoute(day) {
      const os = st.orders.filter((o) => o.day === day && o.status === 'sent');
      if (!os.length || st.routing) return;
      st.routing = day; draw();
      try {
        const start = startOf();
        const from = await geocode(start);
        if (!from) { g.UI.toast(root, 'נקודת היציאה לא נמצאה במפה', 'בדוק אותה בהגדרות'); return; }
        const found = [], missing = [];
        for (const o of os) {
          const c = o.address ? await geocode(`${o.address}, ${o.city}`) : null;
          if (c) found.push({ id: o.id, c }); else missing.push(o.id);
        }
        if (!found.length) { g.UI.toast(root, 'אף כתובת לא נמצאה במפה', 'בדוק את הכתובות בהזמנות'); return; }
        const coords = [from].concat(found.map((f) => f.c)).map((c) => c.join(',')).join(';');
        const r = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&destination=any&roundtrip=false&overview=false`);
        const j = await r.json();
        if (j.code !== 'Ok') throw new Error('route ' + j.code);
        const legs = j.trips[0].legs;
        const ordered = found.map((f, i) => ({ id: f.id, at: j.waypoints[i + 1].waypoint_index })).sort((a, b) => a.at - b.at);
        const legKm = {};
        ordered.forEach((x) => { legKm[x.id] = Math.round(legs[x.at - 1].distance / 1000); });
        st.routes[day] = { ids: ordered.map((x) => x.id).concat(missing), legKm, missing, km: Math.round(j.trips[0].distance / 1000), start };
        store.set(routeKey(day), st.routes[day]);
      } catch (e) {
        console.error(e);
        g.UI.toast(root, 'המסלול לא חושב', 'בדוק אינטרנט ונסה שוב');
      } finally {
        st.routing = null; draw();
      }
    }

    const hiddenTel = (phone) => `tel:%2331%23${db.digits(phone)}`; // #31# = חיוג מחסוי
    const waze = (o) => `https://waze.com/ul?q=${encodeURIComponent([o.address, o.city].filter(Boolean).join(', '))}&navigate=yes`;

    function loginView() {
      return `<header class="hdr"><h1>כניסה</h1><div class="sub">הזן את סיסמת העסק שקיבלת מהמנהל. היא תתבקש פעם אחת בלבד</div></header>
      <form class="main" data-submit="login">
        ${st.err ? `<div class="err" role="alert">${esc(st.err)}</div>` : ''}
        <div class="field"><label for="dpass-l">סיסמת העסק</label><input id="dpass-l" data-f="password" type="password" dir="ltr" value="${esc(st.password)}" autocomplete="current-password"></div>
        <button class="btn" type="submit" ${st.busy ? 'disabled' : ''}>כניסה</button>
      </form>`;
    }

    function pickView() {
      return `<header class="hdr"><h1>מי אתה?</h1><div class="sub">בחר את השם שלך. האפליקציה תזכור אותו</div></header>
      <main class="main">
        ${st.drivers.length ? st.drivers.map((d) => `<button type="button" class="stop" data-a="pick" data-v="${esc(d.id)}"><span style="font-size:20px;font-weight:700">${esc(d.name)}</span><span class="mut" dir="ltr" style="text-align:right">${esc(d.phone)}</span></button>`).join('')
          : '<div class="empty">עדיין אין נהגים. בקש מהמנהל להוסיף אותך.</div>'}
      </main>`;
    }

    const dateLabel = (day) => new Date(day + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const reportOf = (day) => st.reports.find((r) => r.day === day);

    function listView() {
      const pushOff = !db.demo && db.pushSupported() && db.pushState() !== 'granted';
      const today = db.today();
      const days = [...new Set(st.orders.map((o) => o.day).concat(st.reports.map((r) => r.day)))].sort().reverse();
      const rank = { sent: 0, paid: 1, failed: 2 };
      const group = (day) => {
        const route = routeOf(day);
        const openNow = openOf(day);
        const firstOpen = openNow.length ? openNow[0].id : null;
        const os = openNow.concat(st.orders.filter((o) => o.day === day && o.status !== 'sent').sort((a, b) => rank[a.status] - rank[b.status]));
        const rep = reportOf(day);
        const got = os.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amount, 0);
        return `<section style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
          <div class="row" style="align-items:baseline"><h2 style="font-size:17px;color:#F2A33A">${dateLabel(day)}</h2><span class="mut">${rep ? 'נספר ' + money(rep.counted) : money(got)}</span></div>
          ${rep && rep.payment != null ? `<div class="card" style="border:2px solid #5BD29A;display:flex;justify-content:space-between;align-items:center;padding:12px 14px"><span style="font-weight:600">תשלום מנהל</span><b style="font-size:22px;color:#5BD29A">${money(rep.payment)}</b></div>` : ''}
          ${openNow.length ? `<button class="btn" style="min-height:54px;font-size:17px;font-weight:700" type="button" data-a="plan" data-v="${day}" ${st.routing ? 'disabled' : ''}>${st.routing === day ? 'מחשב מסלול...' : 'תכנן נסיעה'}</button>` : ''}
          ${route && openNow.length ? `<div class="row" style="font-size:14px;color:#D5DED8"><span>יציאה: ${esc(route.start)}</span><b>מסלול של ${route.km} ק"מ</b></div>` : ''}
          ${os.map((o) => o.status === 'sent'
            ? `<button type="button" class="stop ${o.id === firstOpen ? 'next' : ''}" data-a="open" data-v="${esc(o.id)}">
                <span class="row" style="align-items:baseline"><span style="font-size:20px;font-weight:700">${route && route.legKm[o.id] != null ? `<span class="rnum">${route.ids.indexOf(o.id) + 1}</span>` : ''}${esc(o.customer)}</span><span class="amt">${money(o.amount)}</span></span>
                <span style="color:#D5DED8">${esc([o.address, o.city].filter(Boolean).join(', '))}</span>
                <span class="mut" style="font-size:15px">${esc(prod(o))}</span>
                ${route && route.legKm[o.id] != null ? `<span class="mut" style="font-size:13px">${route.legKm[o.id]} ק"מ מ${route.ids[0] === o.id ? 'נקודת היציאה' : 'העצירה הקודמת'}</span>` : ''}
                ${route && route.missing.includes(o.id) ? '<span style="font-size:14px;color:#F4D7A8">הכתובת לא נמצאה במפה, לכן הלקוח בסוף הרשימה</span>' : ''}</button>`
            : `<div class="stop isdone" style="cursor:default;opacity:1"><span class="row"><span style="font-weight:600">${esc(o.customer)}</span><span style="font-weight:700">${money(o.amount)}</span></span>
                <span class="row"><span class="mut">${esc(o.city)}</span><span style="font-size:13px;color:${o.status === 'paid' ? '#5BD29A' : '#F2A33A'}">${o.status === 'paid' ? 'שולם' : 'לא נמסר' + (o.failReason ? ' · ' + esc(o.failReason) : '')}</span></span>
                ${rep && rep.approved
                  ? (o.fee ? `<span class="mut">משלוח: ${money(o.fee)}</span>` : '')
                  : `<button type="button" class="btn ghost" style="color:#F2A33A;border-color:#F2A33A;min-height:44px" data-a="fee" data-v="${esc(o.id)}">${o.fee ? `משלוח: ${money(o.fee)} · עריכה` : 'משלוח'}</button>`}</div>`).join('')}
          ${os.some((o) => o.status !== 'sent') ? `<button class="btn ghost" style="min-height:44px;color:#F2A33A;border-color:#F2A33A" type="button" data-a="dayFees" data-v="${day}">סך מחיר המשלוחים של היום</button>` : ''}
          ${rep && rep.approved ? '<div class="mut">הדוח אושר על ידי המנהל</div>' : ''}
          ${day !== today && os.length && !(rep && rep.approved) ? `<button class="btn ghost" type="button" data-a="closeDay" data-v="${day}">${rep ? 'עדכון הסיכום של היום הזה' : 'שליחת סיכום ליום הזה'}</button>` : ''}
        </section>`;
      };
      const todayOrders = st.orders.filter((o) => o.day === today);
      const todayRep = reportOf(today);
      return `<header class="hdr"><div class="row"><div><div class="sub" style="font-size:16px">שלום ${esc((st.me && st.me.name) || '')}</div><h1>המשלוחים שלי</h1></div>
        <button class="btn hdrbtn" style="width:48px;padding:0;display:flex;align-items:center;justify-content:center;border-color:#2E4139" type="button" data-a="settings" aria-label="הגדרות"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"></path></svg></button></div></header>
      <main class="main" style="gap:16px">
        ${pushOff ? '<div class="card pad"><div>הפעל התראות כדי לדעת מיד כשמגיעים משלוחים חדשים.</div><button class="btn small" type="button" data-a="enablePush">הפעלת התראות</button></div>' : ''}
        ${days.length ? days.map(group).join('') : '<div class="empty">אין לך משלוחים כרגע.<br>כשהמנהל ישלח לך, הם יופיעו כאן.</div>'}
      </main>
      ${todayOrders.length && !(todayRep && todayRep.approved) ? `<div class="footer" style="background:transparent"><button class="btn" style="min-height:58px;font-size:18px;font-weight:700" type="button" data-a="closeDay" data-v="${today}">${todayRep ? 'עדכון הסיכום ושליחה מחדש' : 'סיום יום וספירת כסף'}</button></div>` : ''}`;
    }

    function settingsView() {
      return `<header class="hdr"><div class="row"><h1>הגדרות</h1><button class="btn hdrbtn" style="border-color:#2E4139" type="button" data-a="settingsBack">חזרה</button></div></header>
      <main class="main">
        <form class="card pad" data-submit="start"><h2 style="font-size:17px">נקודת מוצא</h2>
          <div class="field"><label for="startaddr">הכתובת שממנה המסלול מתחיל</label><input id="startaddr" data-f="start" value="${esc(st.startDraft != null ? st.startDraft : startOf())}" autocomplete="off"></div>
          <button class="btn ghost" style="color:#F2A33A;border-color:#F2A33A" type="submit">שמירת נקודת המוצא</button></form>
        <section class="card pad"><h2 style="font-size:17px">מחיקת הנתונים שלי</h2>
          <div class="mut">מוחק מהאפליקציה שלך משלוחים שנסגרו ודוחות. אצל המנהל הם נשארים.</div>
          <button class="btn ghost" style="color:#F2A33A;border-color:#F2A33A" type="button" data-a="clearAsk">מחיקת הנתונים שלי</button></section>
        <button class="link" type="button" data-a="switchDriver">לא ${esc((st.me && st.me.name) || 'אתה')}? החלפת נהג</button>
      </main>`;
    }

    function closeNumbers() {
      const os = st.orders.filter((o) => o.day === st.close.day);
      const paid = os.filter((o) => o.status === 'paid');
      const collected = paid.reduce((s, o) => s + o.amount, 0);
      const fees = os.reduce((s, o) => s + (o.fee || 0), 0);
      return { os, paid, failed: os.filter((o) => o.status === 'failed'), open: os.filter((o) => o.status === 'sent'), collected, fees };
    }

    function closeView() {
      const c = st.close, n = closeNumbers();
      const counted = Number(String(c.counted).replace(/[^\d.]/g, ''));
      const has = String(c.counted).trim() !== '' && !Number.isNaN(counted);
      const diff = counted - n.collected;
      return `<header class="hdr"><div class="row"><div class="sub">${dateLabel(c.day)}</div><button class="btn hdrbtn" type="button" data-a="closeBack">חזרה</button></div><h1>סיכום יום</h1></header>
      <main class="main">
        ${st.err ? `<div class="err" role="alert">${esc(st.err)}</div>` : ''}
        <section class="card pad" style="gap:10px;padding:16px">
          <div class="row"><span style="color:#D5DED8">נמסרו</span><b>${n.paid.length} משלוחים</b></div>
          <div class="row"><span style="color:#D5DED8">לא נמסרו</span><b>${n.failed.length + n.open.length}</b></div>
          <div class="row"><span style="color:#D5DED8">מחיר משלוחים (לא מקוזז)</span><b>${money(n.fees)}</b></div>
          <div class="row" style="align-items:baseline;border-top:1px solid var(--line);padding-top:10px"><span style="color:#D5DED8">צריך להיות אצלך</span><b style="font-size:26px">${money(n.collected)}</b></div>
        </section>
        ${n.open.length ? `<div class="err" role="status">עדיין יש ${n.open.length} משלוחים פתוחים. הם יופיעו בדוח כלא הושלמו.</div>` : ''}
        <div class="field"><label for="counted" style="font-size:17px;font-weight:600">כמה כסף ספרת? (₪)</label><input id="counted" class="big" style="height:68px;font-size:32px;border-color:#F2A33A" data-f="counted" inputmode="decimal" value="${esc(c.counted)}" autocomplete="off"></div>
        <button class="btn ghost" style="color:#F2A33A;border-color:#F2A33A" type="button" data-a="openCash">ספירה עם טבלת שטרות</button>
        ${has ? (diff === 0 ? '<div class="tag" role="status" style="padding:12px 14px;font-size:16px">הסכום תואם</div>' : `<div class="err" role="status" style="font-size:16px;font-weight:600">${diff < 0 ? 'חסרים' : 'יש עודף של'} ${money(Math.abs(diff))} לעומת הסכום שנגבה</div>`) : ''}
        <div class="field"><label for="cnote">הערה למנהל (לא חובה)</label><input id="cnote" data-f="note" value="${esc(c.note)}" autocomplete="off"></div>
      </main>
      <div class="footer" style="background:transparent;padding-bottom:18px"><button class="btn done" style="min-height:64px;font-size:20px" type="button" data-a="sendReport" ${st.busy ? 'disabled' : ''}>${reportOf(c.day) ? 'שליחה מחדש למנהל' : 'שליחת הסיכום למנהל'}</button></div>`;
    }

    const NOTES = [[200, '#1F5FA8'], [100, '#B8660F'], [50, '#23784F'], [20, '#B3363A']];
    function cashView() {
      const c = st.cash;
      const total = NOTES.reduce((s, [v]) => s + v * c[v], 0);
      return `<header class="hdr"><div class="row"><h1>טבלת כסף</h1><button class="btn hdrbtn" type="button" data-a="cashBack">חזרה</button></div><div class="sub">לחיצה על שטר מוסיפה אותו לספירה</div></header>
      <main class="main" style="gap:10px">
        ${NOTES.map(([v, color]) => `<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <button type="button" class="note" data-a="noteAdd" data-v="${v}" aria-label="הוספת שטר ${v} שקלים" style="background:${color}">
            <i class="n1"></i><i class="n2"></i><i class="n3"></i><b>${v}</b><span>שקלים</span></button>
          <div class="note-side"><b>× ${c[v]}</b><span class="mut">${money(v * c[v])}</span><button type="button" data-a="noteSub" data-v="${v}" aria-label="הורדת שטר ${v}">−</button></div>
        </div>`).join('')}
      </main>
      <div class="footer" style="background:transparent;padding-bottom:18px">
        <div class="row" style="align-items:baseline"><span style="font-size:17px;color:#D5DED8">סך הכול</span><b style="font-size:34px;color:#F2A33A">${money(total)}</b></div>
        <button class="btn done" style="min-height:60px;font-size:19px" type="button" data-a="cashApply">אישור והעברה לספירה</button>
      </div>`;
    }

    function detailView(o) {
      const open = openOf(o.day);
      const idx = open.findIndex((x) => x.id === o.id);
      return `<header class="hdr"><div class="row"><div class="sub">משלוח ${idx + 1} מתוך ${open.length}</div><button class="btn hdrbtn" type="button" data-a="back">לרשימה</button></div>
        <h1 style="font-size:32px">${esc(o.customer)}</h1><div style="font-size:18px;color:#D5DED8">${esc([o.address, o.city].filter(Boolean).join(', '))}</div></header>
      <main class="main">
        <div class="acts"><a class="act" id="call" href="${hiddenTel(o.phone)}">חיוג מחסוי</a><a class="act" href="${waze(o)}" target="_blank" rel="noopener">ניווט</a></div>
        <section class="card pad"><div class="mut" style="font-size:15px">למסור ללקוח</div><div style="font-size:22px;font-weight:600">${esc(prod(o))}</div></section>
        <section class="collect"><div style="font-size:16px;font-weight:600">לגבות במזומן</div><b>${money(o.amount)}</b></section>
      </main>
      <div class="footer" style="background:transparent;border:0;padding-bottom:18px">
        <button class="btn done" type="button" data-a="paid" ${st.busy ? 'disabled' : ''}>בוצע ושולם</button>
        <button class="btn ghost" type="button" data-a="fail">לא נמסר – דיווח למנהל</button>
      </div>`;
    }

    function draw() {
      if (st.user === undefined) return;
      const o = st.open && st.orders.find((x) => x.id === st.open && x.status === 'sent');
      const v = !st.user ? loginView() : !st.driverId ? pickView() : st.settings ? settingsView() : st.cash ? cashView() : st.close ? closeView() : o ? detailView(o) : listView();
      g.UI.render(root, (db.demo ? '<div class="demo">מצב הדגמה</div>' : '') + v);
    }

    function celebrate() {
      const c = document.createElement('div');
      c.className = 'celebrate'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true');
      const colors = ['#F2A33A', '#5BD29A', '#FFFFFF', '#6FB2F2', '#F2788A'];
      let bits = '';
      for (let i = 0; i < 36; i++) {
        bits += `<i aria-hidden="true" style="left:${(i * 37) % 100}%;background:${colors[i % 5]};animation-duration:${2.4 + (i % 5) * 0.4}s;animation-delay:-${(i % 7) * 0.5}s"></i>`;
      }
      c.innerHTML = `${bits}<div class="cel-box"><svg aria-hidden="true" width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="#F2A33A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M7 12.5l3.5 3.5L17 9"></path></svg>
        <h1>כל הכבוד!</h1><p>סיימת את היום בהצלחה,<br>המשך יום מקסים</p></div><button type="button" class="btn" data-c="1">תודה</button>`;
      c.addEventListener('click', (e) => { if (e.target.closest('[data-c]')) c.remove(); });
      root.appendChild(c);
    }

    const actions = {
      open(v) { st.open = v; draw(); const m = root.querySelector('.main'); if (m) m.scrollTop = 0; },
      back() { st.open = null; draw(); },
      paid() {
        const o = st.orders.find((x) => x.id === st.open);
        g.UI.sheet(root, `<h2>קיבלת ${money(o.amount)} במזומן?</h2><p class="mut">${esc(o.customer)} · ${esc(prod(o))}. המנהל יקבל הודעה מיד.</p>
          <button class="btn done" data-s="yes" style="min-height:60px;font-size:20px">כן, נמסר ושולם</button><button class="btn ghost" data-s="close">עוד לא</button>`, async () => {
          st.busy = true; draw();
          try {
            const lastOne = !st.orders.some((x) => x.status === 'sent' && x.id !== o.id);
            await db.markPaid(o.id); st.open = null;
            if (lastOne) celebrate(); else g.UI.toast(root, 'נשמר', `${o.customer} · ${money(o.amount)}`);
          }
          catch (e) { console.error(e); g.UI.toast(root, 'השמירה נכשלה', `נסה שוב (${(e && (e.code || e.message)) || 'לא ידוע'})`); }
          st.busy = false; draw();
        });
      },
      fail() {
        const o = st.orders.find((x) => x.id === st.open);
        g.UI.sheet(root, `<h2>למה לא נמסר?</h2>${REASONS.map((r, i) => `<button class="btn ghost" data-s="${i}">${r}</button>`).join('')}<button class="link" data-s="close">ביטול</button>`, async (i) => {
          try { await db.markFailed(o.id, REASONS[i]); st.open = null; } catch (e) { console.error(e); g.UI.toast(root, 'השמירה נכשלה', `נסה שוב (${(e && (e.code || e.message)) || 'לא ידוע'})`); }
          draw();
        });
      },
      settings() { st.settings = true; st.startDraft = null; draw(); },
      plan(day) { planRoute(day); },
      settingsBack() { st.settings = false; draw(); },
      clearAsk() {
        g.UI.sheet(root, `<h2 style="color:#F2A33A">למחוק את הנתונים שלך?</h2><div style="line-height:1.5">משלוחים שנסגרו והדוחות שלך יימחקו מהאפליקציה שלך. <b>אי אפשר לשחזר אותם.</b></div>
          <div class="mut">משלוחים פתוחים יישארו, כדי שתוכל להשלים אותם.</div>
          <button class="btn" data-s="yes">מחיקה</button><button class="btn ghost" data-s="close">ביטול</button>`, async () => {
          try { await db.clearDriver(st.driverId); st.settings = false; g.UI.toast(root, 'הנתונים נמחקו', 'המשלוחים הפתוחים נשארו'); }
          catch (e) { console.error(e); g.UI.toast(root, 'המחיקה נכשלה', 'בדוק חיבור ונסה שוב'); }
          draw();
        });
      },
      dayFees(day) {
        const os = st.orders.filter((o) => o.day === day && o.status !== 'sent');
        const total = os.reduce((s, o) => s + (o.fee || 0), 0);
        g.UI.sheet(root, `<h2>מחיר המשלוחים של היום</h2><div class="mut" style="font-size:15px">${dateLabel(day)}</div>
          <div style="max-height:45vh;overflow-y:auto">${os.map((o) => `<div class="row" style="padding:8px 0;border-top:1px solid var(--line)"><span>${esc(o.customer)}</span><b>${money(o.fee || 0)}</b></div>`).join('')}</div>
          <div class="row" style="align-items:baseline;border-top:2px solid #F2A33A;padding-top:10px"><span style="font-size:17px">סך הכול</span><b style="font-size:32px;color:#F2A33A">${money(total)}</b></div>
          <div class="mut">הסכום לא מקוזז מהכסף שמעבירים למנהל.</div><button class="btn ghost" data-s="close">סגירה</button>`, () => {});
      },
      fee(v) {
        const o = st.orders.find((x) => x.id === v);
        const sh = g.UI.sheet(root, `<h2>מחיר המשלוח לנהג</h2><div class="mut" style="font-size:15px">${esc(o.customer)} · ${esc(o.city)}</div>
          <div class="field"><label for="feeval">סכום (₪)</label><input id="feeval" class="big" style="border-color:#F2A33A" inputmode="decimal" value="${o.fee ? esc(o.fee) : ''}" autocomplete="off"></div>
          <button class="btn done" style="min-height:56px;font-size:18px" data-s="save">שמירה</button><button class="btn ghost" data-s="close">ביטול</button>`, async (_, val) => {
          const fee = Number(String(val).replace(/[^\d.]/g, '')) || 0;
          try { await db.setFee(v, fee); } catch (e) { console.error(e); g.UI.toast(root, 'השמירה נכשלה', `נסה שוב (${(e && (e.code || e.message)) || 'לא ידוע'})`); }
        });
        sh.querySelector('#feeval').focus();
      },
      closeDay(v) { const r = reportOf(v); st.err = ''; st.close = { day: v, counted: r ? String(r.counted) : '', note: r ? r.note || '' : '' }; draw(); const m = root.querySelector('.main'); if (m) m.scrollTop = 0; },
      closeBack() { st.close = null; st.err = ''; draw(); },
      openCash() { st.cash = { 200: 0, 100: 0, 50: 0, 20: 0 }; draw(); },
      cashBack() { st.cash = null; draw(); },
      noteAdd(v) { st.cash[v]++; draw(); },
      noteSub(v) { st.cash[v] = Math.max(0, st.cash[v] - 1); draw(); },
      cashApply() { st.close.counted = String(NOTES.reduce((s, [v]) => s + v * st.cash[v], 0)); st.cash = null; draw(); },
      sendReport() {
        const counted = Number(String(st.close.counted).replace(/[^\d.]/g, ''));
        if (String(st.close.counted).trim() === '' || Number.isNaN(counted)) { st.err = 'כתוב כמה כסף ספרת.'; return draw(); }
        const c = st.close, n = closeNumbers();
        const rows = n.os.map((o) => ({ customer: o.customer, city: o.city, product: o.product, qty: o.qty || '', status: o.status, amount: o.amount, fee: o.fee || 0 }));
        (async () => {
          st.busy = true; st.err = ''; draw();
          try {
            await db.sendReport({ driverId: st.driverId, driverName: (st.me && st.me.name) || '', driverPhone: (st.me && st.me.phone) || '', day: c.day, counted, collected: n.collected, fees: n.fees, expected: n.collected, note: c.note.trim(), rows });
            st.close = null;
            g.UI.toast(root, 'הסיכום נשלח למנהל', money(counted));
          } catch (e) { console.error(e); st.err = 'השליחה נכשלה. נסה שוב.'; }
          st.busy = false; draw();
        })();
      },
      pick(v) { setDriver(v); },
      switchDriver() { setDriver(null); },
      async enablePush() { await db.enablePush().catch((e) => console.error(e)); draw(); }
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && root.contains(b) && actions[b.dataset.a]) actions[b.dataset.a](b.dataset.v);
    });
    root.addEventListener('input', (e) => {
      const f = e.target.dataset && e.target.dataset.f;
      if (!f) return;
      if (f === 'password') st.password = e.target.value;
      else if (f === 'start') st.startDraft = e.target.value;
      else if (st.close) { st.close[f] = e.target.value; if (f === 'counted') draw(); }
    });
    root.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (e.target.dataset && e.target.dataset.submit === 'start') {
        const addr = (st.startDraft != null ? st.startDraft : startOf()).trim();
        if (!addr) return g.UI.toast(root, 'כתוב כתובת', 'למשל: ציפורן 4, עפולה');
        try { await db.updateDriver(st.driverId, { startAddress: addr }); st.settings = false; g.UI.toast(root, 'נקודת המוצא נשמרה', addr); }
        catch (x) { console.error(x); g.UI.toast(root, 'השמירה נכשלה', 'נסה שוב'); }
        return draw();
      }
      if (!st.password) { st.err = 'הזן סיסמה.'; return draw(); }
      st.busy = true; st.err = ''; draw();
      try { await db.signIn(st.password); st.password = ''; }
      catch (x) { console.error(x); st.err = /network/.test(x.code || '') ? 'אין חיבור לרשת.' : /too-many/.test(x.code || '') ? 'יותר מדי ניסיונות. המתן כמה דקות.' : 'הסיסמה לא נכונה.'; }
      st.busy = false; draw();
    });

    g.handleBack = () => {
      const sc = root.querySelector(':scope > .scrim');
      if (sc) { sc.remove(); return true; }
      const cel = root.querySelector(':scope > .celebrate');
      if (cel) { cel.remove(); return true; }
      if (st.settings) { actions.settingsBack(); return true; }
      if (st.cash) { actions.cashBack(); return true; }
      if (st.close) { actions.closeBack(); return true; }
      if (st.open) { actions.back(); return true; }
      return false;
    };
    db.onPush((p) => { g.UI.toast(root, p.title, p.body); });
    function subscribe() {
      unsub.forEach((f) => f()); unsub = [];
      st.me = null; st.orders = []; st.reports = []; st.routes = {}; st.open = null; st.close = null; st.cash = null; st.settings = false;
      if (!st.user) return;
      unsub.push(db.watchDrivers((d) => { st.drivers = d; draw(); }));
      if (st.driverId) {
        unsub.push(db.watchMe(st.driverId, (m) => { st.me = m; draw(); }));
        unsub.push(db.watchMine(st.driverId, (o) => { st.orders = o.filter((x) => !x.hiddenDriver); draw(); }));
        unsub.push(db.watchMyReports(st.driverId, (r) => { st.reports = r.filter((x) => !x.hiddenDriver); draw(); }));
      }
    }
    function setDriver(id) {
      st.driverId = id;
      try { id ? localStorage.setItem(ID_KEY, id) : localStorage.removeItem(ID_KEY); } catch (e) { /* נשמר עד סגירה */ }
      db.setPushKey(id);
      subscribe(); draw();
    }
    db.onAuth((u) => {
      st.user = u;
      if (u && st.driverId) db.setPushKey(st.driverId);
      subscribe(); draw();
    });
    return { state: st };
  };
})(self);
