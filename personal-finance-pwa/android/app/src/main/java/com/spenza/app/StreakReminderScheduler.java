package com.spenza.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.util.Calendar;

/**
 * StreakReminderScheduler schedules a daily 8:00 PM check that reminds the user to log an
 * expense if today's streak is not yet complete. The reminder is tied to the Daily Streak
 * widget: it is scheduled when the widget is present and cancelled when the widget is removed.
 */
final class StreakReminderScheduler {
    private static final String TAG = "StreakReminder";
    static final int REMINDER_REQUEST_CODE = 1003;
    static final int REMINDER_HOUR = 20; // 8:00 PM local time
    static final int REMINDER_MINUTE = 0;

    private StreakReminderScheduler() {}

    static boolean hasStreakWidget(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StreakWidgetProvider.class));
        return ids != null && ids.length > 0;
    }

    static void scheduleDailyStreakReminder(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager unavailable, cannot schedule streak reminder");
            return;
        }

        PendingIntent pendingIntent = reminderPendingIntent(context);

        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, REMINDER_HOUR);
        calendar.set(Calendar.MINUTE, REMINDER_MINUTE);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        if (calendar.getTimeInMillis() <= System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_MONTH, 1);
        }

        long triggerAt = calendar.getTimeInMillis();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            }
            Log.d(TAG, "Streak reminder scheduled for " + calendar.getTime());
        } catch (SecurityException e) {
            // Exact-alarm permission not granted (Android 12+): fall back to an inexact alarm
            // so the reminder still fires approximately on time.
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            Log.w(TAG, "Exact alarm denied, scheduled inexact streak reminder", e);
        }
    }

    static void cancelStreakReminder(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        alarmManager.cancel(reminderPendingIntent(context));
        Log.d(TAG, "Streak reminder cancelled");
    }

    private static PendingIntent reminderPendingIntent(Context context) {
        Intent intent = new Intent(context, StreakReminderReceiver.class);
        intent.setAction(StreakReminderReceiver.ACTION_STREAK_REMINDER);
        return PendingIntent.getBroadcast(
            context,
            REMINDER_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
