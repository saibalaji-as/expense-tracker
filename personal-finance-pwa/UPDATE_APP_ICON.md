# Update App Icon to Spenza Logo

## Current Issue

The Android app is showing the default Capacitor icon instead of the Spenza logo.

## Solution

The project now uses `generate-icons.js` to generate both PWA icons and Android launcher icons directly from:

```text
src/assets/logo/spenza-logo.svg
```

Run:

```bash
npm run generate-icons
```

This command updates:

- `public/icons/icon-*.png`
- `public/favicon.ico`
- `public/apple-touch-icon.png`
- `android/app/src/main/res/mipmap-*/ic_launcher.png`
- `android/app/src/main/res/mipmap-*/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-*/ic_launcher_foreground.png`
- `android/app/src/main/res/values/ic_launcher_background.xml`

### Step 1: Sync with Android

```bash
npx cap sync android
```

### Step 2: Rebuild and Install

```bash
cd android
./gradlew clean
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Manual Method (If Automatic Generation Doesn't Work)

If the automatic generation doesn't work, you can manually replace the icons:

### Required Icon Sizes

You need to create these sizes from your Spenza logo:

| Density | Size | Location |
|---------|------|----------|
| mdpi | 48x48 | `android/app/src/main/res/mipmap-mdpi/` |
| hdpi | 72x72 | `android/app/src/main/res/mipmap-hdpi/` |
| xhdpi | 96x96 | `android/app/src/main/res/mipmap-xhdpi/` |
| xxhdpi | 144x144 | `android/app/src/main/res/mipmap-xxhdpi/` |
| xxxhdpi | 192x192 | `android/app/src/main/res/mipmap-xxxhdpi/` |

### Manual Steps

1. **Create icon sizes** using an image editor or online tool:
   - Go to https://icon.kitchen/ or https://appicon.co/
   - Upload your Spenza logo
   - Download the Android icon pack

2. **Replace the files:**
   ```bash
   # For each density folder, replace these files:
   # - ic_launcher.png
   # - ic_launcher_round.png
   # - ic_launcher_foreground.png
   ```

3. **Update the background color** (optional):
   Edit `android/app/src/main/res/values/ic_launcher_background.xml`:
   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <resources>
       <color name="ic_launcher_background">#6366F1</color> <!-- Your brand color -->
   </resources>
   ```

4. **Sync and rebuild:**
   ```bash
   npx cap sync android
   cd android
   ./gradlew clean assembleDebug
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

## Notification Icon

For the notification icon (the small icon that appears in the status bar), you need a white icon on transparent background:

1. **Create notification icon:**
   - Size: 24x24dp (96x96px for xxxhdpi)
   - White icon on transparent background
   - Simple, recognizable shape

2. **Add to drawable:**
   ```bash
   # Create a simple white version of your logo
   # Save as: android/app/src/main/res/drawable/ic_stat_icon_config_sample.png
   ```

3. **Or use XML drawable:**
   Create `android/app/src/main/res/drawable/ic_stat_notification.xml`:
   ```xml
   <vector xmlns:android="http://schemas.android.com/apk/res/android"
       android:width="24dp"
       android:height="24dp"
       android:viewportWidth="24"
       android:viewportHeight="24">
       <path
           android:fillColor="#FFFFFF"
           android:pathData="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM12,20c-4.41,0 -8,-3.59 -8,-8s3.59,-8 8,-8 8,3.59 8,8 -3.59,8 -8,8z"/>
   </vector>
   ```

4. **Update notification service:**
   Change `smallIcon: 'ic_stat_icon_config_sample'` to `smallIcon: 'ic_stat_notification'` in `local-notification.service.ts`

## Verification

After updating the icons:

1. **Check app launcher:**
   - Open app drawer
   - Look for Spenza app
   - Icon should show your logo

2. **Check notifications:**
   - Trigger a test notification
   - Check status bar icon
   - Should show your notification icon

3. **Check recent apps:**
   - Open recent apps (square button)
   - Your app should show the correct icon

## Troubleshooting

### Icon still shows Capacitor logo

1. **Clear app data:**
   ```bash
   adb shell pm clear com.spenza.app
   ```

2. **Uninstall and reinstall:**
   ```bash
   adb uninstall com.spenza.app
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Clear launcher cache:**
   - Settings → Apps → Launcher → Storage → Clear Cache

### Icon looks blurry

- Make sure you're starting with a high-resolution source (1024x1024)
- Use PNG format, not JPEG
- Ensure the icon has proper padding (safe area)

### Notification icon not showing

- Notification icons must be white on transparent background
- Size should be 24x24dp
- Use simple, recognizable shapes
- Avoid gradients and complex details

## Recommended: Use Icon Kitchen

The easiest way to generate all required icons:

1. Go to https://icon.kitchen/
2. Upload your Spenza logo (512x512 or 1024x1024)
3. Adjust padding and background color
4. Download "Android" package
5. Extract and copy files to `android/app/src/main/res/`
6. Sync and rebuild

## Summary

**Quick Method:**
```bash
# 1. Prepare icon
cp public/icons/icon-512x512.png icon.png

# 2. Generate icons
npx capacitor-assets generate --iconSource icon.png --android

# 3. Sync and rebuild
npx cap sync android
cd android
./gradlew clean assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

**Manual Method:**
1. Use https://icon.kitchen/ to generate all sizes
2. Replace files in `android/app/src/main/res/mipmap-*/`
3. Sync and rebuild

---

**TL;DR:** Use `npx capacitor-assets generate` to automatically create all icon sizes from your Spenza logo, then rebuild the app. 🎨✅
