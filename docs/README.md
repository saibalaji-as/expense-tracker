# Spenza Project Guide

This is the single human-facing guide for developing, building, and operating
Spenza. Durable architecture decisions and current engineering state live in
`../ai/`.

## App Overview

Spenza is an Angular PWA with an Android Capacitor shell. Google Drive JSON
backup is the active source of truth for user data. Netlify functions provide
notification and Gemini-backed endpoints.

## Local Development

```bash
cd personal-finance-pwa
npm ci
npm start
```

Open `http://localhost:4200/`.

Useful checks:

```bash
npm run build
npx vitest run
npx tsc --noEmit -p netlify/tsconfig.json
```

## Android Build

Prerequisites:

- Android Studio with Android SDK and Build-Tools
- JDK 17+
- `ANDROID_HOME`, usually `$HOME/Library/Android/sdk`

Build and install a debug APK:

```bash
cd personal-finance-pwa
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Native Google sign-in requires a Google Cloud Android OAuth client for package
`com.spenza.app` whose SHA-1 matches the exact APK signer. Keep one stable
keystore for APKs distributed as updates. Android rejects an update signed with
a different key.

```bash
cd personal-finance-pwa/android
./gradlew :app:signingReport
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
  app/build/outputs/apk/debug/app-debug.apk
```

Do not uninstall an existing app after a signature mismatch until the previous
keystore has been recovered or loss of local app data is acceptable.

If Android Studio needs an explicit JDK:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

## Runtime Configuration

Web OAuth client configuration is injected through `src/index.html`.
Firebase web configuration and the VAPID key live in
`src/app/core/config/firebase.config.ts`. The Firebase messaging service worker
configuration lives in `public/firebase-messaging-sw.js`.

Required Netlify environment variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

Copy the complete Firebase service-account private key, including BEGIN/END
markers and newline characters. Never commit the service-account JSON file.

The production Netlify functions URL is configured in
`src/environments/environment.prod.ts`. Redeploy after changing Netlify
environment variables.

## Notifications

To test Android notifications:

1. Build and install the APK.
2. Open Settings in Spenza.
3. Enable push notifications or the daily reminder being tested.
4. Grant Android notification permission.
5. For a daily reminder, choose a time a few minutes ahead and lock the device.

Useful logs:

```bash
adb logcat | grep -i "FCM\|NotificationService\|LocalNotificationService"
```

Netlify notification functions are under `netlify/functions/`. The main
endpoints are `register-token`, `unregister-token`, `send-reminders`, and
`test-notification`.

## Family Backup Setup

The owner creates the shared family backup from Spenza and shares the generated
Google Drive folder with the partner as an editor. The partner signs in with the
shared Google account, selects family mode, chooses the partner role, and
connects to the shared backup. Folder-based family setup is preferred; direct
file IDs remain backward compatibility only.

## Logo And Icons

The source logo is `src/assets/logo/spenza-logo.svg`. Public logos and generated
PWA icons live under `public/`.

```bash
cd personal-finance-pwa
npm run generate-icons
npm run build
```

## Generated Directories

The following are generated locally and may be deleted when cleaning the
workspace:

```text
personal-finance-pwa/node_modules/
personal-finance-pwa/dist/
personal-finance-pwa/.angular/
personal-finance-pwa/android/.gradle/
personal-finance-pwa/android/build/
personal-finance-pwa/android/app/build/
personal-finance-pwa/android/capacitor-cordova-android-plugins/build/
```

Restore dependencies with `npm ci`. Restore Android web assets and generated
Capacitor integration files with `npx cap sync android`.

## AI Project Memory

- `../AGENTS.md`: coding-agent instructions
- `../drive-ai.md`: memory maintenance guide
- `../ai/PROJECT_CONTEXT.md`: stable architecture and business rules
- `../ai/CURRENT_STATE.md`: active state, risks, and verification notes
- `../ai/AI_RULES.md`: durable engineering rules
- `../ai/TASK_HISTORY.md`: decision-oriented history

