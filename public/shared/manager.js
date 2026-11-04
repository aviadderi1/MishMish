// אפליקציית המנהל
(function (g) {
  const { esc, money, prod } = g.UI;
  const emptyOrder = () => ({ customer: '', phone: '', city: '', address: '', areaId: '', product: '', qty: '1', amount: '' });
  const emptyCust = () => ({ name: '', phone: '', city: '', address: '', areaId: '' });
  const emptyDriver = () => ({ name: '', phone: '', areaId: '' });

  const PHONE_KEY = 'mishmish-manager-phone';
  const readPhone = () => { try { return localStorage.getItem(PHONE_KEY) || ''; } catch (e) { return ''; } };

  g.mountManager = function (root, db) {
    root.classList.add('app', 'mgr');
    const st = {
      user: undefined, tab: 'new', sub: null, areas: [], drivers: [], orders: [], sel: new Set(), reports: [], customers: [], cust: emptyCust(), custIdx: null, managers: null, myPhone: readPhone(), gate: { name: '', phone: '' }, addMgr: { name: '', phone: '' },
      order: emptyOrder(), driver: emptyDriver(), editDriverId: null, pick: null, created: null,
      login: { password: db.demo ? '123456' : '', register: false }, newArea: '', editArea: null, err: '', busy: false,
      day: db.today(), showDetail: false, openDriver: null, pushAsked: false
    };
    const unsub = [];
    let unsubOrders = null;
    const go = (f) => { st.err = ''; f && f(); draw(); };
    const areaName = (id, fallback) => (st.areas.find((a) => a.id === id) || {}).name || fallback || 'ללא אזור';
    const dayDays = () => { // 14 הימים האחרונים, ועוד היום שנבחר בסיכום
      const out = [st.day]; const d = new Date();
      for (let i = 0; i < 14; i++) { out.push(db.today(d)); d.setDate(d.getDate() - 1); }
      return [...new Set(out)];
    };
    const subOrders = () => {
      if (unsubOrders) unsubOrders();
      const a = db.watchOrders(dayDays(), (o) => { st.orders = o.filter((x) => !x.hiddenManager); draw(); });
      const b = db.watchReports(dayDays(), (r) => { st.reports = r.filter((x) => !x.hiddenManager); draw(); });
      unsubOrders = () => { a(); b(); };
    };

    /* ---------- מסכים ---------- */
    const hdr = (title, sub, extra = '') => `<header class="hdr"><div class="row"><h1>${title}</h1>${extra}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</header>`;
    const nav = () => `<nav class="nav" aria-label="ניווט ראשי">${[['new', 'חדשה'], ['orders', 'הזמנות'], ['track', 'מעקב'], ['summary', 'סיכום'], ['drivers', 'נהגים']]
      .map(([k, t]) => `<button type="button" data-a="tab" data-v="${k}" class="${st.tab === k && (!st.sub || st.sub === 'reports') ? 'on' : ''}">${t}</button>`).join('')}</nav>`;
    const err = () => (st.err ? `<div class="err" role="alert">${esc(st.err)}</div>` : '');
    const field = (id, label, form, key, attrs = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" data-f="${form}.${key}" value="${esc(st[form][key])}" ${attrs}></div>`;
    const areaSelect = (id, form, withNew) => `<div class="field"><label for="${id}">אזור</label>
      <select id="${id}" data-f="${form}.areaId"><option value="">בחירת אזור</option>
      ${st.areas.map((a) => `<option value="${esc(a.id)}" ${st[form].areaId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      ${withNew ? '<option value="__new">+ יצירת אזור חדש</option>' : ''}</select></div>`;

    function loginView() {
      const l = st.login;
      return `<header class="hdr"><h1>${l.register ? 'יצירת סיסמת עסק' : 'כניסה'}</h1><div class="sub">${l.register ? 'אותה סיסמה תשמש אותך ואת הנהגים, פעם אחת בכל טלפון' : 'הזן את סיסמת העסק. היא תתבקש פעם אחת בלבד'}</div></header>
      <form class="main" data-submit="login">
        ${err()}
        ${field('lpass', 'סיסמת העסק', 'login', 'password', `type="password" autocomplete="${l.register ? 'new-password' : 'current-password'}" dir="ltr"`)}
        <button class="btn" type="submit" ${st.busy ? 'disabled' : ''}>${l.register ? 'יצירת הסיסמה' : 'כניסה'}</button>
        <button class="link" type="button" data-a="toggleRegister">${l.register ? 'כבר יש סיסמה' : 'פעם ראשונה? יצירת סיסמת עסק'}</button>
      </form>`;
    }

    function isAllowed() {
      if (db.demo) return true;
      return (st.managers || []).some((m) => db.digits(m.phone) === db.digits(st.myPhone));
    }

    function gateView() {
      const first = !st.managers.length;
      return `<header class="hdr"><h1>${first ? 'המנהל הראשון' : 'אימות מנהל'}</h1><div class="sub">${first ? 'הפרטים שלך יופיעו ברשימת המנהלים' : 'הזן את מספר הטלפון שהמנהל הוסיף עבורך'}</div></header>
      <form class="main" data-submit="gate">${err()}
        ${first ? field('gname', 'השם שלך', 'gate', 'name', 'autocomplete="off"') : ''}
        ${field('gphone', 'טלפון', 'gate', 'phone', 'type="tel" dir="ltr" style="text-align:right" autocomplete="off"')}
        <button class="btn" type="submit" ${st.busy ? 'disabled' : ''}>כניסה</button>
      </form>`;
    }

    function newView() {
      const editing = !!st.order.id;
      return `${hdr(editing ? 'עריכת הזמנה' : 'הזמנה חדשה', new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }), '<button class="btn hdrbtn" style="width:48px;padding:0;display:flex;align-items:center;justify-content:center" type="button" data-a="settings" aria-label="הגדרות"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"></path></svg></button>')}
      <form class="main" data-submit="order">
        ${err()}
        <div class="sugwrap">${field('cust', 'שם הלקוח', 'order', 'customer', 'autocomplete="off"')}<div class="sug" id="sug-cust"></div></div>
        <div class="sugwrap">${field('phone', 'טלפון', 'order', 'phone', 'type="tel" dir="ltr" style="text-align:right" autocomplete="off"')}<div class="sug" id="sug-phone"></div></div>
        <div class="two">${field('city', 'עיר', 'order', 'city', 'autocomplete="off"')}<div class="sugwrap">${field('addr', 'רחוב ומספר', 'order', 'address', 'autocomplete="off"')}<div class="sug" id="sug-addr"></div></div></div>
        ${areaSelect('area', 'order', true)}
        <div style="display:grid;grid-template-columns:1fr 96px;gap:12px">${field('prod', 'מוצר', 'order', 'product', 'autocomplete="off"')}${field('qty', 'כמות', 'order', 'qty', 'inputmode="numeric" autocomplete="off"')}</div>
        <div class="field"><label for="amount">סכום לגבייה במזומן (₪)</label><input class="big" id="amount" data-f="order.amount" value="${esc(st.order.amount)}" inputmode="decimal" autocomplete="off"></div>
        <button class="btn ghost" style="background:#E1ECF7;color:#173F70" type="button" data-a="saveCustomer">הוסף לקוח זה ללקוחות קבועים</button>
        <button class="btn ghost" type="submit" ${st.busy ? 'disabled' : ''}>${editing ? 'שמירת שינויים' : 'שמירת הזמנה'}</button>
        ${st.order.status === 'sent' ? '' : `<button class="btn" type="button" data-a="quickSend" ${st.busy ? 'disabled' : ''}>שלח לנהג</button>`}
        ${editing ? `<button class="btn ghost" type="button" data-a="cancelEdit">ביטול</button>${st.order.status === 'sent' ? '' : `<button class="link" type="button" data-a="delOrder" data-v="${esc(st.order.id)}">מחיקת הזמנה</button>`}` : ''}
      </form>${nav()}`;
    }

    function ordersView() {
      const list = st.orders.filter((o) => o.status === 'new');
      const total = list.reduce((s, o) => s + o.amount, 0);
      const days14 = dayDays();
      const sentAll = st.orders.filter((o) => o.status === 'sent' || ((o.status === 'paid' || o.status === 'failed') && days14.includes(o.day)));
      const selected = list.filter((o) => st.sel.has(o.id));
      const selTotal = selected.reduce((s, o) => s + o.amount, 0);
      const stTag = (o) => o.status === 'paid' ? '<span class="tag">שולם</span>' : o.status === 'failed' ? '<span class="tag warn">לא נמסר</span>' : '<span class="tag wait">בדרך</span>';
      const days = [...new Set(list.concat(sentAll).map((o) => o.day))].sort().reverse();
      const dateLabel = (day) => new Date(day + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const dayBlock = (day) => {
        const waiting = list.filter((o) => o.day === day);
        const sent = sentAll.filter((o) => o.day === day);
        const groups = new Map();
        waiting.forEach((o) => { if (!groups.has(o.areaId)) groups.set(o.areaId, []); groups.get(o.areaId).push(o); });
        const keys = [...groups.keys()].sort((a, b) => areaName(a).localeCompare(areaName(b), 'he'));
        return `<section style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
          <h2 style="font-size:17px;color:#123C2F">${dateLabel(day)}</h2>
          ${keys.map((k) => {
            const os = groups.get(k);
            const all = os.every((o) => st.sel.has(o.id));
            const key = `${day}|${k}`;
            return `<div class="card"><div class="area-h">
              <input type="checkbox" id="ga-${esc(key)}" data-a="selArea" data-v="${esc(key)}" ${all ? 'checked' : ''} aria-label="בחירת כל האזור">
              <h3 class="grow" style="margin:0;font-size:16px">ממתינות · ${esc(areaName(k, os[0].areaName))} · ${os.length}</h3>
              <span class="b">${money(os.reduce((s, o) => s + o.amount, 0))}</span></div>
              ${os.map((o) => `<div class="orow"><input type="checkbox" id="o-${esc(o.id)}" data-a="sel" data-v="${esc(o.id)}" ${st.sel.has(o.id) ? 'checked' : ''} aria-label="בחירת ${esc(o.customer)}">
                <button type="button" class="tap grow" data-a="editOrder" data-v="${esc(o.id)}"><div style="font-weight:500">${esc(o.customer)}</div><div class="mut">${esc(o.city)} · ${esc(prod(o))}</div></button>
                <div class="b">${money(o.amount)}</div></div>`).join('')}</div>`;
          }).join('')}
          ${sent.length ? `<div class="card"><div class="area-h" style="background:#DDF0E8;color:#0B5443"><h3 class="grow" style="margin:0;font-size:16px;padding:6px 0">נשלחו לנהגים · ${sent.length}</h3></div>
            ${sent.map((o) => `<div class="orow"><div class="grow"><div style="font-weight:500">${esc(o.customer)}</div><div class="mut">${esc(o.city)} · ${esc(o.driverName)}</div></div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px"><b>${money(o.amount)}</b>${stTag(o)}</div>
              ${o.status === 'sent' ? `<div style="display:flex;flex-direction:column;flex-shrink:0"><button type="button" class="icon" style="color:#123C2F" data-a="editOrder" data-v="${esc(o.id)}">עריכה</button><button type="button" class="icon" style="color:#A32B12" data-a="cancelOrder" data-v="${esc(o.id)}">ביטול</button></div>` : ''}</div>`).join('')}</div>` : ''}
        </section>`;
      };
      return `${hdr('הזמנות', `${list.length} ממתינות · ${sentAll.length} נשלחו · ${money(total)} לשליחה`, '<button class="btn hdrbtn" type="button" data-a="areas">ניהול אזורים</button>')}
      <main class="main" style="gap:16px">
        ${err()}
        ${days.length ? days.map(dayBlock).join('') : '<div class="empty">אין הזמנות.<br>הוסף הזמנה בלשונית "חדשה".</div>'}
      </main>
      ${selected.length ? `<div class="footer"><button class="btn" type="button" data-a="assign">שליחת ${selected.length} הזמנות לנהג · ${money(selTotal)}</button></div>` : ''}
      ${nav()}`;
    }

    function assignView() {
      const orders = st.orders.filter((o) => st.sel.has(o.id) && o.status === 'new');
      const areaIds = new Set(orders.map((o) => o.areaId));
      const open = (id) => st.orders.filter((o) => o.driverId === id && o.status === 'sent').length;
      const drivers = [...st.drivers].sort((a, b) => (areaIds.has(b.areaId) ? 1 : 0) - (areaIds.has(a.areaId) ? 1 : 0));
      const picked = st.drivers.find((d) => d.id === st.pick);
      const total = orders.reduce((s, o) => s + o.amount, 0);
      return `${hdr('למי לשלוח?', `${orders.length} הזמנות · ${money(total)}`, '<button class="btn hdrbtn" type="button" data-a="back">חזרה</button>')}
      <main class="main">
        ${err()}
        ${drivers.length ? drivers.map((d) => `<button type="button" class="drvpick ${st.pick === d.id ? 'on' : ''}" data-a="pick" data-v="${esc(d.id)}">
          <span class="ava">${esc(d.name[0] || '')}</span>
          <span class="grow"><span style="display:block;font-weight:600">${esc(d.name)} ${areaIds.has(d.areaId) ? '<span class="tag">האזור שלו</span>' : ''}</span>
          <span class="mut" style="display:block">${esc(areaName(d.areaId, ''))} · ${open(d.id) ? `${open(d.id)} משלוחים פתוחים` : 'אין משלוחים פתוחים'}</span></span></button>`).join('')
          : '<div class="empty">עדיין אין נהגים. צור נהג בלשונית "נהגים".</div>'}
        <section class="card pad"><h2 style="font-size:16px">מה הנהג יקבל</h2>
          ${orders.map((o) => `<div class="row" style="font-size:14px"><span>${esc(o.customer)} · ${esc(o.city)} · ${esc(prod(o))}</span><span class="b">${money(o.amount)}</span></div>`).join('')}
          <div class="row b" style="border-top:1px solid var(--line);padding-top:8px"><span>סה"כ לגבייה</span><span>${money(total)}</span></div></section>
      </main>
      <div class="footer"><button class="btn" type="button" data-a="send" ${picked && !st.busy && orders.length ? '' : 'disabled'}>${picked ? `שליחה ל${esc(picked.name)}` : 'בחר נהג'}</button></div>`;
    }

    function trackView() {
      const today = db.today();
      const rel = st.orders.filter((o) => o.status === 'sent' || ((o.status === 'paid' || o.status === 'failed') && o.day === today));
      const paid = rel.filter((o) => o.status === 'paid');
      const coll = paid.reduce((s, o) => s + o.amount, 0);
      const openSum = rel.filter((o) => o.status === 'sent').reduce((s, o) => s + o.amount, 0);
      const ids = [...new Set(rel.map((o) => o.driverId))];
      const statusTag = (o) => o.status === 'paid' ? '<span class="tag">שולם</span>' : o.status === 'failed' ? '<span class="tag warn">לא נמסר</span>' : '<span class="tag wait">בדרך</span>';
      return `<header class="hdr"><h1>מעקב חי</h1><div class="stats">
        <div><b>${paid.length}/${rel.length}</b><span>נמסרו</span></div><div><b>${money(coll)}</b><span>נגבו</span></div><div><b>${money(openSum)}</b><span>פתוח</span></div></div></header>
      <main class="main">${pushBanner()}
        ${ids.length ? ids.map((id) => {
          const os = rel.filter((o) => o.driverId === id);
          const done = os.filter((o) => o.status === 'paid');
          const sum = os.reduce((s, o) => s + o.amount, 0), got = done.reduce((s, o) => s + o.amount, 0);
          const next = os.find((o) => o.status === 'sent');
          const finished = os.filter((o) => o.status !== 'sent').length;
          const pct = Math.round((finished / os.length) * 100);
          return `<section class="card"><button type="button" class="tap pad" data-a="toggleDriver" data-v="${esc(id)}" style="box-sizing:border-box">
            <div class="row"><span class="b" style="font-size:17px">${esc(os[0].driverName)}</span><span style="font-weight:600">${money(got)} מתוך ${money(sum)}</span></div>
            <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
            <div class="mut">${done.length} מתוך ${os.length} נמסרו${next ? ` · הבא: ${esc(next.customer)}, ${esc(next.city)}` : ''}</div></button>
            ${st.openDriver === id ? os.map((o) => `<div class="orow"><div class="grow"><div style="font-weight:500">${esc(o.customer)}</div><div class="mut">${esc(o.city)} · ${money(o.amount)}${o.failReason ? ' · ' + esc(o.failReason) : ''}</div></div>${statusTag(o)}</div>`).join('') : ''}
          </section>`;
        }).join('') : '<div class="empty">אין כרגע משלוחים בדרך.</div>'}
      </main>${nav()}`;
    }

    function summaryView() {
      const os = st.orders.filter((o) => o.day === st.day && ['sent', 'paid', 'failed'].includes(o.status));
      const paid = os.filter((o) => o.status === 'paid');
      const got = paid.reduce((s, o) => s + o.amount, 0);
      const all = os.reduce((s, o) => s + o.amount, 0);
      const ids = [...new Set(os.map((o) => o.driverId))];
      const missing = os.filter((o) => o.status !== 'paid');
      const isToday = st.day === db.today();
      const label = new Date(st.day + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
      return `<header class="hdr"><div class="row"><div class="sub">סיכום יום · ${label}</div>
          <div style="display:flex;gap:6px"><button class="btn hdrbtn" type="button" data-a="dayShift" data-v="-1" aria-label="יום קודם">הקודם</button>${isToday ? '' : '<button class="btn hdrbtn" type="button" data-a="dayShift" data-v="1" aria-label="יום הבא">הבא</button>'}</div></div>
        <div class="hero">${money(got)}</div><div class="sub">נגבו במזומן מתוך ${money(all)}</div></header>
      <main class="main">
        <button class="btn" type="button" data-a="reports">דוחות נהגים (${st.reports.filter((r) => r.day === st.day).length})</button>
        <div class="two">
          <div class="card pad" style="gap:2px"><b style="font-size:23px">${paid.length} מתוך ${os.length}</b><span class="mut">משלוחים נמסרו</span></div>
          <div class="card pad" style="gap:2px;background:#F9E7D8;color:#6F2D08;border:0"><b style="font-size:23px">${money(all - got)}</b><span style="font-size:14px">לא נגבו</span></div>
        </div>
        ${ids.length ? `<section class="card pad"><h2 style="font-size:16px">כמה כל נהג צריך להעביר</h2>
          ${ids.map((id) => { const d = os.filter((o) => o.driverId === id); const dp = d.filter((o) => o.status === 'paid'); const fee = d.reduce((s, o) => s + (o.fee || 0), 0);
            return `<div class="row" style="border-top:1px solid #E8EBE6;padding-top:8px"><div><div style="font-weight:600">${esc(d[0].driverName)}</div><div class="mut">${dp.length} מתוך ${d.length} נמסרו${fee ? ` · משלוחים ${money(fee)}` : ''}</div></div><div class="b" style="font-size:18px">${money(dp.reduce((s, o) => s + o.amount, 0))}</div></div>`; }).join('')}</section>` : '<div class="empty">אין נתונים ליום הזה.</div>'}
        ${missing.length ? `<section class="card pad"><h2 style="font-size:16px">לא נמסר</h2>
          ${missing.map((o) => `<div class="row" style="border-top:1px solid #E8EBE6;padding-top:6px"><div class="grow"><div style="font-weight:500">${esc(o.customer)} · ${esc(o.city)} · ${money(o.amount)}</div><div class="mut">${esc(o.driverName)} · ${o.status === 'failed' ? esc(o.failReason || 'לא נמסר') : 'עדיין בדרך'}</div></div>
          ${o.status === 'failed' ? `<button class="btn ghost small" type="button" data-a="returnOrder" data-v="${esc(o.id)}">החזר להזמנות</button>` : ''}</div>`).join('')}</section>` : ''}
        ${os.length ? `<button class="btn ghost" type="button" data-a="toggleDetail">${st.showDetail ? 'הסתרת פירוט' : 'פירוט מלא'}</button>
        ${st.showDetail ? `<section class="card pad"><table class="tbl"><tbody>${os.map((o) => `<tr><td>${esc(o.customer)}<div class="mut">${esc(prod(o))} · ${esc(o.driverName)}</div></td><td class="b">${money(o.amount)}</td><td>${o.status === 'paid' ? `<button class="link" type="button" data-a="reopen" data-v="${esc(o.id)}" style="font-size:13px">ביטול סימון</button>` : ''}</td></tr>`).join('')}</tbody></table></section>` : ''}
        ${db.demo ? '' : '<button class="btn ghost" type="button" data-a="csv">ייצוא דוח לאקסל</button>'}` : ''}
        ${db.demo ? '<button class="link" type="button" data-a="resetDemo">איפוס נתוני ההדגמה</button>' : ''}
      </main>${nav()}`;
    }

    function reportsView() {
      const label = new Date(st.day + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const os = st.orders.filter((o) => o.day === st.day && ['sent', 'paid', 'failed'].includes(o.status));
      const reps = st.reports.filter((r) => r.day === st.day);
      const waiting = [...new Set(os.map((o) => o.driverId))].filter((id) => !reps.some((r) => r.driverId === id));
      const tag = (r) => {
        const d = r.counted - r.collected;
        return d === 0 ? '<span class="tag">תואם</span>' : `<span class="tag warn">${d < 0 ? 'חסרים' : 'עודף'} ${money(Math.abs(d))}</span>`;
      };
      return `${hdr('דוחות נהגים', label, '<button class="btn hdrbtn" type="button" data-a="back">חזרה</button>')}
      <main class="main">${err()}
        ${reps.map((r) => `<section class="card pad">
          <div class="row"><h2 style="font-size:17px">${esc(r.driverName)}</h2>${tag(r)}</div>
          <div class="mut" style="color:#3F4B45">${(r.rows || []).filter((x) => x.status === 'paid').length} נמסרו · נגבו ${money(r.collected)} · נספרו ${money(r.counted)}</div>
          ${r.note ? `<div class="mut">הערה: ${esc(r.note)}</div>` : ''}
          <div class="two"><button class="btn ghost" type="button" data-a="openPdf" data-v="${esc(r.id)}">פתיחת דוח PDF</button><button class="btn ghost" type="button" data-a="payDriver" data-v="${esc(r.id)}">תשלום לנהג</button></div>
          ${r.payment != null ? `<div style="font-weight:600;color:#0B5443">תשלום לנהג: ${money(r.payment)}</div>` : ''}
          ${r.approved ? '<span class="tag" style="align-self:flex-start">הדוח אושר</span>' : `<button class="btn" type="button" data-a="approve" data-v="${esc(r.id)}">אישור דוח</button>`}
        </section>`).join('')}
        ${waiting.map((id) => { const d = os.filter((o) => o.driverId === id); return `<section class="card pad"><div class="row"><h2 style="font-size:17px">${esc(d[0].driverName)}</h2><span class="tag wait">טרם נשלח</span></div><div class="mut">${d.filter((o) => o.status === 'paid').length} מתוך ${d.length} נמסרו · נגבו ${money(d.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amount, 0))}</div></section>`; }).join('')}
        ${!reps.length && !waiting.length ? '<div class="empty">אין דוחות ליום הזה.</div>' : ''}
      </main>${nav()}`;
    }

    function customersView() {
      return `${hdr('לקוחות קבועים', `${st.customers.length} לקוחות`, '<button class="btn hdrbtn" type="button" data-a="settings">חזרה</button>')}
      <main class="main">${err()}
        ${st.customers.length ? st.customers.map((c, i) => `<div class="card" style="display:flex;align-items:center;gap:6px;padding:8px 14px"><div class="grow"><div style="font-weight:600">${esc(c.name)}</div><div class="mut">${esc([c.address, c.city].filter(Boolean).join(', '))}</div><div class="mut" dir="ltr" style="text-align:right">${esc(c.phone)}</div></div>
          <button type="button" class="icon" data-a="editCustomer" data-v="${i}">עריכה</button><button type="button" class="icon" style="color:#A32B12" data-a="delCustomer" data-v="${i}">מחיקה</button></div>`).join('')
          : '<div class="empty">עדיין אין לקוחות קבועים.<br>בהזמנה חדשה לחץ "הוסף לקוח זה ללקוחות קבועים".</div>'}
      </main>`;
    }

    function custForm() {
      return `${hdr('עריכת לקוח קבוע')}
      <form class="main" data-submit="custSave">${err()}
        ${field('ccname', 'שם', 'cust', 'name', 'autocomplete="off"')}
        ${field('ccphone', 'טלפון', 'cust', 'phone', 'type="tel" dir="ltr" style="text-align:right" autocomplete="off"')}
        <div class="two">${field('cccity', 'עיר', 'cust', 'city', 'autocomplete="off"')}${field('ccaddr', 'רחוב ומספר', 'cust', 'address', 'autocomplete="off"')}</div>
        ${areaSelect('ccarea', 'cust', false)}
        <button class="btn" type="submit" ${st.busy ? 'disabled' : ''}>שמירה</button><button class="btn ghost" type="button" data-a="customers">ביטול</button>
      </form>`;
    }

    function settingsView() {
      return `${hdr('הגדרות', '', '<button class="btn hdrbtn" type="button" data-a="back">חזרה</button>')}
      <main class="main">${err()}
        <section class="card pad"><h2 style="font-size:17px">לקוחות קבועים</h2><div class="mut" style="color:#3F4B45">${st.customers.length} לקוחות</div><button class="btn ghost" type="button" data-a="customers">ניהול לקוחות קבועים</button></section>
        <form class="card pad" data-submit="addManager"><h2 style="font-size:17px">מנהלים</h2>
          ${(st.managers || []).map((m, i) => `<div class="row" style="border-top:1px solid #E8EBE6;padding-top:6px"><div class="grow"><div style="font-weight:600">${esc(m.name)}${db.digits(m.phone) === db.digits(st.myPhone) ? ' <span class="tag">אתה</span>' : ''}</div><div class="mut" dir="ltr" style="text-align:right">${esc(m.phone)}</div></div>
            ${db.digits(m.phone) === db.digits(st.myPhone) ? '' : `<a class="icon" style="display:flex;align-items:center;justify-content:center;width:auto;padding:0 6px" href="https://wa.me/?text=${encodeURIComponent(`שלום ${m.name}, להורדת אפליקציית המנהל: ${(g.APP_CONFIG && g.APP_CONFIG.managerApkUrl) || ''}`)}" target="_blank" rel="noopener">שליחת קישור</a><button type="button" class="icon" style="color:#A32B12" data-a="removeManager" data-v="${i}">הסרה</button>`}</div>`).join('')}
          <div style="border-top:1px solid #E8EBE6;padding-top:8px;display:flex;flex-direction:column;gap:8px">
          ${field('mname', 'שם', 'addMgr', 'name', 'autocomplete="off"')}
          ${field('mphone', 'טלפון', 'addMgr', 'phone', 'type="tel" dir="ltr" style="text-align:right" autocomplete="off"')}
          <button class="btn" type="submit" ${st.busy ? 'disabled' : ''}>הוספת מנהל</button></div>
          <div class="mut">המנהל החדש מתקין את האפליקציה, מזין את סיסמת העסק ואת הטלפון שלו.</div></form>
        <section class="card pad"><h2 style="font-size:17px">איפוס נתונים</h2>
          <div class="mut" style="color:#3F4B45">מוחק הזמנות, משלוחים שנסגרו ודוחות מהאפליקציה שלך. אצל הנהגים הם נשארים.</div>
          <button class="btn ghost" style="color:#A32B12;border-color:#A32B12" type="button" data-a="resetAsk">איפוס נתונים</button></section>
      </main>`;
    }

    function driversView() {
      return `${hdr('הנהגים שלי', `${st.drivers.length} נהגים`)}
      <main class="main" style="padding-bottom:90px">
        ${st.drivers.length ? st.drivers.map((d) => `<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px">
          <span class="ava">${esc(d.name[0] || '')}</span>
          <button type="button" class="tap grow" data-a="editDriver" data-v="${esc(d.id)}"><div style="font-weight:600;font-size:17px">${esc(d.name)} <span class="mut" style="font-weight:400">· ${esc(areaName(d.areaId, 'ללא אזור'))}</span></div>
          <div class="mut" dir="ltr" style="text-align:right;font-size:15px">${esc(d.phone)}</div></button>
          <a class="call" href="tel:${esc(db.digits(d.phone))}" aria-label="חיוג אל ${esc(d.name)}"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"></path></svg></a></div>`).join('')
          : '<div class="empty">עדיין אין נהגים. לחץ על + כדי ליצור נהג.</div>'}
      </main>
      <button type="button" class="fab" data-a="newDriver" aria-label="יצירת נהג חדש">+</button>${nav()}`;
    }

    function driverForm() {
      const editing = !!st.editDriverId;
      return `${hdr(editing ? 'עריכת נהג' : 'נהג חדש')}
      <form class="main" data-submit="driver">
        ${err()}
        ${field('dname', 'שם הנהג', 'driver', 'name', 'autocomplete="off"')}
        ${field('dphone', 'מספר טלפון', 'driver', 'phone', `type="tel" dir="ltr" style="text-align:right" autocomplete="off" ${editing ? 'readonly' : ''}`)}
        ${areaSelect('darea', 'driver', false)}
        <button class="btn" type="submit" ${st.busy ? 'disabled' : ''}>שמירת נהג</button>
        <button class="btn ghost" type="button" data-a="back">ביטול</button>
        ${editing ? '<button class="link" type="button" data-a="delDriver">מחיקת נהג</button>' : ''}
      </form>`;
    }

    function createdView() {
      const c = st.created;
      const link = (g.APP_CONFIG && g.APP_CONFIG.driverApkUrl) || '';
      const msg = `שלום ${c.name}, להורדת אפליקציית המשלוחים: ${link}`;
      return `${hdr(`${esc(c.name)} נוסף`, 'שלח לו את הקישור ואת סיסמת העסק')}
      <main class="main">
      ${db.demo ? '' : `<a class="btn" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">שליחת קישור הורדה בוואטסאפ</a>`}
      <button class="btn ghost" type="button" data-a="back">סיום</button></main>`;
    }

    function areasView() {
      const count = (id) => st.orders.filter((o) => o.areaId === id && ['new', 'sent'].includes(o.status)).length;
      return `${hdr('האזורים שלי', 'אתה קובע אילו אזורים קיימים', '<button class="btn hdrbtn" type="button" data-a="back">חזרה</button>')}
      <main class="main">
        ${err()}
        <form class="card pad" data-submit="area"><label for="newarea" style="font-size:14px;font-weight:500">אזור חדש</label>
          <div style="display:flex;gap:8px"><input class="inp grow" id="newarea" data-f="root.newArea" value="${esc(st.newArea)}" placeholder="שם האזור" autocomplete="off"><button class="btn small" style="min-height:48px" type="submit">הוספה</button></div></form>
        ${st.areas.length ? st.areas.map((a) => st.editArea === a.id
          ? `<form class="card pad" data-submit="renameArea"><label for="ren" style="font-size:14px;font-weight:500">שם האזור</label><div style="display:flex;gap:8px"><input class="inp grow" id="ren" data-f="root.renameVal" value="${esc(st.renameVal)}"><button class="btn small" style="min-height:48px" type="submit">שמירה</button></div></form>`
          : `<div class="card" style="display:flex;align-items:center;gap:4px;padding:8px 14px"><div class="grow"><div style="font-weight:600;font-size:17px">${esc(a.name)}</div><div class="mut">${count(a.id)} הזמנות פתוחות</div></div>
            <button type="button" class="icon" data-a="editArea" data-v="${esc(a.id)}">עריכה</button><button type="button" class="icon" data-a="delArea" data-v="${esc(a.id)}">מחיקה</button></div>`).join('')
          : '<div class="empty">עדיין אין אזורים. הוסף את האזור הראשון.</div>'}
      </main>`;
    }

    function pushBanner() {
      if (db.demo || !db.pushSupported() || db.pushState() === 'granted') return '';
      return `<div class="card pad"><div>הפעל התראות כדי לקבל פוש על כל מסירה ותשלום.</div><button class="btn small" type="button" data-a="enablePush">הפעלת התראות</button></div>`;
    }

    function draw() {
      if (st.user === undefined) return;
      let v;
      if (!st.user) v = loginView();
      else if (st.managers === null && !db.demo) v = '<div class="empty" style="margin:auto">טוען...</div>';
      else if (!isAllowed()) v = gateView();
      else if (st.sub === 'assign') v = assignView();
      else if (st.sub === 'driverForm') v = driverForm();
      else if (st.sub === 'created') v = createdView();
      else if (st.sub === 'areas') v = areasView();
      else if (st.sub === 'reports') v = reportsView();
      else if (st.sub === 'settings') v = settingsView();
      else if (st.sub === 'customers') v = customersView();
      else if (st.sub === 'custForm') v = custForm();
      else v = { new: newView, orders: ordersView, track: trackView, summary: summaryView, drivers: driversView }[st.tab]();
      g.UI.render(root, (db.demo ? '<div class="demo">מצב הדגמה · נתונים לדוגמה</div>' : '') + v);
    }

    /* ---------- פעולות ---------- */
    const friendly = (e) => {
      const c = (e && (e.code || e.message)) || '';
      if (/email-already/.test(c)) return 'סיסמת העסק כבר נוצרה. לחץ "כבר יש סיסמה" והזן אותה.';
      if (/weak-password/.test(c)) return 'הסיסמה צריכה לפחות 6 תווים.';
      if (/too-many/.test(c)) return 'יותר מדי ניסיונות. המתן כמה דקות.';
      if (/network/.test(c)) return 'אין חיבור לרשת. נסה שוב.';
      if (/^exists$|functions\/already-exists/.test(c)) return 'כבר קיים נהג עם המספר הזה.';
      if (/credential|wrong-password|user-not-found/.test(c)) return 'הסיסמה לא נכונה.';
      return `הפעולה נכשלה. נסה שוב. (קוד שגיאה: ${c || 'לא ידוע'})`;
    };
    const run = async (f) => {
      if (st.busy) return;
      st.busy = true; st.err = ''; draw();
      try { await f(); } catch (e) { console.error(e); st.err = friendly(e); }
      st.busy = false; draw();
    };
    const validPhone = (p) => /^\d{9,10}$/.test(db.digits(p));

    function readOrderForm() {
      const o = st.order;
      const amount = Number(String(o.amount).replace(/[^\d.]/g, ''));
      const miss = !o.customer.trim() ? 'שם הלקוח' : !validPhone(o.phone) ? 'טלפון תקין' : !o.city.trim() ? 'עיר' : !o.areaId ? 'אזור' : !o.product.trim() ? 'מוצר' : !(amount > 0) ? 'סכום לגבייה' : '';
      if (miss) { st.err = `חסר: ${miss}.`; return null; }
      const data = { customer: o.customer.trim(), phone: o.phone.trim(), city: o.city.trim(), address: o.address.trim(), areaId: o.areaId, areaName: areaName(o.areaId), product: o.product.trim(), qty: String(o.qty || '').trim(), amount };
      if (o.id) data.id = o.id;
      return data;
    }

    const submits = {
      login() {
        const l = st.login;
        if (!l.password) { st.err = 'הזן סיסמה.'; return draw(); }
        run(() => (l.register ? db.createBusiness(l.password) : db.signIn(l.password)));
      },
      order() {
        const data = readOrderForm();
        if (!data) return draw();
        run(async () => {
          await db.saveOrder(data);
          const wasEdit = !!data.id;
          st.order = emptyOrder();
          if (wasEdit) st.tab = 'orders';
          g.UI.toast(root, wasEdit ? 'השינויים נשמרו' : 'ההזמנה נשמרה', `${data.customer} · ${data.city}`);
        });
      },
      gate() {
        const g0 = st.gate, first = !st.managers.length;
        if (first && !g0.name.trim()) { st.err = 'חסר: השם שלך.'; return draw(); }
        if (!validPhone(g0.phone)) { st.err = 'חסר: טלפון תקין.'; return draw(); }
        const inList = st.managers.some((m) => db.digits(m.phone) === db.digits(g0.phone));
        if (!first && !inList) { st.err = 'המספר לא ברשימת המנהלים. בקש ממנהל להוסיף אותך.'; return draw(); }
        run(async () => {
          if (first) await db.saveManagers([{ name: g0.name.trim(), phone: g0.phone.trim() }]);
          st.myPhone = g0.phone.trim();
          try { localStorage.setItem(PHONE_KEY, st.myPhone); } catch (e) { /* נשמר עד הסגירה */ }
        });
      },
      custSave() {
        const c = st.cust;
        if (!c.name.trim()) { st.err = 'חסר: שם.'; return draw(); }
        if (!validPhone(c.phone)) { st.err = 'חסר: טלפון תקין.'; return draw(); }
        run(async () => {
          const list = [...st.customers];
          list[st.custIdx] = { name: c.name.trim(), phone: c.phone.trim(), city: c.city.trim(), address: c.address.trim(), areaId: c.areaId };
          await db.saveCustomers(list);
          st.sub = 'customers';
        });
      },
      addManager() {
        const a = st.addMgr;
        if (!a.name.trim()) { st.err = 'חסר: שם המנהל.'; return draw(); }
        if (!validPhone(a.phone)) { st.err = 'חסר: טלפון תקין.'; return draw(); }
        if ((st.managers || []).some((m) => db.digits(m.phone) === db.digits(a.phone))) { st.err = 'המספר הזה כבר ברשימה.'; return draw(); }
        run(async () => {
          await db.saveManagers([...(st.managers || []), { name: a.name.trim(), phone: a.phone.trim() }]);
          st.addMgr = { name: '', phone: '' };
          g.UI.toast(root, 'המנהל נוסף', 'שלח לו את הקישור ואת סיסמת העסק');
        });
      },
      driver() {
        const d = st.driver;
        if (!d.name.trim()) { st.err = 'חסר: שם הנהג.'; return draw(); }
        if (!validPhone(d.phone)) { st.err = 'חסר: טלפון תקין.'; return draw(); }
        if (!d.areaId) { st.err = 'חסר: אזור.'; return draw(); }
        run(async () => {
          if (st.editDriverId) {
            await db.updateDriver(st.editDriverId, { name: d.name.trim(), areaId: d.areaId });
            st.sub = null;
          } else {
            if (st.drivers.some((x) => db.digits(x.phone) === db.digits(d.phone))) throw new Error('exists');
            await db.createDriver({ name: d.name.trim(), phone: d.phone.trim(), areaId: d.areaId });
            st.created = { name: d.name.trim() };
            st.sub = 'created';
          }
          st.driver = emptyDriver(); st.editDriverId = null;
        });
      },
      area() {
        const n = st.newArea.trim();
        if (!n) { st.err = 'כתוב שם לאזור.'; return draw(); }
        if (st.areas.some((a) => a.name === n)) { st.err = 'כבר יש אזור בשם הזה.'; return draw(); }
        run(async () => { await db.addArea(n); st.newArea = ''; });
      },
      renameArea() {
        const n = (st.renameVal || '').trim();
        if (!n) return;
        run(async () => { await db.renameArea(st.editArea, n); st.editArea = null; });
      }
    };

    const actions = {
      tab(v) { go(() => { st.tab = v; st.sub = null; }); },
      toggleRegister() { go(() => { st.login.register = !st.login.register; }); },
      areas() { go(() => { st.sub = 'areas'; }); },
      back() { go(() => { st.sub = null; st.editDriverId = null; st.driver = emptyDriver(); st.created = null; }); },
      cancelEdit() { go(() => { st.order = emptyOrder(); st.tab = 'orders'; }); },
      sel(v) { st.sel.has(v) ? st.sel.delete(v) : st.sel.add(v); draw(); },
      selArea(v) {
        const [day, area] = v.split('|');
        const os = st.orders.filter((o) => o.status === 'new' && o.areaId === area && o.day === day);
        const all = os.every((o) => st.sel.has(o.id));
        os.forEach((o) => (all ? st.sel.delete(o.id) : st.sel.add(o.id)));
        draw();
      },
      editOrder(v) {
        const o = st.orders.find((x) => x.id === v);
        go(() => { st.order = { id: o.id, customer: o.customer, phone: o.phone, city: o.city, address: o.address || '', areaId: o.areaId, product: o.product, qty: o.qty || '', status: o.status, amount: String(o.amount) }; st.tab = 'new'; });
      },
      cancelOrder(v) {
        const o = st.orders.find((x) => x.id === v);
        g.UI.sheet(root, `<h2>לבטל את ההזמנה?</h2><div>${esc(o.customer)} · ${esc(o.city)} · ${money(o.amount)}</div><div class="mut" style="color:#3F4B45">הלקוח יימחק גם מהרשימה של ${esc(o.driverName)}.</div>
          <button class="btn" style="background:#A32B12" data-s="yes">ביטול ההזמנה</button><button class="btn ghost" data-s="close">חזרה</button>`, () => run(() => db.deleteOrder(v)));
      },
      delOrder(v) {
        g.UI.sheet(root, `<h2>למחוק את ההזמנה?</h2><button class="btn" data-s="yes">מחיקה</button><button class="btn ghost" data-s="close">ביטול</button>`, () => run(async () => {
          await db.deleteOrder(v); st.sel.delete(v); st.order = emptyOrder(); st.tab = 'orders';
        }));
      },
      quickSend() {
        st.err = '';
        const data = readOrderForm();
        if (!data) return draw();
        if (!st.drivers.length) { st.err = 'עדיין אין נהגים. צור נהג בלשונית "נהגים".'; return draw(); }
        run(async () => {
          const id = await db.saveOrder(data);
          st.order = emptyOrder();
          const open = (d) => st.orders.filter((o) => o.driverId === d && o.status === 'sent').length;
          const list = [...st.drivers].sort((a, b) => (b.areaId === data.areaId ? 1 : 0) - (a.areaId === data.areaId ? 1 : 0));
          g.UI.sheet(root, `<h2>למי לשלוח את ההזמנה?</h2>
            <div class="mut">${esc(data.customer)} · ${esc(data.city)} · ${esc(prod(data))} · ${money(data.amount)}</div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto">
            ${list.map((d) => `<button type="button" class="drvpick" data-s="${esc(d.id)}"><span class="ava">${esc(d.name[0] || '')}</span>
              <span class="grow"><span style="display:block;font-weight:600">${esc(d.name)} ${d.areaId === data.areaId ? '<span class="tag">האזור שלו</span>' : ''}</span>
              <span class="mut" style="display:block">${esc(areaName(d.areaId, ''))} · ${open(d.id) ? `${open(d.id)} משלוחים פתוחים` : 'אין משלוחים פתוחים'}</span></span></button>`).join('')}
            </div><button type="button" class="btn ghost" data-s="close">ביטול</button>`, (driverId) => {
            const d = st.drivers.find((x) => x.id === driverId);
            run(async () => { await db.dispatch([id], d); g.UI.toast(root, `נשלח ל${d.name}`, `${data.customer} · ${data.city}`); });
          });
        });
      },
      assign() { go(() => { st.sub = 'assign'; const ids = new Set(st.orders.filter((o) => st.sel.has(o.id)).map((o) => o.areaId)); const m = st.drivers.filter((d) => ids.has(d.areaId)); st.pick = m.length === 1 ? m[0].id : null; }); },
      pick(v) { st.pick = v; draw(); },
      send() {
        const d = st.drivers.find((x) => x.id === st.pick);
        const ids = st.orders.filter((o) => st.sel.has(o.id) && o.status === 'new').map((o) => o.id);
        if (!d || !ids.length) return;
        run(async () => {
          await db.dispatch(ids, d);
          st.sel.clear(); st.sub = null; st.tab = 'track';
          g.UI.toast(root, `נשלח ל${d.name}`, `${ids.length} הזמנות`);
        });
      },
      toggleDriver(v) { st.openDriver = st.openDriver === v ? null : v; draw(); },
      dayShift(v) {
        const d = new Date(st.day + 'T12:00'); d.setDate(d.getDate() + Number(v));
        st.day = db.today(d); st.showDetail = false; subOrders(); draw();
      },
      customers() { go(() => { st.sub = 'customers'; }); },
      editCustomer(i) { go(() => { st.custIdx = Number(i); st.cust = { ...emptyCust(), ...st.customers[Number(i)] }; st.sub = 'custForm'; }); },
      delCustomer(i) {
        const c = st.customers[Number(i)];
        g.UI.sheet(root, `<h2>למחוק את ${esc(c.name)} מהלקוחות הקבועים?</h2><div class="mut" style="color:#3F4B45">הזמנות קיימות לא ישתנו.</div><button class="btn" style="background:#A32B12" data-s="yes">מחיקה</button><button class="btn ghost" data-s="close">ביטול</button>`, () => run(() => db.saveCustomers(st.customers.filter((x) => x !== c))));
      },
      saveCustomer() {
        const o = st.order; st.err = '';
        if (!o.customer.trim()) { st.err = 'חסר: שם הלקוח.'; return draw(); }
        if (!validPhone(o.phone)) { st.err = 'חסר: טלפון תקין.'; return draw(); }
        const entry = { name: o.customer.trim(), phone: o.phone.trim(), city: o.city.trim(), address: o.address.trim(), areaId: o.areaId };
        const i = st.customers.findIndex((c) => db.digits(c.phone) === db.digits(o.phone));
        run(async () => {
          const list = [...st.customers];
          if (i >= 0) list[i] = entry; else list.push(entry);
          await db.saveCustomers(list);
          g.UI.toast(root, i >= 0 ? 'הלקוח הקבוע עודכן' : 'הלקוח נוסף ללקוחות הקבועים', entry.name);
        });
      },
      pickCustomer(i) {
        const c = st.customers[Number(i)];
        go(() => { Object.assign(st.order, { customer: c.name, phone: c.phone, city: c.city, address: c.address, areaId: c.areaId || st.order.areaId }); });
      },
      pickStreet(v) {
        st.order.address = v + ' ';
        const el = root.querySelector('#addr');
        if (el) { el.value = st.order.address; el.focus(); }
        fillSug('sug-addr', '');
      },
      settings() { go(() => { st.sub = 'settings'; }); },
      removeManager(i) {
        const m = st.managers[Number(i)];
        g.UI.sheet(root, `<h2>להסיר את ${esc(m.name)}?</h2><div class="mut" style="color:#3F4B45">הוא לא יוכל להשתמש באפליקציית המנהל בפתיחה הבאה.</div>
          <button class="btn" style="background:#A32B12" data-s="yes">הסרה</button><button class="btn ghost" data-s="close">ביטול</button>`, () => run(() => db.saveManagers(st.managers.filter((x) => x !== m))));
      },
      resetAsk() {
        const WORD = 'מחיקה';
        const sh = g.UI.sheet(root, `<h2 style="color:#A32B12">למחוק את כל הנתונים?</h2>
          <div style="line-height:1.5">הזמנות, משלוחים שנסגרו ודוחות יימחקו מהאפליקציה שלך. <b>אי אפשר לשחזר אותם.</b></div>
          <div class="mut" style="color:#3F4B45">אצל הנהגים לא נמחק כלום. משלוחים שבדרך, נהגים ואזורים יישארו.</div>
          <div class="field"><label for="resetword">כדי לאשר, כתוב: ${WORD}</label><input id="resetword" autocomplete="off"></div>
          <button class="btn" style="background:#A32B12" data-s="yes" disabled>מחיקת כל הנתונים</button><button class="btn ghost" data-s="close">ביטול</button>`, () => run(async () => {
          await db.clearManager();
          st.sel.clear(); st.showDetail = false; st.openDriver = null; st.sub = null; st.tab = 'new';
          g.UI.toast(root, 'הנתונים נמחקו', 'אצל הנהגים לא השתנה כלום');
        }));
        sh.querySelector('#resetword').addEventListener('input', (e) => { sh.querySelector('[data-s="yes"]').disabled = e.target.value.trim() !== WORD; });
      },
      reports() { go(() => { st.sub = 'reports'; }); },
      approve(v) { run(() => db.approveReport(v)); },
      openPdf(v) { const r = st.reports.find((x) => x.id === v); run(() => g.Report.open(r, false)); },
      payDriver(v) {
        const r = st.reports.find((x) => x.id === v);
        const sh = g.UI.sheet(root, `<h2>תשלום ל${esc(r.driverName)}</h2>
          <div class="field"><label for="payval">סכום (₪)</label><input id="payval" class="big" inputmode="decimal" value="${r.payment != null ? esc(r.payment) : ''}" autocomplete="off"></div>
          <button class="btn" data-s="yes">שלח</button><button class="btn ghost" data-s="close">ביטול</button>`, (_, val) => {
          const amount = Number(String(val).replace(/[^\d.]/g, ''));
          if (!(amount > 0)) { st.err = 'כתוב סכום לתשלום.'; return draw(); }
          run(async () => { await db.setPayment(v, amount); g.UI.toast(root, `נשלח ל${r.driverName}`, `תשלום מנהל ${money(amount)}`); });
        });
        sh.querySelector('#payval').focus();
      },
      toggleDetail() { st.showDetail = !st.showDetail; draw(); },
      returnOrder(v) { run(() => db.returnToOrders(v)); },
      reopen(v) {
        g.UI.sheet(root, `<h2>לבטל את סימון התשלום?</h2><p class="mut">ההזמנה תחזור לנהג כפתוחה.</p><button class="btn" data-s="yes">ביטול הסימון</button><button class="btn ghost" data-s="close">השארה</button>`, () => run(() => db.reopenToDriver(v)));
      },
      csv() {
        const os = st.orders.filter((o) => o.day === st.day && ['sent', 'paid', 'failed'].includes(o.status));
        const label = { sent: 'בדרך', paid: 'נמסר ושולם', failed: 'לא נמסר' };
        const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
        const rows = [['לקוח', 'טלפון', 'עיר', 'כתובת', 'אזור', 'מוצר', 'כמות', 'סכום', 'משלוח', 'נהג', 'סטטוס', 'סיבה'].map(q).join(',')]
          .concat(os.map((o) => [o.customer, o.phone, o.city, o.address, areaName(o.areaId, o.areaName), o.product, o.qty || '', o.amount, o.fee || 0, o.driverName, label[o.status], o.failReason].map(q).join(',')));
        if (g.AndroidApp) return g.AndroidApp.shareFile(`סיכום-${st.day}.csv`, '\ufeff' + rows.join('\r\n'));
        const url = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `סיכום-${st.day}.csv`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      resetDemo() { db.resetDemo(); st.sel.clear(); },
      newDriver() {
        go(() => { st.editDriverId = null; st.driver = emptyDriver(); st.sub = 'driverForm'; });
      },
      editDriver(v) {
        const d = st.drivers.find((x) => x.id === v);
        go(() => { st.editDriverId = v; st.driver = { name: d.name, phone: d.phone, areaId: d.areaId || '' }; st.sub = 'driverForm'; });
      },
      delDriver() {
        const id = st.editDriverId;
        if (st.orders.some((o) => o.driverId === id && o.status === 'sent')) { st.err = 'לנהג יש משלוחים פתוחים, אי אפשר למחוק אותו עכשיו.'; return draw(); }
        g.UI.sheet(root, `<h2>למחוק את הנהג?</h2><p class="mut">הוא לא יוכל להיכנס יותר לאפליקציה.</p><button class="btn" data-s="yes">מחיקה</button><button class="btn ghost" data-s="close">ביטול</button>`, () => run(async () => {
          await db.deleteDriver(id); st.sub = null; st.editDriverId = null; st.driver = emptyDriver();
        }));
      },
      editArea(v) { go(() => { st.editArea = v; st.renameVal = (st.areas.find((a) => a.id === v) || {}).name; }); },
      delArea(v) {
        const used = st.drivers.some((d) => d.areaId === v) || st.orders.some((o) => o.areaId === v && ['new', 'sent'].includes(o.status));
        if (used) { st.err = 'האזור בשימוש של נהג או הזמנה פתוחה, אי אפשר למחוק אותו.'; return draw(); }
        g.UI.sheet(root, `<h2>למחוק את האזור?</h2><button class="btn" data-s="yes">מחיקה</button><button class="btn ghost" data-s="close">ביטול</button>`, () => run(() => db.deleteArea(v)));
      },
      async enablePush() { await db.enablePush().catch((e) => console.error(e)); draw(); }
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && root.contains(b) && actions[b.dataset.a]) {
        if (b.type === 'checkbox') e.stopPropagation();
        actions[b.dataset.a](b.dataset.v);
      }
    });
    root.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-submit]');
      if (f) { e.preventDefault(); submits[f.dataset.submit](); }
    });
    function fillSug(id, html) {
      const el = root.querySelector('#' + id);
      if (el) { el.innerHTML = html; el.style.display = html ? 'block' : 'none'; }
    }
    function suggestCustomers(field, id) {
      const v = st.order[field].trim();
      if (st.order.id || v.length < 2) return fillSug(id, '');
      const dv = db.digits(v);
      const hits = st.customers.map((c, i) => ({ c, i })).filter(({ c }) => (field === 'customer' ? c.name.startsWith(v) : dv && db.digits(c.phone).startsWith(dv))).slice(0, 5);
      fillSug(id, hits.map(({ c, i }) => `<button type="button" data-a="pickCustomer" data-v="${i}"><b>${esc(c.name)}</b> <span class="mut">${esc(c.city)} · ${esc(c.phone)}</span></button>`).join(''));
    }
    let streetSeq = 0;
    async function suggestStreets() {
      const typed = st.order.address.trim();
      // אחרי שנבחר רחוב ומוקלד מספר בית אין צורך ברשימה
      if (typed.length < 1 || /\d/.test(typed)) return fillSug('sug-addr', '');
      const seq = ++streetSeq;
      const list = await g.UI.streetsOf(st.order.city);
      if (seq !== streetSeq || st.order.address.trim() !== typed) return;
      const hits = list.filter((x) => x.startsWith(typed)).slice(0, 8);
      fillSug('sug-addr', hits.map((x) => `<button type="button" data-a="pickStreet" data-v="${esc(x)}">${esc(x)}</button>`).join(''));
    }
    const onField = (e) => {
      const f = e.target.dataset && e.target.dataset.f;
      if (!f) return;
      const [form, key] = f.split('.');
      if (e.target.value === '__new') { e.target.value = ''; return go(() => { st.sub = 'areas'; }); }
      if (form === 'root') st[key] = e.target.value; else st[form][key] = e.target.value;
      if (form === 'order') {
        if (key === 'customer') suggestCustomers('customer', 'sug-cust');
        if (key === 'phone') suggestCustomers('phone', 'sug-phone');
        if (key === 'address') suggestStreets();
      }
    };
    root.addEventListener('input', onField);

    g.handleBack = () => {
      const sc = root.querySelector(':scope > .scrim');
      if (sc) { sc.remove(); return true; }
      if (st.sub) { actions.back(); return true; }
      if (st.user && st.tab !== 'new') { actions.tab('new'); return true; }
      return false;
    };
    db.onPush((p) => { g.UI.toast(root, p.title, p.body); });
    db.onAuth((u) => {
      st.user = u;
      unsub.splice(0).forEach((f) => f());
      if (unsubOrders) { unsubOrders(); unsubOrders = null; }
      if (u) {
        unsub.push(db.watchCustomers((l) => { st.customers = l; draw(); }));
        unsub.push(db.watchManagers((l) => { st.managers = l; draw(); }));
        unsub.push(db.watchAreas((a) => { st.areas = a; draw(); }));
        unsub.push(db.watchDrivers((d) => { st.drivers = d; draw(); }));
        subOrders();
      }
      draw();
    });
    return { state: st };
  };
})(self);
