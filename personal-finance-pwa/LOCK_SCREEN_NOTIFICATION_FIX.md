# Lock Screen Notification Fix

## Issue Description

**Problem:** Daily reminder notifications were only appearing when the device was unlocked, not on the lock screen at the scheduled time.

**User Report:** "The notification triggered when I unlock my mobile, But user regret this, They expect they have to get notification even on mobile locked"

## Root Cause

Android's battery optimization and Doze mode were delaying notifications until the device was unlocked. This is a common issue with scheduled notifications on Android 6.0+ (Marshmallow and above).

### Why This Happens

1. **Doze Mode:** When the device is idle and screen is off, Android enters Doze mode to save battery
2. **App Standby:** Apps that haven't been used recently are put in standby mode
3. **Battery Optimization:** By default, apps are optimized to reduce battery drain
4. **Delayed Delivery:** Notifications are queued and delivered when the device wakes up

## Solution Implemented

### 1. Added Required Permissions

**File:** `android/app/src/main/AndroidManifest.xml`

```xml
<!-- Exact alarms for precise notification timing (Android 12+) -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />

<!-- Disable battery optimization for reliable notifications -->
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

**What these do:**
- `SCHEDULE_EXACT_ALARM`: Allows scheduling notifications at exact times (Android 12+)
- `USE_EXACT_ALARM`: Alternative permission for exact alarms
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`: Allows requesting exemption from battery optimization

### 2. Created High-Priority Notification Channels

**File:** `android/app/src/main/java/com/spenza/app/NotificationChannelManager.java`

Created two notification channels with high importance:

1. **Expense Reminders Channel** (`expense-reminders`)
   - High importance for lock screen visibility
   - Vibration pattern: 0, 250, 250, 250 ms
   - Light color: Indigo (#6366F1)
   - Lock screen visibility: PUBLIC

2. **Budget Alerts Channel** (`budget-alerts`)
   - High importance for urgent alerts
   - Vibration pattern: 0, 500, 250, 500 ms (more urgent)
   - Light color: Red (#EF4444)
   - Lock screen visibility: PUBLIC

**Why high importance matters:**
- `IMPORTANCE_HIGH` ensures notifications show on lock screen
- `IMPORTANCE_DEFAULT` or lower may not show on lock screen
- Users can still customize channel settings in system settings

### 3. Updated Notification Scheduling

**File:** `src/app/core/services/local-notification.service.ts`

Added configuration to all notification schedules:

```typescript
schedule: {
  at: scheduledTime,
  repeats: true,
  every: 'day',
  allowWhileIdle: true // ← KEY: Allow notification even in Doze mode
},
channelId: 'expense-reminders', // ← Use high-priority channel
sound: 'default',
smallIcon: 'ic_stat_icon_config_sample',
iconColor: '#6366F1',
ongoing: false,
autoCancel: true
```

**Key changes:**
- `allowWhileIdle: true` - Allows notifications to fire even when device is in Doze mode
- `channelId` - Uses the high-priority channel we created
- `sound: 'default'` - Ensures notification makes a sound
- `iconColor` - Sets notification color for visual distinction

### 4. Initialize Channels on App Startup

**File:** `android/app/src/main/java/com/spenza/app/MainActivity.java`

```java
@Override
public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // Initialize notification channels for reliable delivery
    NotificationChannelManager.createNotificationChannels(this);
    
    // ... rest of initialization
}
```

This ensures notification channels are created before any notifications are scheduled.

## How It Works Now

### Notification Flow

```
User enables daily reminder
         ↓
Schedule notification with:
  - allowWhileIdle: true
  - channelId: 'expense-reminders' (HIGH importance)
  - Lock screen visibility: PUBLIC
         ↓
Android schedules exact alarm
         ↓
At scheduled time:
  - Device wakes up (if in Doze mode)
  - Notification fires immediately
  - Shows on lock screen
  - Vibrates and lights up
         ↓
User sees notification on lock screen
```

### What Changed

**Before:**
```
Scheduled time → Doze mode active → Notification queued → Device unlocked → Notification shown
```

**After:**
```
Scheduled time → Wake from Doze → Notification shown immediately on lock screen
```

## Testing the Fix

### 1. Build and Install

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 2. Enable Daily Reminder

1. Open app → Settings
2. Scroll to "Local Notifications"
3. Toggle "Daily Reminder" ON
4. Set time to 2-3 minutes from now
5. Lock your device

### 3. Verify Lock Screen Delivery

**Expected behavior:**
- At scheduled time, device should:
  - Wake up (screen turns on)
  - Show notification on lock screen
  - Vibrate (pattern: short, short, short)
  - Light up notification LED (if available)

**Check logcat:**
```bash
adb logcat | grep -i "LocalNotificationService\|NotificationChannelManager"
```

Expected output:
```
[NotificationChannelManager] Notification channels created
[NotificationChannelManager] Reminders channel created with HIGH importance
[LocalNotificationService] Scheduling daily reminder for [TIME]
[LocalNotificationService] Daily reminder scheduled successfully
```

### 4. Test Budget Alerts

Budget alerts should also show on lock screen immediately:

1. Set a low budget limit (e.g., ₹100 for Food)
2. Add an expense that exceeds 80% (e.g., ₹85)
3. Lock your device
4. Notification should appear immediately on lock screen

## User Experience

### What Users Will See

**On Lock Screen:**
```
┌─────────────────────────────────────┐
│ 🔔 Expense Reminder                 │
│ Don't forget to log today's         │
│ expenses 💰                          │
│                                      │
│ [Swipe to open]                     │
└─────────────────────────────────────┘
```

**Notification Details:**
- Title: "Expense Reminder" or "Budget Warning"
- Body: Relevant message
- Icon: App icon with colored background
- Vibration: Distinct pattern
- LED: Colored light (if device supports it)
- Sound: Default notification sound

### User Control

Users can customize notification behavior in system settings:

**Settings → Apps → Spenza → Notifications**

- Turn channels on/off
- Change importance level
- Customize sound
- Enable/disable vibration
- Enable/disable LED
- Show/hide on lock screen

## Battery Optimization

### Requesting Exemption

The app now has permission to request battery optimization exemption. This can be implemented in the Settings page:

```typescript
// Future enhancement: Request battery optimization exemption
async requestBatteryOptimizationExemption() {
  // Show dialog explaining why exemption is needed
  // Request exemption using Android API
  // This ensures notifications are never delayed
}
```

**Note:** This is optional and should only be requested if users report continued issues.

### Best Practices

1. **Don't request exemption automatically** - Only when user reports issues
2. **Explain why it's needed** - "For reliable daily reminders"
3. **Respect user choice** - If they decline, notifications may be delayed
4. **Test on multiple devices** - Different manufacturers have different battery optimization

## Platform Differences

### Android Versions

| Version | Behavior |
|---------|----------|
| Android 6-7 (Marshmallow, Nougat) | Doze mode active, `allowWhileIdle` helps |
| Android 8+ (Oreo+) | Notification channels required, HIGH importance needed |
| Android 12+ (S+) | Exact alarm permission required |
| Android 13+ (T+) | POST_NOTIFICATIONS permission required |

### Manufacturer Differences

Some manufacturers have aggressive battery optimization:

- **Samsung:** May require "Allow background activity"
- **Xiaomi:** May require "Autostart" permission
- **Huawei:** May require "Protected apps" setting
- **OnePlus:** May require "Battery optimization" exemption

**Recommendation:** Add a troubleshooting guide in the app for users experiencing issues.

## Troubleshooting

### If Notifications Still Don't Show on Lock Screen

1. **Check notification channel settings:**
   ```
   Settings → Apps → Spenza → Notifications → Expense Reminders
   ```
   - Ensure importance is set to "High" or "Urgent"
   - Ensure "Show on lock screen" is enabled

2. **Check battery optimization:**
   ```
   Settings → Battery → Battery optimization → Spenza
   ```
   - Set to "Don't optimize" if issues persist

3. **Check Do Not Disturb:**
   ```
   Settings → Sound → Do Not Disturb
   ```
   - Ensure Spenza is allowed to override DND (optional)

4. **Check exact alarm permission (Android 12+):**
   ```
   Settings → Apps → Spenza → Alarms & reminders
   ```
   - Ensure "Allow setting alarms and reminders" is enabled

5. **Check logcat for errors:**
   ```bash
   adb logcat | grep -i "LocalNotificationService\|Capacitor\|LocalNotifications"
   ```

### Common Issues

**Issue:** Notification shows but no sound/vibration
**Solution:** Check notification channel settings, ensure sound and vibration are enabled

**Issue:** Notification delayed by 5-10 minutes
**Solution:** Request battery optimization exemption

**Issue:** Notification doesn't repeat daily
**Solution:** Check if app was force-stopped (some manufacturers kill apps aggressively)

**Issue:** Notification shows on unlock but not on lock screen
**Solution:** Check lock screen notification settings in system preferences

## Summary

### What Was Fixed

✅ Added exact alarm permissions for Android 12+
✅ Created high-priority notification channels
✅ Configured notifications with `allowWhileIdle: true`
✅ Set lock screen visibility to PUBLIC
✅ Added vibration and LED patterns
✅ Initialized channels on app startup

### Expected Behavior

✅ Notifications fire at exact scheduled time
✅ Device wakes from Doze mode
✅ Notification shows on lock screen
✅ Vibration and sound play
✅ LED lights up (if available)
✅ User can tap to open app

### Next Steps

1. **Build and test** - Verify fix works on your device
2. **Test on multiple devices** - Different Android versions and manufacturers
3. **Monitor user feedback** - Check if users still report issues
4. **Add troubleshooting guide** - Help users with manufacturer-specific settings
5. **Consider battery exemption** - If issues persist, request exemption

---

**TL;DR:** Notifications now use high-priority channels with `allowWhileIdle: true` to ensure they fire on lock screen at the scheduled time, even when device is in Doze mode. 🔔✅

