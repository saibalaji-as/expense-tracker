package com.spenza.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * StreakReminderReceiver fires at the daily reminder time (8:00 PM). If today's streak is not
 * yet complete, it posts a notification nudging the user to log an expense before midnight so
 * their daily streak stays alive. It then reschedules itself for the next day.
 *
 * All logic is local: it reads the cached backup snapshot and widget queue only.
 */
public class StreakReminderReceiver extends BroadcastReceiver {
    private static final String TAG = "StreakReminder";
    static final String ACTION_STREAK_REMINDER = "com.spenza.app.STREAK_REMINDER";
    private static final int NOTIFICATION_ID = 3001;

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            // Ensure the channel exists even if the app process hasn't been started since boot.
            NotificationChannelManager.createNotificationChannels(context);

            StreakCalculator streak = StreakCalculator.from(context);
            if (!streak.todayComplete) {
                showReminder(context, streak);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to handle streak reminder", e);
        } finally {
            // Repaint the widget so its state reflects the evening check, and re-arm for
            // tomorrow only while the widget is still on the home screen.
            StreakWidgetProvider.updateAll(context);
            if (StreakReminderScheduler.hasStreakWidget(context)) {
                StreakReminderScheduler.scheduleDailyStreakReminder(context);
            }
        }
    }

    private void showReminder(Context context, StreakCalculator streak) {
        String title;
        String body;
        if (streak.currentStreak > 0) {
            title = "Keep your streak alive 🔥";
            body = "Your " + streak.currentStreak + "-day streak ends at midnight. "
                + "Log an expense to keep it going.";
        } else {
            title = "Start your Spenza streak 🔥";
            body = "Log today's first expense to begin a new daily streak.";
        }

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            StreakReminderScheduler.REMINDER_REQUEST_CODE,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            NotificationChannelManager.CHANNEL_ID_STREAK
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(ContextCompat.getColor(context, R.color.colorPrimary))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS not granted (Android 13+): silently skip.
            Log.w(TAG, "Notification permission not granted, skipping streak reminder", e);
        }
    }
}
