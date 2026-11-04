const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });
const db = admin.firestore();
const FS = admin.firestore.FieldValue;

const money = (n) => '₪' + Number(n || 0).toLocaleString('he-IL');

async function pushTo(keys, title, body, path) {
  const docs = await Promise.all(keys.map((k) => db.collection('tokens').doc(k).get()));
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
  const title = a.status === 'paid' ? `נמסר ושולם · ${money(a.amount)}` : 'לא נמסר';
  const body = a.status === 'paid' ? `${a.driverName} מסר ל${a.customer} ב${a.city}` : `${a.driverName} · ${a.customer} · ${a.failReason || ''}`;
  await pushTo(['manager'], title, body, 'manager');
});
