package com.spenza.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "FCMService";
    private static final String CHANNEL_ID = "expense-reminders";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.d(TAG, "FCM token rotated — flagging for re-registration on next app launch.");
        // This service has no Firebase ID token (auth lives in the webview), so
        // it cannot call the registerToken CF directly. Stash the rotated token
        // in CapacitorStorage; NotificationService.ensureNativeTokenFresh picks
        // it up on the next launch and re-registers with the backend. Without
        // this, rotation silently breaks the partner widget push
        // (notifyPartnerLedgerWrite finds only the dead token).
        if (token == null || token.isEmpty()) return;
        try {
            WidgetExpenseQueue.prefs(getApplicationContext()).edit()
                .putString(WidgetExpenseConstants.PENDING_FCM_TOKEN_KEY, token)
                .apply();
        } catch (Exception error) {
            Log.w(TAG, "Failed to persist rotated FCM token.", error);
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "Message received from: " + remoteMessage.getFrom());

        // Check if message contains a notification payload
        if (remoteMessage.getNotification() != null) {
            String title = remoteMessage.getNotification().getTitle();
            String body = remoteMessage.getNotification().getBody();
            Log.d(TAG, "Notification Title: " + title);
            Log.d(TAG, "Notification Body: " + body);
            sendNotification(title, body);
        }

        // Check if message contains a data payload
        if (remoteMessage.getData().size() > 0) {
            Log.d(TAG, "Message data payload: " + remoteMessage.getData());
            if ("family-ledger-record".equals(remoteMessage.getData().get("spenzaKind"))) {
                handleFamilyLedgerRecord(remoteMessage.getData().get("record"));
            }
        }
    }

    /**
     * Widget two-way sync: a family member wrote an expense record to the
     * ledger. Store it in the DISPLAY-ONLY partner-pending overlay and repaint
     * the home-screen widgets — the app itself may stay closed. Authoritative
     * state is never touched here; the app's ledger listener remains the only
     * real sync path (see docs/family-sync-centralization-plan.md §8).
     */
    private void handleFamilyLedgerRecord(String recordJson) {
        if (recordJson == null || recordJson.isEmpty()) return;
        try {
            android.content.SharedPreferences prefs = WidgetExpenseQueue.prefs(getApplicationContext());
            if (!"family".equals(prefs.getString(WidgetExpenseConstants.BACKUP_MODE_KEY, null))) return;
            String familyId = prefs.getString(WidgetExpenseConstants.FIRESTORE_FAMILY_ID_KEY, null);
            if (familyId == null || familyId.trim().isEmpty()) return;
            String activeEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
            if (activeEmail == null) return;

            org.json.JSONObject record = new org.json.JSONObject(recordJson);
            // The CF excludes the writer's uid, but never trust that alone:
            // our own records must not enter the overlay (double count).
            String byEmail = record.optString("updatedByEmail", "");
            if (activeEmail.equalsIgnoreCase(byEmail)) return;

            PartnerPendingStore.upsert(getApplicationContext(), record, activeEmail);
            ExpenseWidgetProvider.updateAll(getApplicationContext());
            Log.d(TAG, "Partner ledger record applied to widget overlay: " + record.optString("id"));
        } catch (org.json.JSONException error) {
            Log.w(TAG, "Malformed family ledger record payload.", error);
        }
    }

    private void sendNotification(String title, String messageBody) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notificationBuilder =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title != null ? title : "Spenza")
                .setContentText(messageBody != null ? messageBody : "New notification")
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent);

        NotificationManager notificationManager =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        // Create notification channel for Android O+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Expense Reminders",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Daily reminders and budget alerts");
            channel.enableLights(true);
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }

        notificationManager.notify(0, notificationBuilder.build());
        Log.d(TAG, "Notification sent successfully");
    }
}
