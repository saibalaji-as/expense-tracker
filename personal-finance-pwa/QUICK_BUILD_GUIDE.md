# Quick Build & Test Guide

## Build and Install App

```bash
# 1. Build the web app
npm run build

# 2. Sync with Android
npx cap sync android

# 3. Build Android APK
cd android
./gradlew assembleDebug

# 4. Install on device
adb install app/build/outputs/apk/debug/app-debug.apk

# 5. Return to project root
cd ..
```

## Test Push Notifications

```bash
# 1. Open app on device
# 2. Go to Settings
# 3. Scroll to "Push Notifications"
# 4. Toggle "Enable reminders" ON
# 5. Grant permission when prompted

# 6. Check logcat for confirmation
adb logcat | grep -i "FCM\|NotificationService"
```

**Expected output:**
```
[NotificationService] Native platform - permission handled by FCM
[FCM] Initializing push notifications...
[FCM] Permission result: granted
[FCM] Registration successful, token: dXyZ123abc...
[FCM] Token registered with backend
[NotificationService] Push notifications enabled
```

## Test Lock Screen Notifications

```bash
# 1. In app, go to Settings → Local Notifications
# 2. Toggle "Daily Reminder" ON
# 3. Set time to 2-3 minutes from now
# 4. Lock your device
# 5. Wait for scheduled time

# Expected: Device wakes up, notification shows on lock screen
```

## Update App Icon

```bash
# Quick method using existing icon
npx capacitor-assets generate --iconSource public/icons/icon-512x512.png --android
npx cap sync android
cd android
./gradlew clean assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Troubleshooting

### Push notification toggle doesn't work

```bash
# Check logcat for errors
adb logcat | grep -i "FCM\|NotificationService\|Capacitor"

# Clear app data and try again
adb shell pm clear com.spenza.app
```

### Notifications don't show on lock screen

```bash
# Check notification channel settings on device:
# Settings → Apps → Spenza → Notifications → Expense Reminders
# - Ensure importance is "High" or "Urgent"
# - Ensure "Show on lock screen" is enabled

# Check battery optimization:
# Settings → Battery → Battery optimization → Spenza
# - Set to "Don't optimize" if issues persist
```

### Icon still shows Capacitor logo

```bash
# Clear app data and reinstall
adb uninstall com.spenza.app
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Clear launcher cache:
# Settings → Apps → Launcher → Storage → Clear Cache
```

## Quick Commands

```bash
# Full rebuild
npm run build && npx cap sync android && cd android && ./gradlew clean assembleDebug && adb install app/build/outputs/apk/debug/app-debug.apk && cd ..

# Watch logcat
adb logcat | grep -i "FCM\|NotificationService\|LocalNotificationService"

# Clear app data
adb shell pm clear com.spenza.app

# Uninstall app
adb uninstall com.spenza.app

# List installed packages
adb shell pm list packages | grep spenza
```

## Files to Reference

- **FIXES_SUMMARY.md** - Complete summary of all fixes
- **LOCK_SCREEN_NOTIFICATION_FIX.md** - Lock screen notification details
- **UPDATE_APP_ICON.md** - App icon update guide
- **PUSH_NOTIFICATION_STATUS.md** - Push notification behavior
- **DEBUG_NOTIFICATIONS.md** - Notification debugging guide

---

**TL;DR:** Run the build commands, test push notifications and lock screen delivery, update the icon if needed. Check logcat for any errors. 🚀

