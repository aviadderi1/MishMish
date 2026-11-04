// פוש ברקע + טעינה מהירה ועבודה גם בקליטה גרועה
importScripts('../shared/config.js', '../vendor/firebase-app-compat.js', '../vendor/firebase-messaging-compat.js');
if (self.APP_CONFIG && self.APP_CONFIG.firebase) {
  firebase.initializeApp(self.APP_CONFIG.firebase);
  firebase.messaging(); // הצגת ההתראה מתבצעת אוטומטית
}
const CACHE = 'mishloach-manager-v1';
const SHELL = ['./', 'manifest.json', 'icon-192.png', '../shared/app.css', '../shared/config.js', '../shared/data.js', '../shared/manager.js',
  '../vendor/firebase-app-compat.js', '../vendor/firebase-auth-compat.js', '../vendor/firebase-firestore-compat.js', '../vendor/firebase-functions-compat.js', '../vendor/firebase-messaging-compat.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
// קודם מהרשת כדי לקבל עדכונים, ואם אין רשת מהמטמון
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const k = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request)));
});
