package com.aviad.mishloach;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** מציג התראה גם כשהאפליקציה פתוחה. כשהיא סגורה, המערכת מציגה אותה לבד. */
public class PushService extends FirebaseMessagingService {
  static final String CHANNEL = "deliveries";

  static void ensureChannel(Context c) {
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel ch = new NotificationChannel(CHANNEL, "משלוחים", NotificationManager.IMPORTANCE_HIGH);
      c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }
  }

  @Override public void onMessageReceived(RemoteMessage m) {
    RemoteMessage.Notification n = m.getNotification();
    if (n == null) return;
    ensureChannel(this);
    PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
    b.setSmallIcon(R.drawable.ic_notify).setContentTitle(n.getTitle()).setContentText(n.getBody())
        .setAutoCancel(true).setContentIntent(pi).setDefaults(Notification.DEFAULT_ALL);
    try {
      getSystemService(NotificationManager.class).notify((int) System.currentTimeMillis(), b.build());
    } catch (SecurityException ignored) { /* המשתמש לא אישר התראות */ }
  }
}
