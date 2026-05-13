# Android App Issues - Comprehensive Fix Guide

## Issues Identified

1. ❌ Android app is not smooth compared to PWA app
2. ❌ Not able to use microphone (voice recording)
3. ❌ Not able to enable push notifications
4. ❌ Budget warnings and daily reminders not triggered on time

---

## Issue 1: Android App Performance (Not Smooth)

### Root Causes
1. **Hardware acceleration not enabled** in AndroidManifest.xml
2. **WebView not optimized** for performance
3. **No caching strategy** configured
4. **Missing performance optimizations** in Capacitor config

### Solutions

#### A. Enable Hardware Acceleration
Add hardware acceleration to AndroidManifest.xml:

```xml
<!-- File: android/app/src/main/AndroidManifest.xml -->
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"
    android:theme="@style/AppTheme"
    android:hardwareAccelerated="true"
    android:largeHeap="true">
    
    <activity
        android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
        android:name=".MainActivity"
        android:label="@string/title_activity_main"
        android:theme="@style/AppTheme.NoActionBarLaunch"
        android:launchMode="singleTask"
        android:exported="true"
        android:hardwareAccelerated="true">
        <!-- ... -->
    </activity>
</application>
```

#### B. Optimize Capacitor Configuration
Update `capacitor.config.ts`:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spenza.app',
  appName: 'Spenza',
  webDir: 'dist/personal-finance-pwa/browser',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Set to true only for debugging
    backgroundColor: '#ffffff',
    // Enable smooth scrolling
    overScrollMode: 'never',
    // Improve touch responsiveness
    scrollbarStyle: 'outsideOverlay',
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
```

#### C. Add WebView Performance Settings
Create a custom MainActivity to optimize WebView:

```java
// File: android/app/src/main/java/com/spenza/app/MainActivity.java
package com.spenza.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Optimize WebView performance
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        
        // Enable hardware acceleration
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        
        // Enable caching
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        
        // Improve rendering performance
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        
        // Enable smooth scrolling
        webView.setScrollBarStyle(WebView.SCROLLBARS_OUTSIDE_OVERLAY);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    }
}
```

---

## Issue 2: Microphone Not Working (Voice Recording)

### Root Cause
Missing microphone permission in AndroidManifest.xml. The Web Speech API requires microphone access on Android.

### Solution

#### A. Add Microphone Permission
Update `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Permissions -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Declare microphone as required feature (optional - only if mic is essential) -->
<uses-feature 
    android:name="android.hardware.microphone" 
    android:required="false" />
```

#### B. Request Runtime Permission
Update `daily-expense.component.ts` to request permission on Android:

```typescript
// Add this method to DailyExpenseComponent
async requestMicrophonePermission(): Promise<boolean> {
  if (Capacitor.getPlatform() === 'android') {
    try {
      // Check if we have permission
      const result = await Capacitor.Plugins.Permissions.query({ name: 'microphone' });
      
      if (result.state === 'granted') {
        return true;
      }
      
      // Request permission
      const requestResult = await Capacitor.Plugins.Permissions.request({ name: 'microphone' });
      return requestResult.state === 'granted';
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      return false;
    }
  }
  return true; // Web/iOS handles permission automatically
}

// Update startVoiceRecording method
async startVoiceRecording(): Promise<void> {
  // Request permission first on Android
  const hasPermission = await this.requestMicrophonePermission();
  if (!hasPermission) {
    alert('Microphone permission is required for voice recording. Please enable it in Settings.');
    return;
  }

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
    return;
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  this.recognition = new SpeechRecognition();
  
  // ... rest of the code
}
```

#### C. Alternative: Use Capacitor Voice Recorder Plugin
For better Android support, consider using `@capacitor-community/speech-recognition`:

```bash
npm install @capacitor-community/speech-recognition
npx cap sync
```

Then update the component:

```typescript
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

async startVoiceRecording(): Promise<void> {
  try {
    // Check permission
    const { available } = await SpeechRecognition.available();
    if (!available) {
      alert('Speech recognition is not available on this device.');
      return;
    }

    // Request permission
    const { permission } = await SpeechRecognition.requestPermission();
    if (permission !== 'granted') {
      alert('Microphone permission is required for voice recording.');
      return;
    }

    // Start listening
    this.isRecording.set(true);
    await SpeechRecognition.start({
      language: 'en-US',
      maxResults: 1,
      prompt: 'Speak now...',
      partialResults: false,
      popup: true,
    });

    SpeechRecognition.addListener('partialResults', (data: any) => {
      console.log('Partial results:', data.matches);
    });

    SpeechRecognition.addListener('result', (data: any) => {
      if (data.matches && data.matches.length > 0) {
        const transcript = data.matches[0];
        this.parseVoiceInput(transcript);
      }
      this.isRecording.set(false);
    });

  } catch (error) {
    console.error('Speech recognition error:', error);
    this.isRecording.set(false);
  }
}

async stopVoiceRecording(): Promise<void> {
  try {
    await SpeechRecognition.stop();
    this.isRecording.set(false);
  } catch (error) {
    console.error('Error stopping speech recognition:', error);
  }
}
```

---

## Issue 3: Push Notifications Not Working

### Root Causes
1. **Missing google-services.json** file for Firebase Cloud Messaging
2. **Missing FCM permissions** in AndroidManifest.xml
3. **No notification service** configured for Android

### Solutions

#### A. Add Firebase Configuration

1. **Download google-services.json:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings → General
   - Scroll to "Your apps" section
   - Click on your Android app (or add one if not exists)
   - Download `google-services.json`
   - Place it in: `android/app/google-services.json`

2. **Update AndroidManifest.xml** with FCM permissions:

```xml
<!-- File: android/app/src/main/AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:hardwareAccelerated="true">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

        <!-- Firebase Cloud Messaging Service -->
        <service
            android:name=".MyFirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

        <!-- Set default notification icon and color -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@mipmap/ic_launcher" />
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_color"
            android:resource="@color/colorPrimary" />
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="expense-reminders" />

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    
    <!-- Push Notifications (Android 13+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- FCM -->
    <uses-permission android:name="com.google.android.c2dm.permission.RECEIVE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    
    <!-- Microphone feature -->
    <uses-feature 
        android:name="android.hardware.microphone" 
        android:required="false" />
</manifest>
```

#### B. Create Firebase Messaging Service

Create `android/app/src/main/java/com/spenza/app/MyFirebaseMessagingService.java`:

```java
package com.spenza.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "FCMService";
    private static final String CHANNEL_ID = "expense-reminders";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.d(TAG, "New FCM token: " + token);
        // Send token to your server if needed
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "Message received from: " + remoteMessage.getFrom());

        // Check if message contains a notification payload
        if (remoteMessage.getNotification() != null) {
            String title = remoteMessage.getNotification().getTitle();
            String body = remoteMessage.getNotification().getBody();
            sendNotification(title, body);
        }

        // Check if message contains a data payload
        if (remoteMessage.getData().size() > 0) {
            Log.d(TAG, "Message data payload: " + remoteMessage.getData());
        }
    }

    private void sendNotification(String title, String messageBody) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notificationBuilder =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(messageBody)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent);

        NotificationManager notificationManager =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        // Create notification channel for Android O+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Expense Reminders",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Daily reminders and budget alerts");
            notificationManager.createNotificationChannel(channel);
        }

        notificationManager.notify(0, notificationBuilder.build());
    }
}
```

#### C. Add Firebase Dependencies

Update `android/app/build.gradle`:

```gradle
dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
    implementation project(':capacitor-cordova-android-plugins')
    
    // Firebase Cloud Messaging
    implementation platform('com.google.firebase:firebase-bom:33.7.0')
    implementation 'com.google.firebase:firebase-messaging'
    implementation 'com.google.firebase:firebase-analytics'
}
```

#### D. Install Capacitor Push Notifications Plugin

```bash
npm install @capacitor/push-notifications
npx cap sync
```

Update your notification service to handle FCM:

```typescript
// src/app/core/services/fcm.service.ts
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

@Injectable({
  providedIn: 'root'
})
export class FcmService {
  async initializePushNotifications(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      console.log('Push notifications not available on web');
      return;
    }

    // Request permission
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      // Register with FCM
      await PushNotifications.register();
    }

    // Listen for registration
    PushNotifications.addListener('registration', (token) => {
      console.log('FCM Token:', token.value);
      // Send token to your backend
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('FCM Registration Error:', error);
    });

    // Listen for push notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
    });

    // Listen for notification taps
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification action performed:', notification);
    });
  }
}
```

---

## Issue 4: Local Notifications Not Triggered on Time

### Root Causes
1. **Battery optimization** killing the app in background
2. **Doze mode** preventing scheduled notifications
3. **Missing exact alarm permission** (Android 12+)
4. **Notification channel not properly configured**

### Solutions

#### A. Request Exact Alarm Permission (Android 12+)

Update `AndroidManifest.xml`:

```xml
<!-- Add this permission for exact alarms (Android 12+) -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />

<!-- Wake lock to ensure notifications fire -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Foreground service for reliable notifications -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
```

#### B. Request Battery Optimization Exemption

Update `MainActivity.java`:

```java
package com.spenza.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Optimize WebView performance
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        
        // Enable hardware acceleration
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        
        // Enable caching
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        
        // Improve rendering performance
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        
        // Enable smooth scrolling
        webView.setScrollBarStyle(WebView.SCROLLBARS_OUTSIDE_OVERLAY);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        
        // Request battery optimization exemption
        requestBatteryOptimizationExemption();
        
        // Request exact alarm permission (Android 12+)
        requestExactAlarmPermission();
    }
    
    private void requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            String packageName = getPackageName();
            
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                Intent intent = new Intent();
                intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + packageName));
                startActivity(intent);
            }
        }
    }
    
    private void requestExactAlarmPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        }
    }
}
```

#### C. Improve Notification Channel Configuration

Update `android/app/src/main/res/values/strings.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Spenza</string>
    <string name="title_activity_main">Spenza</string>
    <string name="package_name">com.spenza.app</string>
    <string name="custom_url_scheme">com.spenza.app</string>
    
    <!-- Local Notifications Channel -->
    <string name="local_notification_channel_id">expense-reminders</string>
    <string name="local_notification_channel_name">Expense Reminders</string>
    <string name="local_notification_channel_description">Daily reminders and budget alerts</string>
</resources>
```

#### D. Use AlarmManager for Reliable Scheduling

Create a custom notification scheduler using AlarmManager:

```java
// File: android/app/src/main/java/com/spenza/app/NotificationScheduler.java
package com.spenza.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.util.Calendar;

public class NotificationScheduler extends BroadcastReceiver {
    private static final String TAG = "NotificationScheduler";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Alarm triggered, showing notification");
        
        // Get notification details from intent
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        
        // Show notification using LocalNotifications plugin
        // This will be handled by Capacitor's LocalNotifications plugin
    }
    
    public static void scheduleDailyNotification(Context context, int hour, int minute) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, NotificationScheduler.class);
        intent.putExtra("title", "Expense Reminder");
        intent.putExtra("body", "Don't forget to log today's expenses 💰");
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            1001, // Request code for daily reminder
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Set alarm time
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, hour);
        calendar.set(Calendar.MINUTE, minute);
        calendar.set(Calendar.SECOND, 0);
        
        // If time has passed today, schedule for tomorrow
        if (calendar.getTimeInMillis() < System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_MONTH, 1);
        }
        
        // Schedule repeating alarm
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                calendar.getTimeInMillis(),
                pendingIntent
            );
        } else {
            alarmManager.setRepeating(
                AlarmManager.RTC_WAKEUP,
                calendar.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY,
                pendingIntent
            );
        }
        
        Log.d(TAG, "Daily notification scheduled for " + hour + ":" + minute);
    }
    
    public static void cancelDailyNotification(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, NotificationScheduler.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            1001,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.cancel(pendingIntent);
        Log.d(TAG, "Daily notification cancelled");
    }
}
```

Register the receiver in `AndroidManifest.xml`:

```xml
<receiver 
    android:name=".NotificationScheduler"
    android:enabled="true"
    android:exported="false">
</receiver>
```

---

## Implementation Steps

### Step 1: Update AndroidManifest.xml
Apply all permission and configuration changes from above.

### Step 2: Create/Update MainActivity.java
Add performance optimizations and permission requests.

### Step 3: Add Firebase Configuration
1. Download and add `google-services.json`
2. Create `MyFirebaseMessagingService.java`
3. Update `build.gradle` with Firebase dependencies

### Step 4: Install Required Packages
```bash
cd /Users/mac/Documents/Sai/expense-tracker/personal-finance-pwa

# Install Capacitor plugins
npm install @capacitor/push-notifications
npm install @capacitor-community/speech-recognition

# Sync with Android
npx cap sync android

# Rebuild Android app
cd android
./gradlew clean
./gradlew assembleDebug
```

### Step 5: Update Capacitor Config
Apply the optimizations to `capacitor.config.ts`.

### Step 6: Test on Device
```bash
# Run on connected Android device
npx cap run android

# Or build APK for testing
cd android
./gradlew assembleDebug
# APK will be in: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Testing Checklist

### Performance Testing
- [ ] App launches quickly (< 3 seconds)
- [ ] Smooth scrolling on all pages
- [ ] No lag when switching between tabs
- [ ] Animations are smooth (60 FPS)
- [ ] No jank when adding expenses

### Microphone Testing
- [ ] Permission dialog appears when tapping mic button
- [ ] Voice recording starts after granting permission
- [ ] Speech is transcribed correctly
- [ ] Recording stops when tapping button again
- [ ] Parsed expense data is correct

### Push Notifications Testing
- [ ] FCM token is generated on app start
- [ ] Can receive test notifications from Firebase Console
- [ ] Notifications appear in notification shade
- [ ] Tapping notification opens the app
- [ ] Notification icon and color are correct

### Local Notifications Testing
- [ ] Daily reminder fires at scheduled time
- [ ] Budget warning appears when threshold exceeded
- [ ] Monthly nudge fires on 28th of month
- [ ] Notifications work when app is closed
- [ ] Notifications work after device restart
- [ ] Can change reminder time successfully

---

## Common Issues and Solutions

### Issue: "App keeps stopping"
**Solution:** Check logcat for errors:
```bash
adb logcat | grep -i spenza
```

### Issue: Notifications not firing after device restart
**Solution:** Add BOOT_COMPLETED receiver:
```xml
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<receiver 
    android:name=".BootReceiver"
    android:enabled="true"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

### Issue: Voice recognition not working
**Solution:** Ensure Google app is installed and updated on the device.

### Issue: App still laggy
**Solution:** 
1. Enable developer options on device
2. Set "Force GPU rendering" to ON
3. Set "Disable HW overlays" to ON
4. Restart device

---

## Additional Optimizations

### 1. Enable ProGuard for Release Builds
Update `android/app/build.gradle`:

```gradle
buildTypes {
    release {
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

### 2. Enable R8 Optimization
Add to `gradle.properties`:

```properties
android.enableR8.fullMode=true
android.enableR8=true
```

### 3. Optimize Images
Ensure all images in `android/app/src/main/res/` are optimized (use WebP format).

### 4. Enable Multidex (if needed)
If you encounter "method count exceeded" error:

```gradle
android {
    defaultConfig {
        multiDexEnabled true
    }
}

dependencies {
    implementation 'androidx.multidex:multidex:2.0.1'
}
```

---

## Resources

- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging/android/client)
- [Android Performance Best Practices](https://developer.android.com/topic/performance)
- [Local Notifications Plugin](https://capacitorjs.com/docs/apis/local-notifications)
- [Speech Recognition Plugin](https://github.com/capacitor-community/speech-recognition)

---

## Summary

This guide addresses all four issues:

1. **Performance**: Hardware acceleration, WebView optimization, caching
2. **Microphone**: Runtime permissions, Speech Recognition plugin
3. **Push Notifications**: Firebase setup, FCM service, proper permissions
4. **Local Notifications**: Exact alarm permissions, battery optimization exemption, AlarmManager

Follow the implementation steps in order, test thoroughly, and refer to the troubleshooting section if you encounter issues.
