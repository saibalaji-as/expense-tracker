# Debug Daily Notifications - Step by Step Guide

## Issue
Daily reminder notifications are not firing at the scheduled time.

## What I've Fixed

### 1. Changed Scheduling Method ✅
**Before:**
```typescript
schedule: {
  on: { hour, minute },
  every: 'day'
}
```
This was scheduling for the next occurrence of that time, which could be tomorrow.

**After:**
```typescript
const scheduledTime = new Date();
scheduledTime.setHours(hour, minute, 0, 0);

// If time has passed today, schedule for tomorrow
if (scheduledTime <= now) {
  scheduledTime.setDate(scheduledTime.getDate() + 1);
}

schedule: {
  at: scheduledTime,
  repeats: true,
  every: 'day'
}
```
Now it calculates the exact next occurrence and schedules for that specific time.

### 2. Added Test Notification ✅
Added a "Test Notification" button in Settings that fires in 10 seconds. This helps verify:
- Notification permission is granted
- Capacitor LocalNotifications plugin works
- Notifications can be displayed
- Notification tap navigation works

---

## How to Debug

### Step 1: Build and Install Updated App
```bash
cd /Users/mac/Documents/Sai/expense-tracker/personal-finance-pwa
npx cap sync android
cd android
./gradlew clean assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Step 2: Test Notification System
```
1. Open Spenza app
2. Go to Settings
3. Scroll to "Local Notifications" section
4. If not granted, tap "Request Permission" and grant
5. Tap "Test Notification (10 seconds)" button
6. Wait 10 seconds
7. Notification should appear: "Test Notification - This is a test notification. It works! 🎉"
```

**Expected Result:**
- ✅ Notification appears in 10 seconds
- ✅ Tapping notification opens app
- ✅ App navigates to Daily Expense page

**If Test Fails:**
- Check notification permission in device Settings
- Check logcat for errors
- Verify Capacitor plugin is installed

### Step 3: Enable Daily Reminder
```
1. In Settings, toggle "Daily Reminder" ON
2. Set time to 2-3 minutes from now
3. Check logcat for scheduling confirmation
4. Wait for scheduled time
5. Notification should appear
```

### Step 4: Monitor Logcat
```bash
# Watch all notification-related logs
adb logcat | grep -E "(LocalNotification|Capacitor|Notification)"

# Expected output when enabling:
[LocalNotificationService] Scheduling daily reminder for Wed May 14 21:30:00 2026
[LocalNotificationService] Daily reminder scheduled successfully

# Expected output when notification fires:
[Capacitor] Notification triggered
[LocalNotificationService] Notification tapped
```

---

## Common Issues and Solutions

### Issue 1: Test Notification Doesn't Appear

**Possible Causes:**
1. Permission not granted
2. Capacitor plugin not installed
3. Android killing notifications

**Solutions:**
```bash
# Check permission
adb shell dumpsys notification | grep -A 5 "com.spenza.app"

# Check if plugin is installed
adb logcat | grep "Capacitor.*LocalNotifications"

# Check battery optimization
# Settings → Apps → Spenza → Battery → Unrestricted
```

### Issue 2: Daily Reminder Doesn't Fire

**Possible Causes:**
1. Notification scheduled for tomorrow instead of today
2. Android Doze mode killing scheduled notifications
3. Battery optimization killing app

**Solutions:**

**A. Check Scheduled Notifications:**
```bash
# Check if notification is scheduled
adb logcat | grep "scheduled"

# Should see:
# [LocalNotificationService] Scheduling daily reminder for [DATE/TIME]
# [LocalNotificationService] Daily reminder scheduled successfully
```

**B. Disable Battery Optimization:**
```
1. Settings → Apps → Spenza
2. Battery → Unrestricted
3. This prevents Android from killing scheduled notifications
```

**C. Check Doze Mode:**
```bash
# Check if app is in Doze whitelist
adb shell dumpsys deviceidle whitelist | grep spenza

# If not whitelisted, add manually:
# Settings → Apps → Spenza → Battery → Unrestricted
```

**D. Use Exact Alarm (Android 12+):**
The app needs exact alarm permission for reliable scheduling. Check if granted:
```bash
# Check exact alarm permission
adb shell dumpsys alarm | grep -A 10 "com.spenza.app"
```

### Issue 3: Notification Fires But Doesn't Repeat

**Possible Cause:**
The `repeats: true` flag might not be working correctly.

**Solution:**
Check if notification is rescheduled after firing:
```bash
# After notification fires, check logcat
adb logcat | grep "reschedul"

# Should see rescheduling happening
```

### Issue 4: Time Zone Issues

**Possible Cause:**
Device timezone doesn't match scheduled time.

**Solution:**
```bash
# Check device timezone
adb shell getprop persist.sys.timezone

# Should match your location
# Example: America/New_York, Asia/Kolkata, etc.
```

---

## Debugging Checklist

### Basic Checks
- [ ] App installed and running
- [ ] Notification permission granted
- [ ] Test notification works (10 seconds)
- [ ] Daily reminder toggle is ON
- [ ] Time is set correctly

### Permission Checks
- [ ] Notification permission: Settings → Apps → Spenza → Notifications → Enabled
- [ ] Battery optimization: Settings → Apps → Spenza → Battery → Unrestricted
- [ ] Exact alarm (Android 12+): Settings → Apps → Spenza → Alarms & reminders → Allowed

### Logcat Checks
- [ ] Scheduling confirmation appears in logcat
- [ ] No errors when scheduling
- [ ] Notification fires at scheduled time
- [ ] Notification tap works

### Device Checks
- [ ] Device not in Doze mode during test
- [ ] Device has correct timezone
- [ ] Device date/time is correct
- [ ] No battery saver mode active

---

## Testing Strategy

### Quick Test (10 seconds)
```
1. Open app → Settings
2. Tap "Test Notification (10 seconds)"
3. Wait 10 seconds
4. Verify notification appears
```
**Purpose:** Verify notification system works

### Short Test (2-3 minutes)
```
1. Open app → Settings
2. Toggle "Daily Reminder" ON
3. Set time to 2-3 minutes from now
4. Close app or put in background
5. Wait for scheduled time
6. Verify notification appears
```
**Purpose:** Verify scheduling works for near-future times

### Real-World Test (Next Day)
```
1. Open app → Settings
2. Toggle "Daily Reminder" ON
3. Set time to 9:00 PM (or your preferred time)
4. Use app normally
5. Wait until 9:00 PM next day
6. Verify notification appears
```
**Purpose:** Verify daily repeating works

---

## Expected Logcat Output

### When Enabling Daily Reminder
```
[Settings] Loaded notification preferences: {dailyReminderEnabled: false, ...}
[Settings] Daily reminder enabled and scheduled
[LocalNotificationService] Scheduling daily reminder for Wed May 14 21:30:00 2026
[Capacitor] [LocalNotifications] Scheduling notification with ID: 1
[LocalNotificationService] Daily reminder scheduled successfully
```

### When Test Notification is Triggered
```
[Settings] Triggering test notification...
[LocalNotificationService] Scheduling test notification for Wed May 14 20:15:10 2026
[Capacitor] [LocalNotifications] Scheduling notification with ID: 999
[LocalNotificationService] Test notification scheduled successfully
```

### When Notification Fires
```
[Capacitor] [LocalNotifications] Notification triggered: ID 1
[Capacitor] [LocalNotifications] Notification action performed
[LocalNotificationService] Notification tapped: {id: 1, title: "Expense Reminder", ...}
[LocalNotificationService] Navigating to /daily from notification tap
```

---

## Alternative: Use AlarmManager Directly

If Capacitor LocalNotifications still doesn't work reliably, we can use the custom `NotificationScheduler.java` we created earlier:

### How to Switch to AlarmManager

1. **Modify LocalNotificationService:**
```typescript
// Instead of using Capacitor plugin
await LocalNotifications.schedule({...});

// Call native AlarmManager via Capacitor plugin bridge
// This would require creating a custom Capacitor plugin
```

2. **Use NotificationScheduler directly:**
The `NotificationScheduler.java` we created uses AlarmManager which is more reliable for scheduled notifications.

---

## Next Steps

1. **Build and install** the updated app with test notification
2. **Test notification system** using the 10-second test button
3. **If test works:** Enable daily reminder and test with 2-3 minutes
4. **If test fails:** Check permissions and logcat for errors
5. **Report back** with:
   - Did test notification work? ✅ or ❌
   - Did daily reminder work? ✅ or ❌
   - Any error messages from logcat

---

## Summary

### What Changed
- ✅ Fixed scheduling to use exact date/time instead of `on: { hour, minute }`
- ✅ Added test notification button (fires in 10 seconds)
- ✅ Added better logging for debugging
- ✅ Calculates next occurrence correctly

### How to Test
1. Build and install updated app
2. Use test notification button to verify system works
3. Enable daily reminder with near-future time (2-3 minutes)
4. Monitor logcat for scheduling and firing

### If Still Not Working
- Check all permissions (notifications, battery, exact alarm)
- Verify test notification works first
- Check logcat for errors
- Consider using AlarmManager directly (more reliable)

Build the app and try the test notification button first - it will tell us if the notification system works at all! 🔍
