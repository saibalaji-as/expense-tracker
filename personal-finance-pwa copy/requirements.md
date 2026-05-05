# Requirements Document

## Introduction

A production-grade, mobile-first Progressive Web App (PWA) for daily personal expense tracking. The application uses Google Sheets as its sole data store — there is no custom backend. Users authenticate via Google OAuth 2.0, and all reads and writes go directly to their own Google Sheet via the Google Sheets API v4. The app is built with Angular 20 (standalone components), styled with plain HTML5/CSS3 and Tailwind CSS, and supports offline usage, installability, and push notification reminders to prompt expense entry.

---

## Glossary

- **App**: The Personal Finance PWA being specified.
- **User**: The authenticated human operating the App.
- **Google_Sheets_Service**: The Angular service responsible for all communication with the Google Sheets API v4.
- **Auth_Service**: The Angular service responsible for Google OAuth 2.0 authentication and token management.
- **Expense_Store**: The Angular service (NgRx Signal Store or RxJS BehaviorSubject) that holds in-memory expense state.
- **Notification_Service**: The Angular service that manages Web Push permission and reminder scheduling via Angular Service Worker.
- **Sync_Service**: The Angular service that coordinates offline queue flushing and online/offline state detection.
- **Daily_Expense_Page**: The `/daily` route where the User logs individual expense entries for the current day.
- **Monthly_Expense_Page**: The `/monthly` route where the User reviews cumulative expenses grouped by month.
- **Expense_Limit_Page**: The `/limits` route where the User configures monthly income and per-category spending limits.
- **Dashboard_Page**: The `/dashboard` route displaying charts and financial summaries.
- **Settings_Page**: The `/settings` route for notification preferences, PWA install, data export, and Google Sheets connection management.
- **Expense_Entry**: A single record containing: date, amount, expense type, limit, savings, and timestamp.
- **Expense_Type**: One of the 14 predefined categories (Housing, Food & Groceries, Transportation, Utilities, Healthcare, Entertainment, Dining Out, Shopping/Clothing, Savings/Emergency Fund, Investments, Education, Personal Care, Subscriptions, Miscellaneous) or a User-defined custom type.
- **Budget_Rule**: The 50/30/20 financial advisor rule: Needs ≤ 50%, Wants ≤ 30%, Savings ≥ 20% of monthly income.
- **Offline_Queue**: A local (IndexedDB or localStorage) buffer of Expense_Entries written while the device is offline, pending sync to Google Sheets.
- **Service_Worker**: The Angular-generated service worker (`ngsw`) responsible for shell caching, background sync, and push notification delivery.
- **Sheet_expenses**: The Google Sheet tab named `expenses` with columns: date, amount, type, limit, savings, timestamp.
- **Sheet_limits**: The Google Sheet tab named `limits` with columns: type, recommendedPercentage, userPercentage, category.
- **Sheet_metadata**: The Google Sheet tab named `metadata` with columns: key, value.

---

## Requirements

### Requirement 1: Google OAuth 2.0 Authentication

**User Story:** As a User, I want to sign in with my Google account, so that the App can access my personal Google Sheet securely without a custom backend.

#### Acceptance Criteria

1. THE Auth_Service SHALL initiate Google OAuth 2.0 authentication using the `gapi` client library with the `https://www.googleapis.com/auth/spreadsheets` scope.
2. WHEN the User successfully authenticates, THE Auth_Service SHALL store the OAuth access token in memory and persist a refresh indicator in localStorage.
3. WHEN the OAuth access token expires, THE Auth_Service SHALL silently refresh the token without requiring the User to re-authenticate.
4. IF the OAuth authentication fails, THEN THE Auth_Service SHALL display an error message describing the failure and offer a retry action.
5. WHEN the User signs out, THE Auth_Service SHALL revoke the OAuth token and clear all locally stored authentication state.
6. THE Auth_Guard SHALL redirect unauthenticated Users to the sign-in screen for all protected routes (`/daily`, `/monthly`, `/limits`, `/dashboard`, `/settings`).

---

### Requirement 2: Google Sheets Data Persistence

**User Story:** As a User, I want all my expense data stored in my own Google Sheet, so that I retain full ownership and can inspect or edit data outside the App.

#### Acceptance Criteria

1. THE Google_Sheets_Service SHALL provide an `authenticate()` method that initialises the `gapi` client and requests the required OAuth scopes.
2. THE Google_Sheets_Service SHALL provide a `readExpenses(sheetId, month)` method that retrieves all rows from Sheet_expenses matching the given month.
3. THE Google_Sheets_Service SHALL provide a `writeExpense(sheetId, entry)` method that appends a single Expense_Entry row to Sheet_expenses.
4. THE Google_Sheets_Service SHALL provide a `batchUpdate(sheetId, rows)` method that writes multiple rows to Sheet_expenses in a single API call.
5. THE Google_Sheets_Service SHALL provide `readLimits(sheetId)` and `writeLimits(sheetId, limits)` methods for Sheet_limits.
6. THE Google_Sheets_Service SHALL provide `readMetadata(sheetId)` and `writeMetadata(sheetId, key, value)` methods for Sheet_metadata.
7. IF a Google Sheets API call returns an HTTP error, THEN THE Google_Sheets_Service SHALL emit the error through an observable error channel and not silently swallow it.
8. WHEN the App first runs after authentication, THE Google_Sheets_Service SHALL verify that Sheet_expenses, Sheet_limits, and Sheet_metadata exist and SHALL create any missing sheets with the correct column headers.

---

### Requirement 3: Expense Entry — Daily Expense Page

**User Story:** As a User, I want to log an expense for today on the Daily Expense Page, so that I can track my spending in real time.

#### Acceptance Criteria

1. THE Daily_Expense_Page SHALL display a reactive form with the following fields: Expense Type (dropdown of 14 predefined types plus any custom types), Expense Amount (numeric input, required, minimum value 0.01), and a read-only Expense Limit field auto-populated from the active limit for the selected Expense Type.
2. WHEN the User selects an Expense Type, THE Daily_Expense_Page SHALL auto-populate the Expense Limit field with the configured limit for that type from the Expense_Store.
3. THE Daily_Expense_Page SHALL display a calculated Savings field showing the difference between the Expense Limit and the Expense Amount, updated in real time as the User types.
4. WHEN the User submits a valid expense form, THE Expense_Store SHALL add the Expense_Entry to the in-memory state and THE Sync_Service SHALL queue the entry for persistence to Sheet_expenses.
5. WHEN the Expense Amount exceeds the Expense Limit for the selected type, THE Daily_Expense_Page SHALL render the form with a red border indicator.
6. WHEN the Expense Amount is within the Expense Limit for the selected type, THE Daily_Expense_Page SHALL render the form with a green border indicator.
7. THE Daily_Expense_Page SHALL display a list of all Expense_Entries logged for the current day, ordered by timestamp descending.
8. IF the expense form is submitted with invalid data (missing required fields or non-positive amount), THEN THE Daily_Expense_Page SHALL display inline validation error messages without submitting the entry.
9. THE Daily_Expense_Page SHALL use Angular Reactive Forms for all form handling and validation.

---

### Requirement 4: Monthly Expense Review

**User Story:** As a User, I want to review my cumulative expenses for any past or current month, so that I can understand my spending patterns over time.

#### Acceptance Criteria

1. THE Monthly_Expense_Page SHALL default to displaying the current calendar month on load.
2. THE Monthly_Expense_Page SHALL provide a native `<input type="month">` control allowing the User to select any past or current month.
3. WHEN the User selects a month, THE Monthly_Expense_Page SHALL load and display all Expense_Entries for that month from the Expense_Store (fetching from Sheet_expenses if not cached).
4. THE Monthly_Expense_Page SHALL display the following summary values: total amount spent, total configured limit, and net savings (limit minus spent) for the selected month.
5. THE Monthly_Expense_Page SHALL display a donut chart showing the proportional breakdown of spending across the three Budget_Rule categories: Needs, Wants, and Savings.
6. THE Monthly_Expense_Page SHALL display a plain HTML `<table>` (no CDK table) listing each Expense_Type with its total spent, configured limit, and variance for the selected month.
7. IF no Expense_Entries exist for the selected month, THEN THE Monthly_Expense_Page SHALL display an empty-state message indicating no data is available.

---

### Requirement 5: Expense Limit Configuration

**User Story:** As a User, I want to set my monthly income and configure spending limits per expense category, so that the App can calculate personalised budgets and alert me when I overspend.

#### Acceptance Criteria

1. THE Expense_Limit_Page SHALL require the User to enter a monthly income amount before any limits are calculated or saved.
2. WHEN the User enters a monthly income, THE Expense_Limit_Page SHALL calculate and display the recommended limit amount for each of the 14 Expense_Types using the default percentages defined in the Budget_Rule table.
3. THE Expense_Limit_Page SHALL display the following for each Expense_Type: the recommended percentage, the calculated limit amount (income × percentage), and an editable percentage input field.
4. WHEN the User edits a percentage for an Expense_Type, THE Expense_Limit_Page SHALL recalculate and update the limit amount for that type in real time.
5. THE Expense_Limit_Page SHALL display a running total of all configured percentages and SHALL visually indicate when the combined Needs + Wants percentage exceeds 80% of income.
6. THE Expense_Limit_Page SHALL allow the User to add custom Expense_Types via a dynamic form array, each with a name, percentage, and category (Needs / Wants / Savings / Growth / Buffer).
7. WHEN the User saves the configuration, THE Google_Sheets_Service SHALL write all limits to Sheet_limits and THE Google_Sheets_Service SHALL write the monthly income to Sheet_metadata.
8. IF the User attempts to save a configuration where Savings percentage is below 20%, THEN THE Expense_Limit_Page SHALL display a warning message and require explicit confirmation before saving.

---

### Requirement 6: Dashboard — Financial Charts

**User Story:** As a User, I want a visual dashboard of my financial data, so that I can quickly assess my spending trends and budget health.

#### Acceptance Criteria

1. THE Dashboard_Page SHALL display a line chart showing the year-to-date daily expense totals, with one data point per day.
2. THE Dashboard_Page SHALL display a pie chart showing the expense type breakdown (amount per Expense_Type) for the current calendar month.
3. THE Dashboard_Page SHALL display a bar chart comparing total monthly spending for the last 6 calendar months.
4. THE Dashboard_Page SHALL display a donut chart showing the Needs vs Wants vs Savings ratio for the current month against the Budget_Rule targets.
5. THE Dashboard_Page SHALL render all charts using Chart.js or ECharts without any Angular Material or CDK dependencies.
6. WHEN the underlying expense data changes (new entry added or sync completes), THE Dashboard_Page SHALL refresh all chart data without requiring a full page reload.
7. IF no expense data exists for a chart's time range, THEN THE Dashboard_Page SHALL display a placeholder message for that chart rather than an empty or broken chart.

---

### Requirement 7: Settings

**User Story:** As a User, I want to manage app preferences, notifications, and data from a single settings page, so that I can control how the App behaves.

#### Acceptance Criteria

1. THE Settings_Page SHALL display the current Google Sheets connection status (connected / disconnected) and the linked spreadsheet ID.
2. THE Settings_Page SHALL provide a toggle to enable or disable push notification reminders.
3. WHEN push notifications are enabled, THE Settings_Page SHALL display a range slider and a numeric input (both bound to the same value) for setting the reminder interval in minutes, with a minimum of 15 minutes and a maximum of 480 minutes, defaulting to 60 minutes.
4. WHEN the User changes the reminder interval, THE Notification_Service SHALL update the scheduled reminder interval immediately without requiring an app restart.
5. THE Settings_Page SHALL display a PWA install button that is visible only when the browser's `beforeinstallprompt` event has fired and the App has not yet been installed.
6. WHEN the User clicks the install button, THE App SHALL invoke the deferred `beforeinstallprompt` prompt to trigger the native browser install flow.
7. THE Settings_Page SHALL provide an "Export to CSV" button that generates and downloads a CSV file containing all Expense_Entries from Sheet_expenses.
8. THE Settings_Page SHALL provide a "Clear Local Data" button that removes all data from the Offline_Queue and clears the Expense_Store in-memory state, without deleting data from Google Sheets.
9. IF the User clicks "Clear Local Data", THEN THE Settings_Page SHALL display a confirmation dialog before executing the clear operation.

---

### Requirement 8: Offline Support and Background Sync

**User Story:** As a User, I want to log expenses even when I have no internet connection, so that I never miss recording a transaction due to connectivity issues.

#### Acceptance Criteria

1. THE Service_Worker SHALL cache the Angular application shell (HTML, CSS, JS bundles) so that the App loads and renders without a network connection.
2. WHEN the device is offline and the User submits an Expense_Entry, THE Sync_Service SHALL store the entry in the Offline_Queue (IndexedDB or localStorage) and confirm to the User that the entry has been saved locally.
3. WHEN the device transitions from offline to online, THE Sync_Service SHALL automatically flush all entries in the Offline_Queue to Sheet_expenses via THE Google_Sheets_Service.
4. WHEN the Offline_Queue flush completes successfully, THE Sync_Service SHALL remove the flushed entries from the Offline_Queue.
5. IF a flush attempt fails for an individual entry, THEN THE Sync_Service SHALL retain that entry in the Offline_Queue and retry on the next online transition.
6. THE App SHALL display a persistent visual indicator (e.g., banner or icon) when the device is offline.
7. WHILE the device is offline, THE Daily_Expense_Page SHALL remain fully functional for entry submission using locally cached limit data.

---

### Requirement 9: Push Notification Reminders

**User Story:** As a User, I want to receive push notification reminders to log my expenses at regular intervals, so that I don't forget to record transactions throughout the day.

#### Acceptance Criteria

1. THE Notification_Service SHALL request push notification permission from the User via the Web Push API (`SwPush.requestSubscription`) on first use or when the User enables notifications in Settings.
2. WHEN push notification permission is granted, THE Service_Worker SHALL schedule a repeating check at the User-configured interval (default: 60 minutes).
3. WHEN the scheduled check fires and no Expense_Entry has been logged in the last interval period, THE Service_Worker SHALL dispatch a push notification with the message "Don't forget to log your expenses!".
4. WHEN the scheduled check fires and at least one Expense_Entry has been logged within the last interval period, THE Service_Worker SHALL not dispatch a notification.
5. WHEN the User taps a push notification, THE App SHALL open (or focus if already open) and navigate to the Daily_Expense_Page.
6. IF the User denies push notification permission, THEN THE Notification_Service SHALL disable the notification toggle in Settings and display a message explaining that permission must be granted in browser settings to re-enable.
7. WHEN the User disables notifications via the Settings toggle, THE Notification_Service SHALL cancel all pending scheduled reminders.

---

### Requirement 10: PWA Installability

**User Story:** As a User, I want to install the App on my mobile device's home screen, so that I can access it like a native app without opening a browser.

#### Acceptance Criteria

1. THE App SHALL include a valid `manifest.webmanifest` file with name, short name, icons (at minimum 192×192 and 512×512 PNG), theme colour, background colour, display mode `standalone`, and start URL `/daily`.
2. THE App SHALL be served over HTTPS in production.
3. THE Service_Worker SHALL be registered on application startup via `@angular/pwa`.
4. WHEN the browser fires the `beforeinstallprompt` event, THE App SHALL capture and defer the event for use by the Settings_Page install button.
5. WHEN the App is launched from the home screen in standalone mode, THE App SHALL not display the browser navigation bar.

---

### Requirement 11: UI Constraints and Accessibility

**User Story:** As a User, I want a clean, mobile-first interface that works well on small screens, so that I can comfortably use the App on my phone.

#### Acceptance Criteria

1. THE App SHALL be built exclusively with Angular 20 standalone components, plain HTML5, CSS3, and Tailwind CSS (or modular SCSS) — Angular Material and CDK UI components SHALL NOT be used.
2. THE App SHALL implement a mobile-first responsive layout that adapts to screen widths from 320px to 1440px.
3. THE App SHALL provide a bottom navigation bar on mobile viewports (< 768px) with links to `/daily`, `/monthly`, `/limits`, `/dashboard`, and `/settings`.
4. ALL interactive elements (buttons, inputs, links) SHALL have a minimum touch target size of 44×44 CSS pixels.
5. ALL form inputs SHALL have associated `<label>` elements with matching `for`/`id` attributes.
6. THE App SHALL achieve a Lighthouse PWA score of 90 or above in a production build.
7. ALL images and icons SHALL include descriptive `alt` attributes or `aria-label` attributes where applicable.
