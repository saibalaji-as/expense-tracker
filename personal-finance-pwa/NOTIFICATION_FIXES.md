# Notification Issues - Final Fixes

## Remaining Issues

1. ❌ Daily reminder not triggering at scheduled time
2. ❌ Push notifications not working

---

## Issue 1: Daily Reminder Not Triggering

### Root Cause
The daily reminder was being scheduled, but:
1. Notifications were not being rescheduled when the app restarted
2. Android may have killed the scheduled notifications
3. No persistence mechanism after app restart

### Solution Implemented

#### A. Added Notification Rescheduling on App Start ✅
Modified `settings.component.ts` to reschedule notifications when the Settings page loads:

```typescript
private async rescheduleNotificationsIfNeeded(): Promise<void> {
  const prefs = await this.storageService.getNotificationPreferences();
  const permissionStatus = this.localNotificationService.permissionStatus();
  
  // Only reschedule if permission is granted and daily reminder was enabled
  if (permissionStatus === 'granted' && prefs.dailyReminderEnabled) {
    await this.localNotificationService.scheduleDailyReminder(
      prefs.reminderHour,
      prefs.reminderMinute
    );
    await this.localNotificationService.scheduleMonthlyNudge();
  }
}
```

This method is called in `ngOnInit()`, ensuring notifications are rescheduled every time the Settings page is visited.

#### B. Boot Receiver Already in Place ✅
The `BootReceiver.java` we created earlier handles rescheduling after device restart:
- Listens for `BOOT_COMPLETED` event
- Reads notification preferences from storage
- Reschedules daily reminder and monthly nudge

#### C. NotificationScheduler Using AlarmManager ✅
The `NotificationScheduler.java` uses Android's AlarmManager for reliable scheduling:
- Uses `setExactAndAllowWhileIdle()` for Android 6+
- Works even in Doze mode
- Automatically reschedules after notification fires

### Testing Daily Reminders

1. **Enable Daily Reminder:**
   - Open Settings
   - Toggle "Daily Reminder" ON
   - Set time to 2-3 minutes from now
   - Grant permission if prompted

2. **Verify Scheduling:**
   - Check logcat for: `[LocalNotificationService] Daily reminder scheduled`
   - Check logcat for: `[NotificationScheduler] Daily notification scheduled`

3. **Wait for Notification:**
   - Keep app in background or close it
   - Wait for scheduled time
   - Notification should appear

4. **Check Logcat:**
   ```bash
   adb logcat | grep -E "(LocalNotification|NotificationScheduler|Spenza)"
   ```

### Why It Should Work Now

1. **Capacitor LocalNotifications** schedules the notification
2. **NotificationScheduler** ensures it fires using AlarmManager
3. **BootReceiver** reschedules after device restart
4. **Settings Component** reschedules when app is opened
5. **Wake Lock** permission ensures delivery even in Doze mode

---

## Issue 2: Push Notifications Not Working

### Root Cause
1. FCM service was created but not integrated with Settings UI
2. No initialization flow when user enables push notifications
3. Missing permission request flow

### Solution Implemented

#### A. Integrated FCM Service with Settings ✅
Modified `settings.component.ts` to use `FcmService`:

```typescript
// Import FCM service
import { FcmService } from '../../core/services/fcm.service';

// Inject in component
readonly fcmService = inject(FcmService);

// Initialize FCM when user enables push notifications
async onNotificationToggleClick(): Promise<void> {
  const isEnabled = this.notificationService.isEnabled();
  if (!isEnabled) {
    // Initialize FCM for push notifications
    await this.fcmService.initialize();
    
    // Check if FCM permission was granted
    const fcmStatus = this.fcmService.getPermissionStatus();
    if (fcmStatus() === 'granted') {
      // Log the FCM token
      const token = this.fcmService.getToken();
      console.log('[Settings] FCM Token:', token);
    }
  } else {
    // Unregister from FCM
    await this.fcmService.unregister();
  }
}
```

#### B. FCM Service Features ✅
The `fcm.service.ts` provides:
- **Permission Request:** Asks user for push notification permission
- **FCM Registration:** Registers with Firebase Cloud Messaging
- **Token Management:** Generates and stores FCM token
- **Notification Handling:** Receives and displays push notifications
- **Tap Handling:** Navigates to appropriate page when notification is tapped

#### C. Firebase Configuration Already in Place ✅
- `google-services.json` is in `android/app/`
- Firebase dependencies added to `build.gradle`
- `MyFirebaseMessagingService.java` handles incoming messages

### Testing Push Notifications

#### 1. Enable Push Notifications in App
```
1. Open Spenza app
2. Go to Settings
3. Toggle "Enable reminders" ON
4. Grant permission when prompted
5. Check logcat for FCM token:
   adb logcat | grep -i "FCM Token"
```

#### 2. Send Test Notification from Firebase Console
```
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: spenza-notifications
3. Go to Cloud Messaging (in left sidebar)
4. Click "Send your first message"
5. Fill in:
   - Notification title: "Test Notification"
   - Notification text: "This is a test from Firebase"
6. Click "Next"
7. Select target: "Single device"
8. Paste the FCM token from logcat
9. Click "Review" then "Publish"
```

#### 3. Verify Notification Appears
```
- Notification should appear in notification shade
- Tap notification to open app
- Check logcat for:
  adb logcat | grep -E "(FCM|MyFirebaseMessaging)"
```

### Expected Logcat Output

**When Enabling Push Notifications:**
```
[FCM] Initializing push notifications...
[FCM] Permission result: granted
[FCM] Registration initiated
[FCM] Registration successful, token: <YOUR_FCM_TOKEN>
[Settings] FCM Token: <YOUR_FCM_TOKEN>
```

**When Receiving Push Notification:**
```
[FCMService] Message received from: <sender_id>
[FCMService] Notification Title: Test Notification
[FCMService] Notification Body: This is a test from Firebase
[FCMService] Notification sent successfully
```

**When Tapping Notification:**
```
[FCM] Push notification action performed
[FCM] Navigating to / from notification tap
```

---

## Troubleshooting

### Daily Reminder Not Firing

**Problem:** Notification doesn't appear at scheduled time

**Solutions:**

1. **Check Permission:**
   ```bash
   adb shell dumpsys notification | grep -A 5 "com.spenza.app"
   ```
   - Ensure notifications are enabled

2. **Check Battery Optimization:**
   ```bash
   adb shell dumpsys deviceidle whitelist | grep spenza
   ```
   - App should be whitelisted

3. **Check Scheduled Notifications:**
   ```bash
   adb logcat | grep -i "notification scheduled"
   ```
   - Should see scheduling confirmation

4. **Manually Trigger:**
   - Set reminder time to 1 minute from now
   - Keep app in foreground
   - Wait and observe

5. **Check AlarmManager:**
   ```bash
   adb shell dumpsys alarm | grep -A 10 "com.spenza.app"
   ```
   - Should see scheduled alarms

### Push Notifications Not Working

**Problem:** No FCM token generated or notifications not received

**Solutions:**

1. **Verify google-services.json:**
   ```bash
   ls -la android/app/google-services.json
   ```
   - File should exist and be valid JSON

2. **Check Firebase Dependencies:**
   ```bash
   cd android
   ./gradlew app:dependencies | grep firebase
   ```
   - Should see firebase-messaging

3. **Check FCM Registration:**
   ```bash
   adb logcat | grep -i "FCM"
   ```
   - Look for "Registration successful" message

4. **Test with Firebase Console:**
   - Use "Send test message" feature
   - Target specific device with FCM token
   - Check if notification appears

5. **Check Internet Connection:**
   - FCM requires internet to register and receive
   - Verify device has active connection

### Permission Denied

**Problem:** User denied notification permission

**Solution:**
```
1. Go to device Settings
2. Apps → Spenza
3. Notifications → Enable
4. Return to app and try again
```

### Notifications Work Once Then Stop

**Problem:** Notifications fire once but not again

**Solution:**
1. **Check if notifications are being rescheduled:**
   ```bash
   adb logcat | grep -i "reschedul"
   ```

2. **Verify BootReceiver is working:**
   - Restart device
   - Check logcat for: `[BootReceiver] Device booted, rescheduling notifications`

3. **Re-enable notifications:**
   - Toggle daily reminder OFF then ON
   - This forces rescheduling

---

## Build and Deploy

### 1. Sync and Build
```bash
cd /Users/mac/Documents/Sai/expense-tracker/personal-finance-pwa

# Sync Capacitor
npx cap sync android

# Build APK
cd android
./gradlew clean
./gradlew assembleDebug
```

### 2. Install and Test
```bash
# Install on device
adb install app/build/outputs/apk/debug/app-debug.apk

# Or run directly
npx cap run android
```

### 3. Monitor Logs
```bash
# Watch all relevant logs
adb logcat | grep -E "(Spenza|FCM|LocalNotification|NotificationScheduler|BootReceiver)"

# Watch only FCM logs
adb logcat | grep -i FCM

# Watch only notification logs
adb logcat | grep -i notification
```

---

## Verification Checklist

### Daily Reminders
- [ ] Can enable daily reminder in Settings
- [ ] Permission requested when enabling
- [ ] Time picker appears when enabled
- [ ] Can change reminder time
- [ ] Notification fires at scheduled time (test with 2-3 minutes)
- [ ] Notification appears even when app is closed
- [ ] Notification works after device restart
- [ ] Tapping notification opens Daily Expense page

### Push Notifications
- [ ] Can enable push notifications in Settings
- [ ] Permission requested when enabling
- [ ] FCM token generated (check logcat)
- [ ] Can receive test notification from Firebase Console
- [ ] Notification appears in notification shade
- [ ] Notification shows correct title and body
- [ ] Tapping notification opens app
- [ ] Notifications work when app is in background
- [ ] Notifications work when app is closed

### Budget Warnings (Already Working)
- [ ] Budget warning appears when exceeding 80% of limit
- [ ] Notification shows correct category and percentage
- [ ] Tapping notification opens Expense Limits page
- [ ] No duplicate warnings within 1 hour

---

## Summary

### Changes Made

1. **settings.component.ts:**
   - Added `rescheduleNotificationsIfNeeded()` method
   - Calls rescheduling in `ngOnInit()`
   - Integrated FCM service
   - Updated push notification toggle to initialize FCM

2. **fcm.service.ts:**
   - Already created in previous fix
   - Handles FCM registration and token management
   - Processes incoming push notifications
   - Handles notification tap events

3. **Android Native Code:**
   - `NotificationScheduler.java` - Already in place
   - `BootReceiver.java` - Already in place
   - `MyFirebaseMessagingService.java` - Already in place

### Expected Results

**Daily Reminders:**
- Fire reliably at scheduled time
- Work even when app is closed
- Persist after device restart
- Can be rescheduled by changing time

**Push Notifications:**
- FCM token generated on enable
- Can receive notifications from Firebase Console
- Notifications appear in notification shade
- Tapping opens app to appropriate page

**Budget Warnings:**
- Already working correctly
- Fire immediately when threshold exceeded
- No changes needed

---

## Next Steps

1. **Build and install** the updated app
2. **Enable daily reminder** and set time to 2-3 minutes from now
3. **Wait and verify** notification appears
4. **Enable push notifications** and note FCM token from logcat
5. **Send test notification** from Firebase Console
6. **Verify** push notification appears

All fixes are in place. The app should now have fully working local and push notifications!
