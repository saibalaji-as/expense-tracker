package com.spenza.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * BootReceiver reschedules notifications after device restart.
 * This ensures that scheduled notifications continue to work even after the device is rebooted.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String NOTIFICATION_PREFS_KEY = "notificationPreferences";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device booted, rescheduling notifications");
            rescheduleNotifications(context);
        }
    }
    
    private void rescheduleNotifications(Context context) {
        try {
            // Re-arm the daily streak reminder if the streak widget is on the home screen.
            if (StreakReminderScheduler.hasStreakWidget(context)) {
                StreakReminderScheduler.scheduleDailyStreakReminder(context);
            }

            // Read notification preferences from Capacitor Storage
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String notificationPrefsJson = prefs.getString(NOTIFICATION_PREFS_KEY, null);
            
            if (notificationPrefsJson != null) {
                Log.d(TAG, "Found notification preferences: " + notificationPrefsJson);
                
                // Parse JSON to check if notifications are enabled
                // For simplicity, we'll check if the string contains enabled flags
                boolean dailyReminderEnabled = notificationPrefsJson.contains("\"dailyReminderEnabled\":true");
                
                if (dailyReminderEnabled) {
                    // Extract hour and minute from JSON (default to 21:00 if not found)
                    int hour = 21;
                    int minute = 0;
                    
                    try {
                        // Simple JSON parsing for hour
                        int hourIndex = notificationPrefsJson.indexOf("\"reminderHour\":");
                        if (hourIndex != -1) {
                            String hourStr = notificationPrefsJson.substring(hourIndex + 15);
                            hourStr = hourStr.substring(0, hourStr.indexOf(","));
                            hour = Integer.parseInt(hourStr.trim());
                        }
                        
                        // Simple JSON parsing for minute
                        int minuteIndex = notificationPrefsJson.indexOf("\"reminderMinute\":");
                        if (minuteIndex != -1) {
                            String minuteStr = notificationPrefsJson.substring(minuteIndex + 17);
                            minuteStr = minuteStr.substring(0, minuteStr.indexOf(","));
                            minute = Integer.parseInt(minuteStr.trim());
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error parsing hour/minute, using defaults", e);
                    }
                    
                    // Reschedule daily reminder
                    NotificationScheduler.scheduleDailyNotification(context, hour, minute);
                    
                    // Reschedule monthly nudge
                    NotificationScheduler.scheduleMonthlyNudge(context);
                    
                    Log.d(TAG, "Notifications rescheduled successfully");
                } else {
                    Log.d(TAG, "Daily reminder is disabled, not rescheduling");
                }
            } else {
                Log.d(TAG, "No notification preferences found");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error rescheduling notifications", e);
        }
    }
}
