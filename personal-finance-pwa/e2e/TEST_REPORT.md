# Spenza E2E Test Report

**Run:** 6/28/2026, 4:30:35 PM  
**Duration:** 157.2s  
**Total:** 204 tests

| Status  | Count |
|---------|-------|
| ✅ Passed  | **164** |
| ✅ Failed  | **0** |
| ⏭️ Skipped | 40 |
| — Flaky   | 0 |

## 🎉 All tests passed!

## ⏭️ Skipped (40)

- `03-daily-expense.spec.ts` → TC-DAILY-04 — Delete an expense removes it from the list
- `03-daily-expense.spec.ts` → TC-DAILY-12 — Voice input shows unsupported message when Speech API absent
- `04-monthly.spec.ts` → TC-MNTH-05 — Category row expands on tap
- `05-limits.spec.ts` → TC-LMT-02 — Adjusting a category percentage updates running total
- `05-limits.spec.ts` → TC-LMT-04 — Savings below 20% shows low-savings warning
- `05-limits.spec.ts` → TC-LMT-05 — Add a custom expense category
- `05-limits.spec.ts` → TC-LMT-06 — Delete a custom category removes it
- `06-finances-accounts.spec.ts` → TC-FIN-04 — Only one account can be default at a time
- `06-finances-accounts.spec.ts` → TC-FIN-05 — Adjust account balance (increase)
- `07-finances-debt.spec.ts` → TC-DEBT-02 — Record a debt payment deducts from account and debt
- `10-settings.spec.ts` → TC-SET-02 — Change language to Tamil
- `10-settings.spec.ts` → TC-SET-03 — Change currency to USD updates display
- `10-settings.spec.ts` → TC-SET-09 — PWA install prompt button appears when supported
- `10-settings.spec.ts` → TC-SET-11 — AI API key is masked in UI (BYOK mode)
- `10-settings.spec.ts` → TC-SET-12 — Clear all data wipes storage and redirects to onboarding
- `11-subscription.spec.ts` → TC-SUB-06 — Subscribe page is not accessible on native (webOnlyGuard)
- `12-offline-pwa.spec.ts` → TC-PWA-01 — App shell renders offline from snapshot cache
- `14-reminders.spec.ts` → TC-REM-11 — Delete reminder removes it from list
- `15-theming.spec.ts` → TC-THEME-01 — Changing palette updates data-palette on <html>
- `15-theming.spec.ts` → TC-THEME-02 — Changing surface style updates data-style on <html>

## ✅ Passed (164)

**`01-auth.spec.ts`**
- TC-AUTH-01 — Unauthenticated user is redirected to login
- TC-AUTH-04 — Sign-out clears session and redirects to login
- TC-AUTH-06 — Sign-in failure shows error, stays on login page
- TC-AUTH-07 — App restores session silently from storage (no picker)
- TC-AUTH-08 — Missing Drive scope shows recovery message

**`02-onboarding.spec.ts`**
- TC-ONBD-01 — First-time user (no mode set) is routed to mode-select
- TC-ONBD-02 — Selecting Single mode persists mode and advances to sign-in
- TC-ONBD-03 — Family mode is gated behind Pro for non-Pro users
- TC-ONBD-04 — Zero-income user navigating to /daily is redirected to income setup
- TC-ONBD-05 — Entering income enables access to daily route
- TC-ONBD-06 — Budget percentages default to recommended values on fresh limits page
- TC-ONBD-07 — Returning user with mode+income bypasses onboarding

**`03-daily-expense.spec.ts`**
- TC-DAILY-01 — Log a new expense (happy path)
- TC-DAILY-02 — Log expense with a past date
- TC-DAILY-03 — Edit an existing expense updates amount
- TC-DAILY-05 — Overspend shows negative savings indicator
- TC-DAILY-13 — Expense links to payment source account
- TC-DAILY-14 — Expense saves locally while offline
- TC-DAILY-15 — Offline entry syncs on reconnect
- TC-DAILY-16 — Date navigation shows different day entries

**`04-monthly.spec.ts`**
- TC-MNTH-01 — Current month summary loads with totals
- TC-MNTH-02 — Navigate to previous month updates label
- TC-MNTH-03 — Future month navigation is blocked
- TC-MNTH-04 — Month with no entries shows empty state
- TC-MNTH-06 — Budget group breakdown shows Needs/Wants/Savings
- TC-MNTH-07 — Month-over-month change indicator is shown

**`05-limits.spec.ts`**
- TC-LMT-01 — Set monthly income persists and recomputes limits
- TC-LMT-03 — Running total > 100% shows warning
- TC-LMT-07 — Cannot delete a predefined category
- TC-LMT-08 — Limits persist across sessions (read from snapshot)
- TC-LMT-09 — Category group colour-coding is visually distinct

**`06-finances-accounts.spec.ts`**
- TC-FIN-01 — Create a new bank account
- TC-FIN-02 — Cannot create account with empty name
- TC-FIN-03 — Edit account name
- TC-FIN-08 — Delete an account removes it from list
- TC-FIN-09 — Total Assets equals sum of active account balances

**`07-finances-debt.spec.ts`**
- TC-DEBT-01 — Create a credit-card debt
- TC-DEBT-05 — Debt marks as Paid when balance reaches zero
- TC-DEBT-07 — Payment creates expense with correct source tag
- TC-DEBT-09 — Total Liabilities equals sum of active remaining balances
- TC-DEBT-10 — Cannot record payment without a source account

**`08-dashboard.spec.ts`**
- TC-DASH-01 — Dashboard stat chips show today/week/avg
- TC-DASH-02 — YTD chart renders with monthly bars
- TC-DASH-03 — Budget rule 50/30/20 summary is shown
- TC-DASH-04 — 6-month trend section is visible
- TC-DASH-05 — Net Worth panel shows Assets minus Liabilities
- TC-DASH-06 — Activity feed shows recent expense entry
- TC-DASH-07 — AI Insights section is visible (hosted mode)
- TC-DASH-08 — AI deep dive button triggers insight fetch

**`09-ai-features.spec.ts`**
- TC-AI-01 — Default provider is Hosted (no key needed)
- TC-AI-02 — AI mode = Disabled hides AI features
- TC-AI-02b — Legacy provider values migrate on load
- TC-AI-08 — Daily AI insight cap is enforced (shows limit reached)
- TC-AI-09 — BYOK mode without key shows "API Key Required"
- TC-AI-11 — Local fallback when AI endpoint is unreachable

**`10-settings.spec.ts`**
- TC-SET-01 — Switch to Dark mode persists preference
- TC-SET-06 — Export backup JSON downloads a file
- TC-SET-13 — AI provider card shows three options

**`11-subscription.spec.ts`**
- TC-SUB-01 — Non-Pro user cannot access /finances (subscription guard)
- TC-SUB-03 — Pro status shown in settings after payment
- TC-SUB-05 — Expired Pro gates finances again

**`12-offline-pwa.spec.ts`**
- TC-PWA-02 — Offline banner appears then disappears on reconnect
- TC-PWA-03 — Expenses logged offline are visible immediately
- TC-PWA-06 — Web manifest contains required fields

**`13-route-guards.spec.ts`**
- TC-GUARD-01 — authGuard blocks all protected routes when unauthenticated
- TC-GUARD-02 — setupGuard redirects to mode-select when no mode configured
- TC-GUARD-03 — setupGuard redirects to income setup when income = 0
- TC-GUARD-04 — subscriptionGuard blocks /finances for non-Pro
- TC-GUARD-05 — Setup-complete user is redirected away from /mode-select
- TC-GUARD-06 — Bottom nav is hidden on /mode-select and /family-setup

**`14-reminders.spec.ts`**
- TC-REM-01 — Reminders list renders with add affordance
- TC-REM-02 — Create a date/time reminder saves to Firestore
- TC-REM-06 — Location reminder type is Pro-gated for free users

**`15-theming.spec.ts`**
- TC-THEME-03 — Palette and style persist across page reload
- TC-THEME-04 — Invalid stored palette falls back to violet
- TC-THEME-05 — Palette applies in both light and dark mode
- TC-THEME-07 — All 20 palette/style combinations are selectable without error

**`16-landing.spec.ts`**
- TC-LAND-01 — Logged-out visitor sees landing content, not redirect
- TC-LAND-02 — Signed-in user at / is redirected to /daily
- TC-LAND-03 — Static branding visible without JavaScript
- TC-LAND-04 — /privacy and /terms routes render content in the SPA
- TC-LAND-05 — Data-scope explanation and Privacy/Terms links are present on landing

---
*Generated by `e2e/generate-report.js` — re-runs automatically with `npm run e2e`*