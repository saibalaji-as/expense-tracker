# Local Notifications Setup Guide

## Overview
This document describes the setup, configuration, and usage of the `@capacitor/local-notifications` plugin for the Spenza Personal Finance PWA. Local notifications enable daily expense reminders, budget alerts, and monthly summary nudges that work across web, Android, and iOS platforms.

---

## Table of Contents
1. [Installation Status](#installation-status)
2. [Platform-Specific Setup](#platform-specific-setup)
3. [How to Enable Notifications](#how-to-enable-notifications)
4. [Notification Types](#notification-types)
5. [Platform Differences](#platform-differences)
6. [Web Fallback Behavior](#web-fallback-behavior)
7. [Usage Examples](#usage-examples)
8. [Troubleshooting](#troubleshooting)
9. [References](#references)

---

## Installation Status

✅ **Completed:**
- Installed `@capacitor/local-notifications` package (v8.1.0)
- Ran `npx cap sync` to sync plugin with native projects
- Configured Android notification channel in `android/app/src/main/res/values/strings.xml`
- Plugin auto-registered in Android (Capacitor 3+ handles this automatically)
- Implemented LocalNotificationService with cross-platform support
- Integrated notification settings into Settings page

---

## Platform-Specific Setup

### Android Configuration

#### Notification Channel
The following notification channel has been configured in `android/app/src/main/res/values/strings.xml`:

```xml
<string name="local_notification_channel_id">expense-reminders</string>
<string name="local_notification_channel_name">Expense Reminders</string>
<string name="local_notification_channel_description">Daily reminders and budget alerts</string>
```

**Channel Properties:**
- **ID**: `expense-reminders`
- **Name**: Expense Reminders (visible to users in system settings)
- **Importance**: Default (makes sound and appears in notification shade)

#### MainActivity
No manual plugin registration is required. Capacitor 3+ automatically registers plugins. The MainActivity extends `BridgeActivity` which handles plugin initialization.

#### Permissions
The following permissions are automatically included by the plugin:
- `android.permission.POST_NOTIFICATIONS` (Android 13+)
- `android.permission.SCHEDULE_EXACT_ALARM` (for precise timing)

#### Testing on Android
1. Build and run the app: `npx cap run android`
2. Navigate to Settings page
3. Enable notifications and grant permission when prompted
4. Verify notifications appear in the system notification shade

---

### iOS Configuration

⚠️ **iOS platform not yet added to this project.**

When iOS is added (via `npx cap add ios`), the following configuration will be required:

#### Info.plist Configuration
Add the following to `ios/App/App/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

#### Notification Permissions
The plugin will automatically request notification permissions when `LocalNotifications.requestPermissions()` is called from the Angular service. iOS will show a system dialog asking the user to allow notifications.

#### Testing on iOS
1. Build and run the app: `npx cap run ios`
2. Navigate to Settings page
3. Enable notifications and grant permission when prompted
4. Verify notifications appear in the iOS notification center

---

### Web Platform

The LocalNotificationService automatically falls back to the browser's Notification API when running on web platforms.

#### Requirements
- **HTTPS**: Browser notifications require a secure context (HTTPS or localhost)
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **User Gesture**: Permission must be requested in response to a user action (e.g., button click)

#### Limitations
See [Web Fallback Behavior](#web-fallback-behavior) section for detailed limitations.

---

## How to Enable Notifications

### Step 1: Navigate to Settings
1. Open the Spenza app
2. Tap the **Settings** icon in the navigation bar
3. Scroll to the **Local Notifications** section

### Step 2: Request Permission
1. If you see a **"Request Permission"** button, tap it
2. A system dialog will appear asking for notification permission
3. Tap **"Allow"** or **"OK"** to grant permission

**Note:** If you deny permission, you can re-enable it later in your device's system settings:
- **Android**: Settings → Apps → Spenza → Notifications
- **iOS**: Settings → Spenza → Notifications
- **Web**: Browser settings → Site permissions → Notifications

### Step 3: Enable Daily Reminder
1. Toggle **"Enable Daily Reminder"** to ON
2. A time picker will appear
3. Select your preferred reminder time (default: 9:00 PM)
4. The app will schedule a daily notification at the selected time

**What happens:**
- You'll receive a notification every day at the chosen time
- The notification will say: "Don't forget to log today's expenses 💰"
- Tapping the notification opens the Daily Expense page

### Step 4: Enable Budget Warnings (Optional)
1. Toggle **"Enable Budget Warnings"** to ON
2. You'll now receive alerts when spending exceeds 80% of a category budget

**What happens:**
- When you add an expense that pushes a category over 80% of its limit, you'll get an immediate notification
- The notification will say: "You've used X% of your [Category] budget"
- Tapping the notification opens the Expense Limits page

---

## Notification Types

### 1. Daily Reminder
**Purpose:** Reminds you to log your daily expenses

**Schedule:** Every day at your configured time (default: 9:00 PM)

**Notification Content:**
- **Title:** Expense Reminder
- **Body:** Don't forget to log today's expenses 💰

**Tap Action:** Opens the Daily Expense page (`/daily`)

**How to Configure:**
- Enable/disable: Settings → Local Notifications → Enable Daily Reminder
- Change time: Settings → Local Notifications → Reminder Time picker

---

### 2. Budget Warning
**Purpose:** Alerts you when spending approaches a category limit

**Trigger:** Automatically sent when an expense entry causes category spending to exceed 80% of its configured limit

**Notification Content:**
- **Title:** Budget Warning
- **Body:** You've used [X]% of your [Category] budget

**Tap Action:** Opens the Expense Limits page (`/limits`)

**How to Configure:**
- Enable/disable: Settings → Local Notifications → Enable Budget Warnings

**Deduplication:** Only one alert per category per hour to avoid notification spam

---

### 3. Monthly Summary Nudge
**Purpose:** Reminds you to review your spending before the month ends

**Schedule:** 28th of each month at 9:00 AM

**Notification Content:**
- **Title:** Monthly Summary
- **Body:** Month ending soon — check your spending summary

**Tap Action:** Opens the Monthly Expense page (`/monthly`)

**How to Configure:**
- Automatically enabled when Daily Reminder is enabled
- Automatically disabled when Daily Reminder is disabled

---

## Platform Differences

### Native Platforms (Android & iOS)

**Advantages:**
✅ Notifications work even when the app is fully closed  
✅ Precise scheduling with system-level reliability  
✅ Notifications persist in the notification center  
✅ Background delivery without requiring the app to be open  
✅ System-managed notification channels (Android) or categories (iOS)  

**Behavior:**
- Notifications are scheduled with the operating system
- The OS handles delivery at the scheduled time
- Notifications appear in the system notification shade/center
- Tapping a notification launches the app and navigates to the relevant page

**Permissions:**
- Android 13+: Requires runtime permission (requested automatically)
- iOS: Requires user permission (requested automatically)

---

### Web Platform

**Advantages:**
✅ Works in any modern browser  
✅ No app installation required  
✅ Same notification UI as native apps  

**Limitations:**
⚠️ **Requires browser tab to remain open** for scheduled notifications  
⚠️ Notifications are lost if the tab is closed or browser is restarted  
⚠️ Less reliable than native notifications  
⚠️ Requires HTTPS (or localhost for development)  
⚠️ Browser-specific permission UI and behavior  

**Behavior:**
- Notifications are scheduled using JavaScript `setTimeout`
- The browser must be running for notifications to fire
- Notifications appear as browser notifications (not system notifications)
- Tapping a notification focuses the browser tab and navigates to the relevant page

**See [Web Fallback Behavior](#web-fallback-behavior) for more details.**

---

## Web Fallback Behavior

When running on web platforms (browser), the app uses the browser's Notification API instead of the Capacitor plugin. This provides basic notification functionality but with important limitations.

### How It Works

1. **Permission Request:**
   - Calls `Notification.requestPermission()` instead of Capacitor API
   - Browser shows its own permission dialog

2. **Scheduling:**
   - Uses JavaScript `setTimeout` to schedule notifications
   - Calculates delay until target time and sets a timer
   - When timer fires, creates a browser notification using `new Notification()`

3. **Recurring Notifications:**
   - After a notification fires, automatically reschedules for the next occurrence
   - Daily reminder: Reschedules for 24 hours later
   - Monthly nudge: Reschedules for next month's 28th

4. **Persistence:**
   - On app startup, checks if notifications are enabled
   - Reschedules all enabled notifications (daily reminder, monthly nudge)

### Limitations

#### 1. Requires Tab to Remain Open
**Problem:** JavaScript timers (`setTimeout`) only run while the browser tab is active or in the background. If the tab is closed, all timers are cleared.

**Impact:**
- Daily reminder will NOT fire if you close the browser tab before the scheduled time
- Monthly nudge will NOT fire if the tab is closed
- Budget warnings work fine (they're immediate, not scheduled)

**Workaround:**
- Keep the browser tab open (can be in the background)
- Pin the tab in your browser to prevent accidental closure
- Use the native app (Android/iOS) for reliable scheduled notifications

#### 2. Lost on Browser Restart
**Problem:** Timers are cleared when the browser is closed or restarted.

**Impact:**
- Scheduled notifications are lost on browser restart
- Notifications are rescheduled when you next open the app

**Workaround:**
- Open the app at least once per day to reschedule notifications
- Use the native app for better reliability

#### 3. Browser-Specific Behavior
**Problem:** Different browsers handle notifications differently.

**Examples:**
- **Chrome:** Notifications work well, persist in notification center
- **Firefox:** Notifications work, but may disappear quickly
- **Safari:** Requires explicit user interaction before requesting permission
- **Mobile browsers:** May not support notifications at all

**Workaround:**
- Use Chrome or Edge for best web notification experience
- Use the native app on mobile devices

#### 4. No Background Delivery
**Problem:** Web notifications cannot be delivered when the browser is not running.

**Impact:**
- Unlike native apps, web apps cannot wake up to deliver notifications
- Notifications only fire if the browser is already running

**Workaround:**
- Use the native app for background notifications

### When Web Fallback Works Well

Despite the limitations, web fallback is suitable for:
- ✅ **Budget warnings** (immediate, not scheduled)
- ✅ **Development and testing** (quick iteration without building native apps)
- ✅ **Users who keep browser tabs open** (e.g., pinned tabs)
- ✅ **Desktop users** (more likely to have browser running continuously)

### When to Use Native App

Use the native app (Android/iOS) for:
- ✅ **Reliable daily reminders** (guaranteed delivery even when app is closed)
- ✅ **Monthly nudges** (long-term scheduled notifications)
- ✅ **Mobile devices** (better battery management and notification handling)
- ✅ **Background delivery** (notifications work without app being open)

---

## Usage Examples

### Example 1: Enable Daily Reminder

```typescript
// User action in Settings component
async onDailyReminderToggle() {
  const enabled = !this.notificationPrefs().dailyReminderEnabled;
  
  if (enabled) {
    // Schedule daily reminder at 9:00 PM
    await this.localNotificationService.scheduleDailyReminder(21, 0);
    // Also schedule monthly nudge
    await this.localNotificationService.scheduleMonthlyNudge();
  } else {
    // Cancel notifications
    await this.localNotificationService.cancelDailyReminder();
    await this.localNotificationService.cancelMonthlyNudge();
  }
  
  // Save preference
  const updated = { ...this.notificationPrefs(), dailyReminderEnabled: enabled };
  await this.storageService.setNotificationPreferences(updated);
  this.notificationPrefs.set(updated);
}
```

**Result:**
- Daily notification scheduled for 9:00 PM every day
- Monthly notification scheduled for 28th of each month at 9:00 AM
- Preferences saved to storage

---

### Example 2: Change Reminder Time

```typescript
// User changes time in Settings component
async onReminderTimeChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const [hourStr, minuteStr] = input.value.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  
  // Cancel existing reminder
  await this.localNotificationService.cancelDailyReminder();
  
  // Schedule new reminder with updated time
  await this.localNotificationService.scheduleDailyReminder(hour, minute);
  
  // Save updated preference
  const updated = { 
    ...this.notificationPrefs(), 
    reminderHour: hour, 
    reminderMinute: minute 
  };
  await this.storageService.setNotificationPreferences(updated);
  this.notificationPrefs.set(updated);
}
```

**Result:**
- Old notification cancelled
- New notification scheduled at the selected time
- Preferences updated in storage

---

### Example 3: Trigger Budget Warning

```typescript
// In ExpenseStore when adding an expense
addEntry(entry: ExpenseEntry): void {
  patchState(store, { entries: [entry, ...store.entries()] });
  
  // Check if budget threshold exceeded
  const limit = store.limitMap()[entry.type];
  if (limit) {
    const categoryTotal = store.selectedMonthEntries()
      .filter(e => e.type === entry.type)
      .reduce((sum, e) => sum + e.amount, 0);
    
    const limitAmount = (limit.userPercentage * store.monthlyIncome()) / 100;
    const percent = (categoryTotal / limitAmount) * 100;
    
    if (percent >= 80) {
      // Emit budget threshold event
      budgetThresholdExceeded$.next({
        category: entry.type,
        percent: Math.round(percent),
        timestamp: Date.now()
      });
    }
  }
}

// In LocalNotificationService (subscribed to event)
budgetThresholdExceeded$.subscribe(async (event) => {
  const prefs = await this.storageService.getNotificationPreferences();
  if (prefs.budgetWarningsEnabled) {
    await this.scheduleOverspendAlert(event.category, event.percent);
  }
});
```

**Result:**
- When expense pushes category over 80%, notification is sent immediately
- Notification says: "You've used 85% of your Food budget"
- Tapping notification opens Expense Limits page

---

### Example 4: Handle Notification Tap

```typescript
// In LocalNotificationService initialization
private setupNotificationListener(): void {
  if (this.platform === 'native') {
    LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      this.handleNotificationTap(event.notification);
    });
  }
}

private handleNotificationTap(notification: any): void {
  const route = notification.extra?.route;
  if (route) {
    this.router.navigate([route]);
  }
}
```

**Result:**
- User taps notification
- App opens (or focuses if already open)
- Navigates to the relevant page (e.g., `/daily`, `/limits`, `/monthly`)

---

## Troubleshooting

### Permission Denied

**Problem:** User denied notification permission

**Solution:**
1. **Android:** Settings → Apps → Spenza → Notifications → Enable
2. **iOS:** Settings → Spenza → Notifications → Allow Notifications
3. **Web:** Browser settings → Site permissions → Notifications → Allow

After re-enabling in system settings, return to the app and toggle notifications off and on again.

---

### Notifications Not Firing (Web)

**Problem:** Daily reminder doesn't fire on web platform

**Possible Causes:**
1. Browser tab was closed before scheduled time
2. Browser was restarted
3. Computer went to sleep

**Solution:**
- Keep the browser tab open (can be in background)
- Pin the tab to prevent accidental closure
- Use the native app for reliable notifications

---

### Notifications Not Firing (Android)

**Problem:** Notifications don't appear on Android device

**Possible Causes:**
1. Battery optimization is killing the app
2. Notification channel is disabled
3. App doesn't have notification permission

**Solution:**
1. Check notification permission: Settings → Apps → Spenza → Notifications
2. Disable battery optimization: Settings → Apps → Spenza → Battery → Unrestricted
3. Check notification channel: Long-press a notification → Settings → Ensure "Expense Reminders" is enabled

---

### Wrong Notification Time

**Problem:** Notification fires at the wrong time

**Possible Causes:**
1. Device timezone is incorrect
2. Time picker value wasn't saved

**Solution:**
1. Check device timezone settings
2. In app Settings, change the reminder time and verify it saves
3. Toggle the daily reminder off and on again to reschedule

---

### Duplicate Notifications

**Problem:** Receiving multiple notifications for the same event

**Possible Causes:**
1. Notification was scheduled multiple times
2. App was opened multiple times without canceling old notifications

**Solution:**
1. Toggle daily reminder off, wait 5 seconds, toggle back on
2. This cancels all existing notifications and reschedules fresh ones

---

### Budget Warnings Not Appearing

**Problem:** No notification when exceeding 80% of budget

**Possible Causes:**
1. Budget warnings are disabled in Settings
2. Category doesn't have a configured limit
3. Already received an alert for this category in the last hour (deduplication)

**Solution:**
1. Check Settings → Local Notifications → Enable Budget Warnings is ON
2. Check Expense Limits page → Ensure category has a limit configured
3. Wait 1 hour before adding another expense in the same category

---

## Verification

To verify the plugin is correctly installed and working:

### 1. Check Installation
```bash
# Verify package is installed
npm list @capacitor/local-notifications

# Should show: @capacitor/local-notifications@8.1.0
```

### 2. Check Capacitor Sync
```bash
npx cap sync

# Should show:
# Found 3 Capacitor plugins for android:
#     @capacitor/local-notifications@8.1.0
#     ...
```

### 3. Test in App
1. Open the app
2. Navigate to Settings
3. Request notification permission (should see system dialog)
4. Enable daily reminder
5. Set reminder time to 1 minute from now
6. Wait 1 minute
7. Verify notification appears

### 4. Test Budget Warning
1. Go to Expense Limits page
2. Set a low limit for a category (e.g., Food: $10)
3. Go to Daily Expense page
4. Add an expense for $9 in that category
5. Verify notification appears immediately

---

## References

- [Capacitor Local Notifications Plugin Documentation](https://capacitorjs.com/docs/apis/local-notifications)
- [Browser Notification API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- Design Document: `.kiro/specs/local-push-notifications/design.md`
- Requirements Document: `.kiro/specs/local-push-notifications/requirements.md`
- LocalNotificationService: `src/app/core/services/local-notification.service.ts`
- Settings Component: `src/app/features/settings/settings.component.ts`

---

## Summary

Local notifications in Spenza provide three types of reminders:
1. **Daily Reminder** - Scheduled at your chosen time every day
2. **Budget Warning** - Immediate alert when spending exceeds 80% of a category limit
3. **Monthly Summary Nudge** - Reminder on the 28th of each month

**Platform Support:**
- **Android/iOS**: Full native support with background delivery
- **Web**: Fallback using browser Notification API (requires tab to remain open)

**Configuration:**
- All settings managed in Settings → Local Notifications section
- Preferences persist across app sessions
- Notifications work independently from FCM push notifications

For the most reliable experience, use the native app on Android or iOS. The web version works well for immediate notifications (budget warnings) but has limitations for scheduled notifications (daily reminder, monthly nudge).
