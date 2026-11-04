package com.aviad.mishloach;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends Activity {
  private static final String HOST = "appassets.androidplatform.net";
  private static final int REQ_NOTIFY = 1, REQ_CALL = 2;
  private WebView web;
  private String pendingCall;

  @SuppressLint("SetJavaScriptEnabled")
  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    PushService.ensureChannel(this);
    getWindow().setStatusBarColor(Color.parseColor(BuildConfig.BAR_COLOR));
    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor(BuildConfig.BAR_COLOR));
    setContentView(web);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setSupportMultipleWindows(false);
    s.setTextZoom(100);
    final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
        .setDomain(HOST).addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
    web.addJavascriptInterface(new Bridge(), "AndroidApp");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        return loader.shouldInterceptRequest(r.getUrl());
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (HOST.equals(u.getHost())) return false;
        if ("tel".equals(u.getScheme())) { call(u.getSchemeSpecificPart()); return true; }
        openExternal(u);
        return true;
      }
    });
    if (state != null) web.restoreState(state);
    else web.loadUrl("https://" + HOST + "/assets/" + BuildConfig.START_PATH);
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
    }
  }

  private void openExternal(Uri u) {
    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); }
    catch (Exception e) { Toast.makeText(this, "אין אפליקציה שיכולה לפתוח את הקישור", Toast.LENGTH_LONG).show(); }
  }

  /** number כולל את #31# כשהחיוג מחסוי */
  private void call(String number) {
    if (BuildConfig.FLAVOR.equals("driver") && checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
      pendingCall = number;
      requestPermissions(new String[] {Manifest.permission.CALL_PHONE}, REQ_CALL);
      return;
    }
    dial(number, BuildConfig.FLAVOR.equals("driver") ? Intent.ACTION_CALL : Intent.ACTION_DIAL);
  }

  private void dial(String number, String action) {
    try { startActivity(new Intent(action, Uri.parse("tel:" + Uri.encode(number)))); }
    catch (Exception e) { Toast.makeText(this, "החיוג נכשל", Toast.LENGTH_LONG).show(); }
  }

  @Override public void onRequestPermissionsResult(int code, String[] p, int[] res) {
    if (code == REQ_CALL && pendingCall != null) {
      boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
      dial(pendingCall, ok ? Intent.ACTION_CALL : Intent.ACTION_DIAL);
      pendingCall = null;
    }
    if (code == REQ_NOTIFY) web.evaluateJavascript("window.dispatchEvent(new Event('focus'))", null);
  }

  @Override public void onBackPressed() {
    web.evaluateJavascript("window.handleBack ? window.handleBack() : false", (r) -> {
      if (!"true".equals(r)) finish();
    });
  }

  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

  private void sendToken(String token) {
    String js = "window.onNativePushToken && window.onNativePushToken(" + JSONObject.quote(token) + ")";
    runOnUiThread(() -> web.evaluateJavascript(js, null));
  }

  private class Bridge {
    @JavascriptInterface public String pushState() {
      if (Build.VERSION.SDK_INT < 33) return "granted";
      return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ? "granted" : "default";
    }

    @JavascriptInterface public void requestPushToken() {
      try {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener((t) -> sendToken(t.isSuccessful() ? t.getResult() : ""));
      } catch (Exception e) { sendToken(""); } // Firebase עדיין לא מחובר
      runOnUiThread(() -> {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
          requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
        }
      });
    }

    @JavascriptInterface public void shareFile(String name, String content) {
      try {
        File dir = new File(getCacheDir(), "reports");
        dir.mkdirs();
        File f = new File(dir, name);
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(content.getBytes(StandardCharsets.UTF_8)); }
        Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
        Intent i = new Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(i, "שליחת הדוח"));
      } catch (Exception e) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "ייצוא הדוח נכשל", Toast.LENGTH_LONG).show());
      }
    }
  }
}
