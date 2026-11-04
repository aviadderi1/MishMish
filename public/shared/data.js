// שכבת הנתונים המשותפת: Firebase בפרודקשן, או מצב הדגמה מקומי כשאין הגדרות חיבור.
(function (g) {
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const driverEmail = (phone) => `${digits(phone)}@driver.mishloach.app`;
  const by = (k) => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''), 'he');

  /* ---------- מצב הדגמה ---------- */
  const KEY = 'mishloach-demo-v2';
  function seed() {
    const a = [['a1', 'צפון'], ['a2', 'מרכז'], ['a3', 'דרום']].map(([id, name]) => ({ id, name }));
    const dr = [['d1', 'משה', '050-000-0201', 'a1'], ['d2', 'עמית', '050-000-0202', 'a2'], ['d3', 'סאמר', '050-000-0203', 'a3']]
      .map(([id, name, phone, areaId]) => ({ id, name, phone, areaId, code: '123456' }));
    const o = [['נועה לוי', '052-000-0101', 'חיפה', 'הנשיא 12', 'a1', 'מארז פרימיום × 2', 480], ['יוסי כהן', '052-000-0102', 'קריית אתא', 'הגפן 7', 'a1', 'מארז בסיסי × 1', 150], ['דני אברהם', '052-000-0103', 'פתח תקווה', 'רוטשילד 4', 'a2', 'מארז בסיסי × 2', 300]]
      .map(([customer, phone, city, address, areaId, product, amount], i) => ({ id: 'o' + i, customer, phone, city, address, areaId, product, amount, status: 'new', day: dayKey(), createdAt: Date.now() }));
    return { areas: a, drivers: dr, orders: o, push: null, seq: 100 };
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
    const setUser = (u) => { user = u; try { u ? localStorage.setItem(sessKey, JSON.stringify(u)) : localStorage.removeItem(sessKey); } catch (e) { /* אין */ } authSubs.forEach((f) => f(user)); };
    const watch = (fn, cb) => { const run = () => cb(fn()); store.subs.add(run); setTimeout(run, 0); return () => store.subs.delete(run); };
    const order = (id) => store.s.orders.find((o) => o.id === id);
    return {
      demo: true, role, today: dayKey, digits,
      resetDemo: () => store.reset(),
      onAuth(cb) { authSubs.add(cb); setTimeout(() => cb(user), 0); },
      async signIn(id, secret) {
        if (role === 'manager') return setUser({ uid: 'm1', email: id });
        const d = store.s.drivers.find((x) => digits(x.phone) === digits(id) && x.code === secret);
        if (!d) throw new Error('auth');
        setUser({ uid: d.id });
      },
      async registerManager(email) { setUser({ uid: 'm1', email }); },
      async signOut() { setUser(null); },
      watchAreas: (cb) => watch(() => [...store.s.areas].sort(by('name')), cb),
      async addArea(name) { store.s.areas.push({ id: store.id(), name }); store.commit(); },
      async renameArea(id, name) { store.s.areas.find((a) => a.id === id).name = name; store.commit(); },
      async deleteArea(id) { store.s.areas = store.s.areas.filter((a) => a.id !== id); store.commit(); },
      watchDrivers: (cb) => watch(() => store.s.drivers.map(({ code, ...d }) => d).sort(by('name')), cb),
      watchMe: (uid, cb) => watch(() => store.s.drivers.find((d) => d.id === uid) || null, cb),
      async createDriver(d) {
        if (store.s.drivers.some((x) => digits(x.phone) === digits(d.phone))) throw new Error('exists');
        const code = String(100000 + Math.floor(Math.random() * 900000));
        store.s.drivers.push({ id: store.id(), ...d, code }); store.commit();
        return { code };
      },
      async updateDriver(id, f) { Object.assign(store.s.drivers.find((d) => d.id === id), f); store.commit(); },
      async resetDriverCode(id) { const code = String(100000 + Math.floor(Math.random() * 900000)); store.s.drivers.find((d) => d.id === id).code = code; store.commit(); return { code }; },
      async deleteDriver(id) { store.s.drivers = store.s.drivers.filter((d) => d.id !== id); store.commit(); },
      watchOrders: (days, cb) => watch(() => store.s.orders.filter((o) => o.status === 'new' || o.status === 'sent' || days.includes(o.day)), cb),
      watchMine: (uid, cb) => watch(() => store.s.orders.filter((o) => o.driverId === uid && (o.status === 'sent' || o.day === dayKey())), cb),
      async saveOrder(o) {
        if (o.id) Object.assign(order(o.id), o);
        else store.s.orders.push({ ...o, id: store.id(), status: 'new', day: dayKey(), createdAt: Date.now() });
        store.commit();
      },
      async deleteOrder(id) { store.s.orders = store.s.orders.filter((o) => o.id !== id); store.commit(); },
      async dispatch(ids, driver) {
        ids.forEach((id) => Object.assign(order(id), { status: 'sent', driverId: driver.id, driverName: driver.name, day: dayKey(), sentAt: Date.now() }));
        const total = ids.reduce((s, id) => s + order(id).amount, 0);
        store.notify('driver:' + driver.id, `${ids.length} משלוחים חדשים`, `₪${total.toLocaleString('he-IL')} לגבייה`);
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
          if (p.target === 'manager' ? role === 'manager' : (role === 'driver' && user && p.target === 'driver:' + user.uid)) cb(p);
        });
      }
    };
  }

  /* ---------- Firebase ---------- */
  function fireDB(role) {
    const cfg = g.APP_CONFIG;
    const fb = g.firebase;
    if (!fb.apps.length) fb.initializeApp(cfg.firebase);
    const auth = fb.auth(), fs = fb.firestore(), fns = fb.app().functions(cfg.region);
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    const col = (n) => fs.collection(n);
    const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const call = (name, data) => fns.httpsCallable(name)(data).then((r) => r.data);
    const now = () => fb.firestore.FieldValue.serverTimestamp();
    let currentToken = null;
    const native = g.AndroidApp;
    const saveToken = async (t) => {
      currentToken = t;
      await col('tokens').doc(auth.currentUser.uid).set({ list: fb.firestore.FieldValue.arrayUnion(t) }, { merge: true });
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
    const swReg = () => navigator.serviceWorker.register('sw.js');
    return {
      demo: false, role, today: dayKey, digits,
      onAuth(cb) {
        auth.onAuthStateChanged((u) => {
          cb(u ? { uid: u.uid, email: u.email } : null);
          if (u && native) this.enablePush().catch((e) => console.error(e));
        });
      },
      async signIn(id, secret) {
        const email = role === 'driver' ? driverEmail(id) : id;
        await auth.signInWithEmailAndPassword(email, secret);
        if (role === 'manager') {
          const u = auth.currentUser;
          const m = await fs.collection('managers').doc(u.uid).get();
          if (!m.exists) { await auth.signOut(); throw new Error('auth'); }
        }
      },
      async registerManager(email, password) {
        const c = await auth.createUserWithEmailAndPassword(email, password);
        try { await call('claimFirstManager', {}); } catch (e) { await c.user.delete(); throw new Error('manager-exists'); }
      },
      async signOut() {
        try {
          if (currentToken && auth.currentUser) await col('tokens').doc(auth.currentUser.uid).set({ list: fb.firestore.FieldValue.arrayRemove(currentToken) }, { merge: true });
        } catch (e) { /* לא חוסם יציאה */ }
        await auth.signOut();
      },
      watchAreas: (cb) => col('areas').orderBy('name').onSnapshot((s) => cb(docs(s))),
      addArea: (name) => col('areas').add({ name }),
      renameArea: (id, name) => col('areas').doc(id).update({ name }),
      deleteArea: (id) => col('areas').doc(id).delete(),
      watchDrivers: (cb) => col('drivers').orderBy('name').onSnapshot((s) => cb(docs(s))),
      watchMe: (uid, cb) => col('drivers').doc(uid).onSnapshot((d) => cb(d.exists ? { id: d.id, ...d.data() } : null)),
      createDriver: (d) => call('createDriver', d),
      updateDriver: (id, f) => col('drivers').doc(id).update(f),
      resetDriverCode: (id) => call('resetDriverCode', { id }),
      deleteDriver: (id) => call('deleteDriver', { id }),
      watchOrders: (days, cb) => merged([
        col('orders').where('status', 'in', ['new', 'sent']),
        col('orders').where('day', 'in', days)
      ], cb),
      watchMine: (uid, cb) => merged([
        col('orders').where('driverId', '==', uid).where('status', '==', 'sent'),
        col('orders').where('driverId', '==', uid).where('day', '==', dayKey())
      ], cb),
      saveOrder(o) {
        const { id, ...f } = o;
        if (id) return col('orders').doc(id).update(f);
        return col('orders').add({ ...f, status: 'new', day: dayKey(), driverId: null, createdAt: now() });
      },
      deleteOrder: (id) => col('orders').doc(id).delete(),
      async dispatch(ids, driver) {
        const batch = fs.batch();
        ids.forEach((id) => batch.update(col('orders').doc(id), { status: 'sent', driverId: driver.id, driverName: driver.name, day: dayKey(), sentAt: now() }));
        batch.set(col('dispatches').doc(), { driverId: driver.id, orderIds: ids, createdAt: now() });
        await batch.commit();
      },
      markPaid: (id) => col('orders').doc(id).update({ status: 'paid', day: dayKey(), doneAt: now() }),
      markFailed: (id, reason) => col('orders').doc(id).update({ status: 'failed', failReason: reason, day: dayKey(), doneAt: now() }),
      returnToOrders: (id) => col('orders').doc(id).update({ status: 'new', driverId: null, driverName: null, failReason: null, day: dayKey() }),
      reopenToDriver: (id) => col('orders').doc(id).update({ status: 'sent', failReason: null }),
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

  g.createDB = function (role) {
    return g.APP_CONFIG && g.APP_CONFIG.firebase ? fireDB(role) : demoDB(role);
  };

  /* ---------- עזרי תצוגה ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  g.UI = {
    esc,
    money: (n) => '₪' + Number(n || 0).toLocaleString('he-IL'),
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
        s.remove(); onAction(b.dataset.s);
      });
      root.appendChild(s);
    },
    render(root, html) {
      const main = root.querySelector('.main');
      const top = main ? main.scrollTop : 0;
      const act = root.ownerDocument.activeElement;
      const fid = act && root.contains(act) && act.id;
      let pos = null;
      try { pos = fid ? act.selectionStart : null; } catch (e) { pos = null; }
      const keep = [...root.querySelectorAll(':scope > .toast, :scope > .scrim')];
      root.innerHTML = html;
      keep.forEach((k) => root.appendChild(k));
      const m2 = root.querySelector('.main');
      if (m2) m2.scrollTop = top;
      if (fid) {
        const el = root.querySelector('#' + fid);
        if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) { /* סוג שדה ללא סמן */ } }
      }
    }
  };
})(self);
