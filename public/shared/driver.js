// אפליקציית הנהג
(function (g) {
  const { esc, money } = g.UI;
  const REASONS = ['הלקוח לא נמצא', 'הלקוח לא ענה', 'הלקוח סירב', 'כתובת שגויה', 'אחר'];

  g.mountDriver = function (root, db) {
    root.classList.add('app', 'drv');
    const ID_KEY = 'mishmish-driver-id';
    const readId = () => { try { return localStorage.getItem(ID_KEY); } catch (e) { return null; } };
    const st = { user: undefined, driverId: readId(), drivers: [], me: null, orders: [], open: null, password: db.demo ? '123456' : '', err: '', busy: false };
    let unsub = [];

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

    function listView() {
      const open = st.orders.filter((o) => o.status === 'sent');
      const done = st.orders.filter((o) => o.status !== 'sent');
      const paid = done.filter((o) => o.status === 'paid');
      const all = st.orders.reduce((s, o) => s + o.amount, 0);
      const got = paid.reduce((s, o) => s + o.amount, 0);
      const pushOff = !db.demo && db.pushSupported() && db.pushState() !== 'granted';
      return `<header class="hdr"><div class="sub" style="font-size:16px">שלום ${esc((st.me && st.me.name) || '')}</div><h1>המשלוחים שלי</h1>
        <div class="sub" style="font-size:16px">${paid.length} מתוך ${st.orders.length} נמסרו · ${money(got)} מתוך ${money(all)}</div></header>
      <main class="main">
        ${pushOff ? '<div class="card pad"><div>הפעל התראות כדי לדעת מיד כשמגיעים משלוחים חדשים.</div><button class="btn small" type="button" data-a="enablePush">הפעלת התראות</button></div>' : ''}
        ${open.map((o, i) => `<button type="button" class="stop ${i === 0 ? 'next' : ''}" data-a="open" data-v="${esc(o.id)}">
          <span class="row" style="align-items:baseline"><span style="font-size:20px;font-weight:700">${esc(o.customer)}</span><span class="amt">${money(o.amount)}</span></span>
          <span style="color:#D5DED8">${esc([o.address, o.city].filter(Boolean).join(', '))}</span>
          <span class="mut" style="font-size:15px">${esc(o.product)}</span></button>`).join('')}
        ${!open.length && !done.length ? '<div class="empty">אין לך משלוחים כרגע.<br>כשהמנהל ישלח לך, הם יופיעו כאן.</div>' : ''}
        ${!open.length && done.length ? '<div class="empty" style="padding:16px">סיימת את כל המשלוחים.</div>' : ''}
        ${done.length ? `<h2 class="mut" style="font-size:15px;margin-top:6px">הסתיימו</h2>` : ''}
        ${done.map((o) => `<div class="stop isdone" style="cursor:default"><span class="row"><span style="font-weight:600">${esc(o.customer)}</span><span style="font-weight:600">${o.status === 'paid' ? `שולם ${money(o.amount)}` : 'לא נמסר'}</span></span>${o.failReason ? `<span class="mut">${esc(o.failReason)}</span>` : ''}</div>`).join('')}
        <button class="link" type="button" data-a="switchDriver">לא ${esc((st.me && st.me.name) || 'אתה')}? החלפת נהג</button>
      </main>`;
    }

    function detailView(o) {
      const open = st.orders.filter((x) => x.status === 'sent');
      const idx = open.findIndex((x) => x.id === o.id);
      return `<header class="hdr"><div class="row"><div class="sub">משלוח ${idx + 1} מתוך ${open.length}</div><button class="btn hdrbtn" type="button" data-a="back">לרשימה</button></div>
        <h1 style="font-size:32px">${esc(o.customer)}</h1><div style="font-size:18px;color:#D5DED8">${esc([o.address, o.city].filter(Boolean).join(', '))}</div></header>
      <main class="main">
        <div class="acts"><a class="act" id="call" href="${hiddenTel(o.phone)}">חיוג מחסוי</a><a class="act" href="${waze(o)}" target="_blank" rel="noopener">ניווט</a></div>
        <section class="card pad"><div class="mut" style="font-size:15px">למסור ללקוח</div><div style="font-size:22px;font-weight:600">${esc(o.product)}</div></section>
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
      const v = !st.user ? loginView() : !st.driverId ? pickView() : o ? detailView(o) : listView();
      g.UI.render(root, (db.demo ? '<div class="demo">מצב הדגמה</div>' : '') + v);
    }

    const actions = {
      open(v) { st.open = v; draw(); const m = root.querySelector('.main'); if (m) m.scrollTop = 0; },
      back() { st.open = null; draw(); },
      paid() {
        const o = st.orders.find((x) => x.id === st.open);
        g.UI.sheet(root, `<h2>קיבלת ${money(o.amount)} במזומן?</h2><p class="mut">${esc(o.customer)} · ${esc(o.product)}. המנהל יקבל הודעה מיד.</p>
          <button class="btn done" data-s="yes" style="min-height:60px;font-size:20px">כן, נמסר ושולם</button><button class="btn ghost" data-s="close">עוד לא</button>`, async () => {
          st.busy = true; draw();
          try { await db.markPaid(o.id); st.open = null; g.UI.toast(root, 'נשמר', `${o.customer} · ${money(o.amount)}`); }
          catch (e) { console.error(e); g.UI.toast(root, 'השמירה נכשלה', 'נסה שוב'); }
          st.busy = false; draw();
        });
      },
      fail() {
        const o = st.orders.find((x) => x.id === st.open);
        g.UI.sheet(root, `<h2>למה לא נמסר?</h2>${REASONS.map((r, i) => `<button class="btn ghost" data-s="${i}">${r}</button>`).join('')}<button class="link" data-s="close">ביטול</button>`, async (i) => {
          try { await db.markFailed(o.id, REASONS[i]); st.open = null; } catch (e) { console.error(e); g.UI.toast(root, 'השמירה נכשלה', 'נסה שוב'); }
          draw();
        });
      },
      pick(v) { setDriver(v); },
      switchDriver() { setDriver(null); },
      async enablePush() { await db.enablePush().catch((e) => console.error(e)); draw(); }
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && root.contains(b) && actions[b.dataset.a]) actions[b.dataset.a](b.dataset.v);
    });
    root.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.f) st.password = e.target.value; });
    root.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!st.password) { st.err = 'הזן סיסמה.'; return draw(); }
      st.busy = true; st.err = ''; draw();
      try { await db.signIn(st.password); st.password = ''; }
      catch (x) { console.error(x); st.err = /network/.test(x.code || '') ? 'אין חיבור לרשת.' : /too-many/.test(x.code || '') ? 'יותר מדי ניסיונות. המתן כמה דקות.' : 'הסיסמה לא נכונה.'; }
      st.busy = false; draw();
    });

    g.handleBack = () => {
      const sc = root.querySelector(':scope > .scrim');
      if (sc) { sc.remove(); return true; }
      if (st.open) { actions.back(); return true; }
      return false;
    };
    db.onPush((p) => { g.UI.toast(root, p.title, p.body); });
    function subscribe() {
      unsub.forEach((f) => f()); unsub = [];
      st.me = null; st.orders = []; st.open = null;
      if (!st.user) return;
      unsub.push(db.watchDrivers((d) => { st.drivers = d; draw(); }));
      if (st.driverId) {
        unsub.push(db.watchMe(st.driverId, (m) => { st.me = m; draw(); }));
        unsub.push(db.watchMine(st.driverId, (o) => { st.orders = o; draw(); }));
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
