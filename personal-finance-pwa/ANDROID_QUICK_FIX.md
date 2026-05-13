# Android Issues - Quick Fix Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Run Setup Script
```bash
cd /Users/mac/Documents/Sai/expense-tracker/personal-finance-pwa
./setup-android-fixes.sh
```

This will:
- Install `@capacitor/push-notifications` plugin
- Sync Capacitor with Android project

### Step 2: Add Firebase Configuration

**Download google-services.json:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **General**
4. Scroll to **"Your apps"** section
5. Click on your Android app (or add one if not exists)
   - Package name: `com.spenza.app`
6. Click **"Download google-services.json"**
7. Place it here: `android/app/google-services.json`

### Step 3: Build and Test
```bash
# Option 1: Run on connected device
npx cap run android

# Option 2: Build APK
cd android
./gradlew assembleDebug
# APK location: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## ✅ What's Been Fixed

### 1. Performance Issues ✅
- ✅ Hardware acceleration enabled
- ✅ WebView optimized for smooth scrolling
- ✅ Caching enabled for faster load times
- ✅ Rendering priority set to HIGH

### 2. Microphone Not Working ✅
- ✅ `RECORD_AUDIO` permission added
- ✅ `MODIFY_AUDIO_SETTINGS` permission added
- ✅ Microphone feature declared in manifest

**Note:** You'll need to update your voice recording code to request permission at runtime. See `ANDROID_ISSUES_FIX.md` for code examples.

### 3. Push Notifications ✅
- ✅ Firebase Cloud Messaging service created
- ✅ FCM permissions added
- ✅ Notification channel configured
- ✅ Firebase dependencies added to build.gradle
- ✅ `@capacitor/push-notifications` plugin ready to install

**Remaining:** Add `google-services.json` file (Step 2 above)

### 4. Local Notifications Not Firing ✅
- ✅ Exact alarm permissions added (Android 12+)
- ✅ Battery optimization exemption request added
- ✅ Wake lock permission added
- ✅ Boot receiver created (reschedules after restart)
- ✅ Custom AlarmManager scheduler created
- ✅ Notification channel properly configured

---

## 📱 Testing Checklist

After building and installing the app:

### Performance
- [ ] App launches quickly (< 3 seconds)
- [ ] Smooth scrolling on all pages
- [ ] No lag when switching tabs
- [ ] Animations are smooth

### Microphone
- [ ] Tap microphone button
- [ ] Permission dialog appears
- [ ] Grant permission
- [ ] Speak and verify transcription works

### Push Notifications
- [ ] Open Firebase Console
- [ ] Go to Cloud Messaging
- [ ] Send test notification
- [ ] Verify notification appears on device

### Local Notifications
- [ ] Go to Settings
- [ ] Enable daily reminder
- [ ] Set time to 1 minute from now
- [ ] Wait and verify notification appears
- [ ] Test budget warning by exceeding limit

---

## 🔧 Troubleshooting

### App won't build
```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

### Notifications not working
1. Check device Settings → Apps → Spenza → Notifications (enabled?)
2. Check device Settings → Apps → Spenza → Battery → Unrestricted
3. Check logcat: `adb logcat | grep -i spenza`

### Microphone not working
1. Check permission granted: Settings → Apps → Spenza → Permissions
2. Ensure Google app is installed and updated
3. Check logcat for errors

### Performance still poor
1. Enable developer options on device
2. Settings → Developer Options → Force GPU rendering (ON)
3. Settings → Developer Options → Disable HW overlays (ON)
4. Restart device

---

## 📚 Additional Resources

- **Full Documentation:** `ANDROID_ISSUES_FIX.md`
- **Local Notifications:** `LOCAL_NOTIFICATIONS_SETUP.md`
- **FCM Setup:** `FCM_SETUP_INSTRUCTIONS.md`

---

## 🆘 Need Help?

If you encounter issues:

1. Check logcat output:
   ```bash
   adb logcat | grep -E "(Spenza|FCM|Notification|MainActivity)"
   ```

2. Verify all files are in place:
   ```bash
   ls -la android/app/google-services.json
   ls -la android/app/src/main/java/com/spenza/app/
   ```

3. Clean and rebuild:
   ```bash
   cd android
   ./gradlew clean
   ./gradlew assembleDebug
   ```

---

## 📝 Summary

All Android issues have been addressed:

1. ✅ **Performance:** Hardware acceleration + WebView optimization
2. ✅ **Microphone:** Permissions added (code update needed)
3. ✅ **Push Notifications:** FCM setup complete (needs google-services.json)
4. ✅ **Local Notifications:** AlarmManager + battery optimization + boot receiver

**Next:** Run `./setup-android-fixes.sh` and add `google-services.json`
