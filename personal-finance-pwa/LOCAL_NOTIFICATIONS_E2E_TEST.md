# Local Notifications - End-to-End Testing Guide

## Overview

This document provides a comprehensive testing checklist for the local push notifications feature. Follow these tests to verify that all notification functionality works correctly across different scenarios.

## Prerequisites

Before starting the tests:

1. ✅ Ensure the app is built and deployed (or running locally)
2. ✅ Have access to the Settings page
3. ✅ Clear any existing notification preferences (optional, for clean testing)
4. ✅ Have a test expense category with a configured budget limit

---

## Test Suite

### Test 1: Permission Request

**Objective:** Verify notification permission can be requested and granted

**Steps:**
1. Open the app and navigate to Settings
2. Scroll to the "Local Notifications" section
3. Verify "Request Permission" button is visible
4. Click "Request Permission"
5. Grant permission in the browser/system dialog

**Expected Results:**
- ✅ Permission dialog appears
- ✅ After granting, "Request Permission" button disappears
- ✅ Daily Reminder and Budget Warnings toggles become enabled
- ✅ No error messages appear in console

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 2: Enable Daily Reminder

**Objective:** Verify daily reminder can be enabled and scheduled

**Steps:**
1. In Settings → Local Notifications section
2. Toggle "Daily Reminder" to ON
3. Verify time picker appears
4. Set reminder time to 2 minutes from current time
5. Check browser console for scheduling confirmation

**Expected Results:**
- ✅ Toggle switches to ON state
- ✅ Time picker input appears below the toggle
- ✅ Console shows: `[LocalNotificationService] Daily reminder scheduled for HH:MM`
- ✅ Console shows: `[LocalNotificationService] Monthly nudge scheduled for...`
- ✅ Preferences are saved (check localStorage/IndexedDB)

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 3: Daily Reminder Notification Fires

**Objective:** Verify daily reminder notification appears at configured time

**Steps:**
1. Wait for the scheduled time (from Test 2)
2. Keep the app open in the browser
3. Observe notification appearance

**Expected Results:**
- ✅ Notification appears at the exact scheduled time
- ✅ Title: "Expense Reminder"
- ✅ Body: "Don't forget to log today's expenses 💰"
- ✅ Notification icon displays correctly

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 4: Daily Reminder Navigation

**Objective:** Verify tapping daily reminder navigates to /daily page

**Steps:**
1. Wait for daily reminder notification (or trigger manually if testing on native)
2. Click/tap the notification

**Expected Results:**
- ✅ App opens (if closed) or focuses (if open)
- ✅ Navigation occurs to `/daily` route
- ✅ Daily expense page displays correctly
- ✅ Console shows: `[LocalNotificationService] Navigating to /daily from notification tap`

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 5: Change Reminder Time

**Objective:** Verify changing reminder time cancels old and schedules new notification

**Steps:**
1. In Settings, with Daily Reminder enabled
2. Change the time picker to a different time (e.g., 5 minutes from now)
3. Check console for cancellation and rescheduling messages

**Expected Results:**
- ✅ Console shows: `[LocalNotificationService] Daily reminder cancelled`
- ✅ Console shows: `[LocalNotificationService] Daily reminder scheduled for [NEW_TIME]`
- ✅ New time is saved in preferences
- ✅ Old notification does not fire
- ✅ New notification fires at updated time

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 6: Disable Daily Reminder

**Objective:** Verify disabling daily reminder cancels scheduled notifications

**Steps:**
1. In Settings, toggle "Daily Reminder" to OFF
2. Check console for cancellation messages
3. Wait past the previously scheduled time

**Expected Results:**
- ✅ Toggle switches to OFF state
- ✅ Time picker disappears
- ✅ Console shows: `[LocalNotificationService] Daily reminder cancelled`
- ✅ Console shows: `[LocalNotificationService] Monthly nudge cancelled`
- ✅ No notification appears at the previously scheduled time
- ✅ Preferences updated in storage

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 7: Budget Warning Notification

**Objective:** Verify budget alert appears when spending exceeds 80% threshold

**Steps:**
1. In Settings, ensure "Budget Warnings" toggle is ON
2. Navigate to Limits page and set a low budget for a category (e.g., Food: ₹100)
3. Navigate to Daily page
4. Add an expense that crosses 80% threshold (e.g., Food: ₹85)
5. Observe notification

**Expected Results:**
- ✅ Notification appears immediately (within 1 second)
- ✅ Title: "Budget Warning"
- ✅ Body: "You've used 85% of your Food budget" (or similar)
- ✅ Console shows: `[LocalNotificationService] Budget threshold exceeded: {category: 'Food', percent: 85, ...}`
- ✅ Console shows: `[LocalNotificationService] Budget alert scheduled for Food (85%)`

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 8: Budget Alert Navigation

**Objective:** Verify tapping budget alert navigates to /limits page

**Steps:**
1. Trigger a budget alert (from Test 7)
2. Click/tap the notification

**Expected Results:**
- ✅ App opens (if closed) or focuses (if open)
- ✅ Navigation occurs to `/limits` route
- ✅ Expense Limit page displays correctly
- ✅ Console shows: `[LocalNotificationService] Navigating to /limits from notification tap`

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 9: Budget Alert Deduplication

**Objective:** Verify duplicate budget alerts are prevented within 1-hour window

**Steps:**
1. Trigger a budget alert for a category (e.g., Food at 85%)
2. Immediately add another expense in the same category (e.g., Food: ₹10)
3. Check console for deduplication message

**Expected Results:**
- ✅ First alert appears normally
- ✅ Second alert is skipped
- ✅ Console shows: `[LocalNotificationService] Skipping duplicate alert for Food (last alert was X minutes ago)`
- ✅ Only one notification appears

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 10: Monthly Nudge Notification

**Objective:** Verify monthly nudge is scheduled correctly

**Steps:**
1. Enable Daily Reminder (which also enables monthly nudge)
2. Check console for monthly nudge scheduling message
3. Verify the scheduled date is the 28th of current or next month at 9:00 AM

**Expected Results:**
- ✅ Console shows: `[LocalNotificationService] Monthly nudge scheduled for [DATE]`
- ✅ Scheduled date is the 28th at 9:00 AM
- ✅ If today is before the 28th, scheduled for this month
- ✅ If today is 28th or later, scheduled for next month

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 11: Monthly Nudge Navigation

**Objective:** Verify tapping monthly nudge navigates to /monthly page

**Steps:**
1. Wait for monthly nudge (or manually trigger if testing on native)
2. Click/tap the notification

**Expected Results:**
- ✅ App opens (if closed) or focuses (if open)
- ✅ Navigation occurs to `/monthly` route
- ✅ Monthly expense page displays correctly
- ✅ Console shows: `[LocalNotificationService] Navigating to /monthly from notification tap`

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 12: Web Browser Fallback

**Objective:** Verify notifications work on web browser using Notification API

**Steps:**
1. Open the app in a web browser (Chrome, Firefox, Safari)
2. Complete Tests 1-9 in the browser environment
3. Check console for web-specific messages

**Expected Results:**
- ✅ All tests pass in web browser
- ✅ Console shows: `[LocalNotificationService] Web daily reminder scheduled for...`
- ✅ Console shows: `[LocalNotificationService] Web monthly nudge scheduled for...`
- ✅ Console shows: `[LocalNotificationService] Web budget alert shown for...`
- ✅ Notifications use browser Notification API
- ✅ setTimeout is used for scheduling (check console logs)

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 13: Permission Denied Handling

**Objective:** Verify UI handles denied notification permission gracefully

**Steps:**
1. Clear notification permission for the site (browser settings)
2. Reload the app
3. Navigate to Settings → Local Notifications
4. Click "Request Permission"
5. Deny permission in the dialog

**Expected Results:**
- ✅ "Request Permission" button remains visible
- ✅ Error message appears: "Notification permission denied. Enable notifications in your device settings to use this feature."
- ✅ Daily Reminder toggle is disabled (grayed out)
- ✅ Budget Warnings toggle is disabled (grayed out)
- ✅ No crashes or console errors
- ✅ App continues to function normally

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 14: FCM Service Independence

**Objective:** Verify local notifications don't interfere with FCM push notifications

**Steps:**
1. Enable both local notifications and FCM push notifications
2. Trigger a local notification (daily reminder or budget alert)
3. Trigger an FCM notification (via send-reminders function)
4. Observe both notifications

**Expected Results:**
- ✅ Both notifications appear independently
- ✅ No conflicts or suppression
- ✅ Both notification systems work simultaneously
- ✅ Settings page shows separate sections for "Push Notifications" and "Local Notifications"
- ✅ No cross-imports between LocalNotificationService and FcmService

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 15: Persistence Across Sessions

**Objective:** Verify notification preferences persist across app restarts

**Steps:**
1. Enable Daily Reminder with a specific time (e.g., 14:30)
2. Enable Budget Warnings
3. Close the app completely
4. Reopen the app
5. Navigate to Settings → Local Notifications

**Expected Results:**
- ✅ Daily Reminder toggle is ON
- ✅ Time picker shows the previously set time (14:30)
- ✅ Budget Warnings toggle is ON
- ✅ Console shows: `[LocalNotificationService] Loaded preferences: {dailyReminderEnabled: true, ...}`
- ✅ Notifications are rescheduled on app startup
- ✅ Console shows: `[LocalNotificationService] Scheduling daily reminder and monthly nudge...`

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

### Test 16: Service Initialization

**Objective:** Verify LocalNotificationService initializes correctly on app startup

**Steps:**
1. Clear all notification preferences
2. Reload the app
3. Check console for initialization messages

**Expected Results:**
- ✅ Console shows: `[LocalNotificationService] Initializing service...`
- ✅ Console shows: `[LocalNotificationService] Permission status: [STATUS]`
- ✅ Console shows: `[LocalNotificationService] Loaded preferences: {...}`
- ✅ Console shows: `[LocalNotificationService] Subscribed to budget threshold events`
- ✅ Console shows: `[LocalNotificationService] Initialization complete`
- ✅ No errors during initialization

**Status:** ⬜ Pass / ⬜ Fail

**Notes:**
```
[Add any observations here]
```

---

## Platform-Specific Tests

### Android Tests (if applicable)

**Test A1: Native Notification Channel**
- ✅ Notifications use "Expense Reminders" channel
- ✅ Channel appears in Android notification settings
- ✅ Channel importance is "default"

**Test A2: Background Notifications**
- ✅ Notifications fire when app is closed
- ✅ Notifications fire when device is locked
- ✅ Tapping notification opens app to correct route

**Status:** ⬜ Pass / ⬜ Fail / ⬜ N/A

---

### iOS Tests (if applicable)

**Test I1: Notification Permissions**
- ✅ iOS permission dialog appears correctly
- ✅ Permissions persist across app restarts

**Test I2: Background Notifications**
- ✅ Notifications fire when app is closed
- ✅ Notifications fire when device is locked
- ✅ Tapping notification opens app to correct route

**Status:** ⬜ Pass / ⬜ Fail / ⬜ N/A

---

## Summary

### Test Results Overview

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | Permission Request | ⬜ | |
| 2 | Enable Daily Reminder | ⬜ | |
| 3 | Daily Reminder Fires | ⬜ | |
| 4 | Daily Reminder Navigation | ⬜ | |
| 5 | Change Reminder Time | ⬜ | |
| 6 | Disable Daily Reminder | ⬜ | |
| 7 | Budget Warning Notification | ⬜ | |
| 8 | Budget Alert Navigation | ⬜ | |
| 9 | Budget Alert Deduplication | ⬜ | |
| 10 | Monthly Nudge Notification | ⬜ | |
| 11 | Monthly Nudge Navigation | ⬜ | |
| 12 | Web Browser Fallback | ⬜ | |
| 13 | Permission Denied Handling | ⬜ | |
| 14 | FCM Service Independence | ⬜ | |
| 15 | Persistence Across Sessions | ⬜ | |
| 16 | Service Initialization | ⬜ | |

### Overall Status

- **Total Tests:** 16
- **Passed:** 0
- **Failed:** 0
- **Not Applicable:** 0

---

## Known Issues

Document any issues discovered during testing:

1. [Issue description]
   - **Severity:** High / Medium / Low
   - **Steps to reproduce:**
   - **Expected behavior:**
   - **Actual behavior:**

---

## Testing Environment

- **Date:** [YYYY-MM-DD]
- **Tester:** [Name]
- **Platform:** Web / Android / iOS
- **Browser/OS:** [Browser name and version / OS version]
- **App Version:** [Version number]
- **Build:** Development / Production

---

## Recommendations

Based on testing results, document any recommendations for:

1. **Bug Fixes:**
   - [List critical bugs that need fixing]

2. **Improvements:**
   - [List potential improvements]

3. **Documentation Updates:**
   - [List documentation that needs updating]

---

## Sign-off

**Tester Signature:** ___________________

**Date:** ___________________

**Status:** ⬜ Approved for Production / ⬜ Requires Fixes

---

## Quick Test Commands

For quick testing during development:

```javascript
// Check permission status
console.log(Notification.permission);

// Manually trigger a test notification (web)
new Notification('Test', { body: 'This is a test notification' });

// Check localStorage for preferences
JSON.parse(localStorage.getItem('notification_preferences'));

// Check scheduled notifications (native - in browser console won't work)
// Use Android Studio Logcat or Xcode console to view native logs
```

---

## Troubleshooting

### Notifications Not Appearing

1. Check permission status in browser settings
2. Verify console for error messages
3. Check if notification preferences are saved correctly
4. Ensure time is set correctly (not in the past)
5. For web: ensure browser tab is open or service worker is active

### Navigation Not Working

1. Check console for navigation errors
2. Verify route exists in Angular router configuration
3. Check notification extra data contains correct route

### Budget Alerts Not Triggering

1. Verify budget limit is set for the category
2. Check if expense amount crosses 80% threshold
3. Verify Budget Warnings toggle is enabled
4. Check console for budget threshold events

---

**End of Testing Guide**
