// הגדרות חיבור ל-Firebase. כל עוד firebase ריק, האפליקציה רצה במצב הדגמה (הנתונים נשמרים רק בדפדפן).
self.APP_CONFIG = {
  firebase: null,   // הדבק כאן את firebaseConfig מ-Firebase Console, לדוגמה: { apiKey: "...", authDomain: "...", projectId: "...", messagingSenderId: "...", appId: "..." }
  vapidKey: "",     // Cloud Messaging > Web Push certificates
  region: "europe-west1",
  driverApkUrl: "https://github.com/aviadderi1/MishMish/releases/latest/download/driver.apk"
};
