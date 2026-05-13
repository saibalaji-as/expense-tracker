package com.spenza.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.util.Calendar;

/**
 * NotificationScheduler handles scheduling of recurring notifications using AlarmManager.
 * This ensures notifications fire reliably even when the app is closed or device is restarted.
 */
public class NotificationScheduler extends BroadcastReceiver {
    private static final String TAG = "NotificationScheduler";
    private static final int DAILY_REMINDER_REQUEST_CODE = 1001;
    private static final int MONTHLY_NUDGE_REQUEST_CODE = 1002;
    
    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Alarm triggered, notification should be shown by Capacitor LocalNotifications plugin");
        
        // Get notification details from intent
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        int requestCode = intent.getIntExtra("requestCode", 0);
        
        Log.d(TAG, "Notification details - Title: " + title + ", Body: " + body + ", RequestCode: " + requestCode);
        
        // The actual notification display is handled by Capacitor's LocalNotifications plugin
        // This receiver just ensures the alarm fires at the right time
        
        // Reschedule for next occurrence
        if (requestCode == DAILY_REMINDER_REQUEST_CODE) {
            // Reschedule for tomorrow
            int hour = intent.getIntExtra("hour", 21);
            int minute = intent.getIntExtra("minute", 0);
            scheduleDailyNotification(context, hour, minute);
        } else if (requestCode == MONTHLY_NUDGE_REQUEST_CODE) {
            // Reschedule for next month
            scheduleMonthlyNudge(context);
        }
    }
    
    /**
     * Schedule a daily notification at the specified time
     */
    public static void scheduleDailyNotification(Context context, int hour, int minute) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager is null, cannot schedule notification");
            return;
        }
        
        Intent intent = new Intent(context, NotificationScheduler.class);
        intent.putExtra("title", "Expense Reminder");
        intent.putExtra("body", "Don't forget to log today's expenses 💰");
        intent.putExtra("requestCode", DAILY_REMINDER_REQUEST_CODE);
        intent.putExtra("hour", hour);
        intent.putExtra("minute", minute);
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            DAILY_REMINDER_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Set alarm time
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, hour);
        calendar.set(Calendar.MINUTE, minute);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        
        // If time has passed today, schedule for tomorrow
        if (calendar.getTimeInMillis() <= System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_MONTH, 1);
        }
        
        // Schedule exact alarm (works even in Doze mode)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    calendar.getTimeInMillis(),
                    pendingIntent
                );
            } else {
                alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP,
                    calendar.getTimeInMillis(),
                    pendingIntent
                );
            }
            Log.d(TAG, "Daily notification scheduled for " + hour + ":" + minute + " on " + calendar.getTime());
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied for exact alarm. User needs to grant permission in Settings.", e);
        }
    }
    
    /**
     * Schedule monthly nudge notification (28th of each month at 9:00 AM)
     */
    public static void scheduleMonthlyNudge(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager is null, cannot schedule notification");
            return;
        }
        
        Intent intent = new Intent(context, NotificationScheduler.class);
        intent.putExtra("title", "Monthly Summary");
        intent.putExtra("body", "Month ending soon — check your spending summary");
        intent.putExtra("requestCode", MONTHLY_NUDGE_REQUEST_CODE);
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            MONTHLY_NUDGE_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Set alarm time (28th of month at 9:00 AM)
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.DAY_OF_MONTH, 28);
        calendar.set(Calendar.HOUR_OF_DAY, 9);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        
        // If 28th has passed this month, schedule for next month
        if (calendar.getTimeInMillis() <= System.currentTimeMillis()) {
            calendar.add(Calendar.MONTH, 1);
        }
        
        // Schedule exact alarm
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    calendar.getTimeInMillis(),
                    pendingIntent
                );
            } else {
                alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP,
                    calendar.getTimeInMillis(),
                    pendingIntent
                );
            }
            Log.d(TAG, "Monthly nudge scheduled for " + calendar.getTime());
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied for exact alarm. User needs to grant permission in Settings.", e);
        }
    }
    
    /**
     * Cancel daily notification
     */
    public static void cancelDailyNotification(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager is null, cannot cancel notification");
            return;
        }
        
        Intent intent = new Intent(context, NotificationScheduler.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            DAILY_REMINDER_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.cancel(pendingIntent);
        Log.d(TAG, "Daily notification cancelled");
    }
    
    /**
     * Cancel monthly nudge
     */
    public static void cancelMonthlyNudge(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager is null, cannot cancel notification");
            return;
        }
        
        Intent intent = new Intent(context, NotificationScheduler.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            MONTHLY_NUDGE_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.cancel(pendingIntent);
        Log.d(TAG, "Monthly nudge cancelled");
    }
}
