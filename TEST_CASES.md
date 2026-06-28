# Spenza — End-to-End Test Cases

**App:** Spenza Personal Finance PWA (Angular + Firebase + Google Drive)  
**Date:** 2026-06-27 (updated)  
**Coverage:** All routes, guards, user flows, AI features, offline behaviour, and subscription gates

> **Update 2026-06-27:** Added modules 15–19 covering Reminders, Credit-Card spend detection, Theming (palette & surface style), the public landing page, and native Android home-screen widgets. Revised the AI module (modules 9 & 11) for the new hosted/BYOK/disabled provider model, and revised offline notes for the Drive-only persistence layer (Google Sheets / IndexedDB offline queue removed; Drive JSON backup is the sole source of truth).

---

## Module Index

| # | Module | Test IDs |
|---|--------|----------|
| 1 | Authentication | TC-AUTH-01 – TC-AUTH-08 |
| 2 | Onboarding & Mode Selection | TC-ONBD-01 – TC-ONBD-07 |
| 3 | Daily Expense Logging | TC-DAILY-01 – TC-DAILY-18 |
| 4 | Monthly Expense View | TC-MNTH-01 – TC-MNTH-07 |
| 5 | Expense Limits (Budget Setup) | TC-LMT-01 – TC-LMT-09 |
| 6 | Finances — Asset Accounts | TC-FIN-01 – TC-FIN-09 |
| 7 | Finances — Debt Accounts & Payments | TC-DEBT-01 – TC-DEBT-10 |
| 8 | Dashboard & Analytics | TC-DASH-01 – TC-DASH-08 |
| 9 | AI Features (Hosted / BYOK / Disabled) | TC-AI-01 – TC-AI-11 |
| 10 | Family Sync | TC-FAM-01 – TC-FAM-10 |
| 11 | Settings | TC-SET-01 – TC-SET-14 |
| 12 | Subscription / Pro Paywall | TC-SUB-01 – TC-SUB-06 |
| 13 | Offline & PWA | TC-PWA-01 – TC-PWA-06 |
| 14 | Route Guards & Navigation | TC-GUARD-01 – TC-GUARD-06 |
| 15 | Reminders (Date/Time & Location) | TC-REM-01 – TC-REM-12 |
| 16 | Credit-Card Spend Detection & Pending Expenses | TC-CC-01 – TC-CC-09 |
| 17 | Theming — Palette & Surface Style | TC-THEME-01 – TC-THEME-07 |
| 18 | Public Landing Page | TC-LAND-01 – TC-LAND-05 |
| 19 | Native Android Widgets (Expense & Streak) | TC-WIDG-01 – TC-WIDG-08 |

---

## 1. Authentication

### TC-AUTH-01 — Unauthenticated user is redirected to login
**Precondition:** No active session  
**Steps:**
1. Navigate directly to `/daily`
2. Observe redirect

**Expected:** User lands on the login/auth page, not `/daily`

---

### TC-AUTH-02 — Successful Google Sign-in (web)
**Precondition:** Valid Google account  
**Steps:**
1. Open app on web
2. Click "Sign in with Google"
3. Complete Google OAuth flow
4. Observe app state

**Expected:** `isAuthenticated` becomes `true`; user is redirected to `/mode-select` (first time) or `/daily` (returning user); email is displayed in Settings

---

### TC-AUTH-03 — Auth callback completes token exchange
**Precondition:** OAuth redirect in progress  
**Steps:**
1. App receives redirect at `/auth/callback` with valid code
2. Wait for callback component to finish

**Expected:** Firebase session is established; user is navigated to the appropriate route without error

---

### TC-AUTH-04 — Sign-out clears session
**Precondition:** User is signed in  
**Steps:**
1. Navigate to Settings
2. Tap "Sign Out"

**Expected:** `isAuthenticated` becomes `false`; user is redirected to login; local tokens are cleared from storage

---

### TC-AUTH-05 — Expired token triggers silent refresh
**Precondition:** User has a stale/expired access token stored  
**Steps:**
1. Simulate token expiry
2. Trigger any API call (e.g. save expense)

**Expected:** App silently refreshes the token and completes the operation without asking the user to sign in again

---

### TC-AUTH-06 — Sign-in fails gracefully
**Precondition:** Google OAuth fails or is cancelled  
**Steps:**
1. Begin Google Sign-in
2. Cancel or allow OAuth to fail

**Expected:** Error toast is shown; user remains on login page; no crash

---

### TC-AUTH-07 — Silent token refresh on foreground (no picker)
**Precondition:** Returning user with a previously authorised Google account; access token near/after expiry  
**Steps:**
1. Background the app, wait until the ~1h access token is stale
2. Bring the app to the foreground (or reload within token expiry on web)

**Expected:** `getTokenSilent()` / native `#nativeSignIn({silent})` auto-selects the authorised account with **no** account-picker UI and refreshes the token; on web, `#restoreSession` restores the persisted token (5-min buffer) so a reload does not bounce to `/auth/callback`. The user is never asked to sign in again.

---

### TC-AUTH-08 — Missing Drive (appdata) scope is detected and recoverable
**Precondition:** User unticked the Drive permission checkbox during Google granular consent  
**Steps:**
1. Sign in but deny/omit the `drive.appdata` scope
2. App attempts a Drive call

**Expected:** `grantedScopesIncludeDrive()` returns false → `MissingDriveScopeError`; instead of an infinite sign-in loop, `AuthCallbackComponent` shows the i18n `auth.error.driveAccess` message (en/ta/hi) telling the user to tick **all** permission checkboxes; the next interactive web sign-in uses `prompt: 'consent'` to re-show them.

---

## 2. Onboarding & Mode Selection

### TC-ONBD-01 — First-time user sees Mode Selection
**Precondition:** Authenticated, no mode set  
**Steps:**
1. Sign in for the first time
2. Observe routing

**Expected:** User is routed to `/mode-select`; both "Single User" and "Family/Shared" options are visible

---

### TC-ONBD-02 — Select Single User mode
**Precondition:** At `/mode-select`  
**Steps:**
1. Click "Single User"
2. Wait for setup to complete

**Expected:** `BackupModeService` sets mode to `single`; user is redirected to `/limits?onboarding=income` for income setup

---

### TC-ONBD-03 — Select Family mode is gated behind Pro
**Precondition:** Non-Pro user at `/mode-select`  
**Steps:**
1. Click "Family / Shared"

**Expected:** User is shown a Pro paywall or lock icon; navigation to family setup is blocked

---

### TC-ONBD-04 — Income setup is required before accessing daily log
**Precondition:** Mode = `single`, monthly income = 0  
**Steps:**
1. Navigate to `/daily`

**Expected:** `setupGuard` redirects user to `/limits?onboarding=income` to enter monthly income first

---

### TC-ONBD-05 — Income setup saved enables access to all routes
**Precondition:** At `/limits?onboarding=income`  
**Steps:**
1. Enter a valid monthly income (e.g. ₹50,000)
2. Save

**Expected:** Income is persisted; user can now navigate to `/daily`, `/monthly`, `/dashboard`

---

### TC-ONBD-06 — Budget percentages default to recommended values
**Precondition:** First visit to `/limits`  
**Steps:**
1. Open Limits page after income setup

**Expected:** All 14 predefined categories are pre-populated with their `recommendedPct` values (e.g. Housing = 30%, Food = 10%); running total is shown

---

### TC-ONBD-07 — Returning user bypasses onboarding
**Precondition:** Mode and income already set  
**Steps:**
1. Sign in on a new session

**Expected:** `setupGuard` skips mode-select and income-setup; user goes directly to `/daily`

---

## 3. Daily Expense Logging

### TC-DAILY-01 — Log a new expense (happy path)
**Precondition:** Signed in, income and limits configured  
**Steps:**
1. Navigate to `/daily`
2. Select category "Food & Groceries"
3. Enter amount ₹500
4. Enter comment "Weekly groceries"
5. Tap Save

**Expected:** Entry appears in today's list with correct category, amount, and comment; daily total updates; progress ring reflects new spend

---

### TC-DAILY-02 — Log expense with a past date
**Steps:**
1. Open calendar picker
2. Select a date 3 days ago
3. Enter amount and category
4. Save

**Expected:** Entry is created with the selected date (not today); it appears under the correct date heading

---

### TC-DAILY-03 — Edit an existing expense
**Steps:**
1. Tap an existing expense entry
2. Change the amount
3. Save

**Expected:** Entry is updated in the list with new amount; totals and savings recompute correctly; `updatedByEmail` is set

---

### TC-DAILY-04 — Delete an expense
**Steps:**
1. Tap an existing expense
2. Tap Delete → confirm in dialog

**Expected:** Entry is removed from the list; daily totals decrease accordingly

---

### TC-DAILY-05 — Overspend warning is shown
**Precondition:** Category limit is ₹1,000  
**Steps:**
1. Log an expense of ₹1,200 for that category

**Expected:** Savings field shows a negative value; an overspend/alert indicator is visible in the entry row

---

### TC-DAILY-06 — Last month overspend warning banner
**Precondition:** Previous month had at least one category over its limit  
**Steps:**
1. Open `/daily` at the start of a new month

**Expected:** Yellow warning banner shows "last month overspend" with the relevant category name

---

### TC-DAILY-07 — Upload a receipt image
**Steps:**
1. In the expense form, tap "Attach receipt"
2. Select a valid JPEG image
3. Save the expense

**Expected:** Receipt thumbnail is shown in the entry; `ExpenseReceipt` fields (`fileId`, `viewUrl`) are populated; file is uploaded to Google Drive

---

### TC-DAILY-08 — Receipt upload fails for oversized file
**Steps:**
1. Attempt to attach a file > configured max

**Expected:** Error toast "Receipt too large" is shown; expense form is still usable without the receipt

---

### TC-DAILY-09 — AI Smart Fill from receipt
**Precondition:** AI enabled (Gemini or local), valid receipt attached  
**Steps:**
1. Attach a receipt image
2. Tap "Smart Fill"

**Expected:** Amount and category fields are auto-populated from the receipt; a confidence indicator is shown; user can review before saving

---

### TC-DAILY-10 — Split bill creates multiple entries
**Steps:**
1. Attach a receipt
2. In the split panel, add 3 rows with different categories and amounts
3. Tap "Log Split"

**Expected:** 3 separate `ExpenseEntry` records are created; each has the correct category and amount; total matches the receipt total

---

### TC-DAILY-11 — Voice expense input
**Precondition:** Browser supports Web Speech API or native mic  
**Steps:**
1. Tap mic icon
2. Speak "Spent 300 on food today"
3. Wait for AI parsing

**Expected:** Amount (300) and category (Food) are populated in the form; transcript is saved to comment

---

### TC-DAILY-12 — Voice expense — unsupported browser fallback
**Precondition:** Browser does not support Speech API  
**Steps:**
1. Tap mic icon

**Expected:** "Voice not supported in this browser" message is shown; form is still functional

---

### TC-DAILY-13 — Payment source selection
**Precondition:** At least one Asset Account exists  
**Steps:**
1. Open expense form
2. Select an account from "Payment Source" dropdown
3. Save

**Expected:** Entry has `accountId` set; account balance decreases by the expense amount

---

### TC-DAILY-14 — Offline expense save (queue)
**Precondition:** Device is offline  
**Steps:**
1. Turn off network
2. Log a new expense

**Expected:** "Entry saved locally — will sync when online" toast appears; entry is visible in the list immediately; no crash

---

### TC-DAILY-15 — Offline expense syncs on reconnect
**Precondition:** One expense is in the offline queue  
**Steps:**
1. Restore network connectivity

**Expected:** Queued expense is synced to Google Drive/Sheets; offline banner disappears; toast confirms sync

---

### TC-DAILY-16 — Date navigation — view a different day
**Steps:**
1. Tap the calendar icon on the Daily page
2. Select a date with existing entries

**Expected:** Entry list updates to show only that day's expenses; date heading changes; "Go to today" button appears

---

### TC-DAILY-17 — Receipt editor — rotate and enhance
**Steps:**
1. Attach a receipt
2. Open the receipt editor
3. Rotate 90° and toggle "Enhance"
4. Tap "Use Edited"

**Expected:** The rotated/enhanced image is used as the attachment; original is discarded

---

### TC-DAILY-18 — Widget source tagging
**Precondition:** Running on Android with home-screen widget  
**Steps:**
1. Log expense from the native widget shortcut

**Expected:** Resulting `ExpenseEntry.source` is `'widget'`; entry appears correctly in the daily list

---

## 4. Monthly Expense View

### TC-MNTH-01 — Current month summary loads correctly
**Steps:**
1. Navigate to `/monthly`

**Expected:** Total Spent, Total Limit, and Net Savings cards show correct values for the current month; budget breakdown donut/bar chart renders

---

### TC-MNTH-02 — Navigate to previous month
**Steps:**
1. Tap the left chevron on the month picker

**Expected:** Month label updates to previous month; all figures update to match that month's data

---

### TC-MNTH-03 — Future month navigation is blocked
**Steps:**
1. On current month, tap the right chevron

**Expected:** Toast "Cannot navigate to a future month" is shown; navigation is blocked

---

### TC-MNTH-04 — Month with no entries shows empty state
**Steps:**
1. Navigate to a month that has no expenses

**Expected:** "No entries" empty state is shown with appropriate message; charts show zero values

---

### TC-MNTH-05 — Category breakdown drilldown
**Steps:**
1. Tap a category row in the breakdown table

**Expected:** Category detail panel expands with individual entry list, sparkline, and total for that category

---

### TC-MNTH-06 — Budget group breakdown is accurate
**Steps:**
1. Open monthly view for a month with mixed-category expenses

**Expected:** Needs / Wants / Savings / Growth / Buffer totals reflect the correct sum of entries per group; percentages are relative to monthly income

---

### TC-MNTH-07 — Month-over-month change indicator
**Steps:**
1. View a month that follows a previous month with expenses

**Expected:** Each category row shows an up/down arrow with the percentage change vs. the prior month

---

## 5. Expense Limits (Budget Setup)

### TC-LMT-01 — Set monthly income
**Steps:**
1. Navigate to `/limits`
2. Enter ₹80,000 in the income field
3. Save

**Expected:** Income is persisted; per-category monetary limits recompute from percentages; page reflects new values

---

### TC-LMT-02 — Adjust a category percentage
**Steps:**
1. Change "Entertainment" from 6% to 10%

**Expected:** Running total updates; if total exceeds 100%, a warning indicator appears; limit amounts recompute

---

### TC-LMT-03 — Running total > 100% shows warning
**Steps:**
1. Increase multiple categories until total > 100%

**Expected:** "Budget exceeds income" warning is shown; Save button may be disabled or warn on click

---

### TC-LMT-04 — Save budget with low savings allocation
**Precondition:** Savings category set to < 10%  
**Steps:**
1. Save the limits

**Expected:** "Low savings" warning card is displayed advising the user to increase savings allocation

---

### TC-LMT-05 — Add a custom expense category
**Steps:**
1. Click "Add Custom"
2. Enter name "Pet Care"
3. Assign 3% and category group "Wants"
4. Save

**Expected:** "Pet Care" appears in the limit list; it is available as an expense type when logging daily entries

---

### TC-LMT-06 — Delete a custom category
**Precondition:** At least one custom category exists  
**Steps:**
1. Tap delete on the custom category
2. Confirm in dialog

**Expected:** Category is removed from the limits list; it no longer appears in the expense type dropdown

---

### TC-LMT-07 — Cannot delete a predefined category
**Steps:**
1. Attempt to delete "Housing" (predefined)

**Expected:** Delete action is not available for predefined categories

---

### TC-LMT-08 — Limits persist across sessions
**Steps:**
1. Set limits and save
2. Sign out and sign in again

**Expected:** All limit values are restored correctly from Google Drive backup

---

### TC-LMT-09 — Category group colour-coding is correct
**Steps:**
1. View the limits page

**Expected:** Needs = blue, Wants = orange, Savings = green, Growth = teal, Buffer = grey — colours match the defined CSS vars

---

## 6. Finances — Asset Accounts

### TC-FIN-01 — Create a new bank account
**Steps:**
1. Navigate to `/finances`
2. Click "Add Account"
3. Enter Name: "HDFC Salary", Type: Bank, Balance: ₹25,000
4. Toggle "Set as Default"
5. Save

**Expected:** Account appears in the list; total assets increases by ₹25,000; default badge is shown

---

### TC-FIN-02 — Cannot create account with empty name
**Steps:**
1. Submit account form without a name

**Expected:** Validation error "Name is required" is shown; form does not submit

---

### TC-FIN-03 — Edit an existing account
**Steps:**
1. Tap edit on an account
2. Change the name to "HDFC Main"
3. Save

**Expected:** Account name updates in the list; balance and type remain unchanged

---

### TC-FIN-04 — Set a different account as default
**Precondition:** Account A is default  
**Steps:**
1. Edit Account B and enable "Set as Default"
2. Save

**Expected:** Account B gets the default badge; Account A loses it; only one account is default at a time

---

### TC-FIN-05 — Adjust account balance (increase)
**Steps:**
1. Open adjust balance for an account
2. Select "Increase", enter ₹5,000, reason "Salary received"
3. Save

**Expected:** Account balance increases by ₹5,000; adjustment appears in the adjustment history log

---

### TC-FIN-06 — Adjust account balance (decrease)
**Steps:**
1. Select "Decrease", enter ₹2,000

**Expected:** Balance decreases; if balance goes below 0 and `allowOverdraft` is false, a warning is shown

---

### TC-FIN-07 — Archive an account
**Steps:**
1. Edit an account and set `archived: true`
2. Save

**Expected:** Account disappears from the active accounts list; total assets updates; it can be recovered

---

### TC-FIN-08 — Delete an account
**Steps:**
1. Tap delete on an account
2. Confirm in dialog

**Expected:** Account is permanently removed; total assets adjusts; no orphaned expense entries referencing the account ID crash the app

---

### TC-FIN-09 — Total Assets summary is accurate
**Precondition:** Multiple active accounts with known balances  
**Steps:**
1. View the summary strip on the Finances page

**Expected:** "Total Assets" = sum of all active (non-archived) account balances

---

## 7. Finances — Debt Accounts & Payments

### TC-DEBT-01 — Create a credit card debt
**Steps:**
1. Click "Add Debt"
2. Enter Name: "HDFC Credit Card", Type: Credit Card
3. Principal: ₹100,000, Remaining: ₹45,000, Interest Rate: 18%, Monthly EMI: ₹5,000
4. Set next due date to next month
5. Save

**Expected:** Debt appears in the list; Total Liabilities increases by ₹45,000 (remaining balance)

---

### TC-DEBT-02 — Record a debt payment
**Precondition:** A debt account exists  
**Steps:**
1. Tap "Record Payment" on the debt
2. Select source account, enter ₹5,000 and today's date
3. Save

**Expected:** Debt `remainingBalance` decreases by ₹5,000; a corresponding `ExpenseEntry` with type "Debt Payment" is created; source account balance decreases

---

### TC-DEBT-03 — Edit a debt payment
**Steps:**
1. Open payment history for a debt
2. Edit the most recent payment amount to ₹6,000
3. Save

**Expected:** `remainingBalance` on the debt adjusts by the difference; the expense entry amount updates accordingly

---

### TC-DEBT-04 — Delete a debt payment
**Steps:**
1. Delete a payment record and confirm

**Expected:** Payment is removed from history; `remainingBalance` reverts by the deleted amount; the linked expense entry is also deleted

---

### TC-DEBT-05 — Debt status transitions to Paid
**Precondition:** `remainingBalance` reaches 0 via payments  
**Steps:**
1. Record a final payment that clears the remaining balance

**Expected:** Debt status changes to `paid`; it is visually distinguished in the list

---

### TC-DEBT-06 — Archive a paid debt
**Steps:**
1. Set status to `archived` on a paid debt

**Expected:** Debt disappears from the active debts list; Total Liabilities does not include it

---

### TC-DEBT-07 — Debt payment creates Expense Entry with correct source
**Steps:**
1. Record a payment from account A for debt X

**Expected:** `ExpenseEntry.source` = `'debt-payment'`; `ExpenseEntry.accountId` = account A's ID; `ExpenseEntry.debtId` = debt X's ID

---

### TC-DEBT-08 — Next due date shows on Dashboard
**Precondition:** Debt has a `nextDueDate` set  
**Steps:**
1. Open Dashboard / Net Worth panel

**Expected:** "Next Due" date is displayed correctly in the Finances summary widget on the dashboard

---

### TC-DEBT-09 — Total Liabilities = sum of active remaining balances
**Precondition:** Multiple active debts  
**Steps:**
1. Check the summary strip on Finances page

**Expected:** "Total Liabilities" = sum of `remainingBalance` for all non-archived debts

---

### TC-DEBT-10 — Cannot record a payment without a source account
**Steps:**
1. Open "Record Payment" with no accounts configured

**Expected:** Account dropdown is empty or disabled; Save is blocked; error message explains setup required

---

## 8. Dashboard & Analytics

### TC-DASH-01 — Dashboard stat chips are accurate
**Steps:**
1. Navigate to `/dashboard`

**Expected:** "Today" chip = sum of today's entries; "Week" chip = sum of last 7 days; "Avg/Day" chip = month total ÷ days elapsed this month

---

### TC-DASH-02 — Year-to-date (YTD) chart renders
**Steps:**
1. View the YTD section

**Expected:** Bar/line chart shows one bar per month from Jan to current month; bars match actual totals for each month

---

### TC-DASH-03 — Budget rule (50/30/20) summary
**Precondition:** Expenses across Needs, Wants, Savings categories logged  
**Steps:**
1. View the Budget Rule section on Dashboard

**Expected:** Actual percentages for Needs/Wants/Savings are shown alongside recommended targets; over-budget groups are highlighted

---

### TC-DASH-04 — 6-month trend chart
**Steps:**
1. View 6-month section

**Expected:** Chart shows last 6 months of total spend with correct values and month labels

---

### TC-DASH-05 — Net Worth panel
**Precondition:** Asset and Debt accounts configured  
**Steps:**
1. View Net Worth card

**Expected:** Net Worth = Total Assets − Total Liabilities; individual figures match Finances page values

---

### TC-DASH-06 — Activity feed (single user)
**Steps:**
1. Log a new expense
2. Open Dashboard

**Expected:** Activity feed shows the new entry with correct actor name, action "added", amount, and relative time ("Just now")

---

### TC-DASH-07 — AI Insights — local mode generates summary
**Precondition:** AI mode = Default (local), at least 7 days of expense data  
**Steps:**
1. Navigate to Dashboard
2. Wait for or trigger insight generation

**Expected:** Wins, Warnings, Suggestions, and Forecast sections are populated with data-driven insights; "Local" badge is shown

---

### TC-DASH-08 — AI Insights — Gemini deep dive
**Precondition:** AI mode = Gemini (API key configured or default)  
**Steps:**
1. Click "Get AI Analysis" button

**Expected:** Gemini badge appears; detailed analysis loads asynchronously; loading spinner shown during fetch; insights are cached and a "Fresh" status is shown

---

## 9. AI Features (Hosted / BYOK / Disabled)

> **Provider model (2026-06-10):** `AiSettingsService` exposes three provider modes — `hosted` (default; Spenza-managed Groq for insights/voice + Gemini for receipts, **no user key required**), `byok` (legacy "bring your own key": user supplies a Gemini and/or Groq key), and `disabled`. Legacy values are normalised: `user-key` → `byok`, `default` → `hosted`, unknown → `hosted`. Deterministic local fallbacks must still run when the network/AI is unavailable.

### TC-AI-01 — Default provider is Hosted (no key required)
**Precondition:** Fresh install, never opened AI settings  
**Steps:**
1. Open the app and use any AI feature (Smart Fill / voice / insights)

**Expected:** AI works with no API key entered; `AiSettingsService.isHosted()` is `true`; requests are sent with **no** `X-Gemini-Api-Key` / Groq key header (server uses its own `GROQ_API_KEY` / `GEMINI_API_KEY`); insight responses report `provider: 'groq'` (text) or `'gemini'` (receipts)

---

### TC-AI-01b — Switch to BYOK and store a key
**Steps:**
1. Navigate to Settings → AI
2. Switch provider from "Hosted" to "Use My Key" (BYOK)
3. Enter a valid Gemini (and/or Groq) API key, choose the BYOK preference
4. Save

**Expected:** Key is stored privately (masked, never shown in plain text); provider mode becomes `byok`; subsequent AI calls send the user's key header

---

### TC-AI-02 — AI mode = Disabled hides all AI features
**Steps:**
1. Set AI mode to "Disabled"
2. Go to Daily Expense form
3. Go to Dashboard insights

**Expected:** Mic/voice button and Smart Fill button are hidden; Dashboard insights show "AI Unavailable" state; `isDisabled()` is `true`; no AI network calls are made

---

### TC-AI-02b — Legacy provider values migrate on load
**Precondition:** Stored settings contain a legacy `provider` value (`user-key` or `default`)  
**Steps:**
1. Launch the app so `AiSettingsService.normalize()` runs

**Expected:** `user-key` → `byok`, `default` → `hosted`, any unknown value → `hosted`; the migrated value is persisted and used everywhere

---

### TC-AI-03 — Receipt extraction — amount found
**Precondition:** Clear receipt image with visible total  
**Steps:**
1. Attach receipt, tap Smart Fill

**Expected:** Extracted amount is pre-filled; category is suggested; confidence level is shown; user can apply or dismiss

---

### TC-AI-04 — Receipt extraction — multiple totals found
**Precondition:** Receipt has subtotal and grand total  
**Steps:**
1. Attach receipt, tap Smart Fill

**Expected:** "Possible totals" are listed; user can select the correct one

---

### TC-AI-05 — Receipt extraction — unreadable image
**Precondition:** Blurry or completely blank image  
**Steps:**
1. Attach unreadable image, tap Smart Fill

**Expected:** "Could not extract data from receipt" message is shown; form fields are unchanged

---

### TC-AI-06 — Voice expense — AI parses amount and category
**Steps:**
1. Speak "Paid 850 rupees for electricity"
2. Wait for parsing

**Expected:** Amount = 850, Category = "Utilities" is filled in; comment field shows transcript

---

### TC-AI-07 — Voice comment recording
**Steps:**
1. Tap the mic icon in the comment field
2. Speak "Extra charge for late fee"

**Expected:** Comment field is populated with the spoken text; mic stops automatically

---

### TC-AI-08 — AI insight daily cap is enforced
**Precondition:** Hosted mode  
**Steps:**
1. Request AI insights repeatedly within a single day

**Expected:** Generation is capped at `maxTotalCallsPerDay = 5` total and 2 per locale (raised from 2 / 1); once exhausted, a "limit reached" message is shown and cached insights (if any) are displayed; no crash

---

### TC-AI-09 — AI insight requires API key only in BYOK mode when key is missing
**Steps:**
1. Set AI mode to "Use My Key" (BYOK) but leave the key blank
2. Request insights

**Expected:** "API Key Required" state is shown with a link to open AI Settings; no API call is made. (In **Hosted** mode this state never appears — the key check is skipped.)

---

### TC-AI-10 — Hosted receipt extraction falls back to server Gemini
**Precondition:** Hosted mode, no user key  
**Steps:**
1. Attach a receipt and tap Smart Fill

**Expected:** Request is sent with no key header; the server uses its own `GEMINI_API_KEY` (multimodal still requires Gemini); extraction succeeds and returns `provider: 'gemini'`

---

### TC-AI-11 — Local deterministic fallback when AI is unreachable
**Precondition:** AI endpoint returns 5xx / network offline  
**Steps:**
1. Trigger voice parse or insight generation

**Expected:** App falls back to the deterministic local parser/summary; the user still gets a usable result; no crash or blank state

---

## 10. Family Sync

### TC-FAM-01 — Owner creates a family and gets invite code
**Precondition:** Pro subscription, authenticated  
**Steps:**
1. Navigate to `/family-setup`
2. Select "Owner"
3. Wait for family creation

**Expected:** 8-character uppercase invite code is displayed; expiry time (24 hours) is shown; code is copyable

---

### TC-FAM-02 — Partner joins with valid invite code
**Precondition:** Partner has a separate Google account  
**Steps:**
1. Navigate to `/family-setup`
2. Select "Partner"
3. Enter the owner's invite code
4. Tap Connect

**Expected:** `FamilyDocument.partnerUid` is set; partner is redirected to `/daily`; both users share the same expense data

---

### TC-FAM-03 — Invite code expires after 24 hours
**Precondition:** Invite code is > 24 hours old  
**Steps:**
1. Partner enters the expired code

**Expected:** Error "Invite code has expired" is shown; partner is not added to the family

---

### TC-FAM-04 — Invite code can only be used once
**Precondition:** Code was already redeemed  
**Steps:**
1. Second partner attempts to use the same code

**Expected:** Error "Invite code already used" is shown

---

### TC-FAM-05 — Partner's expense appears in Owner's feed in real-time
**Precondition:** Family is active  
**Steps:**
1. Partner logs an expense of ₹200 (Food)
2. Owner checks the Daily page

**Expected:** Entry appears in Owner's view with "Partner" role label; no page refresh required

---

### TC-FAM-06 — Owner's expense appears in Partner's feed
**Steps:**
1. Owner logs ₹500 (Transport)
2. Partner checks Daily page

**Expected:** Entry shows "Owner" label; amount and category are correct

---

### TC-FAM-07 — Family activity feed on Dashboard shows both actors
**Steps:**
1. Both Owner and Partner log expenses
2. View Dashboard activity feed

**Expected:** Entries from both are listed with correct actor labels (Owner / Partner)

---

### TC-FAM-08 — Family sync is Pro-gated
**Precondition:** User without Pro subscription  
**Steps:**
1. Navigate to `/mode-select`
2. Try to select Family mode

**Expected:** Lock icon / Pro badge shown; selection leads to upgrade prompt, not family setup

---

### TC-FAM-09 — Conflict: two edits to the same expense
**Precondition:** Family active; same expense edited by both simultaneously  
**Steps:**
1. Owner edits expense A to ₹300
2. Partner simultaneously edits expense A to ₹400
3. Both save

**Expected:** Last-write-wins or a merge strategy applies; no data loss; at minimum one of the two values is persisted; no crash

---

### TC-FAM-10 — Family invite generates new code after expiry
**Precondition:** Previous invite expired  
**Steps:**
1. Owner taps "Generate New Invite" in Settings

**Expected:** New 8-character code is generated with a fresh 24-hour expiry; old code is invalidated

---

## 11. Settings

### TC-SET-01 — Change theme to Dark mode
**Steps:**
1. Settings → Appearance → select Dark
2. Observe UI

**Expected:** App switches to dark colour scheme; preference is persisted across sessions

---

### TC-SET-02 — Change app language to Tamil
**Steps:**
1. Settings → Language → select Tamil (ta)

**Expected:** All UI labels render in Tamil; currency format and number separators are appropriate

---

### TC-SET-03 — Change currency to USD
**Steps:**
1. Settings → Currency → select USD

**Expected:** All monetary values are formatted with "$" prefix; existing entry amounts are unchanged

---

### TC-SET-04 — Enable daily reminder push notification
**Steps:**
1. Settings → Notifications → toggle Daily Reminder
2. Grant permission if prompted

**Expected:** Permission is requested; notification preference is saved; `NotificationPreferences.dailyReminder` = true

---

### TC-SET-05 — Local budget warning notification
**Steps:**
1. Enable budget warnings notification
2. Log an expense that causes a category to exceed 80% of its limit

**Expected:** A local notification is fired with the warning message

---

### TC-SET-06 — Export data as JSON
**Steps:**
1. Settings → Data → "Export Backup JSON"

**Expected:** A JSON file is downloaded containing all expense entries and limits; file is valid JSON

---

### TC-SET-07 — Import from Google Sheets
**Steps:**
1. Settings → Import → paste Sheets URL
2. Tap Import

**Expected:** Expenses are imported and merged; duplicates are avoided; success count is shown

---

### TC-SET-08 — Switch backup mode (Single → Family)
**Precondition:** Pro user in Single mode  
**Steps:**
1. Settings → tap "Switch Backup Mode"
2. Confirm

**Expected:** User is routed to `/mode-select` to re-configure; existing data is preserved

---

### TC-SET-09 — PWA install prompt is surfaced
**Precondition:** Running in a browser that supports PWA install  
**Steps:**
1. Wait for `beforeinstallprompt` event in Settings

**Expected:** "Install App" button becomes visible; tapping it triggers the native install prompt

---

### TC-SET-10 — Notification disclosure modal
**Steps:**
1. Tap notification enable for the first time

**Expected:** Disclosure modal appears explaining what app reads vs. never reads; "Allow" and "Deny" options are present

---

### TC-SET-11 — AI API key is stored privately
**Steps:**
1. Enter a Gemini API key in Settings → AI
2. Save
3. Re-open settings

**Expected:** Key field shows a masked value (not plain text); key is readable from storage only within the app

---

### TC-SET-12 — Clear all data (danger action)
**Steps:**
1. Settings → Data → Clear All
2. Confirm prompt

**Expected:** All local storage, IndexedDB, and cached data is wiped; user is taken back to onboarding flow

---

### TC-SET-13 — AI provider card (Hosted / BYOK / Disabled)
**Steps:**
1. Open Settings → AI
2. Observe the provider selector

**Expected:** Three options are shown — Hosted (default, "no key needed"), Use My Key (BYOK), Disabled. Selecting Hosted clears/ignores any stored key; selecting BYOK reveals key + preference fields; selecting Disabled hides all AI affordances app-wide. The current selection persists across sessions. *(See module 9 for behavioural cases.)*

---

### TC-SET-14 — Spend-notification access toggle (Android)
**Precondition:** Native Android build  
**Steps:**
1. Open Settings → enable "Detect card spends from notifications"
2. Approve the OS notification-access permission

**Expected:** `SpendNotificationAccessService.setPromptEnabled(true)` runs; status reflects "granted/enabled"; tapping the row when permission is missing opens OS notification-access settings. Disabling stops new spend prompts. *(See module 16 for the detection → pending-expense flow.)*

---

## 12. Subscription / Pro Paywall

### TC-SUB-01 — Non-Pro user sees upgrade prompt on Finances route
**Steps:**
1. Navigate to `/finances` without Pro

**Expected:** `subscriptionGuard` blocks access; user is redirected to upgrade page or `/subscribe`

---

### TC-SUB-02 — Subscribe flow opens payment page
**Steps:**
1. Tap "Upgrade to Spenza Pro"
2. On mobile native: confirm external browser opens `/subscribe`

**Expected:** Payment page loads; Stripe checkout is available

---

### TC-SUB-03 — Pro status is reflected after payment
**Precondition:** Payment completed  
**Steps:**
1. Return to app after successful Stripe checkout

**Expected:** Settings shows "Spenza Pro — Active" with renewal date; `subscriptionService.isPro()` = true; `/finances` is accessible

---

### TC-SUB-04 — Cancel subscription shows pending cancellation state
**Steps:**
1. Settings → Pro → "Cancel Subscription"
2. Confirm

**Expected:** Status shows "Cancels [date] · Access until then"; renewal date is replaced with cancellation date; Pro features remain accessible until expiry

---

### TC-SUB-05 — Pro expires — features are gated again
**Precondition:** Simulate Pro expiry  
**Steps:**
1. Pro `expiresAt` is in the past
2. Try to access `/finances`

**Expected:** `subscriptionGuard` blocks access; upgrade prompt is shown again

---

### TC-SUB-06 — Web-only guard blocks subscribe route on native
**Precondition:** Running as Capacitor native app  
**Steps:**
1. Attempt to navigate to `/subscribe` directly on Android/iOS

**Expected:** `webOnlyGuard` redirects to `/settings`; subscribe page is not rendered natively

---

## 13. Offline & PWA

### TC-PWA-01 — App loads offline (service worker cache)
**Precondition:** App has been opened once while online  
**Steps:**
1. Disable network
2. Close and reopen app

**Expected:** App shell loads from service worker cache; previously loaded data is shown; "Offline" banner appears

---

### TC-PWA-02 — Offline banner appears and disappears
**Steps:**
1. Go offline → offline banner visible
2. Restore network → banner disappears

**Expected:** `SyncService.isOnline` signal drives the banner visibility in real time

---

### TC-PWA-03 — Offline (unsynced) count is tracked
**Steps:**
1. Log 3 expenses while offline

**Expected:** Entries are saved local-first and visible immediately; an offline-log badge surfaces 3 unsynced items pending the background Drive write (Drive JSON backup is the sole persistence layer — the legacy IndexedDB/Sheets queue has been removed)

---

### TC-PWA-04 — Unsynced entries flush to Drive on reconnect
**Steps:**
1. Have local-first entries that have not yet reached Drive
2. Come back online

**Expected:** The background sync writes them to `appDataFolder/spenza-backup.json` with retry; the offline-log badge returns to 0; no duplicate entries

---

### TC-PWA-05 — Push notification is received
**Precondition:** FCM token registered  
**Steps:**
1. Trigger a server-sent FCM push (e.g. daily reminder)

**Expected:** Notification appears in the device notification tray with correct title and body

---

### TC-PWA-06 — App manifest and icons are correct
**Steps:**
1. Inspect `manifest.webmanifest` in DevTools

**Expected:** `name`, `short_name`, `icons` (all sizes), `start_url`, and `display: standalone` are all present and valid

---

## 14. Route Guards & Navigation

### TC-GUARD-01 — `authGuard` blocks unauthenticated access
**Steps:**
1. Without signing in, navigate to `/daily`, `/monthly`, `/limits`, `/settings`, `/dashboard`

**Expected:** All routes redirect to login; `/privacy`, `/terms`, `/subscribe` remain accessible

---

### TC-GUARD-02 — `setupGuard` redirects to mode-select when no mode is set
**Steps:**
1. Authenticated but mode not set; navigate to `/daily`

**Expected:** Redirected to `/mode-select`

---

### TC-GUARD-03 — `setupGuard` redirects to income setup when income = 0
**Steps:**
1. Mode = single, income = 0; navigate to `/daily`

**Expected:** Redirected to `/limits?onboarding=income`

---

### TC-GUARD-04 — `subscriptionGuard` blocks `/finances` for non-Pro
**Steps:**
1. Non-Pro user navigates to `/finances`

**Expected:** Access denied; redirected to upgrade prompt

---

### TC-GUARD-05 — Setup complete user redirected away from `/mode-select`
**Steps:**
1. Mode = single, income set; manually navigate to `/mode-select`

**Expected:** Redirected to `/daily`; `/mode-select` is not rendered for already-setup users

---

### TC-GUARD-06 — Bottom nav is hidden on setup screens
**Steps:**
1. Navigate to `/mode-select` or `/family-setup`

**Expected:** Bottom navigation bar is not shown; user cannot navigate away from setup flow via nav

---

## 15. Reminders (Date/Time & Location)

> **Feature (2026-06-12):** New `/reminders` (list) and `/reminders/:id` (form) routes behind `authGuard` + `setupGuard`. Reminders live in Firestore `users/{uid}/reminders`. Two types — `datetime` and `location` (geofence). Datetime reminders schedule a Capacitor local notification and are also claimed by a server scheduler (~1 min cadence); location reminders check foreground position on app resume against a radius. Status is `active | completed | expired`. Location reminders are **Pro-gated**. Voice creation parses a spoken phrase via `AiVoiceReminderService`. Maps picker via `GoogleMapsLoaderService` (hidden gracefully when no Maps key).

### TC-REM-01 — Open Reminders list
**Steps:**
1. Navigate to `/reminders`

**Expected:** Active reminders render newest-first; empty state shown when none; an "Add reminder" affordance routes to `/reminders/new`

---

### TC-REM-02 — Create a date/time reminder
**Steps:**
1. Open the reminder form, enter a title
2. Select type "Date & time", pick a future `datetime-local` value
3. Save

**Expected:** A Firestore reminder doc is created with `type: 'datetime'`, `status: 'active'`; a local notification is scheduled and its `notificationId` is stored; the item appears in the list

---

### TC-REM-03 — Date/time reminder fires a notification
**Precondition:** Active datetime reminder whose `remindAt` has arrived; notification permission granted  
**Steps:**
1. Wait for the scheduled time

**Expected:** Local notification is delivered (or server scheduler delivers it); `notifiedAt` is set; the reminder transitions out of the active-pending state

---

### TC-REM-04 — Expiry grace window for a fired-but-unconfirmed reminder
**Precondition:** Datetime reminder past `remindAt` with `notifiedAt === null`  
**Steps:**
1. Observe `markExpiredDatetimeReminders` behaviour

**Expected:** The reminder is only marked `expired` after the `EXPIRY_GRACE_MS` (3 min) window, giving the per-minute server scheduler time to claim and deliver it

---

### TC-REM-05 — Create a location reminder (Pro)
**Precondition:** Pro subscription  
**Steps:**
1. Open the form, select type "Location"
2. Search a place (Nominatim) or tap the map to drop/drag the pin
3. Adjust the radius (km), Save

**Expected:** Reminder saved with `type: 'location'` and a `ReminderLocation { name, lat, lng, radiusKm }`; the confirmed location + radius circle render on the map

---

### TC-REM-06 — Location reminder type is Pro-gated for non-Pro users
**Precondition:** Free (non-Pro) user  
**Steps:**
1. Open the form and select the "Location" type

**Expected:** A Pro hint (`reminders.form.locationProHint`) is shown and the location-picker fields are not usable; only datetime reminders can be saved

---

### TC-REM-07 — Location reminder triggers on geofence entry
**Precondition:** Active location reminder with `notifiedAt === null`  
**Steps:**
1. Resume the app while physically within `radiusKm` of the saved point

**Expected:** On app resume, foreground position is read (8s timeout) and haversine distance ≤ radius fires a notification and sets `notifiedAt`; no double-fire on subsequent resumes

---

### TC-REM-08 — Maps picker hidden when no API key
**Precondition:** `GOOGLE_MAPS_API_KEY` / `window.__GOOGLE_MAPS_API_KEY__` absent  
**Steps:**
1. Open a location reminder form

**Expected:** `mapsAvailable()` is false; the map host is hidden gracefully; text search (Nominatim) still works; no console crash

---

### TC-REM-09 — Voice-create a reminder
**Steps:**
1. In the form, tap the voice button and speak e.g. "Remind me to pay rent tomorrow at 9am"
2. Wait for parsing

**Expected:** `AiVoiceReminderService` parses the phrase; title and `remindAt` are pre-filled; a recording/parsing state is shown and stops automatically; user can review before saving

---

### TC-REM-10 — Edit a reminder reschedules its notification
**Steps:**
1. Open an existing datetime reminder, change the time, Save

**Expected:** The previously scheduled local notification (`notificationId`) is cancelled and a new one is scheduled; the Firestore doc is updated

---

### TC-REM-11 — Delete a reminder
**Steps:**
1. Delete a reminder from the list/form

**Expected:** Firestore doc removed; any pending local notification is cancelled; item disappears from the list in real time (onSnapshot)

---

### TC-REM-12 — Reminders require deployed Firestore rules
**Precondition:** `users/{uid}/reminders` owner-only rules deployed  
**Steps:**
1. Read/write a reminder as the signed-in owner; attempt access as another uid

**Expected:** Owner can read/write own reminders; cross-user access is denied. (Regression guard: missing rules previously broke the whole reminders screen.)

---

## 16. Credit-Card Spend Detection & Pending Expenses

> **Feature:** On Android, with notification access granted (`SpendNotificationAccessService`), a `SpendNotificationClassifier` detects credit-card spend notifications and queues a `PendingCcExpense`. The in-app `CreditCardPickerComponent` then prompts the user to attribute it. Pending items persist under `spenza_pending_cc_expense_queue_v1`. Resolving creates an `ExpenseEntry` with `source: 'notification-prompt'` and updates balances: assigning to a card **increases** that card's `remainingBalance`; saving to the default account **decreases** that account's `balance`.

### TC-CC-01 — Detected card spend creates a pending prompt
**Precondition:** Android, notification access enabled, a card-spend notification arrives  
**Steps:**
1. Receive/tap the spend notification

**Expected:** A `PendingCcExpense` (amount, comment, date, timestamp, type) is queued; on next app open the Credit-Card picker surfaces the first pending item with the detected amount and optional merchant comment

---

### TC-CC-02 — Assign pending spend to a specific credit card
**Precondition:** ≥1 active `credit-card` debt account exists  
**Steps:**
1. In the picker, choose a credit card

**Expected:** `resolvePendingCcExpense(id, debtId)` creates an `ExpenseEntry` with `debtId` set and `source: 'notification-prompt'`; the chosen card's `remainingBalance` increases by the amount; item removed from the pending queue

---

### TC-CC-03 — Save pending spend to the default account
**Steps:**
1. In the picker, choose "Save to default account"

**Expected:** `resolvePendingCcExpense(id, null)` creates an entry with `accountId` = default (or first non-archived) account; that account's `balance` decreases by the amount; item removed from the queue

---

### TC-CC-04 — Picker shows only active credit cards
**Steps:**
1. Open the picker with a mix of active, archived, and non-card debts

**Expected:** Only debts where `type === 'credit-card'` and `status === 'active'` are offered as targets

---

### TC-CC-05 — Cancelling keeps the item pending
**Steps:**
1. Tap outside / cancel the picker without choosing

**Expected:** No entry is created; the `PendingCcExpense` stays in the queue and re-prompts next time; no balance change

---

### TC-CC-06 — Pending queue survives app restart
**Steps:**
1. Queue a pending CC expense, force-close, reopen

**Expected:** The item is rehydrated from `spenza_pending_cc_expense_queue_v1` and re-prompts; resolving once removes it permanently

---

### TC-CC-07 — Multiple pending items are resolved one at a time
**Precondition:** ≥2 pending CC expenses queued  
**Steps:**
1. Resolve the first; observe the picker

**Expected:** The picker always shows `pendingCcExpenses()[0]`; after each resolution the next item appears until the queue is empty

---

### TC-CC-08 — Resolved entry carries family attribution
**Precondition:** Family mode  
**Steps:**
1. Resolve a pending CC expense

**Expected:** The created `ExpenseEntry` preserves `createdByEmail` / `createdByRole` from the pending item so it is attributed correctly in the family feed

---

### TC-CC-09 — No default account → save-to-account is a no-op on balances
**Precondition:** No non-archived asset account exists  
**Steps:**
1. Choose "Save to default account" for a pending CC spend

**Expected:** The expense entry is still created (no `accountId`), but no account balance is mutated; no crash

---

## 17. Theming — Palette & Surface Style

> **Feature (2026-06-13):** Settings exposes a colour **palette** (`violet | rose | azure | emerald | amber`) and a surface **style** (`glass | neumorphism | claymorphism | neobrutalism`). Persisted as `pf-palette` / `pf-style`; applied via `data-palette` / `data-style` attributes on `<html>`. Selections sync to the native Android home-screen widgets (palette + style rendered per light/dark).

### TC-THEME-01 — Change colour palette
**Steps:**
1. Settings → Appearance → pick a palette (e.g. Emerald)

**Expected:** `ThemeService.setPalette()` persists `pf-palette`; `data-palette` updates on `<html>`; accent colours change app-wide instantly; a "Palette saved" confirmation is shown

---

### TC-THEME-02 — Change surface style
**Steps:**
1. Settings → Appearance → pick a style (e.g. Neumorphism)

**Expected:** `ThemeService.setStyle()` persists `pf-style`; surfaces re-render in the chosen style with a cross-fade ripple originating at the tapped card; a "Style saved" confirmation names the style

---

### TC-THEME-03 — Palette & style persist across sessions
**Steps:**
1. Set a non-default palette + style, restart the app

**Expected:** Saved values are restored from storage on launch and re-applied before first paint (no flash of default violet/glass)

---

### TC-THEME-04 — Invalid stored value falls back to default
**Precondition:** `pf-palette` / `pf-style` storage holds an unknown value  
**Steps:**
1. Launch the app

**Expected:** Validation rejects the bad value; palette falls back to `violet`, style to `glass`

---

### TC-THEME-05 — Palette/style is independent of light/dark mode
**Steps:**
1. Toggle dark mode, then change palette

**Expected:** Palette and style apply correctly in both light and dark; dark-mode toggle does not reset palette/style

---

### TC-THEME-06 — Selection syncs to Android widgets
**Precondition:** Android, an Expense/Streak widget is on the home screen  
**Steps:**
1. Change palette and/or style in the app

**Expected:** The next widget refresh renders the widget surface bitmap (`WidgetSurface` / `WidgetTheme`) using the selected palette + style for the current day/night, matching the app

---

### TC-THEME-07 — Each palette/style combination is selectable
**Steps:**
1. Cycle through all 5 palettes × 4 styles

**Expected:** All 20 combinations apply without error; the active option is visually indicated (`aria-pressed` / check icon)

---

## 18. Public Landing Page

> **Feature (2026-06-22):** Root route `''` serves `WelcomeComponent` with **no** auth guard, so logged-out visitors and the Google OAuth branding crawler (which runs no JS) see the app's purpose, Google data-scope explanations, and Privacy/Terms links. `/`, `/privacy`, `/terms` render shell-less and without the loading screen (`isPublicPage`). Static branding markup is embedded in `index.html` (cleared on Angular bootstrap), and `/privacy` & `/terms` also have standalone static pages served via Firebase rewrites; `ngsw-config` excludes them from the cached app shell.

### TC-LAND-01 — Logged-out visitor sees the landing page
**Steps:**
1. Visit `/` while signed out

**Expected:** Welcome/landing content renders with no auth redirect; app shell, bottom nav, and loading screen are hidden; data-scope explanation + Privacy/Terms links are present

---

### TC-LAND-02 — Signed-in user is redirected to /daily
**Steps:**
1. Visit `/` while authenticated and setup-complete

**Expected:** `WelcomeComponent` redirects to `/daily`; the landing page is not shown to logged-in users

---

### TC-LAND-03 — Branding visible without JavaScript
**Precondition:** JS disabled (simulating Google's branding crawler)  
**Steps:**
1. Fetch raw HTML of `/`

**Expected:** Static branding markup inside `<app-root>` in `index.html` is present in the served HTML (before Angular clears it on bootstrap)

---

### TC-LAND-04 — Static /privacy and /terms pages
**Steps:**
1. Visit `/privacy` and `/terms` directly (signed out)

**Expected:** Standalone static `public/privacy.html` / `public/terms.html` are served via Firebase rewrites (ahead of the SPA catch-all); the service worker does not serve the cached app shell there (`navigationUrls` negation)

---

### TC-LAND-05 — Landing text matches in-app components
**Steps:**
1. Compare static landing/privacy/terms text with the hash-routed welcome/privacy/terms components

**Expected:** Static and component copy are kept in sync (regression check — they are maintained separately)

---

## 19. Native Android Widgets (Expense & Streak)

> **Feature (2026-06-13):** Two home-screen widgets. The Expense widget logs/adds an expense from the home screen; the Duolingo-style **Daily Streak** widget shows a streak that counts a day when ≥1 expense is logged. `StreakCalculator` is pure local logic over the snapshot (`spenza_drive_backup_snapshot_v1`) + email-scoped widget queue (`spenza_widget_expense_queue_v1`); best streak persists as `spenza_streak_best_v1`. Three reaction states: ACTIVE / AT_RISK / BROKEN. A daily 20:00 `StreakReminderReceiver` posts a "keep your streak alive" notification only when today is not yet logged. **Note: requires a native Gradle build; not exercisable in the web app.**

### TC-WIDG-01 — Add expense from the Expense widget
**Precondition:** Expense widget on the home screen  
**Steps:**
1. Use the widget's quick-add to log an amount

**Expected:** The entry is appended to `spenza_widget_expense_queue_v1` (source tagged as widget) and flushed to the in-app store / Drive on next app open; the entry appears in the daily log

---

### TC-WIDG-02 — Streak increments when today is logged
**Steps:**
1. Log ≥1 expense for the current local date

**Expected:** `StreakCalculator` counts today; the streak widget shows the ACTIVE state with the incremented count

---

### TC-WIDG-03 — Streak counts back from today-or-yesterday
**Precondition:** Logged yesterday, not yet today  
**Steps:**
1. Open the widget before midnight

**Expected:** Streak stays alive (AT_RISK state) counting from yesterday; it only breaks after midnight passes with today unlogged

---

### TC-WIDG-04 — Broken streak state
**Precondition:** No expense logged for ≥2 days  
**Steps:**
1. View the widget

**Expected:** BROKEN state — flame icon/badge/colour and message reflect a reset streak; count returns to 0; `best` streak value is preserved

---

### TC-WIDG-05 — Best streak persists
**Steps:**
1. Reach a new high streak, then break it

**Expected:** `spenza_streak_best_v1` retains the highest value reached and is displayed even after the current streak resets

---

### TC-WIDG-06 — Daily streak reminder notification
**Precondition:** Streak widget present, today not yet logged, 20:00 local  
**Steps:**
1. Wait for the 20:00 `StreakReminderReceiver` alarm

**Expected:** A "keep your streak alive" notification posts on the `streak-reminders` channel **only** when today is unlogged; it is suppressed once an expense exists for today

---

### TC-WIDG-07 — Reminder scheduling tied to widget lifecycle
**Steps:**
1. Add the streak widget, then later remove it

**Expected:** The 20:00 alarm is scheduled in provider `onEnabled`/`onUpdate`, `MainActivity`, and `BootReceiver`; it is cancelled in `onDisabled` when the last widget is removed

---

### TC-WIDG-08 — Both widgets refresh on snapshot write & match theme
**Steps:**
1. Log an expense in-app (snapshot write); change palette/style

**Expected:** `ExpenseWidgetProvider.updateAll()` also refreshes the streak widget; both render with the app's selected palette + surface style for day/night

---

## Cross-Cutting Concerns

| Area | Expectation |
|------|-------------|
| **i18n** | All visible text uses `translate` pipe; no hardcoded English strings in templates |
| **Currency formatting** | All amounts use `currencyFormat` pipe; switching currency updates all views |
| **Date handling** | All dates use `toLocalDateString` / `parseLocalDate` utils; no raw `new Date()` calls that ignore timezone |
| **Role attribution** | Every `ExpenseEntry` written in Family mode has `createdByEmail` and `createdByRole` populated |
| **Accessibility** | Key interactive elements have `aria-label`; modals trap focus; alerts use `role="alert"` and `aria-live` |
| **Error boundaries** | Any failed Drive API call shows a toast; the app does not crash to a blank screen |
| **Persistence** | Google Drive JSON backup (`appDataFolder/spenza-backup.json`) is the sole source of truth; the legacy Google Sheets / IndexedDB offline queue has been removed. Entries save local-first and sync to Drive in the background with retry; an offline-log badge surfaces unsynced items |
| **Responsive layout** | All pages are usable at 375 px (mobile) and 1280 px (desktop) viewport widths |

---

*Generated by Claude · Spenza PWA · 2026-06-07 · Updated 2026-06-27 (modules 9, 11, 15–19, auth + cross-cutting revisions)*
