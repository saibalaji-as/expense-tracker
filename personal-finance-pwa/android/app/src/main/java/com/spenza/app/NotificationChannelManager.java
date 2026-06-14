package com.spenza.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * NotificationChannelManager
 * 
 * Manages notification channels for the Spenza app.
 * Ensures notifications are delivered reliably and show on lock screen.
 */
public class NotificationChannelManager {
    
    // Channel IDs
    public static final String CHANNEL_ID_REMINDERS = "expense-reminders";
    public static final String CHANNEL_ID_BUDGET_ALERTS = "budget-alerts";
    public static final String CHANNEL_ID_SPEND_PROMPTS = "spend-prompts";
    public static final String CHANNEL_ID_STREAK = "streak-reminders";

    // Channel Names
    private static final String CHANNEL_NAME_REMINDERS = "Expense Reminders";
    private static final String CHANNEL_NAME_BUDGET_ALERTS = "Budget Alerts";
    private static final String CHANNEL_NAME_SPEND_PROMPTS = "Spend Prompts";
    private static final String CHANNEL_NAME_STREAK = "Daily Streak";

    // Channel Descriptions
    private static final String CHANNEL_DESC_REMINDERS = "Daily reminders to log your expenses";
    private static final String CHANNEL_DESC_BUDGET_ALERTS = "Alerts when you exceed budget limits";
    private static final String CHANNEL_DESC_SPEND_PROMPTS = "Prompts to log expenses detected from device notifications";
    private static final String CHANNEL_DESC_STREAK = "Reminders to keep your daily expense-logging streak alive";
    
    /**
     * Create all notification channels
     * Should be called during app initialization
     */
    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = 
                context.getSystemService(NotificationManager.class);
            
            if (notificationManager != null) {
                // Create Expense Reminders channel
                createRemindersChannel(notificationManager);
                
                // Create Budget Alerts channel
                createBudgetAlertsChannel(notificationManager);

                createSpendPromptsChannel(notificationManager);

                createStreakChannel(notificationManager);

                android.util.Log.d("NotificationChannelManager", "Notification channels created");
            }
        }
    }
    
    /**
     * Create the Expense Reminders notification channel
     * High importance to ensure delivery even when device is locked
     */
    private static void createRemindersChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID_REMINDERS,
                CHANNEL_NAME_REMINDERS,
                NotificationManager.IMPORTANCE_HIGH // High importance for lock screen visibility
            );
            
            // Set description
            channel.setDescription(CHANNEL_DESC_REMINDERS);
            
            // Enable lock screen visibility
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            
            // Enable vibration
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 250, 250});
            
            // Enable lights
            channel.enableLights(true);
            channel.setLightColor(0xFF6366F1); // Primary color (indigo)
            
            // Show badge
            channel.setShowBadge(true);
            
            // Bypass Do Not Disturb (optional - user can disable this)
            channel.setBypassDnd(false);
            
            // Register the channel
            notificationManager.createNotificationChannel(channel);
            
            android.util.Log.d("NotificationChannelManager", 
                "Reminders channel created with HIGH importance");
        }
    }
    
    /**
     * Create the Budget Alerts notification channel
     * Max importance for immediate attention
     */
    private static void createBudgetAlertsChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID_BUDGET_ALERTS,
                CHANNEL_NAME_BUDGET_ALERTS,
                NotificationManager.IMPORTANCE_HIGH // High importance for urgent alerts
            );
            
            // Set description
            channel.setDescription(CHANNEL_DESC_BUDGET_ALERTS);
            
            // Enable lock screen visibility
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            
            // Enable vibration with urgent pattern
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 250, 500});
            
            // Enable lights
            channel.enableLights(true);
            channel.setLightColor(0xFFEF4444); // Red color for alerts
            
            // Show badge
            channel.setShowBadge(true);
            
            // Bypass Do Not Disturb (optional - user can disable this)
            channel.setBypassDnd(false);
            
            // Register the channel
            notificationManager.createNotificationChannel(channel);
            
            android.util.Log.d("NotificationChannelManager", 
                "Budget alerts channel created with HIGH importance");
        }
    }

    private static void createSpendPromptsChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID_SPEND_PROMPTS,
                CHANNEL_NAME_SPEND_PROMPTS,
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription(CHANNEL_DESC_SPEND_PROMPTS);
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
            channel.enableVibration(false);
            channel.enableLights(true);
            channel.setLightColor(0xFF14B8A6);
            channel.setShowBadge(true);
            channel.setBypassDnd(false);
            notificationManager.createNotificationChannel(channel);
            android.util.Log.d("NotificationChannelManager", "Spend prompts channel created");
        }
    }
    
    /**
     * Create the Daily Streak notification channel.
     * High importance so the "keep your streak alive" reminder is visible on the lock screen.
     */
    private static void createStreakChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID_STREAK,
                CHANNEL_NAME_STREAK,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(CHANNEL_DESC_STREAK);
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 200, 250});
            channel.enableLights(true);
            channel.setLightColor(0xFFFF7A3D); // Streak flame orange
            channel.setShowBadge(true);
            channel.setBypassDnd(false);
            notificationManager.createNotificationChannel(channel);
            android.util.Log.d("NotificationChannelManager", "Streak channel created with HIGH importance");
        }
    }

    /**
     * Get the default notification channel ID
     * Used for notifications that don't specify a channel
     */
    public static String getDefaultChannelId() {
        return CHANNEL_ID_REMINDERS;
    }
}
