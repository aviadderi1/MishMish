package com.aviad.mishloach;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** עדכון המסכים ברקע: מוריד גרסה חדשה מ-GitHub, והיא נכנסת לפעולה בפתיחה הבאה. */
final class Updater {
  static final String BASE = "https://github.com/aviadderi1/MishMish/releases/latest/download/";
  private static final String PREFS = "updates", KEY_WEB = "web_version";

  private Updater() {}

  private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  private static File webDir(Context c, int version) { return new File(c.getFilesDir(), "web_" + version); }

  /** התיקייה של המסכים שהורדו, או null אם צריך להשתמש במסכים שבתוך האפליקציה */
  static File currentWeb(Context c) {
    int v = prefs(c).getInt(KEY_WEB, 0);
    if (v <= BuildConfig.VERSION_CODE) return null;
    File d = webDir(c, v);
    return new File(d, "shared/config.js").exists() ? d : null;
  }

  private static HttpURLConnection open(String url) throws IOException {
    HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
    h.setInstanceFollowRedirects(true);
    h.setConnectTimeout(15000);
    h.setReadTimeout(60000);
    return h;
  }

  private static int readInt(String url) {
    HttpURLConnection h = null;
    try {
      h = open(url);
      if (h.getResponseCode() != 200) return 0;
      try (InputStream in = h.getInputStream()) {
        byte[] b = new byte[32];
        int n = in.read(b);
        return n > 0 ? Integer.parseInt(new String(b, 0, n, "UTF-8").trim()) : 0;
      }
    } catch (Exception e) {
      return 0;
    } finally {
      if (h != null) h.disconnect();
    }
  }

  static boolean nativeUpdateAvailable() { return readInt(BASE + "native-version.txt") > BuildConfig.NATIVE_VERSION; }

  static void updateWeb(Context c) {
    int remote = readInt(BASE + "web-version.txt");
    int current = Math.max(prefs(c).getInt(KEY_WEB, 0), BuildConfig.VERSION_CODE);
    if (remote <= current) return;
    File tmp = new File(c.getFilesDir(), "web_tmp");
    deleteAll(tmp);
    HttpURLConnection h = null;
    try {
      h = open(BASE + "web.zip");
      if (h.getResponseCode() != 200) return;
      String root = tmp.getCanonicalPath() + File.separator;
      try (ZipInputStream z = new ZipInputStream(new BufferedInputStream(h.getInputStream()))) {
        byte[] buf = new byte[8192];
        ZipEntry e;
        while ((e = z.getNextEntry()) != null) {
          File f = new File(tmp, e.getName());
          if (!f.getCanonicalPath().startsWith(root)) throw new IOException("bad path");
          if (e.isDirectory()) { f.mkdirs(); continue; }
          f.getParentFile().mkdirs();
          try (FileOutputStream o = new FileOutputStream(f)) {
            int n;
            while ((n = z.read(buf)) > 0) o.write(buf, 0, n);
          }
        }
      }
      if (!new File(tmp, "shared/config.js").exists()) throw new IOException("incomplete");
      File target = webDir(c, remote);
      deleteAll(target);
      if (!tmp.renameTo(target)) throw new IOException("rename");
      prefs(c).edit().putInt(KEY_WEB, remote).apply();
      // ניקוי גרסאות ישנות, בלי לגעת בזו שרצה עכשיו
      File running = currentWebAtStart;
      File[] all = c.getFilesDir().listFiles();
      if (all != null) for (File d : all) {
        if (d.getName().startsWith("web_") && !d.equals(target) && !d.equals(running)) deleteAll(d);
      }
    } catch (Exception e) {
      deleteAll(tmp);
    } finally {
      if (h != null) h.disconnect();
    }
  }

  static File currentWebAtStart;

  private static void deleteAll(File f) {
    File[] kids = f.listFiles();
    if (kids != null) for (File k : kids) deleteAll(k);
    f.delete();
  }

  private static String mime(String p) {
    if (p.endsWith(".html")) return "text/html";
    if (p.endsWith(".js")) return "text/javascript";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".json")) return "application/json";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
  }

  /** קודם מהמסכים שהורדו, ואם הקובץ לא שם מתוך האפליקציה */
  static WebViewAssetLoader.PathHandler handler(Context c) {
    final File web = currentWeb(c);
    currentWebAtStart = web;
    final WebViewAssetLoader.AssetsPathHandler bundled = new WebViewAssetLoader.AssetsPathHandler(c);
    return (path) -> {
      if (web != null) {
        try {
          File f = new File(web, path);
          if (f.getCanonicalPath().startsWith(web.getCanonicalPath() + File.separator) && f.isFile()) {
            return new WebResourceResponse(mime(path), "UTF-8", new FileInputStream(f));
          }
        } catch (IOException ignored) { /* נופלים לקובץ שבתוך האפליקציה */ }
      }
      return bundled.handle(path);
    };
  }

  /** מוריד את ה-APK החדש ופותח את מסך ההתקנה של אנדרואיד */
  static File downloadApk(Context c) throws IOException {
    File dir = new File(c.getCacheDir(), "reports");
    dir.mkdirs();
    File f = new File(dir, "update.apk");
    HttpURLConnection h = open(BASE + BuildConfig.FLAVOR + ".apk");
    try {
      if (h.getResponseCode() != 200) throw new IOException("http " + h.getResponseCode());
      try (InputStream in = h.getInputStream(); FileOutputStream o = new FileOutputStream(f)) {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
      }
      return f;
    } finally {
      h.disconnect();
    }
  }
}
