// שכבת הנתונים המשותפת: Firebase בפרודקשן, או מצב הדגמה מקומי כשאין הגדרות חיבור.
(function (g) {
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const BUSINESS_EMAIL = 'business@mishmish.app'; // חשבון אחד לכל העסק, הסיסמה היא סיסמת העסק
  const lastDays = (n = 14) => { const out = []; const d = new Date(); for (let i = 0; i < n; i++) { out.push(dayKey(d)); d.setDate(d.getDate() - 1); } return out; };
  const by = (k) => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''), 'he');

  /* ---------- מצב הדגמה ---------- */
  const KEY = 'mishloach-demo-v5';
  function seed() {
    const a = [['a1', 'צפון'], ['a2', 'מרכז'], ['a3', 'דרום']].map(([id, name]) => ({ id, name }));
    const dr = [['d1', 'משה', '050-000-0201', 'a1'], ['d2', 'עמית', '050-000-0202', 'a2'], ['d3', 'סאמר', '050-000-0203', 'a3']]
      .map(([id, name, phone, areaId]) => ({ id, name, phone, areaId }));
    const o = [['נועה לוי', '052-000-0101', 'חיפה', 'הנשיא 12', 'a1', 'מארז פרימיום × 2', 480], ['יוסי כהן', '052-000-0102', 'קריית אתא', 'הגפן 7', 'a1', 'מארז בסיסי × 1', 150], ['דני אברהם', '052-000-0103', 'פתח תקווה', 'רוטשילד 4', 'a2', 'מארז בסיסי × 2', 300]]
      .map(([customer, phone, city, address, areaId, product, amount], i) => ({ id: 'o' + i, customer, phone, city, address, areaId, product, amount, status: 'new', day: dayKey(), createdAt: Date.now() }));
    return { areas: a, drivers: dr, orders: o, reports: [], managers: [{ name: 'מנהל לדוגמה', phone: '050-000-0301' }], customers: [], push: null, seq: 100 };
  }
  const store = {
    s: null, subs: new Set(), pushSubs: new Set(), lastPush: null,
    load() {
      try { this.s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.s = null; }
      if (!this.s) this.s = seed();
      this.lastPush = this.s.push && this.s.push.id;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) { /* הדגמה בזיכרון בלבד */ } },
    emit() { this.subs.forEach((f) => f()); this.firePush(); },
    commit() { this.save(); this.emit(); },
    firePush() {
      const p = this.s.push;
      if (p && p.id !== this.lastPush) { this.lastPush = p.id; this.pushSubs.forEach((f) => f(p)); }
    },
    id() { this.s.seq++; return 'x' + this.s.seq; },
    notify(target, title, body) { this.s.push = { id: this.id(), target, title, body }; },
    reset() { this.s = seed(); this.commit(); }
  };

  function demoDB(role) {
    if (!store.s) {
      store.load();
      g.addEventListener && g.addEventListener('storage', (e) => { if (e.key === KEY) { store.load2 = 1; try { store.s = JSON.parse(e.newValue) || seed(); } catch (x) { store.s = seed(); } store.emit(); } });
    }
    const sessKey = KEY + '-session-' + role;
    let user = role === 'manager' ? { uid: 'm1', email: 'demo' } : null;
    try { user = JSON.parse(localStorage.getItem(sessKey)) || user; } catch (e) { /* אין */ }
    const authSubs = new Set();
    let pushKey = role === 'manager' ? 'manager' : null;
    const setUser = (u) => { user = u; try { u ? localStorage.setItem(sessKey, JSON.stringify(u)) : localStorage.removeItem(sessKey); } catch (e) { /* אין */ } authSubs.forEach((f) => f(user)); };
    const watch = (fn, cb) => { const run = () => cb(fn()); store.subs.add(run); setTimeout(run, 0); return () => store.subs.delete(run); };
    const order = (id) => store.s.orders.find((o) => o.id === id);
    return {
      demo: true, role, today: dayKey, digits,
      resetDemo: () => store.reset(),
      onAuth(cb) { authSubs.add(cb); setTimeout(() => cb(user), 0); },
      async signIn() { setUser({ uid: 'business' }); },
      async createBusiness() { setUser({ uid: 'business' }); },
      setPushKey(k) { pushKey = k; },
      watchAreas: (cb) => watch(() => [...store.s.areas].sort(by('name')), cb),
      async addArea(name) { store.s.areas.push({ id: store.id(), name }); store.commit(); },
      async renameArea(id, name) { store.s.areas.find((a) => a.id === id).name = name; store.commit(); },
      async deleteArea(id) { store.s.areas = store.s.areas.filter((a) => a.id !== id); store.commit(); },
      watchDrivers: (cb) => watch(() => store.s.drivers.map(({ code, ...d }) => d).sort(by('name')), cb),
      watchMe: (uid, cb) => watch(() => store.s.drivers.find((d) => d.id === uid) || null, cb),
      async createDriver(d) {
        if (store.s.drivers.some((x) => digits(x.phone) === digits(d.phone))) throw new Error('exists');
        store.s.drivers.push({ id: store.id(), ...d }); store.commit();
      },
      async updateDriver(id, f) { Object.assign(store.s.drivers.find((d) => d.id === id), f); store.commit(); },
      async deleteDriver(id) { store.s.drivers = store.s.drivers.filter((d) => d.id !== id); store.commit(); },
      watchOrders: (days, cb) => watch(() => store.s.orders.filter((o) => o.status === 'new' || o.status === 'sent' || days.includes(o.day)), cb),
      watchMine: (uid, cb) => watch(() => store.s.orders.filter((o) => o.driverId === uid && (o.status === 'sent' || lastDays().includes(o.day))), cb),
      watchReports: (days, cb) => watch(() => store.s.reports.filter((r) => days.includes(r.day)), cb),
      watchMyReports: (uid, cb) => watch(() => store.s.reports.filter((r) => r.driverId === uid && lastDays().includes(r.day)), cb),
      async sendReport(r) {
        const id = `${r.driverId}_${r.day}`;
        const old = store.s.reports.find((x) => x.id === id);
        if (old) Object.assign(old, r, { sentAtMs: Date.now() }); else store.s.reports.push({ ...r, id, approved: false, sentAtMs: Date.now() });
        const diff = r.counted - r.expected;
        store.notify('manager', `דוח יום מ${r.driverName}`, `להעברה ₪${r.expected.toLocaleString('he-IL')} · נספרו ₪${r.counted.toLocaleString('he-IL')}${diff ? ` · ${diff < 0 ? 'חסרים' : 'עודף'} ₪${Math.abs(diff).toLocaleString('he-IL')}` : ''}`);
        store.commit();
      },
      async approveReport(id) { store.s.reports.find((x) => x.id === id).approved = true; store.commit(); },
      async setPayment(id, amount) {
        const r = store.s.reports.find((x) => x.id === id);
        r.payment = amount;
        store.notify('driver:' + r.driverId, 'תשלום מנהל', `₪${amount.toLocaleString('he-IL')}`);
        store.commit();
      },
      async setFee(id, fee) { order(id).fee = fee; store.commit(); },
      watchCustomers: (cb) => watch(() => store.s.customers, cb),
      async saveCustomers(list) { store.s.customers = list; store.commit(); },
      watchManagers: (cb) => watch(() => store.s.managers, cb),
      async saveManagers(list) { store.s.managers = list; store.commit(); },
      async clearManager() {
        store.s.orders = store.s.orders.filter((o) => o.status !== 'new');
        const hide = (x) => { x.hiddenManager = true; return !x.hiddenDriver; };
        store.s.orders = store.s.orders.filter((o) => o.status === 'sent' || hide(o));
        store.s.reports = store.s.reports.filter(hide);
        store.commit();
      },
      async clearDriver(id) {
        const hide = (x) => { if (x.driverId !== id) return true; x.hiddenDriver = true; return !x.hiddenManager; };
        store.s.orders = store.s.orders.filter((o) => o.status === 'sent' || o.status === 'new' || hide(o));
        store.s.reports = store.s.reports.filter(hide);
        store.commit();
      },
      async saveOrder(o) {
        const id = o.id || store.id();
        if (o.id) Object.assign(order(o.id), o);
        else store.s.orders.push({ ...o, id, status: 'new', day: dayKey(), createdAt: Date.now() });
        store.commit();
        return id;
      },
      async deleteOrder(id) { store.s.orders = store.s.orders.filter((o) => o.id !== id); store.commit(); },
      async dispatch(ids, driver) {
        ids.forEach((id) => Object.assign(order(id), { status: 'sent', driverId: driver.id, driverName: driver.name, day: dayKey(), sentAt: Date.now() }));
        const total = ids.reduce((s, id) => s + order(id).amount, 0);
        store.notify('driver:' + driver.id, ids.length === 1 ? 'משלוח חדש' : `${ids.length} משלוחים חדשים`, `₪${total.toLocaleString('he-IL')} לגבייה`);
        store.commit();
      },
      async markPaid(id) {
        const o = order(id); Object.assign(o, { status: 'paid', day: dayKey(), doneAt: Date.now() });
        store.notify('manager', `נמסר ושולם · ₪${o.amount.toLocaleString('he-IL')}`, `${o.driverName} מסר ל${o.customer} ב${o.city}`);
        store.commit();
      },
      async markFailed(id, reason) {
        const o = order(id); Object.assign(o, { status: 'failed', failReason: reason, day: dayKey(), doneAt: Date.now() });
        store.notify('manager', 'לא נמסר', `${o.driverName} · ${o.customer} · ${reason}`);
        store.commit();
      },
      async returnToOrders(id) { Object.assign(order(id), { status: 'new', driverId: null, driverName: null, failReason: null, day: dayKey() }); store.commit(); },
      async reopenToDriver(id) { Object.assign(order(id), { status: 'sent', failReason: null }); store.commit(); },
      pushSupported: () => true,
      pushState: () => 'granted',
      async enablePush() { return 'granted'; },
      onPush(cb) {
        store.pushSubs.add((p) => {
          if (p.target === 'manager' ? role === 'manager' : (role === 'driver' && p.target === 'driver:' + pushKey)) cb(p);
        });
      }
    };
  }

  /* ---------- Firebase ---------- */
  function fireDB(role) {
    const cfg = g.APP_CONFIG;
    const fb = g.firebase;
    if (!fb.apps.length) fb.initializeApp(cfg.firebase);
    const auth = fb.auth(), fs = fb.firestore();
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    const col = (n) => fs.collection(n);
    const withMs = (r) => ({ ...r, sentAtMs: r.sentAt && r.sentAt.toMillis ? r.sentAt.toMillis() : Date.now() });
    const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const now = () => fb.firestore.FieldValue.serverTimestamp();
    let currentToken = null;
    let pushKey = role === 'manager' ? 'manager' : null; // tokens/manager או tokens/<מזהה נהג>
    const native = g.AndroidApp;
    const saveToken = async (t) => {
      currentToken = t;
      if (pushKey) await col('tokens').doc(pushKey).set({ list: fb.firestore.FieldValue.arrayUnion(t) }, { merge: true });
    };
    const merged = (queries, cb) => {
      const parts = queries.map(() => []);
      const unsubs = queries.map((q, i) => q.onSnapshot((s) => {
        parts[i] = docs(s);
        const m = new Map();
        parts.flat().forEach((o) => m.set(o.id, o));
        cb([...m.values()]);
      }, (e) => console.error(e)));
      return () => unsubs.forEach((u) => u());
    };
    // מבקש מהשרת הקטן לשלוח פוש. כישלון כאן לא פוגע בנתונים, שכבר נשמרו.
    const notify = async (payload) => {
      try {
        if (!cfg.pushUrl || !auth.currentUser) return;
        const id = await auth.currentUser.getIdToken();
        const r = await fetch(cfg.pushUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${id}` }, body: JSON.stringify(payload) });
        if (!r.ok) console.error('push', r.status);
      } catch (e) { console.error('push', e); }
    };
    // בלי קליטה Firestore שומר מקומית ומסיים רק כשהרשת חוזרת: לא משאירים את הנהג מחכה
    const saveThenNotify = (write, payload) => {
      const done = write.then(() => notify(payload));
      done.catch((e) => console.error(e));
      return Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
    };
    const runBatches = async (ops) => {
      for (let i = 0; i < ops.length; i += 400) {
        const b = fs.batch();
        ops.slice(i, i + 400).forEach((f) => f(b));
        await b.commit();
      }
    };
    const swReg = () => navigator.serviceWorker.register('sw.js');
    return {
      demo: false, role, today: dayKey, digits,
      onAuth(cb) {
        auth.onAuthStateChanged((u) => {
          cb(u ? { uid: u.uid } : null);
          if (u && native && pushKey) this.enablePush().catch((e) => console.error(e));
        });
      },
      signIn: (password) => auth.signInWithEmailAndPassword(BUSINESS_EMAIL, password),
      createBusiness: (password) => auth.createUserWithEmailAndPassword(BUSINESS_EMAIL, password),
      // הנהג בחר את השם שלו: ההתראות יגיעו למכשיר הזה לפי הנהג שנבחר
      async setPushKey(k) {
        if (currentToken && pushKey && pushKey !== k) {
          await col('tokens').doc(pushKey).set({ list: fb.firestore.FieldValue.arrayRemove(currentToken) }, { merge: true }).catch(() => {});
        }
        pushKey = k;
        if (k && native) await this.enablePush().catch((e) => console.error(e));
      },
      watchAreas: (cb) => col('areas').orderBy('name').onSnapshot((s) => cb(docs(s))),
      addArea: (name) => col('areas').add({ name }),
      renameArea: (id, name) => col('areas').doc(id).update({ name }),
      deleteArea: (id) => col('areas').doc(id).delete(),
      watchDrivers: (cb) => col('drivers').orderBy('name').onSnapshot((s) => cb(docs(s))),
      watchMe: (uid, cb) => col('drivers').doc(uid).onSnapshot((d) => cb(d.exists ? { id: d.id, ...d.data() } : null)),
      createDriver: (d) => col('drivers').add({ ...d, createdAt: now() }),
      updateDriver: (id, f) => col('drivers').doc(id).update(f),
      async deleteDriver(id) { await col('drivers').doc(id).delete(); await col('tokens').doc(id).delete().catch(() => {}); },
      watchOrders: (days, cb) => merged([
        col('orders').where('status', 'in', ['new', 'sent']),
        col('orders').where('day', 'in', days)
      ], cb),
      watchMine: (uid, cb) => merged([
        col('orders').where('driverId', '==', uid).where('status', '==', 'sent'),
        col('orders').where('driverId', '==', uid).where('day', 'in', lastDays())
      ], cb),
      watchReports: (days, cb) => col('reports').where('day', 'in', days).onSnapshot((s) => cb(docs(s).map(withMs)), (e) => console.error(e)),
      watchMyReports: (uid, cb) => col('reports').where('driverId', '==', uid).where('day', 'in', lastDays()).onSnapshot((s) => cb(docs(s).map(withMs)), (e) => console.error(e)),
      sendReport(r) {
        const id = `${r.driverId}_${r.day}`;
        return saveThenNotify(col('reports').doc(id).set({ ...r, approved: false, sentAt: now() }, { merge: true }), { kind: 'report', reportId: id });
      },
      approveReport: (id) => col('reports').doc(id).update({ approved: true, approvedAt: now() }),
      setPayment: (id, amount) => saveThenNotify(col('reports').doc(id).update({ payment: amount, paymentAt: now() }), { kind: 'payment', reportId: id }),
      setFee(id, fee) {
        const w = col('orders').doc(id).update({ fee });
        w.catch((e) => console.error(e));
        return Promise.race([w, new Promise((r) => setTimeout(r, 1500))]);
      },
      watchCustomers: (cb) => col('tokens').doc('_customers').onSnapshot((d) => cb(d.exists ? d.data().list || [] : []), (e) => console.error(e)),
      saveCustomers: (list) => col('tokens').doc('_customers').set({ list }),
      // רשימת המנהלים נשמרת כמסמך באוסף tokens, שחוקי ההרשאות כבר מאפשרים
      watchManagers: (cb) => col('tokens').doc('_managers').onSnapshot({ includeMetadataChanges: true }, (d) => {
        if (!d.exists && d.metadata.fromCache) return; // עוד לא יודעים: מחכים לשרת
        cb(d.exists ? d.data().list || [] : []);
      }, (e) => console.error(e)),
      saveManagers: (list) => col('tokens').doc('_managers').set({ list }),
      // כל צד מוחק רק אצלו. המסמך נמחק מהשרת רק אחרי ששני הצדדים מחקו אותו.
      async clearManager() {
        const snaps = await Promise.all([col('orders').get({ source: 'server' }), col('reports').get({ source: 'server' })]);
        const ops = [];
        snaps[0].docs.forEach((d) => {
          const o = d.data();
          if (o.status === 'sent') return;
          if (o.status === 'new' || o.hiddenDriver) ops.push((b) => b.delete(d.ref));
          else ops.push((b) => b.update(d.ref, { hiddenManager: true }));
        });
        snaps[1].docs.forEach((d) => { if (d.data().hiddenDriver) ops.push((b) => b.delete(d.ref)); else ops.push((b) => b.update(d.ref, { hiddenManager: true })); });
        await runBatches(ops);
      },
      async clearDriver(id) {
        const snaps = await Promise.all([col('orders').where('driverId', '==', id).get({ source: 'server' }), col('reports').where('driverId', '==', id).get({ source: 'server' })]);
        const ops = [];
        snaps[0].docs.forEach((d) => {
          const o = d.data();
          if (o.status === 'sent' || o.status === 'new') return;
          if (o.hiddenManager) ops.push((b) => b.delete(d.ref)); else ops.push((b) => b.update(d.ref, { hiddenDriver: true }));
        });
        snaps[1].docs.forEach((d) => { if (d.data().hiddenManager) ops.push((b) => b.delete(d.ref)); else ops.push((b) => b.update(d.ref, { hiddenDriver: true })); });
        await runBatches(ops);
      },
      async saveOrder(o) {
        const { id, ...f } = o;
        if (id) { await col('orders').doc(id).update(f); return id; }
        return (await col('orders').add({ ...f, status: 'new', day: dayKey(), driverId: null, createdAt: now() })).id;
      },
      deleteOrder: (id) => col('orders').doc(id).delete(),
      async dispatch(ids, driver) {
        const batch = fs.batch();
        ids.forEach((id) => batch.update(col('orders').doc(id), { status: 'sent', driverId: driver.id, driverName: driver.name, day: dayKey(), sentAt: now() }));
        await batch.commit();
        notify({ kind: 'dispatch', driverId: driver.id, orderIds: ids });
      },
      markPaid: (id) => saveThenNotify(col('orders').doc(id).update({ status: 'paid', day: dayKey(), doneAt: now() }), { kind: 'done', orderId: id }),
      markFailed: (id, reason) => saveThenNotify(col('orders').doc(id).update({ status: 'failed', failReason: reason, day: dayKey(), doneAt: now() }), { kind: 'done', orderId: id }),
      returnToOrders: (id) => col('orders').doc(id).update({ status: 'new', driverId: null, driverName: null, failReason: null, hiddenDriver: false, day: dayKey() }),
      reopenToDriver: (id) => col('orders').doc(id).update({ status: 'sent', failReason: null, hiddenDriver: false }),
      pushSupported: () => !!native || 'serviceWorker' in navigator && 'Notification' in g && fb.messaging.isSupported(),
      pushState: () => (native ? native.pushState() : ('Notification' in g ? Notification.permission : 'denied')),
      async enablePush() {
        if (native) {
          const t = await new Promise((resolve) => { g.onNativePushToken = resolve; native.requestPushToken(); });
          if (t) await saveToken(t);
          return native.pushState();
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return perm;
        const reg = await swReg();
        currentToken = await fb.messaging().getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
        await saveToken(currentToken);
        return perm;
      },
      onPush(cb) {
        if (native || !('serviceWorker' in navigator) || !fb.messaging.isSupported()) return; // באפליקציה ההתראה מוצגת על ידי המערכת
        fb.messaging().onMessage((m) => {
          const n = (m.notification || {});
          cb({ id: m.messageId, title: n.title, body: n.body });
        });
      }
    };
  }

  // כרטיס "יש גרסה חדשה": מופיע רק כשצריך עדכון של האפליקציה עצמה
  g.showNativeUpdate = function () {
    const root = document.querySelector('.app');
    if (!root || root.querySelector(':scope > .update') || g.updateDismissed) return;
    const u = document.createElement('div');
    u.className = 'update'; u.setAttribute('role', 'status');
    u.innerHTML = '<b>יש גרסה חדשה</b><span>הנתונים שלך יישארו כמו שהם.</span><div class="two"><button type="button" class="btn" data-u="go">עדכון עכשיו</button><button type="button" class="btn ghost" data-u="later">אחר כך</button></div>';
    u.addEventListener('click', (e) => {
      const b = e.target.closest('[data-u]');
      if (!b) return;
      if (b.dataset.u === 'go') g.AndroidApp.installUpdate();
      else { g.updateDismissed = true; u.remove(); }
    });
    root.appendChild(u);
  };
  g.createDB = function (role) {
    if (g.AndroidApp && g.AndroidApp.nativeUpdateAvailable) setTimeout(() => { if (g.AndroidApp.nativeUpdateAvailable()) g.showNativeUpdate(); }, 1500);
    return g.APP_CONFIG && g.APP_CONFIG.firebase ? fireDB(role) : demoDB(role);
  };

  /* ---------- עזרי תצוגה ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const streetsBusy = {};
  g.UI = {
    esc,
    money: (n) => '₪' + Number(n || 0).toLocaleString('he-IL'),
    prod: (o) => o.product + (o.qty && Number(o.qty) > 0 ? ` × ${o.qty}` : ''),
    // רשימת הרחובות של עיר: מאגר הממשלה, ואם הוא לא זמין OpenStreetMap
    async streetsOf(city) {
      const name = String(city || '').trim();
      if (name.length < 2) return [];
      const key = 'mishmish-streets-' + name;
      try { const c = JSON.parse(localStorage.getItem(key)); if (c && c.length) return c; } catch (e) { /* אין */ }
      if (streetsBusy[name]) return streetsBusy[name];
      streetsBusy[name] = (async () => {
        let list = [];
        try {
          const q = encodeURIComponent(JSON.stringify({ 'שם_ישוב': name }));
          const r = await fetch(`https://data.gov.il/api/3/action/datastore_search?resource_id=a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3&limit=5000&q=${q}`);
          const j = await r.json();
          list = ((j.result && j.result.records) || []).filter((x) => String(x['שם_ישוב'] || '').trim() === name).map((x) => String(x['שם_רחוב'] || '').trim());
        } catch (e) { console.error(e); }
        if (!list.length) {
          try {
            const q = `[out:json][timeout:25];area["name"="${name.replace(/"/g, '')}"]["place"]->.a;way(area.a)["highway"]["name"];out tags;`;
            const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            const j = await r.json();
            list = (j.elements || []).map((x) => x.tags && (x.tags['name:he'] || x.tags.name)).filter(Boolean);
          } catch (e) { console.error(e); }
        }
        list = [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
        if (list.length) { try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* עד הסגירה */ } }
        delete streetsBusy[name];
        return list;
      })();
      return streetsBusy[name];
    },
    toast(root, title, body) {
      const t = document.createElement('div');
      t.className = 'toast'; t.setAttribute('role', 'status');
      t.innerHTML = `<i></i><div><b>${esc(title)}</b><span>${esc(body || '')}</span></div>`;
      root.appendChild(t);
      setTimeout(() => t.remove(), 5000);
    },
    // חלונית אישור שלא נחסמת כמו confirm של הדפדפן
    sheet(root, html, onAction) {
      const s = document.createElement('div');
      s.className = 'scrim';
      s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
      s.addEventListener('click', (e) => {
        if (e.target === s) return s.remove();
        const b = e.target.closest('[data-s]');
        if (!b) return;
        if (b.dataset.s === 'close') return s.remove();
        const inp = s.querySelector('input');
        const value = inp ? inp.value : undefined;
        s.remove(); onAction(b.dataset.s, value);
      });
      root.appendChild(s);
      return s;
    },
    render(root, html) {
      const main = root.querySelector('.main');
      const top = main ? main.scrollTop : 0;
      const act = root.ownerDocument.activeElement;
      const fid = act && root.contains(act) && act.id;
      let pos = null;
      try { pos = fid ? act.selectionStart : null; } catch (e) { pos = null; }
      const keep = [...root.querySelectorAll(':scope > .toast, :scope > .scrim, :scope > .update, :scope > .celebrate')];
      root.innerHTML = html;
      keep.forEach((k) => root.appendChild(k));
      const m2 = root.querySelector('.main');
      if (m2) m2.scrollTop = top;
      if (fid) {
        const el = root.querySelector('#' + CSS.escape(fid));
        if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) { /* סוג שדה ללא סמן */ } }
      }
    }
  };
})(self);
