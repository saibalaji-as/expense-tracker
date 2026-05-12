# Capacitor Android Setup Guide

This guide covers building and running Spenza as a native Android app using Capacitor.

---

## Prerequisites

### 1. Android Studio
Download and install from: https://developer.android.com/studio

During installation, make sure to install:
- Android SDK (API level 35 recommended)
- Android SDK Build-Tools
- Android Emulator

### 2. JDK 17+
Android Studio bundles a JDK, but if you need a standalone install:
- macOS: `brew install openjdk@17`
- Or download from: https://adoptium.net

### 3. Environment Variable (optional but recommended)
Add to your shell profile (`~/.zshrc` or `~/.bash_profile`):
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

---

## First-Time Setup (after Android Studio is installed)

```bash
cd personal-finance-pwa

# 1. Build the Angular app
ng build

# 2. Sync built files into the Android project
npx cap sync

# 3. Open in Android Studio (only needed first time or for native config)
npx cap open android

# 4. In Android Studio: Run > Run 'app' (or press Shift+F10)
```

---

## Daily Development Workflow

You stay in Kiro/VS Code the entire time. Android Studio runs in the background.

```bash
cd personal-finance-pwa

# 1. Make changes to Angular code as normal

# 2. Build Angular
ng build

# 3. Sync to Android project
npx cap sync

# 4. Run on connected device or emulator
npx cap run android
```

---

## Google Sign-In Setup (Required for Android)

The Android app uses `@capgo/capacitor-social-login` for native Google Sign-In.
You need to create an **Android OAuth Client ID** in Google Cloud Console.

### Steps:
1. Go to https://console.cloud.google.com/apis/credentials
2. Click **Create Credentials → OAuth Client ID**
3. Select **Android** as the application type
4. Enter:
   - Package name: `com.spenza.app`
   - SHA-1 fingerprint: run `keytool -keystore ~/.android/debug.keystore -list -v` (password: `android`)
5. Copy the generated Client ID
6. Update `capacitor.config.ts` — replace `REPLACE_WITH_ANDROID_CLIENT_ID` with your Android Client ID

---

## Updating the Netlify Functions URL

If your Netlify site URL changes, update it in one place:

```
personal-finance-pwa/src/environments/environment.prod.ts
```

Change the `netlifyFunctionsUrl` value and rebuild.

---

## Troubleshooting

### "JAVA_HOME not set" error
Android Studio bundles a JDK. Point Gradle to it:
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

### App shows blank screen
- Make sure `ng build` ran successfully before `npx cap sync`
- Check that `dist/personal-finance-pwa/browser/index.html` exists

### Google Sign-In fails on Android
- Verify the Android OAuth Client ID is set in `capacitor.config.ts`
- Verify the SHA-1 fingerprint matches your keystore
- For release builds, add the release keystore SHA-1 to Google Cloud Console

### Routing not working (404 on navigation)
- Hash routing is enabled (`/#/daily`) — this is correct for Capacitor
- Do not use `PathLocationStrategy` with Capacitor

---

## Future iOS Setup

When you're ready to build for iOS (requires macOS + Xcode):

```bash
cd personal-finance-pwa

# Add iOS platform
npx cap add ios

# Sync and open in Xcode
npx cap sync
npx cap open ios
```

The same Angular code, same Capacitor plugins, same auth service — all work on iOS automatically.

---

## Project Structure

```
personal-finance-pwa/
├── android/                    ← Native Android project (open in Android Studio)
├── src/
│   ├── environments/
│   │   ├── environment.ts      ← Dev config (local Netlify URL)
│   │   └── environment.prod.ts ← Prod config (spenzaio.netlify.app URL)
│   └── app/
│       └── core/services/
│           ├── auth.service.ts ← Handles web (GSI) + native (SocialLogin) sign-in
│           └── fcm.service.ts  ← Uses absolute URL on native, relative on web
└── capacitor.config.ts         ← Capacitor + plugin configuration
```
