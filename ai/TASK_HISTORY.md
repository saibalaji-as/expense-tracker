# Task History

## 2026-06-03 - AuthService displayName Signal

- User asked how to find the Firebase UID, why it is a long random string, and whether the email username could serve as an identifier.
- Explained that Firebase UIDs are intentionally random 28-char strings: globally unique, unpredictable, and stable even when the user changes email/password. They are Firestore document keys and not meant to be human-readable.
- Added `displayName` computed signal to `AuthService` (derives `saibalaji315` from `saibalaji315@gmail.com` via `userEmail().split('@')[0]`).
- Added `computed` to the `@angular/core` import in `auth.service.ts`.
- Decision: Firestore paths continue to use `firebaseUid` (periods in emails would require escaping; email can change). `displayName` is for UI display only.

## 2026-06-02 - Bill Extraction Modern Drag-To-Crop UI

- User reported the legacy 4-slider crop tool in the bill image editor was hard to use.
- Replaced the range-slider crop controls with a fully interactive drag-to-crop overlay directly on the image.
- Changed `daily-expense.component.ts`:
  - Removed `receiptEditorClipPath()` and `updateReceiptEditorCrop()` methods and their range-slider template.
  - Removed CSS `clip-path` from the preview `<img>`; image now renders unclipped.
  - Added an `inline-block` wrapper (`#cropRef`) sized to the image, containing an absolute-positioned overlay.
  - Overlay renders four dark mask quadrants outside the active crop box and a draggable crop box with rule-of-thirds grid lines.
  - Crop box has 4 large corner handles (40×40 px touch targets) and 4 pill-shaped edge handles for resize; interior is draggable to move.
  - Added private `cropDragState` field tracking pointer ID, start position, container rect, and initial crop percentages.
  - Added `startCropDrag(type, event, container)` — stores drag context, attaches document-level `pointermove`/`pointerup`/`pointercancel` listeners.
  - Added `onCropPointerMove(event)` — maps clientX/clientY to percentage deltas via stored `containerRect`; handles move, n/s/e/w/nw/ne/sw/se resize modes with minimum 8% crop size enforcement.
  - Added `stopCropDrag(event)` — clears state and removes document-level listeners.
  - Document-level listeners are also removed in `ngOnDestroy` for safety.
  - Made `rotateReceiptEditor()` async: when a non-zero rotation is selected, `renderRotatedPreview()` draws the rotated image to a canvas blob, creates a new object URL, and updates `editor.url` so the crop overlay always aligns with the visually correct orientation.
  - Added `renderRotatedPreview(file, rotation)` private method using `createImageBitmap` → `drawRotatedBitmap` → `canvasToJpegBlob` → `createObjectURL`; rotation 0° fast-paths to a direct `createObjectURL(file)`.
  - Crop resets to full (0, 0, 100, 100) on rotate so the overlay starts fresh in the new orientation.
  - Added `Image` lucide icon import for the Use Original button.
  - Added hint text at the bottom of the editor: "Drag corners or edges to crop · Drag inside to move".
- Changed `i18n.service.ts`:
  - Removed `daily.receipt.editor.cropLeft/Top/Width/Height` keys.
  - Added `daily.receipt.editor.cropHint`.
- Decision: crop percentages are always in the visual (post-rotation) coordinate space; `getBoundingClientRect()` on the unrotated container gives correct viewport bounds at rotation 0°; `renderRotatedPreview` bakes rotation into the preview URL so no CSS transform is active on the image in the editor, eliminating coordinate ambiguity.
- `createEditedReceiptImage()` is unchanged — it still applies rotation to the original file bitmap before cropping, consistent with the stored percentages.
- Verification:
  - `npx tsc --noEmit` passed (zero errors).

## 2026-05-31 - Native Widget Direct Credit Action
- User requested a visible widget action for credited amounts and removal of the in-dialog Expense/Received choice.
- Changed `ExpenseWidgetProvider` and both active widget layouts:
  - Added an always-visible `Credit` action with a dedicated icon.
  - Credit taps launch `ExpenseWidgetActivity` with the credit mode extra, while category and More taps keep launching expense mode.
- Changed `ExpenseWidgetActivity`:
  - Removed the Amount kind dropdown.
  - Expense launches open the expense dialog directly.
  - Credit launches open the account-adjustment dialog directly, hiding expense categories and expense quick-comment chips while keeping target-account selection.
- Kept notification-listener behavior aligned:
  - Expense notifications continue opening the expense dialog.
  - Credit/refund notifications continue passing credit mode and now open the account-adjustment dialog without a second mode-selection step.

## 2026-05-31 - Documentation Consolidation And Workspace Cleanup
- Consolidated useful human-facing setup, build, Android signing, Netlify environment, notification, family backup, logo, and generated-directory guidance into `docs/README.md`.
- Removed stale feature-completion diaries, phase-status guides, duplicate troubleshooting notes, and the superseded app-root Angular CLI README.
- Preserved required structural documentation: `AGENTS.md`, `.github/copilot-instructions.md`, `drive-ai.md`, and `ai/*.md`.
- Updated `setup-android-fixes.sh` to point at the consolidated guide.
- Decision:
  - Keep runtime directories intact because Angular, Android, Netlify, Git, and AI workflow tooling depend on their structure.
  - Workspace cleanup may delete ignored build caches and dependencies, which can be regenerated with `npm ci`, `npm run build`, and `npx cap sync android`.

## 2026-05-31 - Android APK Signature Mismatch And Native Google Login Diagnosis
- User reported that Android rejected an APK update with a package mismatch, then Google login failed with `Google sign-in cancelled by user` after uninstalling the old app and installing the new APK.
- Diagnosis:
  - Package ID is still `com.spenza.app`; the update rejection was a signing-certificate mismatch, not a package-name change.
  - Gradle has no release signing configuration, so debug APKs use the machine-local `~/.android/debug.keystore`.
  - The current debug APK signer SHA-1 is `D0:48:3A:CC:04:57:A2:24:0E:53:91:05:8B:15:31:04:02:15:0A:50`.
  - The old expected SHA-1 documented in source was `A9:87:C7:2A:58:35:B4:AA:AE:13:F7:84:99:EF:91:45:4D:9A:C4:9B`, and that signing keystore is not present on this machine.
  - Native Google login requires a Google Cloud Android OAuth client for package `com.spenza.app` whose SHA-1 matches the exact installed APK signer.
- Fix:
  - Removed the stale Android OAuth client ID incorrectly passed through the plugin's iOS-only `iOSServerClientId` field.
  - Updated `capacitor.config.ts` comments to describe the real native Google OAuth requirement.
  - Added APK signing, signer verification, stable-keystore, and Google OAuth SHA-1 guidance, now consolidated in `docs/README.md`.

## 2026-05-31 - Native Widget Expense Finance-Account Deduction
- User reported that native widget expenses logged correctly but did not reduce the finance account balance until the expense was edited later in the app.
- Diagnosis:
  - The widget dialog loaded the default finance account for received-money adjustments but omitted `accountId` from expense entries.
  - Android WorkManager merged queued expense rows without applying linked-account balance deltas.
  - Angular `ExpenseStore.flushPendingWidgetExpenses()` also added queued expense rows without applying linked-account deltas when the app consumed the queue first.
  - Editing the expense later through Daily selected an account and ran the normal `updateEntry()` reversal/apply logic, making the missing deduction appear.
- Fix:
  - Expense mode now shows a `Pay from account` dropdown using the default active account initially.
  - Native widget expense entries include the selected `accountId` when available.
  - Android WorkManager deducts linked widget expenses atomically while merging them by ID.
  - Angular widget queue flush applies the same linked-account deduction when it wins the queue race.
  - Missing, archived, and insufficient-balance account cases remain queued rather than partially merging.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Ran `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`.
  - Ran `npx vitest run src/app/core/services/expense-store.service.spec.ts`.
  - Ran `graphify update .`.

## 2026-05-31 - Graphify And Persistent AI Memory Integration
- Added a two-layer AI context workflow:
  - `ai/*.md` remains the curated source for durable product rules, architecture decisions, current state, and historical reasoning.
  - `graphify-out/graph.json` provides generated live code structure for symbol, relationship, and impact queries.
- Updated `drive-ai.md` with:
  - A reusable Graphify-aware startup prompt.
  - A session-end graph refresh step.
  - Practical `query`, `explain`, `path`, and `affected` command examples.
  - Fresh-clone guidance.
- Updated `AGENTS.md` and `.github/copilot-instructions.md` so Codex and VS Code Copilot read curated memory before architecture-affecting work and use Graphify before broad code searches.
- Updated `ai/AI_RULES.md` to require `graphify update .` after code changes and prevent generated graph output from bloating curated memory.
- Added `scripts/setup-ai-context.sh` and `scripts/refresh-ai-context.sh` for second-machine bootstrap:
  - Installs `uv` through Homebrew when needed.
  - Installs Graphify when needed.
  - Configures Codex and VS Code Copilot Chat integrations.
  - Builds the local graph.
  - Installs a machine-local Git `post-merge` hook so future `git pull` merges refresh Graphify automatically.
- Decision:
  - Keep `graphify-out/` local and gitignored because it is generated output.
  - Commit portable AI guidance files so future chats inherit the workflow.

## 2026-05-29 - Widget Insight Refresh After Debt Payment
- User observed that a recorded debt payment appeared in expense history but did not appear in the home-screen widget insight until logging another expense.
- Diagnosis:
  - Widget insight reads `spenza_drive_backup_snapshot_v1` and pending native widget queue items.
  - App-created debt-payment expenses were written into the cached snapshot, but the Android widget was not explicitly redrawn after that app-side snapshot update.
  - Native widget-created expenses already called `ExpenseWidgetProvider.updateAll()`, which is why the widget caught up after the next expense.
- Fix:
  - Added native `ExpenseWidgetPlugin.refresh()` to call `ExpenseWidgetProvider.updateAll()`.
  - Registered `ExpenseWidgetPlugin` in `MainActivity`.
  - Updated `ExpenseStore.writeLocalBackupSnapshot()` to call the native refresh bridge on Android after writing the local backup snapshot.
- Verification:
  - Ran `npm run build`.
  - Ran `./gradlew :app:assembleDebug`.
  - Both passed.

## 2026-05-29 - Native Widget Dialog Theme Polish
- User liked the widget dialog direction but wanted it matched more closely to the Spenza app theme, especially dropdowns, text, icons, and inputs.
- Updated `ExpenseWidgetActivity`:
  - Replaced stock Android `Spinner` dropdowns with a reusable custom native themed dropdown.
  - Dropdown triggers now use rounded Spenza-style surfaces, icon badges, bold selected labels, and chevron rotation.
  - Dropdown menus now use themed floating panels, selected row highlighting, check marks, category/account icons, and capped scrolling height.
  - Amount kind, Expense type, and Receive into account selectors all use the same dropdown treatment.
  - Tuned title/helper text, amount/comment inputs, and action button corner radius/typography to better match the Angular app controls.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-29 - Native Widget Expense Type Dropdown
- User wanted the native widget sheet to save space by replacing the expense type chip grid with a dropdown.
- Updated `ExpenseWidgetActivity`:
  - Replaced the two-column expense type chip list with a compact spinner/dropdown.
  - Kept the same `selectedType` behavior for widget launches and voice smart-fill category updates.
  - Received mode still hides expense type and shows the account adjustment selector.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-29 - Native Widget Credit Adjustment Flow
- User wanted the native widget/notification review sheet to handle credits now that Spenza has Finance accounts.
- Updated `ExpenseWidgetActivity`:
  - Added an Amount kind dropdown with `Expense` and `Received`.
  - Expense keeps the existing category/amount/comment flow.
  - Received hides expense categories and shows a target account dropdown loaded from active cached finance accounts.
  - Saving a received amount queues a Finance account-balance increase adjustment rather than creating an expense.
- Extended native widget queue/sync:
  - Queue items now distinguish `kind: 'expense'` and `kind: 'adjustment'`.
  - Android `WidgetExpenseSyncWorker` merges adjustment items into Drive by increasing the selected account balance and appending an `accountAdjustments` audit row.
  - Angular `ExpenseStore.flushPendingWidgetExpenses()` now also handles queued adjustment items when the app opens before WorkManager sync completes.
- Updated notification listener/classifier:
  - SMS notifications with credit/received/refund terms and a selected-currency amount now classify as `INCOME_OR_REFUND` and can prompt.
  - Credit prompts pass `WIDGET_AMOUNT_KIND_CREDIT` so the widget dialog opens with `Received` selected.
- Updated project context/rules for the new queue shape and received-money adjustment behavior.
- Verification:
  - Ran `./gradlew :app:testDebugUnitTest --tests com.spenza.app.SpendNotificationClassifierTest`.
  - Ran `npm run build`.
  - Ran `./gradlew :app:assembleDebug`.
  - All passed.

## 2026-05-29 - Spend Notification SMS And Currency Gate
- User reported that the Android notification listener was still reading unwanted notifications and asked to focus on SMS finance notifications only.
- Tightened `SpendNotificationClassifier`:
  - Non-SMS/messaging-source packages now return `UNKNOWN`, so payment apps, wallets, banks, and other apps are ignored even when they contain currency text.
  - Amount candidates must include a marker for the selected Spenza currency before they can be considered.
  - Currency marker support now covers INR (`₹`, `INR`, `Rs`, rupee), USD (`$`, `US$`, `USD`, dollar), and AED (`AED`, `د.إ`, `dh/dhs`, dirham).
  - Bare amounts without currency markers no longer prompt.
- Updated `SpendNotificationListenerService`:
  - Reads the active app currency from `spenza_currency`, with cached Drive backup metadata as fallback.
  - Passes that currency into classification.
  - Displays/dedupes detected prompt amounts with the active currency instead of always using rupees.
- Added Android unit coverage for SMS-only eligibility, selected-currency mismatch, USD SMS classification, and bare-amount rejection.
- Updated AI rules to preserve the SMS-only and selected-currency notification behavior.
- Verification:
  - Ran `./gradlew :app:testDebugUnitTest --tests com.spenza.app.SpendNotificationClassifierTest`.
  - Ran `./gradlew :app:assembleDebug`.
  - Both passed.

## 2026-05-28 - Debt And Debt-Payment Edit/Delete
- User wanted to edit/delete debt logs after discovering test debts could not be removed from Finances.
- Added dedicated debt/payment reversal methods in `ExpenseStore`:
  - `deleteDebt` removes a debt only when it has no payment logs or linked debt-payment entries.
  - `updateDebtPayment` reverses the previous payment, applies the new amount/date/account/comment, updates the generated `Debt Payment` expense, updates account balances, and recalculates debt remaining/status.
  - `deleteDebtPayment` removes the generated debt-payment expense, restores the payment account balance, increases the debt remaining balance, and removes the payment audit record.
- Updated `FinancesComponent`:
  - Added per-debt delete button.
  - Added payment history under each debt.
  - Added edit/delete controls for each debt-payment log.
  - Reuses the existing payment form for both record and edit modes.
- Added English, Tamil, and Hindi i18n strings for payment history, update/delete confirmations, and feedback messages.
- Updated project memory/rules to reflect that Daily remains blocked for debt-payment edits; Finances is now the dedicated reversal path.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-28 - Native Widget In-Form Expense Type Selector
- User reported that notification-listener prompts opened the widget expense form as `Miscellaneous` with no reliable way to correct the expense type before saving.
- Updated `ExpenseWidgetActivity`:
  - Removed the separate category-picker screen for the widget More action.
  - Always opens the native expense log form directly.
  - Added a two-column in-form expense type selector covering all predefined widget categories.
  - Keeps the selected type visibly highlighted and updates the form title when changed.
  - Keeps notification prompt amount/comment prefill behavior, while allowing the user to change away from the default `Miscellaneous` before Save.
  - Syncs the selector/title when voice smart-fill changes the parsed category.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-28 - Local Spend Notification Classifier
- Implemented the user's requested model-like local classifier for Android spend notifications.
- Added `SpendNotificationClassifier`:
  - Classifies notification text into explicit types before amount extraction:
    - `EXPENSE_TRANSACTION`
    - `INCOME_OR_REFUND`
    - `BALANCE_OR_STATEMENT`
    - `PAYMENT_REQUEST`
    - `FAILED_OR_PENDING`
    - `SECURITY_OR_OTP`
    - `APP_UPDATE_OR_SYSTEM`
    - `UNKNOWN`
  - Combines source package hints, action terms, amount/currency context, payment rails, balance context, and blocking classes into a confidence score.
  - Only high-confidence `EXPENSE_TRANSACTION` results can open the review sheet.
- Updated `SpendNotificationListenerService` to delegate to the classifier and removed the old direct keyword-gate parsing path.
- Added unit coverage for:
  - Real debit expense.
  - Play Store update summary false positive.
  - OTP/security message.
  - Refund/credit message.
  - Failed transaction.
  - Balance-only statement.
- Verification:
  - Ran `./gradlew :app:testDebugUnitTest`.
  - Ran `./gradlew :app:assembleDebug`.
  - Both passed.

## 2026-05-28 - Spend Notification App-Update False Positive Filter
- User reported a false spend prompt from an app update/security-style notification, where Spenza opened the quick expense sheet with an unrelated amount.
- Tightened `SpendNotificationListenerService`:
  - Ignores known app-store notification packages before parsing:
    - Google Play Store: `com.android.vending`
    - Samsung Galaxy Store: `com.sec.android.app.samsungapps`
    - Amazon Appstore: `com.amazon.venezia`
  - Rejects notification text about app updates, installs/downloads, Play Protect/security scans, storage, backup complete, and sync complete.
  - Keeps transaction parsing local-only and still review-before-save.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-28 - App-Wide Themed Dropdown Migration
- User requested every app dropdown to match the new themed Debt type menu.
- Added shared `ThemedSelectComponent`:
  - Spenza-themed full-width trigger and floating menu.
  - Optional Lucide icon support.
  - ControlValueAccessor support for `formControlName`.
  - Direct `[value]` / `(valueChange)` support for non-form row selectors.
- Replaced native Angular app `<select>` controls:
  - Daily payment source.
  - Daily split-bill category rows.
  - Limits custom budget group dropdowns on desktop and mobile.
  - Finances account type, debt type, adjustment kind, and debt-payment account.
- Updated project rules to use `ThemedSelectComponent` for visible app dropdowns going forward.
- Verification:
  - `rg -n "<select|</select>" personal-finance-pwa/src/app` returns no matches.
  - Ran `npm run build`.
  - Passed.

## 2026-05-28 - Debt Type Picker Changed To Themed Dropdown
- Reworked the Finances Add/Edit debt type selector after user feedback that the horizontal chip picker caused unwanted scrolling.
- Replaced the horizontal chip strip with a full-width custom dropdown trigger and floating themed menu:
  - Shows the selected debt type with a matching icon.
  - Uses Spenza border/background/primary states instead of the plain browser select menu.
  - Keeps the same reactive `type` form control and debt model unchanged.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-28 - Debt Dialog Compact Layout And Type Picker
- Polished the Finances Add/Edit debt dialog based on mobile screenshot feedback.
- Replaced the plain Debt type native dropdown with a compact horizontal icon chip picker that updates the existing reactive `type` control.
- Reduced debt form vertical height:
  - Debt name, debt type, start date, and next due date remain full width.
  - Borrowed amount + remaining balance now share one row.
  - Interest rate + monthly EMI now share one row.
  - Debt form fields use tighter padding and smaller gaps.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-28 - Finances Add/Edit Forms Moved To Dialogs
- Changed Finances add/edit account and add/edit debt forms from inline section cards to modal dialogs.
- Updated `ModalComponent`:
  - Added `showActions` input so form dialogs can hide the default Confirm/Cancel footer.
  - Added max-height and overflow scrolling so longer debt forms stay usable on small screens.
- Removed the previous scroll-to-form behavior because dialog opening now provides the focus transition.
- Kept debt payment recording inline under each debt; debt-payment edit/delete remains planned for Phase 5.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-28 - Finances Screen Spacing And Form Scroll Polish
- Addressed Finances screen aesthetic bugs from mobile/desktop screenshots:
  - Replaced the root `space-y` stack with an explicit grid gap.
  - Added mobile bottom padding so the final finance sections breathe above the floating bottom nav.
  - Added stable account/debt form section IDs.
  - Add/Edit account and Add/Edit debt actions now scroll to their forms after rendering, with delayed correction passes for mobile/WebView reliability.
- Added a Phase 5 action plan to `ai/ACCOUNT_BALANCES_DEBT_EMI_PLAN.md` for debt-payment edit/delete reversal:
  - Keep Daily edit/delete blocked for debt-payment entries.
  - Add Finances payment history controls later.
  - Implement atomic `deleteDebtPayment` and `updateDebtPayment` store methods before exposing those controls.
- Verification:
  - Ran `npm run build`.
  - Passed.
  - Started local dev server on `http://127.0.0.1:4201/`; browser automation was unavailable in this session, so no screenshot QA was captured.

## 2026-05-28 - Old-App Finance Array Preservation Guard
- Investigated a report that a finance account created yesterday disappeared after the user opened an older pre-finance app build and deleted an expense entry.
- Diagnosis:
  - Current app deletion does not delete finance accounts.
  - Current app blocks generic Daily edit/delete for debt-payment entries.
  - Older pre-finance builds can still rewrite `spenza-backup.json` without `accounts`, `accountAdjustments`, `debts`, and `debtPayments`, effectively dropping finance data from the Drive backup.
- Added a compatibility guard in `ExpenseStore.applyBackupDocument`:
  - When a remote backup is missing finance arrays but current cached/in-memory state still has finance arrays, preserve the cached arrays.
  - Immediately persist the upgraded backup back to Drive so future reads include the finance schema.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-28 - Account Balances And Debt/EMI Phase 4 Dashboard Net Worth
- Completed Phase 4 from `ai/ACCOUNT_BALANCES_DEBT_EMI_PLAN.md`.
- Extended `ExpenseStore` computed state:
  - `netWorth`
  - `activeDebtCount`
  - `nextDebtDue`
- Added a Dashboard net-worth summary band:
  - Shows net worth as assets minus active liabilities.
  - Shows total assets, total liabilities, active account count, active debt count, and next debt due.
  - Includes an empty state and Finances setup/manage link.
- Added English, Tamil, and Hindi i18n strings for the new Dashboard card.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-27 - Debt/EMI Phase 3 Implementation
- Initiated Phase 3 from `ai/ACCOUNT_BALANCES_DEBT_EMI_PLAN.md`.
- Added debt data model:
  - `DebtAccount`
  - `DebtPayment`
  - debt create/update input types
  - debt payment input type
  - canonical `DEBT_PAYMENT_EXPENSE_TYPE`
- Extended backup compatibility:
  - `BackupDocument` now supports optional `debts` and `debtPayments` arrays.
  - New backup files include empty debt arrays.
  - Older backup files without debt arrays continue loading as empty debt state.
  - Settings JSON export/restore includes debt arrays.
  - Family-to-single merge and shared-file rotation preserve debt arrays.
- Added `Debt Payment` as a predefined visible category with `0%` recommended allocation.
- Extended `ExpenseStore`:
  - Added `debts` and `debtPayments` state.
  - Added computed `activeDebts` and `totalLiabilities`.
  - Added `addDebt`, `updateDebt`, and `recordDebtPayment`.
  - `recordDebtPayment` atomically creates a debt-payment expense, deducts the selected account, reduces remaining debt balance, creates a payment record, and marks debt paid at zero.
  - Debt overpayments are rejected.
  - Debt payments reuse existing account overdraft validation.
  - Generic expense update/delete now blocks debt-payment entries so Daily cannot create inconsistent debt/payment state.
- Extended `FinancesComponent`:
  - Added debt add/edit form.
  - Added active/paid debt list with progress bars.
  - Added inline debt-payment form with account selection.
  - Added English, Tamil, and Hindi i18n strings.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-27 - Account Balances Phase 2 Implementation
- Initiated Phase 2 from `ai/ACCOUNT_BALANCES_DEBT_EMI_PLAN.md`.
- Linked Daily expenses to asset accounts:
  - Added a payment-source selector to the Daily form when active accounts exist.
  - Preselects the default account for new expenses.
  - Preserves/restores the linked account while editing existing expenses.
  - Persists the selected account in the same-session Daily draft.
  - Shows linked account names in Daily list/detail metadata.
- Centralized balance effects in `ExpenseStore`:
  - `addEntry` and `addEntries` deduct linked expense amounts from account balances.
  - `updateEntry` reverses the old linked-account effect before applying the new one.
  - `deleteEntry` restores the linked account balance.
  - Split-bill saves apply aggregate account deltas atomically.
  - Overdraft-blocked accounts reject expense saves before state is patched.
  - Existing expenses without `accountId` remain balance-neutral.
- Added English, Tamil, and Hindi strings for the Daily payment-source UI.
- Stopped the local Angular dev watcher that had been running on `http://127.0.0.1:4201/`.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-27 - Account Balances Phase 1 Implementation
- Initiated implementation from `ai/ACCOUNT_BALANCES_DEBT_EMI_PLAN.md`.
- Added account data model:
  - `AssetAccount`
  - `AccountBalanceAdjustment`
  - account create/update/adjust input types
- Extended backup compatibility:
  - `BackupDocument` now supports optional `accounts` and `accountAdjustments` arrays.
  - New backup files include empty arrays.
  - Older backup files without account arrays continue loading as empty account state.
  - Settings JSON export/restore includes the account arrays.
  - Family-to-single merge and shared-file rotation preserve account arrays.
- Extended `ExpenseStore`:
  - Added `accounts` and `accountAdjustments` state.
  - Added computed `activeAccounts`, `defaultAccount`, and `totalAssets`.
  - Added `addAccount`, `updateAccount`, `setDefaultAccount`, `adjustAccountBalance`, and `deleteAccount`.
  - Manual balance adjustments do not create expenses.
  - Deleting accounts is blocked when any expense references the account ID.
- Added guarded `/finances` route and app-shell navigation item.
- Added `FinancesComponent`:
  - Account add/edit form.
  - Account list with balances, type, default badge, default action, manual adjustment form, and delete confirmation.
  - Empty state for first account setup.
  - English, Tamil, and Hindi i18n strings.
- Verification:
  - Ran `npm run build`.
  - Passed.
  - Started Angular dev server on `http://127.0.0.1:4201/` because port `4200` was already in use.

## 2026-05-27 - Account Balances And Debt/EMI Feature Planning
- User provided business context for expanding Spenza from expense tracking into optional account balance, debt/EMI, and net-worth tracking.
- Analyzed the current code shape before planning:
  - `ExpenseStore` is the correct transaction boundary for Drive-backed accounts/debts and balance-affecting expense mutations.
  - `BackupDocument` currently contains `metadata`, `expenses`, and `limits`; new arrays should be optional on read for backward compatibility.
  - `ExpenseEntry` can be extended with optional `accountId`, `debtId`, and source fields without breaking old backups.
  - Daily expense create/update/delete already centralizes through store methods, which supports safe balance deduction/reversal in Phase 2.
- Created `ai/ACCOUNT_BALANCES_DEBT_EMI_PLAN.md` with phased implementation details:
  - Phase 1: asset accounts and balances.
  - Phase 2: link expenses to accounts and auto-deduct/reverse balances.
  - Phase 3: debts, EMIs, and debt payment expense creation.
  - Phase 4: dashboard net worth and optional reminders.
- No app code was changed in this planning pass.

## 2026-05-27 - Spend Notification Keyword Coverage And Listener Reliability
- User reported a real spend notification using the keyword `Used` and said many notifications were not being listened to.
- Expanded `SpendNotificationListenerService` keyword coverage:
  - Added common spend terms and channels: `used`, `debit`, `dr`, `payment`, `purchased`, `withdrawal`, `charged`, `deducted`, `sent`, `transferred`, `txn`, `pos`, `atm`, `ecom`, `billpay`, `autopay`, `nach`, `ach debit`, `mandate debit`, `emi`, `fee`, `fees`, and `charges`.
  - Kept broader channel terms such as UPI/card transaction while requiring better amount context before prompting.
  - Added stronger non-spend filters for credits, refunds, cashback, reversals, salary/deposits, failed/declined/pending/processing/cancelled/rejected transactions, request-only messages, mandate setup messages, and OTP/PIN/CVV/password/security notifications.
  - Reworked amount parsing to score amounts near spend keywords/currency markers and avoid likely balance/reference/OTP amount contexts.
- Fixed likely listener miss culprits:
  - No longer drops all group-summary notifications, because some SMS/payment apps expose transaction text only in summary notifications.
  - Reads Android messaging-style notification extras in addition to title/text/big text/text lines.
  - Adds `onListenerConnected`/`onListenerDisconnected` logging and requests Android notification listener rebind on disconnect for Android N+.
  - Makes Settings permission-status detection tolerate both long and short flattened Android component names.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-26 - Android Payment Notification Spend Prompts
- User requested a feature that can read device notifications such as SMS/payment alerts and ask the user whether to log the detected amount as an expense.
- Added native Android notification-listener support:
  - Added `SpendNotificationListenerService` using Android `NotificationListenerService`.
  - Requires Android notification access and Spenza's own local toggle before parsing notification content.
  - Ignores Spenza notifications, group summaries, ongoing notifications, and likely credits/refunds/cashback/reversals/salary/deposits.
  - Locally parses likely debit/spent/paid/purchase notifications for an amount.
  - Stores only a local dedupe fingerprint to avoid repeated prompts.
- Added prompt notification flow:
  - Added `spend-prompts` notification channel.
  - Shows a private "Log this expense?" notification when a likely spend is detected.
  - Tapping the prompt opens the existing native `ExpenseWidgetActivity` with the amount/comment prefilled and `Miscellaneous` as default category.
  - The expense is not saved until the user reviews and taps Save.
- Added Settings integration:
  - Added `SpendNotificationAccessPlugin` and Angular `SpendNotificationAccessService`.
  - Settings now shows Android-only payment notification prompt controls, permission status, refresh status, and a shortcut to Android notification access settings.
  - Added English, Tamil, and Hindi i18n strings for the new Settings card.
- Updated project rules:
  - Notification/SMS-derived spend detection must stay explicit opt-in, Android notification-listener based, local-only, and review-before-save.
- Verification:
  - Ran `npm run build`.
  - Ran `./gradlew :app:assembleDebug`.
  - Both passed.

## 2026-05-25 - Widget Dialog Task Isolation And Nav Bar Insets
- User observed:
  - When the main app was already open, using the widget brought the app forward first and then opened the dialog.
  - Dialog buttons could appear behind the mobile navigation bar.
- Changed `AndroidManifest.xml`:
  - Assigned `ExpenseWidgetActivity` a separate widget task affinity.
  - Added `launchMode="singleTop"` and `finishOnTaskLaunch="true"` while keeping it excluded from recents.
- Changed `ExpenseWidgetProvider.java`:
  - Adds `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP` to widget button intents, so the widget dialog launches into its own lightweight task instead of the app task.
- Changed `ExpenseWidgetActivity.java`:
  - Bottom-sheet inset handling now uses the larger of IME bottom inset and navigation-bar bottom inset for both the amount form and category picker.
  - This keeps dialog controls above the navigation bar when the keyboard is closed and directly above the keyboard when it is open.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Widget More Category Picker
- User requested a Show More expense type at the last widget slot; tapping it should open a dialog with expense type chips like the app, then let the user select the type.
- Changed widget action slots:
  - Replaced the final visible widget tile with `More` in both 1-row and 3-row layouts.
  - Kept optional Shopping as the extra fifth action for wide placements.
- Changed `ExpenseWidgetProvider.java`:
  - Binds the final `More` tile to a special native category extra.
- Changed `WidgetExpenseConstants.java` and `WidgetExpenseUtils.java`:
  - Added a special `TYPE_MORE` sentinel.
  - Added all predefined app categories to native widget allowed types.
  - Added normalization aliases for the expanded category set.
- Changed `ExpenseWidgetActivity.java`:
  - If opened with `TYPE_MORE`, first renders a bottom-sheet category picker.
  - Category picker shows two-column chip-style options for all predefined categories.
  - Selecting a chip switches into the existing amount/comment/mic form with the chosen canonical type.
  - Display labels are shortened where useful while saved type values remain canonical.
- Added `ic_widget_more.xml`.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Widget 1-Row And 3-Row Grid Modes
- User identified the launcher grid behavior and requested:
  - Use 3-height and 4/5-width grid sizing instead of a 4x4-style minimum.
  - Short/reduced height should become a 1x4 layout showing only expense types.
  - Increased height should become a 3x4 layout showing daily insight plus expense types.
  - 4-wide placements should show 4 expense types; 5-wide placements should show 5.
- Changed `expense_widget_info.xml`:
  - Lowered minimum widget height to support a short 1-row layout.
  - Enabled horizontal and vertical resizing.
  - Set target height to 3 cells and max resize width/height hints for 5-wide and 3-row states.
- Changed `ExpenseWidgetProvider.java`:
  - Chooses `expense_widget_quick` when launcher-reported height is short.
  - Chooses `expense_widget` when launcher-reported height is tall enough for daily insight.
  - Shows the optional Shopping tile only when launcher-reported width is wide enough.
- Added `expense_widget_quick.xml`:
  - 1-row quick-action-only widget layout with Food, Travel, Fun, optional Shop, and Misc.
- Changed native category support:
  - Added `Shopping/Clothing` as the fifth optional widget category.
  - Added shopping icon/background resources and widget colors.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Native Widget Form Mic Button Alignment
- User reported the quick-expense mic button was too large and should align/orient with the Cancel and Save buttons.
- Changed `ExpenseWidgetActivity.java`:
  - Reduced mic button layout from `72dp x 72dp` to `52dp x 52dp`.
  - Reduced mic icon padding from `22dp` to `15dp`.
  - Set the actions row gravity to `CENTER_VERTICAL`.
  - Made Cancel and Save action params explicitly `52dp` tall so all three controls share the same height.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Revert Dark Compact Widget Redesign
- User requested reverting the dark compact widget redesign because it still did not look better.
- Reverted only the last widget redesign:
  - Restored `expense_widget_info.xml` to vertical-resizable widget hints with `minHeight=150dp`, `maxResizeHeight=300dp`, and `resizeMode="vertical"`.
  - Restored `ExpenseWidgetProvider.java` provider-side switching between `expense_widget` and `expense_widget_compact`.
  - Restored `expense_widget.xml` to the previous pale vertical dashboard with large text, progress bar, trend badge, and one-row category actions.
  - Restored light widget colors and button/background drawables from before the dark compact attempt.
- Kept unrelated fixes, including the native widget form keyboard-gap fix.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Dark Compact Reference-Style Widget Redesign
- User expected the Spenza widget to look at least like a provided dark compact finance widget reference.
- Changed widget sizing and rendering:
  - `expense_widget_info.xml` now requests a fixed compact 4x2-style footprint and disables widget resizing with `resizeMode="none"`.
  - `ExpenseWidgetProvider.java` now always renders `expense_widget` and no longer switches between normal/compact layouts.
  - Daily budget text is formatted as `spent / budget` on two lines for a compact finance-widget layout.
- Rebuilt `expense_widget.xml`:
  - Dark horizontal card.
  - Left side contains Spenza, Daily Budget, amount/budget, progress, and yesterday comparison.
  - Right side contains DAILY INSIGHT and a 2x2 quick-action tile grid.
  - Kept labels aligned with actual widget actions: Food, Travel, Fun, Misc.
- Changed widget drawables/colors:
  - Darkened the widget background, tile surface, pressed state, text, stroke, and progress track colors.
  - Added `spenza_widget_tile` color for action cards.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Native Widget Form Keyboard Gap Fix
- User shared a screenshot where the quick expense bottom-sheet dialog left an awkward dimmed gap above the keyboard.
- Finding:
  - `ExpenseWidgetActivity` changed the sheet `ScrollView` height to `MATCH_PARENT` when IME insets were present.
  - The sheet content stayed at the top of that full-height scroll container, leaving transparent/dimmed space between the visible sheet content and keyboard.
- Changed `ExpenseWidgetActivity.java`:
  - Kept the `ScrollView` height as `WRAP_CONTENT` while applying the IME bottom margin.
  - This keeps the sheet content bottom-anchored directly above the keyboard instead of stretching the container.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Revert Compressed Fixed-Height Widget
- User shared a device screenshot showing the fixed-height attempt looked poor and non-standard, with tiny content pinned near the top and a large empty lower area.
- Reverted the prior compressed-widget direction:
  - `expense_widget_info.xml` now uses the previous standard widget hints: `300dp` width, `150dp` minimum height, `300dp` max resize height, and `resizeMode="vertical"`.
  - `ExpenseWidgetProvider.java` restored launcher-size-based switching between `expense_widget` and `expense_widget_compact`.
  - `expense_widget.xml` restored the previous larger text/icon sizing, `12dp` root padding, vertical centering, and 64dp full-width action row.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Fixed-Height Full-Width Widget Dashboard
- User reported the widget still had top/bottom empty space, should take the full width, and should not allow user height resizing.
- Changed `expense_widget_info.xml`:
  - Locked the widget footprint to a 4x2-style `320dp x 170dp` size.
  - Set `resizeMode="none"` and made min/max resize height equal so supported launchers should not expose height resizing.
- Changed `ExpenseWidgetProvider.java`:
  - Removed launcher-size-based portrait/landscape layout switching.
  - Always renders the main `expense_widget` dashboard layout.
- Changed `expense_widget.xml`:
  - Reduced root top/bottom padding and removed vertical centering.
  - Tightened text, progress, trend, and action-row sizing so the dashboard fills the fixed height without top/bottom slack.
  - Kept all four category actions in a full-width single row.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Widget Two-State Size Hints And Single-Row Portrait Actions
- User still saw whitespace in both widget layouts and requested:
  - Only two size states: landscape and portrait.
  - Tighter spacing in both states.
  - Portrait icons in a single row instead of two rows.
  - Border around the icon only, not large action cards.
- Changed `expense_widget_info.xml`:
  - Returned resizing to vertical-only.
  - Added `maxResizeWidth` and `maxResizeHeight` hints so supported launchers are constrained closer to the two intended footprints.
  - Width is fixed by min/max resize width; height spans short landscape to taller portrait.
- Changed `expense_widget.xml`:
  - Replaced the 2x2 category grid with a compact single-row four-action layout.
  - Kept type tap targets transparent, with no full-card border/background.
  - Added small bordered icon chips for the category icons only.
- Changed `expense_widget_compact.xml`:
  - Tightened the landscape action cluster.
  - Kept icon-chip borders while reducing label/icon sizes inside the compact landscape action group.
- Changed `expense_widget_*_icon_bg.xml`:
  - Added a subtle stroke to each icon chip background.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Compact Borderless Widget Type Actions
- User reported category/type actions still used too much space in both portrait and landscape widgets, and the landscape insight area still had visible top/bottom whitespace.
- Changed `expense_widget.xml`:
  - Replaced the weighted full-height category grid with a compact fixed-height grid.
  - Removed visible bordered action-card backgrounds from category tap targets.
  - Removed icon badge backgrounds so only the category icons and labels remain, with small padding.
- Changed `expense_widget_compact.xml`:
  - Made the insight area wider than the action area.
  - Reduced action grid to a compact fixed-size 2x2 group.
  - Removed visible borders/background cards from type actions and removed icon badge backgrounds.
  - Increased spacing inside the insight stack so it uses the landscape widget height more intentionally.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Mature Portrait And Landscape Widget Styling
- User reported the Spenza widget style still looked immature and requested stricter standards:
  - Only portrait and landscape styles.
  - Both styles should cover full width.
  - No unused white space inside widgets.
  - Increase text size roughly 30%.
  - Match the app theme background.
- Changed `ExpenseWidgetProvider.java`:
  - Replaced height-only compact switching with orientation-based switching from launcher-reported widget width vs height.
  - Keeps exactly two rendered layout styles: portrait (`expense_widget`) and landscape (`expense_widget_compact`).
- Changed `expense_widget_info.xml`:
  - Enabled horizontal and vertical resizing so launchers can reach both portrait and landscape shapes.
  - Raised the minimum width/height to support the fuller dashboard layouts.
- Changed `expense_widget.xml`:
  - Rebuilt the portrait layout with larger text, larger icons, stronger hierarchy, and a weighted 2x2 action grid that fills remaining widget height.
- Changed `expense_widget_compact.xml`:
  - Rebuilt the landscape layout as a full-width split dashboard with insight content on the left and a weighted 2x2 action grid on the right.
- Changed `expense_widget_background.xml` and `values/colors.xml`:
  - Removed background drawable padding to avoid double-padding.
  - Adjusted light widget background/surface colors closer to the app theme tokens.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Native Widget Form Mic Icon And Keyboard Resize Fix
- User reported the native quick-expense form mic icon looked poor and asked to use the icon style already used in the app; screenshots also showed the keyboard still covering the form fields.
- Changed `ExpenseWidgetActivity.java`:
  - Replaced the emoji/text mic `Button` with an `ImageButton`.
  - Anchored the translucent Activity as a full-height transparent window instead of a bottom `WRAP_CONTENT` window.
  - Kept the bottom sheet visually anchored at the bottom inside a `FrameLayout`.
  - Added Android 11+ IME inset handling that lifts the sheet above the keyboard and lets the scroll view fill available height while typing.
- Added `res/drawable/ic_widget_mic.xml`:
  - Native vector mic based on the Lucide-style mic used in the Angular Daily form.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Widget Fixed Width And Compact Icon Corrections
- User reported the widget still had too much empty space, tiny icons, poor responsiveness, and horizontal resize handles.
- Changed `expense_widget_info.xml`:
  - Set `resizeMode="vertical"` so supported launchers should allow height changes only.
  - Increased/fixed `minWidth` and `minResizeWidth` to keep the widget width stable.
- Changed `ExpenseWidgetProvider.java`:
  - Raised the compact layout switch threshold so reduced-height launcher sizes activate `expense_widget_compact` sooner.
- Changed `expense_widget.xml`:
  - Removed stretch-weight behavior from the standard action grid.
  - Gave each action tile a fixed height.
  - Increased normal icon badge size to `38dp`.
- Changed `expense_widget_compact.xml`:
  - Kept the insight panel on the left and action buttons on the right.
  - Fixed the action panel width and action tile heights.
  - Increased compact icon badge size to `30dp`.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Responsive Short-Height Widget Layout
- User asked whether reducing the widget height can show a compact landscape layout like the reference image.
- Changed `ExpenseWidgetProvider.java`:
  - Added `onAppWidgetOptionsChanged()` handling.
  - Added option-based layout switching using `OPTION_APPWIDGET_MIN_HEIGHT`.
  - Uses the normal daily insight dashboard above the threshold and `expense_widget_compact` for short-height widgets.
  - Guards against launchers temporarily reporting height `0` during initial placement.
- Added `expense_widget_compact.xml`:
  - Compact horizontal dashboard with app icon, Spenza title, daily budget/spend, progress, trend, and four icon category actions.
  - Keeps the same widget action ids, so existing Food/Transport/Entertainment/Misc click behavior remains unchanged.
- Changed `expense_widget_info.xml`:
  - Added `minResizeHeight="118dp"` so launchers can reduce the widget height enough to activate the compact layout.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Compact Widget Icon Tile Styling
- User reported the daily insight widget was still too large and lacked icons in the expense type buttons.
- Changed `expense_widget.xml`:
  - Removed the Gemini/spark badge from the header.
  - Tightened spacing around the daily insight section.
  - Replaced plain text category blocks with compact icon + label tiles.
  - Increased category label size for better readability at the smaller widget footprint.
- Changed widget resources:
  - Reduced the widget provider default size from a 4x5-style request to a smaller 3x3 request in `expense_widget_info.xml`.
  - Added native vector icons for Food, Transport, Fun, and Misc.
  - Added soft category icon badge backgrounds for light and dark system themes.
  - Switched quick tiles to a lighter Spenza surface card treatment with pressed feedback.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Widget Daily Insight And Keyboard-Safe Form Redesign
- User rejected the previous widget/form styling and provided a target design:
  - Widget should look like a polished Spenza card and include daily insight.
  - Native expense form should avoid lonely black background.
  - Keyboard should not hide fields/actions.
  - Daily insight should use real app data.
- Changed `ExpenseWidgetProvider.java`:
  - Added daily insight binding from `spenza_drive_backup_snapshot_v1`.
  - Includes current-account queued widget entries from `spenza_widget_expense_queue_v1` before Drive sync completes.
  - Displays today's spend, calculated daily budget, progress percentage, and comparison with yesterday.
  - Refreshes widget immediately after a new widget expense is queued.
- Changed widget resources:
  - Resized widget target in `expense_widget_info.xml`.
  - Rebuilt `expense_widget.xml` as a daily-insight mini dashboard with Spenza header, progress bar, trend badge, and four action tiles.
  - Added progress/trend/spark drawable resources.
- Changed `ExpenseWidgetActivity.java` and native theme:
  - Added translucent `AppTheme.WidgetActivity`.
  - Added `windowSoftInputMode="adjustResize"`.
  - Changed form to a scrollable bottom sheet with lighter dim, handle, large rounded amount/comment fields, prominent mic/save controls, and quick comment chips.
  - Keeps system light/dark palette support.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Native Widget Styling And Animation Polish
- User reported the home screen widget and native amount input screen looked plain/flat and asked for impressive styling, good animation, strict Spenza theme alignment, and light/dark behavior from the system theme.
- Changed Android widget resources:
  - Added Spenza light/dark native colors in `values/colors.xml` and `values-night/colors.xml`.
  - Restyled `expense_widget.xml` with Spenza title/subtitle, glassy gradient card surface, category-colored gradient buttons, and pressed-state drawable selectors.
  - Added category gradient drawables for Food, Transport, Entertainment, and Misc.
- Changed `ExpenseWidgetActivity.java`:
  - Converted the native input UI into a themed bottom-sheet style with a dimmed backdrop.
  - Added system light/dark palette selection from `Configuration.UI_MODE_NIGHT`.
  - Added rounded Spenza-style input fields, gradient primary Save button, secondary Mic/Cancel buttons, and ripple/press feedback.
  - Added entrance animation, save exit animation, smart-fill pop feedback, and mic/listening pulse animation.
- Constraint noted:
  - Android home screen widgets are `RemoteViews`, so real continuous animation is launcher-limited; richer motion is implemented in the native Activity while the widget uses stateful drawable feedback.
- Updated `AI_RULES.md` with the native widget theme/styling rule.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Passed.

## 2026-05-25 - Widget Queue Flushes When Main App Opens
- User observed that widget-saved expenses showed the "Expense queued" toast but sometimes did not appear in the app until opening/retrying the app 2-3 times.
- Finding:
  - The widget correctly queued expenses locally.
  - Background Drive sync relied on Android WorkManager, which is network-constrained and OS-scheduled, so it can be delayed.
  - The Angular app only saw widget expenses after WorkManager eventually merged them into Drive/local snapshot.
- Changed `personal-finance-pwa/src/app/core/services/expense-store.service.ts`:
  - Added parsing for `spenza_widget_expense_queue_v1` queue items.
  - Filters queue items to the currently signed-in Google email.
  - Deduplicates entries by expense `id` against the current store.
  - Merges pending widget expenses into store state and persists through the existing serialized Drive write path.
  - Removes consumed current-account queue items while preserving queue items for other accounts.
  - Flushes the widget queue during cached startup, full Drive bootstrap, and Drive refresh.
- Behavior after fix:
  - Opening the full app after widget saves should show current-account widget expenses immediately, even if WorkManager has not yet run.
  - If Drive persistence is temporarily unavailable, entries still remain visible locally and the existing dirty backup snapshot path can retry.
- Updated `PROJECT_CONTEXT.md` and `AI_RULES.md` with the app-side queue flush rule.
- Verification:
  - Ran `npm run build`.
  - Passed.

## 2026-05-25 - Native Android Home Screen Quick Expense Widget
- User requested a reliable native Android home screen widget because PWA app widgets were limited/unreliable.
- Requirements:
  - Show 4 category buttons: Food, Transport, Entertainment, Miscellaneous.
  - Open a native Android amount input with mic comments.
  - Use Gemini AI to extract expense details from comments like the app flow.
  - Save confirmed expense to a local queue.
  - Sync queued expenses to Google Drive API when network is available.
  - Avoid full app launch by using a lightweight native Activity.
  - Avoid re-login by reusing existing auth token from Capacitor Preferences.
- Changed Android native project:
  - Added `ExpenseWidgetProvider` with a 4-button `RemoteViews` widget.
  - Added `ExpenseWidgetActivity` for standalone native amount/comment/mic input without launching the WebView app.
  - Added Android `SpeechRecognizer` voice capture; if `spenza_ai_settings_private` contains a user Gemini key, it calls the existing production `parse-voice-expense` Netlify function and applies parsed amount/date/category/comment.
  - Added `WidgetExpenseQueue` storing queued items in Capacitor Preferences key `spenza_widget_expense_queue_v1`.
  - Added `WidgetExpenseSyncWorker` using WorkManager network constraints to merge queued expenses into the active Drive backup JSON by `id`.
  - Added `WidgetExpenseConstants` and `WidgetExpenseUtils` for storage keys, canonical category mapping, entry construction, local date, daily limit calculation, and cached snapshot updates.
  - Added widget resources: `expense_widget.xml`, `expense_widget_info.xml`, and widget background/button drawables.
  - Added WorkManager dependency to `android/app/build.gradle`.
  - Registered `ExpenseWidgetActivity` and `ExpenseWidgetProvider` in `AndroidManifest.xml`.
- Changed `personal-finance-pwa/src/app/core/services/auth.service.ts`:
  - Native sign-in stores the latest short-lived Google access token and expiry in Capacitor Preferences keys `gapi_access_token` and `gapi_access_token_expires_at`.
  - Sign-out and scope-version mismatch clear those token-cache keys.
- Safety/isolation decisions:
  - Widget queue saves locally first and never blocks confirmation on Drive/network.
  - Widget queue entries are tagged with the Google email active at queue time and are not synced into another active account after account switching.
  - If token is missing/expired/rejected, the worker keeps the queue and retries later instead of launching the app or prompting login.
  - Feature is removable by disabling/removing `ExpenseWidgetProvider` and `ExpenseWidgetActivity` manifest entries plus the `WidgetExpense*` classes/resources.
- Updated `PROJECT_CONTEXT.md` and `AI_RULES.md` for the native widget architecture and native-only token-cache exception.
- Verification:
  - Ran `./gradlew :app:assembleDebug`.
  - Ran `npm run build`.
  - Both passed.

## 2026-05-25 - Settings Sign-Out Clears Local Session And Leaves Guarded Route
- User reported a critical bug: pressing Sign out in Settings left the user on the Settings screen and should wipe all local cache/supporting local files for the logged-in account.
- Findings:
  - `SettingsComponent.onSignOut()` only called `authService.signOut()` and relied on auth guards during a later route access.
  - This meant a signed-out user could remain on `/settings`.
  - The earlier account-switch cleanup existed, but explicit sign-out did not clear the active backup snapshot, backup-mode cache, offline queue, Daily draft, AI local key/cache, notification state, or all local preferences in one place.
  - Web sign-out cleared local auth state only after the Google script was available, so a GSI script/revoke edge case could delay local sign-out.
- Changed `personal-finance-pwa/src/app/core/services/auth.service.ts`:
  - Web sign-out now clears local auth state immediately, then attempts Google token revocation as best-effort.
- Changed `personal-finance-pwa/src/app/core/services/ai-settings.service.ts`:
  - Added `clearLocalState()` to remove private AI key/settings and weekly insight cache/usage while resetting service signals.
- Changed `personal-finance-pwa/src/app/features/settings/settings.component.ts`:
  - Sign-out now disables push notification state, cancels local reminders, signs out auth, clears local expense state, clears Daily draft, clears offline queue, removes active backup snapshot, clears backup-mode/config cache, clears AI settings/cache, clears Capacitor Preferences, and navigates to `/auth/callback` with `replaceUrl`.
- Updated `PROJECT_CONTEXT.md` and `AI_RULES.md` with explicit sign-out cleanup rules.
- Verification:
  - Ran `npx vitest run src/app/core/guards/auth.guard.spec.ts src/app/features/auth/auth-flow.integration.spec.ts src/app/features/settings/settings.component.spec.ts`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-25 - Google Account Switch Cache Isolation
- User asked what happens if a user signs in with a different Google email and reported abnormal behavior, including restarting the setup cycle even though that account has a Spenza folder in Drive.
- Findings:
  - Before this fix, explicit sign-in replaced the token/email but did not reliably clear account-scoped local backup-mode cache or the active local backup snapshot.
  - The fast-startup snapshot added earlier was not tied to a Google email.
  - On account switch, Spenza could briefly reuse the previous account's cached mode/file/snapshot before the newly selected account's Drive config was fully loaded.
  - If the new account had its own Spenza folder/config, stale local cache could still steer startup into the wrong setup branch first.
- Changed `personal-finance-pwa/src/app/core/services/auth.service.ts`:
  - Explicit sign-in now returns the signed-in email and whether it differs from the previously stored email.
- Changed `personal-finance-pwa/src/app/core/services/backup-mode.service.ts`:
  - Added `clearLocalCacheForAccountSwitch()` to clear local mode/shared-file/folder/role/config-ID state without writing anything to Drive.
- Changed `personal-finance-pwa/src/app/core/services/expense-store.service.ts`:
  - Local backup snapshots now include `userEmail`.
  - Cached startup refuses snapshots whose email does not match the restored signed-in email.
  - Older snapshots without an email are skipped once a current email is known.
  - Added `clearLocalBackupCache()` and made `clearLocalData()` reset `driveFileId`.
- Changed `personal-finance-pwa/src/app/features/auth/auth-callback.component.ts` and `personal-finance-pwa/src/app/features/settings/settings.component.ts`:
  - When explicit sign-in switches Google email, Spenza clears account-scoped local state and force-loads the new account's Drive config before loading backup data.
- Updated `PROJECT_CONTEXT.md` and `AI_RULES.md` with account-scoped local cache behavior.
- Verification:
  - Ran `npx vitest run src/app/core/guards/auth.guard.spec.ts src/app/features/auth/auth-flow.integration.spec.ts`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-25 - Fast Startup From Local Drive Backup Cache
- User reported an uncomfortable boot/sign-in experience:
  - Spenza appeared to require Google sign-in every time.
  - Sign-in often showed Retry and took too long.
  - User expected the app to open immediately and do Google/Drive work after startup.
- Findings:
  - `AuthService` restored local signed-in state, but web access tokens are memory-only and disappear after app/browser restart.
  - A silent web token refresh failure cleared persisted auth state, which made a returning user look fully signed out.
  - `App.bootstrapData()` and `setupGuard` redirected to `/auth/callback` whenever the restored web session had no live token.
  - `ExpenseStore` had no local Drive backup snapshot, so the boot screen had to wait for Drive config plus Drive backup load before rendering user data.
- Changed `personal-finance-pwa/src/app/core/services/auth.service.ts`:
  - Silent web token refresh errors no longer clear persisted auth state.
- Changed `personal-finance-pwa/src/app/core/guards/setup.guard.ts`:
  - Removed the redirect to `/auth/callback` that was based only on a missing in-memory web token.
- Changed `personal-finance-pwa/src/app/core/services/expense-store.service.ts`:
  - Added local active-backup snapshot storage under `spenza_drive_backup_snapshot_v1`.
  - Remote Drive reads and successful writes refresh the local snapshot.
  - App startup can hydrate expenses, limits, income, receipt folder, file ID, and modified time from the local snapshot.
  - Local changes are cached as dirty before Drive persistence; successful Drive writes clear the dirty marker.
  - Dirty cached snapshots are flushed to Drive before the next remote backup read.
- Changed `personal-finance-pwa/src/app/app.ts`:
  - Returning users with local auth, complete local backup-mode config, and a matching local backup snapshot enter the app from cached data immediately.
  - Drive config/data bootstrap runs in the background after cached startup.
  - Background Drive failures after cached data has rendered no longer replace the app with the loading retry screen.
- Updated `PROJECT_CONTEXT.md` with the local cached backup startup architecture.
- Updated `AI_RULES.md` with the new auth/session and cached-backup startup rules.
- Verification:
  - Ran `npx vitest run src/app/core/guards/auth.guard.spec.ts src/app/features/auth/auth-flow.integration.spec.ts`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-23 - Weekly AI Credit Optimization And Language-Switch Hardening
- User felt Gemini credits were draining faster after enhancing weekly insights and reported that AI insights sometimes did not work after language changes.
- Findings:
  - Enhanced anomaly/what-if/seasonality prompts were legitimately heavier than the old on-device-like insight prompt.
  - Dashboard was sending a large 90-day category daily vector including empty days, plus broad baseline/seasonality/intent arrays.
  - `generate-insights` allowed up to 2600 output tokens and asked for 35-70 words per detail.
  - `AiInsightService` counted usage only after a successful Gemini response, so failed/malformed/rate-limited attempts could be retried and still drain credits.
  - `generate-insights` retried alternate Gemini models after a 429 response, which is wasteful when the user key is already quota/rate limited.
  - Settings cleared all weekly AI cache/usage on language change, forcing fresh calls and making language switches more likely to hit quota.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Weekly AI now allows 1 fresh Gemini call per locale per day and 2 total fresh weekly-insight calls per day across locales.
  - Counts a weekly Gemini attempt before the fetch call.
  - Changed-input requests after same-locale cap can reuse same-locale fallback cache instead of calling Gemini again.
  - Preserves rate-limit status behavior.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Compacted Dashboard weekly AI payload:
    - Top expenses 5 -> 3.
    - Recent category trend 90 days -> 46-day window and only non-empty days.
    - Budget usage 8 -> 6.
    - Repeated expenses 6 -> 4.
    - Partner activity 6 -> 3.
    - Category baselines 10 -> 6.
    - Budget intent 12 -> 8.
    - Monthly seasonality 12 -> 6.
    - What-if cuts 8 -> 5.
- Changed `personal-finance-pwa/netlify/functions/generate-insights.ts`:
  - Reduced requested detail length from 35-70 words to 20-40 words.
  - Lowered `maxOutputTokens` from 2600 to 1400.
  - Stopped retrying alternate Gemini models after 429 quota/rate-limit responses; fallback model attempts remain only for 404 model availability.
- Changed `personal-finance-pwa/src/app/features/settings/settings.component.ts`:
  - Removed weekly AI cache/usage clearing from language changes.
  - Locale-aware signatures remain responsible for preventing wrong-language cached responses.
- Updated `AI_RULES.md` with the new weekly AI caps, attempt-counting, compact payload, concise output, and language-switch cache rules.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-23 - Dashboard AI Android Scroll, Rate Limit, Route Scroll, And Daily Drafts
- User reported five existing issues:
  - Android Dashboard AI auto-scroll did not work while web did.
  - Rapid repeated taps on `Ask AI` were possible before visible loading began.
  - Gemini credit/rate limit responses were shown as a plain generic unavailable message.
  - Every page switch should start at scroll top `0`.
  - Unsaved Daily expense form data was lost when navigating away.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Added an early `aiInsightLoading` guard before async API-key/cache checks.
  - Dashboard now sets loading state immediately when starting AI refresh, preventing duplicate request starts.
  - Reworked Gemini block scrolling to compute document top from the current scroll offset and write to `window`, `document.documentElement`, and `document.body`.
  - Added delayed correction passes to improve Android/Capacitor WebView reliability after smooth scrolling/rendering.
  - Renders a specific rate-limit status panel when AI service returns `rate-limit`.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Added `rate-limit` to `AiInsightResultSource`.
  - Parses failed function responses for `RATE_LIMIT`, quota, rate-limit, or too-many-requests signals.
  - Returns a retry/reset label for client-side daily limit or upstream quota exhaustion.
- Changed `personal-finance-pwa/netlify/functions/generate-insights.ts`:
  - Gemini 429/rate-limit failures now return HTTP 429 with `code: RATE_LIMIT` metadata instead of falling back to a generic 200/local response.
- Changed `personal-finance-pwa/src/app/app.ts`:
  - Added root `NavigationEnd` handling to reset page scroll top to `0` on every route switch.
- Added `personal-finance-pwa/src/app/core/services/daily-expense-draft.service.ts`.
- Changed `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.ts`:
  - Restores in-memory Daily expense drafts on page re-entry.
  - Saves category, amount, date, comment, split bill mode, and split rows while the user edits.
  - Clears the draft after create, update, or split-bill save.
  - Recalculates remaining limit when a restored draft has a selected category/date.
- Updated English, Tamil, Hindi, and fallback i18n copy for AI credit-limit messaging.
- Updated `AI_RULES.md` with Android-safe AI scroll, duplicate-tap prevention, rate-limit messaging, route scroll-top, and Daily draft rules.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-23 - Dashboard View AI Exact Block-Top Scroll
- User asked to make sure clicking `View AI` changes scroll position so the Gemini insight block is at the top.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Removed the sticky-header offset from Dashboard AI scroll positioning.
  - `scrollToGeminiInsights()` now targets the Gemini block’s exact document top.
  - Added a post-smooth-scroll correction that snaps to the exact block top if the browser lands more than 2px away.
- Updated `AI_RULES.md` with the exact block-top scroll rule.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npm run build`.
  - Both passed.

## 2026-05-23 - Dashboard AI Scenario Flow Alignment
- User described the desired Dashboard AI flow:
  - Fresh Dashboard with no previous AI response should show `Ask AI` and call `generate-insights` on tap.
  - After the response, it should save and auto-scroll to Gemini insights.
  - Re-entering Dashboard with unchanged expense data should show `View AI`, not `Ask AI`.
  - Pressing `View AI` should only scroll to the saved Gemini response.
  - Expense log updates should invalidate the previous AI response and make the next `Ask AI` call Gemini.
  - App language changes should delete previous AI response state; the new language starts with `Ask AI`, calls Gemini fresh on tap, saves, and scrolls.
- Current mismatch found:
  - Dashboard did not hydrate a matching saved response on entry, so the button could show `Ask AI` even when a valid saved response existed.
  - Language changes did not explicitly clear weekly AI cache/usage, so old response state could survive contrary to the requested flow.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Added cache hydration for the current normalized AI payload.
  - If a matching saved Gemini response exists, Dashboard loads it into the Gemini section and the button shows `View AI`.
  - If the normalized payload changes because expenses changed, Dashboard clears displayed Gemini output and status.
  - Hydration is request-token guarded so stale async cache checks cannot reapply old content.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Added `clearWeeklyInsightState()` to remove saved weekly insight cache and usage metadata.
- Changed `personal-finance-pwa/src/app/features/settings/settings.component.ts`:
  - On actual app language changes, clears weekly AI cache and usage before saving the new language.
  - Re-selecting the already active language does not clear AI state.
- Updated `personal-finance-pwa/src/app/core/services/ai-insight.service.spec.ts`:
  - Added coverage that clearing weekly insight state removes cache/usage and causes the next same-payload request to call Gemini again.
- Updated `AI_RULES.md` with Dashboard AI hydration, expense invalidation, and language-reset rules.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npm run build`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - All passed.

## 2026-05-23 - Dashboard AI English Scroll And Touch Hover Fix
- User reported that automatic scroll still failed in English, while other languages scrolled after the response, and that the AI button stayed visually pressed on touch screens until tapping outside.
- Root cause:
  - The Dashboard AI button still had mobile `hover:` and `group-hover:` classes. On touch browsers, hover state can latch even after `blur()`, making the button look stuck.
  - AI scroll still depended on a `ViewChild` plus `scrollIntoView()` timing. Cached/immediate English responses can render on a different timing path from fresh localized responses, so the single scroll path was still fragile.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Added `pointerdown`, `pointerup`, `pointercancel`, and `pointerleave` handlers to release the AI button state.
  - Kept the release handler public for Angular strict templates.
  - Made button hover/glow/lift desktop-only with `min-[887px]:hover:*`.
  - Replaced mobile sticky hover behavior with a short `active:scale-[0.98]` press state.
  - Added a stable `id="gemini-insights-block"` to the Gemini section.
  - Replaced `scrollIntoView()`-only behavior with offset-based `window.scrollTo()` using the sticky header height.
  - Scroll now retries through delayed animation frames and can find the target by either `ViewChild` or DOM id.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npm run build`.
  - Both passed.

## 2026-05-23 - Dashboard AI Language Toggle API Gate Fix
- User reported that English Dashboard AI showed “AI could not generate deep dives,” while changing to another language worked, then switching back to English failed again.
- Root cause:
  - `AiInsightService` stored only one weekly AI cache entry under `ai_weekly_insight_cache_v1`.
  - A successful Tamil/Hindi response could overwrite an earlier English response.
  - The daily usage gate was global, so if the current language had no matching cache and the global count was exhausted, the service returned `none` before calling `fetch('/generate-insights')`.
  - This produced the unavailable panel even though the user expected a fresh English API call or the previous English response.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Replaced single-entry cache handling with a versioned cache store containing up to 12 recent entries.
  - Preserved backward compatibility with the old single-entry cache shape.
  - Exact cache reuse now searches the cache history for the matching normalized payload, including locale.
  - Stale fallback cache now searches only same-locale entries.
  - Usage counts are now tracked per locale through `localeCounts`, while keeping the existing total `callCount` metadata.
  - A daily limit reached in Tamil/Hindi no longer blocks an English API call.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - AI scroll now retries for several animation frames if the Gemini/status block is not available immediately on mobile.
- Updated `personal-finance-pwa/src/app/core/services/ai-insight.service.spec.ts`:
  - Added coverage that switching English -> Tamil -> English reuses the correct English cached result instead of calling the API or failing.
  - Added coverage that another language’s daily limit does not prevent a fresh English API call.
- Updated `AI_RULES.md` with the per-locale cache history and per-locale usage-gate rules.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npm run build`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - All passed.

## 2026-05-23 - Dashboard AI Mobile Touch, Scroll, And Locale Cache Fix
- User reported mobile Dashboard AI behavior issues:
  - The AI button looked bumped/held after touch instead of releasing normally.
  - `View AI` did not reliably scroll to the AI response after fresh generation, though language changes caused scrolling.
  - Changing app/system language could still show a previous saved AI response, making it unclear whether Gemini was called fresh or cached content was reused.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - AI button click now receives the event and blurs the tapped button immediately to clear stuck mobile touch/focus styling.
  - Removed the always-on small-screen hover lift from the AI button; the lift remains only at desktop breakpoint.
  - AI scroll now waits for two animation frames before calling `scrollIntoView`, giving Angular/mobile layout time to render the Gemini/status block.
  - Final fresh/cache/unavailable AI scroll happens after `aiInsightLoading` is cleared so the user lands on the actual result/status block.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Added `locale` to the weekly insight cache signature fallback metadata.
  - Reusable cache still requires the full normalized payload signature to match.
  - Stale fallback cache is now allowed only when the cached response locale matches the requested locale.
  - If app language changes and daily call limit is reached, the service returns no AI result instead of showing previous-language content.
- Updated `personal-finance-pwa/src/app/core/services/ai-insight.service.spec.ts`:
  - Added coverage that changing only locale calls Gemini again when usage allows.
  - Added coverage that previous-language fallback cache is not shown when daily usage is exhausted.
- Updated `AI_RULES.md` with the locale-safe fallback cache rule.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-23 - Dashboard AI Scroll, Localization, And API-Key Guidance
- User reported that after tapping `View AI`, they still had to scroll manually to see the Gemini response.
- User also asked for Gemini responses to be more detailed, to match the selected app language, and to guide users who have not added a Gemini API key.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Added a `ViewChild` target for the Gemini deep-dive section.
  - Tapping `Ask AI`/`View AI` now scrolls the Gemini section into view after cached, fresh, unavailable, or missing-key output is shown.
  - If a Gemini response is already visible for the current payload, `View AI` scrolls to it instead of doing more work.
  - Added a missing-key panel with a Settings link explaining that a Gemini key unlocks AI deep dives, receipt smart-fill, and voice expense smart-fill.
  - Split AI status into title/detail/needs-key signals so unavailable and missing-key states can be rendered as useful panels instead of terse text.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Added `getAvailability()` so Dashboard can detect missing/disabled Gemini key before attempting cache/API generation.
- Changed `personal-finance-pwa/netlify/functions/generate-insights.ts`:
  - Prompt now tells Gemini to write section titles/details in the selected app locale.
  - Structured labels remain fixed English enum values for response parsing.
  - Detail guidance increased from very brief responses to richer 35-70 word explanations when enough data exists.
  - Increased Gemini max output tokens and normalized detail length allowance.
- Updated fallback, English, Tamil, and Hindi translations for API-key guidance and unavailable AI panels.
- Updated `AI_RULES.md` to record Dashboard AI scroll, missing-key guidance, and localized Gemini response rules.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts src/app/features/dashboard/dashboard.component.spec.ts`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-22 - Dashboard AI Deep Dives Become User-Triggered
- User reported Gemini was being triggered on Dashboard landing and asked to protect AI credits.
- Product decision:
  - Dashboard should render on-device/local insights by default.
  - Gemini deep dives should appear only after the user taps an impressive AI button in the insight card header.
  - Before any API call, the app must check whether the previous Gemini response still matches the current expense-derived insight input.
  - If no expense/log-derived input change happened, show the previous saved Gemini response instead of calling the API.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Removed the auto-generation effect that called Gemini whenever the Dashboard insight payload changed.
  - Added a styled top-right AI button with loading/review states.
  - Button click first checks `getReusableCachedWeeklyInsights()`.
  - Unchanged cached responses are displayed immediately with no Gemini call.
  - If there is no matching cached response, the existing `generateWeeklyInsightsWithSource()` path is used, preserving daily usage limits and fallback behavior.
  - If expenses change after AI output is shown, the stale Gemini section is cleared so the Dashboard returns to local-only until the user taps AI again.
- Updated English, Tamil, Hindi, and fallback i18n copy for the AI button and cache/fresh/unavailable status messages.
- Updated `AI_RULES.md` to make Dashboard Gemini deep dives explicitly user-triggered and cache-first.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts src/app/features/dashboard/dashboard.component.spec.ts`.
  - Ran `npm run build`.
  - Both passed.

## 2026-05-22 - Hybrid Local/Gemini Dashboard Insights
- User pointed out that on-device and Gemini weekly insights felt too similar, making the Gemini API key feel unnecessary.
- Product decision:
  - Keep deterministic local insights as the "what happened" weekly summary.
  - Use Gemini as a separate hybrid deep-dive lane for work local rules do not handle well: anomaly explanation, cross-category behavior hacks, what-if simulations, seasonal timing, and budget intent vs reality.
  - Continue excluding expense comments from weekly AI prompts for privacy.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Local insight cards now always remain visible as the primary weekly summary.
  - Gemini results render in a visually separate "Gemini deep dives" section instead of replacing local sections.
  - Dashboard shows a Hybrid badge when Gemini deep dives are available.
  - Expanded the AI payload with 90-day category daily vectors, 13-week category baselines/z-scores, budget intent vs actuals, monthly seasonality, what-if cut candidates, and monthly income.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Extended `AiInsightPayload` to support hybrid deep-dive inputs.
  - Existing cache and daily call-limit behavior remains unchanged.
- Changed `personal-finance-pwa/netlify/functions/generate-insights.ts`:
  - Gemini schema now returns five deep-dive sections: Anomaly, Behavior hack, What if, Seasonal timing, Intent check.
  - Prompt now explicitly avoids repeating local totals and focuses on deeper synthesis.
- Updated English, Tamil, Hindi, and fallback i18n copy for hybrid/Gemini deep-dive UI.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts src/app/features/dashboard/dashboard.component.spec.ts`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build`.
  - All passed.

## 2026-05-22 - Toast Clearance And Language Settings Polish
- User shared a mobile Settings screenshot where the success toast was hidden behind the floating bottom navigation and the language selector looked too plain.
- Changed `personal-finance-pwa/src/app/shared/components/toast/toast.component.ts`:
  - Raised the root toast above the mobile nav with `bottom-[calc(6.25rem+env(safe-area-inset-bottom))]`.
  - Increased toast stacking to `z-[70]`.
  - Kept desktop toast placement at bottom-right.
- Changed `personal-finance-pwa/src/app/features/settings/settings.component.ts`:
  - Replaced the plain app-language native select with themed language option cards.
  - Cards support selected state with primary border, accent background, glow, gradient badge, and check indicator.
  - Restyled the voice input language area into a gradient-accented preview panel matching the app’s light/dark themes.
- Verification:
  - Ran `npm run build` in `personal-finance-pwa`.
  - Build passed.

## 2026-05-22 - Voice Expense Smart-Fill And Clear Comment
- User asked for a clear button on the Daily comment input and asked whether AI could support voice expense logging in English, Hindi, and Tamil/native tone:
  - User speaks an expense.
  - Browser speech recognition converts it to plain text.
  - The transcript is sent to AI.
  - AI returns JSON fields including expense type based on spoken items.
- Changed `daily-expense.component.ts`:
  - Added an inline clear-comment button that appears only when comment text exists.
  - Replaced the unsupported browser `alert()` path with `UserFeedbackService`.
  - Existing mic flow still appends transcript to comments.
  - Added AI parsing after transcript capture.
  - Applies parsed `amount`, `date`, matched category/type, and cleaned comment to the form for user review.
  - Keeps transcript in comments and shows fallback feedback when AI is disabled, missing a key, unavailable, or cannot parse.
- Added `AiVoiceExpenseService`:
  - Loads `AiSettingsService`.
  - Requires user-key Gemini mode.
  - Calls `/.netlify/functions/parse-voice-expense` on web and `environment.netlifyFunctionsUrl` on native.
- Added `parse-voice-expense` Netlify function:
  - Accepts transcript, locale, currency, categories, and today.
  - Uses Gemini structured JSON output.
  - Normalizes amount/date/category/comment/confidence/readable.
  - Prompts for English, Hindi, Tamil, and mixed native phrasing.
  - Keeps categories constrained to the app’s current allowed category list.
- Updated fallback, English, Tamil, and Hindi translations for:
  - Clear comment.
  - Voice unsupported title.
  - Voice parsing progress.
  - AI fallback and successful form-fill feedback.
- Verification:
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-21 - Save Acknowledgments And Plain-Language Guidance
- User reported that saving limits and other fields gave no clear acknowledgment, and that generic error toasts are not enough for nontechnical users.
- Product decision:
  - Add a shared app-wide feedback surface for success, warning, info, and guided error messages.
  - Show success only after the Drive persistence path completes for Drive-backed save operations.
  - Use plain next-step guidance when validation or persistence fails.
- Added `personal-finance-pwa/src/app/core/services/user-feedback.service.ts`:
  - Holds the current feedback message with tone, title, detail, and persistence behavior.
  - Provides `success`, `info`, `warning`, `error`, and `dismiss` helpers.
- Updated `personal-finance-pwa/src/app/shared/components/toast/toast.component.ts`:
  - Generalized the root toast from error-only to success/info/warning/error.
  - Drive and Sheets failures now include user-oriented guidance, e.g. check connection, Drive permissions, family folder sharing.
  - Family backup 403 still shows the switch-to-single action.
- Updated Drive-backed store mutation methods in `expense-store.service.ts`:
  - `addEntry`, `addEntries`, `updateEntry`, `deleteEntry`, `setLimitsAndIncome`, and `patchReceiptFolderId` now return promises that complete after Drive persistence.
  - Callers can now acknowledge confirmed saves instead of optimistic local state only.
- Updated Daily expense flow:
  - Create, update, split bill save, and delete now show success messages.
  - Invalid submissions now explain what fields to fix.
  - Save/delete failures now explain that the expense was not saved/deleted and what to check.
- Updated Limits flow:
  - Invalid income/custom category and unbalanced allocation cases show guidance.
  - Successful limit saves acknowledge that monthly income and category limits were saved to Drive.
  - Failed limit saves show next-step guidance.
- Updated Settings flow:
  - Added acknowledgments/guidance for theme, language, currency, AI settings/API key, receipt folder setup, push/local notifications, daily reminder time, budget warnings, test notification, backup export, JSON restore, Sheets import, local cache clear, copied IDs, and backup file rotation.
  - Replaced the test-notification browser `alert()` with app feedback.
- Verification:
  - Ran `npx vitest run src/app/features/expense-limit/expense-limit.component.spec.ts src/app/features/daily-expense/daily-expense.component.spec.ts src/app/features/settings/settings.component.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-21 - Default Budget Recommendations Match 50/30/20
- User reported that saving untouched default limits showed the “Low Savings Warning,” which felt unfair because the system defaults should already follow advisor-style 50/30/20 guidance.
- Root cause:
  - `CATEGORY_DEFS.recommendedPct` totaled 100 overall, but Savings + Growth totaled only 17%.
  - `ExpenseLimitComponent` warns when Savings + Growth is below 20%, so the untouched default configuration triggered the warning.
- Changed `personal-finance-pwa/src/app/core/models/category-definitions.ts`:
  - Rebalanced default recommendations to Needs 50%, Wants 30%, Savings + Growth 20%, Buffer 0%.
  - New default category percentages:
    - Housing 30, Food & Groceries 10, Transportation 5, Utilities 3, Healthcare 2.
    - Entertainment 6, Dining Out 7, Shopping/Clothing 7, Personal Care 5, Subscriptions 5.
    - Savings/Emergency Fund 12, Investments 6, Education 2.
    - Miscellaneous 0.
- Updated `category-definitions.spec.ts`:
  - Added explicit group-total coverage for the 50/30/20 default rule.
- Verification:
  - Ran `npx vitest run src/app/core/models/category-definitions.spec.ts src/app/features/expense-limit/expense-limit.component.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-21 - Monthly Income Gate Before Expense Tracking
- User reported that 50/30/20 budget logic becomes meaningless when users start tracking with `monthlyIncome = 0`, because percentages and insights all collapse to 0%.
- Product decision:
  - Treat monthly income as required onboarding before expense tracking and budget analytics.
  - Reuse the existing Limits page as the gate so the user can set income and budget percentages in one place.
  - Keep Settings reachable during the gate so users can restore/import existing backup data if needed.
- Changed routing/bootstrap:
  - Added `personal-finance-pwa/src/app/core/guards/setup-income-gate.ts` with a pure predicate for income-gated routes.
  - Updated `setupGuard` so `/daily`, `/monthly`, and `/dashboard` redirect to `/limits?onboarding=income` after Drive backup data is loaded and monthly income is still missing.
  - Updated app bootstrap so first-time setup completion navigates zero-income users to Limits instead of Daily.
- Changed Limits UI:
  - Added a prominent onboarding banner: “Set your monthly income to unlock budgeting.”
  - Disabled saving while the limits form is invalid, so an empty income cannot be saved through the primary action.
  - Added English, Tamil, Hindi, and fallback i18n copy.
- Added tests:
  - `setup.guard.spec.ts` verifies the pure income-gate behavior, including no redirect before Drive data loads, gated route redirects, Settings/Limits availability, and configured-income access.
- Verification:
  - Ran `npx vitest run src/app/core/guards/setup.guard.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-20 - Category Definitions Become Single Source Of Truth
- User identified duplicate category definitions between `expense-type.constants.ts` and `category-definitions.ts`, including mismatched recommended percentages, and asked to keep `category-definitions.ts` as the more complete source.
- Changed `personal-finance-pwa/src/app/core/models/category-definitions.ts`:
  - Made `CATEGORY_DEFS` authoritative for predefined expense type names, category IDs, icon/color metadata, budget group, and recommended percentage.
  - Changed `Savings/Emergency` to canonical stored type name `Savings/Emergency Fund` to preserve existing expense/limit data compatibility.
  - Adjusted recommended percentages so the authoritative category set totals 100 while retaining Housing at 30.
  - Added derived exports:
    - `PREDEFINED_EXPENSE_TYPES`
    - `DEFAULT_BUDGET_PERCENTAGES`
    - `budgetGroupToBudgetCategory()`
    - `getCategoryDefByName()`
    - `getCategoryIdByName()`
    - `getCategoryNameById()`
- Removed `personal-finance-pwa/src/app/core/models/expense-type.constants.ts`.
- Updated category consumers:
  - `index.ts` now exports `category-definitions`.
  - Daily, Monthly, Dashboard, and Limits no longer maintain local hardcoded `TYPE_TO_CAT_ID` / `CAT_ID_TO_TYPE` maps.
  - Specs now import predefined/default category data from `category-definitions.ts`.
- Added `personal-finance-pwa/src/app/core/models/category-definitions.spec.ts` to verify derived exports, lookups, and 100% default allocation.
- Verification:
  - Ran `npx vitest run src/app/core/models/category-definitions.spec.ts src/app/features/expense-limit/expense-limit.component.spec.ts src/app/features/daily-expense/daily-expense.component.spec.ts src/app/features/monthly-expense/monthly-expense.component.spec.ts src/app/features/dashboard/dashboard.component.spec.ts src/app/core/services/expense-store.service.spec.ts src/app/core/services/receipt-extraction.service.spec.ts src/app/core/models/expense-entry.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-20 - Split Bill UI Theming And Alignment
- User reported the split bill screen looked too simple and asked for more impressive styling that matches both light and dark themes, with aligned select/input/buttons.
- Changed `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.ts`:
  - Replaced the plain bordered split bill box with a themed card using app tokens, dark-mode-friendly backgrounds, soft gradient header, shadow, and receipt split icon treatment.
  - Added total and split amount summary chips.
  - Converted each split row into a compact card with aligned category select, amount input, remove button, and note field.
  - Added category icons inside the select wrapper and a custom chevron while preserving the explicit selected option binding for native/mobile select reliability.
  - Improved add/remove button styling and total mismatch presentation.
  - Added a `splitBillSubtitle` computed translation helper.
- Updated translations:
  - Added split bill title, subtitle, category/amount labels, and remove-row aria label to fallback translations and `en`, `ta`, `hi` JSON files.
- Verification:
  - Ran `npx vitest run src/app/features/daily-expense/daily-expense.component.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-20 - Export Backup JSON Instead Of CSV
- User reported the Export CSV button was not working and asked to export the backup JSON instead so users can store a local backup file.
- Root issue:
  - The existing Settings export path only serialized expense entries to CSV.
  - CSV export omitted backup metadata, limits, currency, receipt folder ID, and did not match the existing JSON restore path.
- Changed `personal-finance-pwa/src/app/features/settings/settings.component.ts`:
  - Replaced `onExportCsv()` with `onExportBackupJson()`.
  - Export now downloads a restore-compatible JSON document with:
    - `version: '1.0'`
    - `lastUpdated`
    - `metadata.monthlyIncome`
    - `metadata.currency`
    - optional `metadata.receiptFolderId`
    - `expenses`
    - `limits`
  - Download file name is `spenza-backup-YYYY-MM-DD.json`.
  - Removed the old CSV serialization helper.
- Updated copy:
  - Data-management description now says backup file export.
  - Button label now says Export backup JSON in fallback translations and `en`, `ta`, `hi`.
- Updated tests:
  - Replaced CSV export property coverage with backup JSON shape/round-trip coverage.
  - Refreshed stale Settings source-text assertions to match the current component text.
- Verification:
  - Ran `npx vitest run src/app/features/settings/settings.component.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-20 - Closed-App Daily Reminder Uses Push Fallback
- User reported that local notifications only trigger when entering the app, not when the app is closed, and asked why AI tips were not appearing in push notifications.
- Root cause / behavior clarification:
  - The web/PWA local notification fallback uses `setTimeout`, which cannot run after the browser/app process is closed; it resumes only when the app is opened again.
  - Native Capacitor local notifications can schedule with the OS, but web/PWA closed-app delivery needs push.
  - Push reminders already use deterministic money-tip copy in source code, not Gemini-generated AI, to avoid unwanted AI credit usage.
- Product decision:
  - Keep local notification scheduling for on-device/native behavior.
  - Add FCM push as the closed-app fallback for the user-selected daily reminder time.
  - Continue using static deterministic money tips for notification text; do not call Gemini for reminders.
- Changed client code:
  - `SettingsComponent` now syncs daily reminder enable/disable and time changes to `NotificationService`.
  - `NotificationService` and `FcmService` now pass optional daily reminder preferences when registering the FCM token.
- Changed backend code:
  - `register-token` stores `dailyReminderEnabled`, `reminderHour`, and `reminderMinute`.
  - `send-reminders` runs every minute and uses selected daily reminder slots when preferences exist.
  - Existing hourly 08:00-22:00 behavior remains for older push-only registrations without daily reminder preferences.
  - `scheduler-utils` added `getDailyReminderSlot()`.
- Verification:
  - Ran `npx vitest run netlify/functions-tests/scheduler-utils.test.ts netlify/functions-tests/reminder-messages.test.ts src/app/core/services/notification.service.spec.ts src/app/core/services/fcm.service.spec.ts`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - All passed.

## 2026-05-20 - Split Bill Dropdown Shows Actual AI-Selected Type
- User reported that split bill saving worked correctly by AI-specified expense type, but every split row dropdown visually showed `Housing`.
- Root cause:
  - Split row state already held the correct `row.type`, and save used that state.
  - The native/mobile `<select>` UI was not reliably reflecting the bound select value inside repeated split rows, so it visually fell back to the first option.
- Changed `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.ts`:
  - Added explicit `[selected]="cat.name === row.type"` on split bill row options.
  - Changed split mode submit button text from category-based fallback (`Log Miscellaneous`) to `Log split bill`.
- Updated translations:
  - Added `daily.receipt.split.logSplit` to `en`, `ta`, `hi`, and fallback translations.
- Verification:
  - Ran `npx vitest run src/app/features/daily-expense/daily-expense.component.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-20 - Receipt Smart-Fill Apply Button And Missing Type Submit Fix
- User reported a critical receipt extraction UI issue from a mobile screenshot:
  - Receipt data was extracted and already filled into the form, but the `Apply` button still appeared.
  - Expense type displayed as not found in the smart-fill card.
  - The main button displayed `Log Miscellaneous`, but tapping it did not save until the user manually selected an expense type.
- Root cause:
  - `applyReceiptExtraction(false)` auto-filled amount/comment but only set `expenseType` when extraction returned a type.
  - `actionLabel()` visually fell back to the selected category definition, which defaults to the misc category when the form type is empty.
  - The submit button only checked amount presence, while `onSubmit()` correctly rejected the invalid form because `expenseType` was required.
  - The `Apply` button was always rendered whenever extraction existed, even after auto-apply had already completed.
- Changed `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.ts`:
  - Hide smart-fill `Apply` button after suggestions have already applied.
  - Apply a real valid fallback `Miscellaneous` expense type when extraction does not provide a recognized type.
  - Normalize extracted type names before setting them into the form.
  - Show the applied fallback type in the smart-fill card instead of leaving it as `Not found`.
  - Disable the main submit button based on full form validity for normal expense mode.
- Changed `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.spec.ts`:
  - Added regression coverage proving missing receipt type falls back to `Miscellaneous` and passes validation with a valid amount.
  - Added coverage for normalized extracted category aliases.
- Verification:
  - Ran `npx vitest run src/app/features/daily-expense/daily-expense.component.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-20 - Money-Tip Reminder Notifications
- User wanted notification reminders to do more than ask users to enter expenses, suggesting AI-style saving tips or finance current affairs.
- Product decision:
  - Local daily notification is the primary channel for richer reminder tips because it runs at the user’s chosen time and does not require Gemini/network access.
  - Hourly push reminders can use generic rotating money-tip copy, but should stay lightweight because hourly notifications can become noisy.
  - Real finance current-affairs/news tips were not added because the app has no trusted fresh financial news/data source, freshness policy, or citation/failure behavior.
  - Reminder copy is deterministic/static for now, so it does not consume Gemini credits.
- Changed local reminders:
  - Added `personal-finance-pwa/src/app/core/utils/reminder-message.ts`.
  - `LocalNotificationService.scheduleDailyReminder()` now uses rotating daily “Spenza money tip” content for native scheduled notifications.
  - Web daily reminder fallback also picks tip content when the reminder fires.
- Changed hourly push reminders:
  - Added `personal-finance-pwa/netlify/functions/reminder-messages.ts`.
  - `send-reminders` now sends a deterministic rotating money-tip message based on the claimed reminder slot.
- Updated settings copy:
  - Notification descriptions now mention quick money/saving tips in fallback translations and `en`, `ta`, `hi` JSON.
- Test/build changes:
  - Added `src/app/core/utils/reminder-message.spec.ts`.
  - Added `netlify/functions-tests/reminder-messages.test.ts`.
  - Added daily reminder body coverage to `local-notification.service.spec.ts`.
  - Updated Vitest config to include Netlify function tests and Netlify tsconfig to include all function test files.
- Verification:
  - Ran `npx vitest run src/app/core/utils/reminder-message.spec.ts src/app/core/services/local-notification.service.spec.ts netlify/functions-tests/reminder-messages.test.ts`.
  - Ran `npx tsc --noEmit -p netlify/tsconfig.json`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - All passed.

## 2026-05-20 - Weekly Gemini Insights Reuse Cache Until Expense Data Changes
- User observed that entering Dashboard showed `Refreshing`, implying Gemini weekly insights could be called unnecessarily and consume credits.
- Root cause:
  - `AiInsightService` only reused cached Gemini insights inside a 12-hour fresh-cache window.
  - After that window, Dashboard route entry could trigger Gemini even when the weekly insight input had not changed.
  - The previous cache signature compared broad totals/counts and did not use the full derived insight payload.
- Changed `personal-finance-pwa/src/app/core/services/ai-insight.service.ts`:
  - Added reusable cache lookup for weekly insights.
  - Added source-aware generation result metadata: `cache`, `gemini`, or `none`.
  - Added a stable normalized `dataKey` signature for the full insight payload.
  - Cached Gemini insight is now reused whenever the exact normalized input is unchanged, regardless of cache age.
  - Existing max-2-calls-per-day and stale-cache fallback behavior remain for changed inputs and failure/limit cases.
- Changed `personal-finance-pwa/src/app/features/dashboard/dashboard.component.ts`:
  - Checks reusable cached Gemini insight before setting `aiInsightLoading`.
  - Re-entering Dashboard with unchanged data shows the previous Gemini insight without the refreshing badge.
- Added `personal-finance-pwa/src/app/core/services/ai-insight.service.spec.ts`:
  - Verifies unchanged input reuses cached Gemini output without a second fetch.
  - Verifies changed expense-derived input calls Gemini again.
- Verification:
  - Ran `npx vitest run src/app/core/services/ai-insight.service.spec.ts`.
  - Ran `npm run build` in `personal-finance-pwa`.
  - Both passed.

## 2026-05-18 - Receipt Editor Use Edited Button Closes Immediately
- User reported that clicking `Use edited` in the bill extraction popup takes time and allows repeated clicks, causing duplicate user-triggered work.
- Root cause:
  - `applyReceiptEditor()` awaited edited image generation before closing the receipt editor popup.
  - During the await, the button remained visible and could be clicked repeatedly.
- Changed `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.ts`:
  - Added `applyingReceiptEditor` signal as an in-progress guard.
  - `Use edited` button is disabled while the edited image is being generated.
  - `applyReceiptEditor()` now closes the editor popup immediately after the first click, before awaiting canvas/image processing.
  - Duplicate clicks return early while `applyingReceiptEditor()` is true.
  - If edited image generation fails, flow uses the original receipt file and starts extraction instead of reopening the popup.
- Verification:
  - Ran `npm run build` in `personal-finance-pwa`.
  - Build passed.

## 2026-05-18 - Receipt Extraction Survives Daily Page Navigation
- User reported a serious UX bug: if bill extraction took time and the user switched screens, the extraction session was terminated.
- Root cause:
  - `DailyExpenseComponent` owned selected receipt file, extraction progress/result/error/source, and the stale-run cancellation counter.
  - Route changes destroyed the component, which destroyed that local extraction state and abandoned the in-flight UI session.
- Implemented root-scoped extraction session:
  - New file: `personal-finance-pwa/src/app/core/services/receipt-extraction-session.service.ts`.
  - Service owns:
    - selected file.
    - extraction result/error/applied/source/fallback reason.
    - extracting flag.
    - run token for stale extraction cancellation.
  - Service performs Gemini-first extraction through `AiReceiptExtractionService.extractWithStatus()`.
  - Service falls back to local `ReceiptExtractionService.extract()`.
  - Service uses current `I18nService`, `CurrencyService`, and available categories passed by Daily page.
- Updated Daily page:
  - File: `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.ts`.
  - Removed component-local extraction run ID and Gemini fallback orchestration.
  - Daily receipt UI now binds to `ReceiptExtractionSessionService` signals.
  - Added an `effect()` that auto-applies completed extraction results when Daily is active again.
  - Clear/select/replace receipt now cancels stale extraction through the service.
- Preserved important behavior:
  - Receipt image editor still lets users use original or edited scan before extraction.
  - OCR/Gemini extraction still uses the selected/edited file before upload compression.
  - Split bill and receipt upload flows continue reading from the selected session file.
- Known boundary:
  - The active `File` object is in browser/app memory, so navigation within the SPA is safe; a full app reload still loses an in-progress extraction.
- Verification:
  - Ran `npm run build` in `personal-finance-pwa`.
  - Build passed.

## 2026-05-18 - Receipt Upload Compression Target Set To 120 KB
- User observed that full-quality receipt images were being saved to Google Drive and could consume excessive Drive storage.
- User clarified that “80%” meant reducing a 10 MB image by 80%, but even 2 MB is too large; final requirement is no uploaded receipt image should be greater than 120 KB.
- Verified receipt flow in `DailyExpenseComponent`:
  - Selected image/PDF is used for Gemini/local extraction first.
  - `uploadSelectedReceipt()` prepares a separate upload file at save time.
- Changed image receipt upload compression:
  - File: `personal-finance-pwa/src/app/features/daily-expense/daily-expense.component.ts`.
  - Added constants:
    - `RECEIPT_UPLOAD_MAX_DIMENSION = 1600`.
    - `RECEIPT_UPLOAD_TARGET_BYTES = 120 * 1024`.
    - `RECEIPT_UPLOAD_JPEG_QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4, 0.32]`.
    - `RECEIPT_UPLOAD_SCALE_STEP = 0.82`.
  - `compressReceiptImage()` now creates a JPEG upload copy and compresses iteratively.
  - The compressor starts at 80% JPEG quality, then reduces quality and dimensions until the upload blob is at or under 120 KB.
  - Removed the prior size guard that could keep the original file instead of the compressed upload copy.
  - If compression cannot meet the 120 KB limit, image upload fails rather than saving the original full-size image.
- Changed PDF-to-image receipt storage compression:
  - File: `personal-finance-pwa/src/app/core/services/receipt-extraction.service.ts`.
  - Added equivalent 120 KB iterative compression for rendered PDF receipt images.
- Preserved important behavior:
  - OCR/Gemini extraction still runs before upload compression, so extraction quality is not reduced.
  - Drive receives the compressed storage copy after the user saves the expense.
- Verification:
  - Ran `npm run build` in `personal-finance-pwa`.
  - Build passed.

## 2026-05-18 - AI Memory Initialization
- Completed end-to-end static project analysis for persistent AI memory.
- Existing files were present but empty:
  - `ai/PROJECT_CONTEXT.md`
  - `ai/CURRENT_STATE.md`
  - `ai/AI_RULES.md`
  - `ai/TASK_HISTORY.md`
- Created dense, structured memory for:
  - Stable architecture.
  - Current state and technical debt.
  - Project-specific AI implementation rules.
  - Historical engineering decisions.
- No app source code was changed.
- Tests/build were not run because the task was documentation/memory generation.

## Architecture Decisions Preserved

### Angular Standalone PWA
- Decision: App uses Angular 21 standalone components with strict TypeScript/templates and zoneless change detection.
- Why:
  - Modern Angular architecture.
  - Lazy route loading.
  - Signal-first state patterns.
- Consequence:
  - Future components should remain standalone.
  - Prefer signals/computed/effect over older mutable component state patterns.

### Google Drive JSON Is Source Of Truth
- Decision: Authoritative expense/limit/income data lives in `spenza-backup.json` on Google Drive.
- Why:
  - Avoid spreadsheet schema fragility for app-owned data.
  - Support single and family modes through Drive file/folder permissions.
  - Store rich backup metadata and receipt folder IDs.
- Consequence:
  - New data features should mutate `ExpenseStore` and persist to Drive.
  - Google Sheets should remain migration/legacy unless explicitly reintroduced.

### Google Sheets Kept For Migration / Legacy
- Decision: `GoogleSheetsService` and `SyncService` remain in the repo.
- Why:
  - Existing users may need import from older spreadsheet-based data.
  - Some offline queue functionality was originally Sheets-oriented.
- Current use:
  - Settings imports all Sheets data into Drive backup in one store operation.
- Rejected approach:
  - Do not add new primary persistence features directly against Sheets.

### Backup Mode Config In Drive appDataFolder
- Decision: `spenza-config.json` stores backup mode, shared IDs, role, and AI settings.
- Why:
  - Allows cross-device mode recovery.
  - Keeps config private to the signed-in Google account.
- Consequence:
  - `BackupModeService` is the source for mode/role/shared-file state.
  - Local cache accelerates startup but Drive config remains authoritative after sign-in.

### Family Mode Uses Shared Folder
- Decision: Current family setup creates one user-visible Google Drive folder `Spenza Family`.
- Folder contents:
  - `spenza-backup.json`.
  - `Receipts/`.
- Why:
  - One folder ID is easier for users to share.
  - Receipt files and backup share the same permission boundary.
- Compatibility:
  - Partner flow still accepts old direct shared backup file ID if folder lookup fails.
- Rejected/disabled approach:
  - Settings file rotation UI is disabled in comments; switch-backup-mode flow is preferred.

### Single <-> Family Migration
- Decision: Mode transitions try to preserve user data.
- Single -> family:
  - Owner setup copies private backup data into new shared backup.
  - If copy fails, private backup remains safe.
- Family -> single:
  - Settings switch flow reads shared backup, finds/creates private backup, merges entries by ID, and writes private backup.
  - Shared entries take precedence on conflicts.
- Why:
  - Prevent data loss when changing household mode.

### Drive Polling For Multi-Device Sync
- Decision: Root app polls active Drive backup every 30s while visible/focused.
- Why:
  - Lightweight family/multi-device refresh without realtime infrastructure.
- Implementation:
  - Compare `modifiedTime`.
  - Skip when local changes are unpersisted.
  - Reload full backup only on changed `modifiedTime`.

### Serialized Drive Writes
- Decision: `ExpenseStore.persistToDrive()` serializes writes through a promise queue and revision counters.
- Why:
  - Avoid overlapping full-document writes clobbering newer local state.
- Consequence:
  - Do not replace with fire-and-forget direct `writeBackupFile()` calls.

### AI Is Opt-In User-Key
- Decision: Gemini features require the user to save their own Gemini API key.
- Why:
  - Avoid app-owned AI billing/secrets.
  - Preserve privacy and optionality.
- Implementation:
  - `AiSettingsService` normalizes providers to `user-key` or `disabled`.
  - Weekly insights and receipt extraction call Netlify functions only when key is active.
  - Deterministic/local fallbacks remain mandatory.
- Rejected/incomplete approach:
  - `default` provider type exists but is not currently functional.

### Weekly Insights Privacy
- Decision: Weekly AI prompt excludes expense comments.
- Why:
  - Comments may contain private purchase or household details.
- Consequence:
  - If future AI prompts need comments, require explicit privacy/product decision.

### Receipt Extraction Fallback Chain
- Decision: Receipt extraction tries Gemini only when enabled and file size allows; local OCR/PDF fallback remains available.
- Why:
  - Core receipt feature should work without AI key/network.
  - AI may fail due to quota/auth/model issues.
- Local details:
  - OCR languages: English + Tamil + Hindi.
  - Amount scoring favors net/grand/paid totals and bottom-of-receipt totals.
  - PDF embedded text is preferred before rendering/OCR.

### Notifications Split
- Decision: Push and local notifications are separate stacks.
- Push:
  - `NotificationService` + `FcmService`.
  - Netlify functions store/remove FCM tokens in Firestore.
  - Scheduled backend reminders.
- Local:
  - `LocalNotificationService`.
  - Daily reminder, monthly nudge, budget warning.
- Why:
  - Native/local scheduling and server push have different permission/runtime semantics.
- Constraint:
  - Do not request notification permission at startup.

### Hourly Reminder Scheduler
- Decision: Netlify `send-reminders` runs every 30 minutes but only sends at exact local hourly slots 08:00-22:00.
- Why:
  - Netlify schedule must accommodate half-hour timezones like Asia/Kolkata.
- Duplicate prevention:
  - Transaction claim on `lastReminderSlot`.
- Invalid token handling:
  - Deletes Firestore user doc for invalid/unregistered tokens.

### Theming And UI System
- Decision: UI uses Tailwind + CSS variable design tokens.
- Why:
  - Theme switching and category color consistency.
- Important tokens:
  - Semantic tokens: background/foreground/card/primary/etc.
  - Category tokens: `--cat-*`.
  - Utility classes: `.glass-card`, `.gradient-primary`, `.gradient-text`, `.shadow-glow`.
- Consequence:
  - New UI should use tokens and shared components, not new hardcoded visual systems.

### i18n And Currency
- Decision: App supports English, Tamil, Hindi with JSON dictionaries plus built-in fallback translations.
- Decision: Currency display supports INR, USD, AED.
- Why:
  - App targets multilingual household use and multiple currency contexts.
- Consequence:
  - User-facing text should be translated.
  - Money formatting should go through `CurrencyService`/pipes.

## Important Bug Fixes / Implemented Behaviors Found
- Auth guard waits for async session restore to prevent reload redirect loops.
- Setup guard waits for backup-mode cache and can load Drive config before deciding route.
- Scope versioning clears cached auth when Google scopes change.
- Root bootstrap has retry delays for Drive config/data load.
- Loading timeout prevents indefinite spinner after bootstrap failures.
- Drive config recovery handles cached config ID 404 by rediscovering/creating config.
- Family setup recovers from existing `Spenza Family` folder bundle when config is incomplete.
- Partner setup ensures receipt folder ID exists in family backup metadata.
- Drive refresh on focus/visibility prevents stale multi-device state.
- Import from Sheets writes once to Drive rather than N individual writes.
- JSON restore validates backup shape and writes through store.
- Account delete tries to delete known Drive items, clears queue/local state/config, cancels notifications, and signs out.
- Scheduler utilities validate IANA timezone and fall back to UTC.

## Rejected / Avoided Approaches
- Avoid reusing Google Sheets as primary persistence for new features.
- Avoid direct component-level Drive writes when `ExpenseStore` can persist.
- Avoid silent AI dependency; AI features must degrade to local behavior.
- Avoid permission prompts during app startup.
- Avoid changing Google scopes without scope-version migration.
- Avoid deleting shared family data when switching backup mode; user must manage Drive sharing manually.
- Avoid rotating shared files from Settings; current UI comments direct users to backup-mode switch instead.

## Debugging Discoveries / Risk Notes
- `git status --short` on 2026-05-18 showed `ai/` and `drive-ai.md` as untracked.
- Large/high-risk modules:
  - `src/app/features/daily-expense/daily-expense.component.ts`
  - `src/app/features/settings/settings.component.ts`
  - `src/app/core/services/local-notification.service.ts`
  - `src/app/core/services/expense-store.service.ts`
- Duplicate category mapping exists in multiple components and should be consolidated.
- Extensive debug `console.log` statements remain in services/components and Netlify functions.
- Browser `alert()`/`confirm()` remain in some flows and should be replaced with project modal/toast patterns.
- `firebase.config.ts` public config has stale TODO wording; Admin credentials are correctly expected via Netlify env.
- `CATEGORY_DEFS.recommendedPct` differs from `DEFAULT_BUDGET_PERCENTAGES`; use defaults for budget-limit business logic.
- Some hardcoded UI copy bypasses i18n.

## Migration History
- Original/legacy architecture included Google Sheets tabs for `expenses`, `limits`, `metadata`.
- Current architecture migrated authoritative storage to Drive backup JSON.
- Sheets import remains available from Settings:
  - Reads all expenses by passing empty month filter.
  - Reads limits and metadata.
  - Imports monthly income from `monthlyIncome`.
  - Writes into active Drive backup.
- Family mode evolved from direct shared file ID to shared folder ID.
- Backward compatibility for old direct file ID is preserved in partner setup and settings family URL display.

## Performance Fixes / Optimizations
- Lazy-loaded standalone feature routes.
- Production service worker prefetches app shell and lazily caches assets.
- Drive writes serialized and revision-guarded.
- Drive reads skip unchanged backups using `modifiedTime`.
- Backup mode Drive config load cached for 60s.
- AI calls cached, daily-limited, and gated by meaningful data changes.
- Receipt OCR caps PDF pages, output image pages, long-edge scaling, and total pixels.
- Chart colors resolve CSS variables only when building canvas datasets.

## Future Work Recommended
- Split large feature components by responsibility.
- Reduce production logging and remove sensitive token logs.
- Replace `alert()`/`confirm()` with existing modal/toast UI.
- Improve i18n coverage for hardcoded Settings/family/auth strings.
- Decide whether to delete, isolate, or revive legacy Sheets offline queue.
- Add focused tests for:
  - Drive backup persistence race behavior.
  - Family setup/join/mode-switch migrations.
  - Budget threshold events.
  - Receipt extraction fallback.
  - AI cache/usage gates.
  - Scheduler timezone slots.

## 2026-05-31 - Finance Account Adjustment History UI
- Problem:
  - Finance account balance adjustments already persisted a user-entered `reason`, but users could not see saved adjustment comments anywhere in the Finance screen.
- Implemented:
  - Added per-account adjustment history below each account card.
  - Each history row shows increase/decrease, signed amount, saved date, and the saved reason with an explicit fallback when no reason exists.
  - Added English, Tamil, and Hindi translations for the history heading and missing-reason fallback.
- Verification:
  - Parsed all edited i18n JSON dictionaries successfully.
  - Angular build could not run in this checkout because `personal-finance-pwa/node_modules` is absent and `ng` is unavailable.

## 2026-05-31 - Debt-Payment Log Actions And Input Clear Controls
- Problem:
  - Daily expense logs showed edit/delete controls for debt-payment entries even though generic store mutations correctly reject them.
  - Editable fields across the app and native widget dialog did not consistently expose a quick clear affordance.
- Implemented:
  - Added one Daily `canManageEntry()` rule and applied it to list-row, single-detail, and grouped-detail action buttons.
  - Added shared Angular `appClearable` behavior for populated editable inputs, with picker-aware date/time positioning and Escape-key support.
  - Applied clear controls across Daily, Limits, Finances, Settings, and family join entry fields while leaving special/read-only controls unchanged.
  - Added native Android amount/comment clear icons in `ExpenseWidgetActivity`.
- Verification:
  - `git diff --check`, i18n JSON parsing, and Android clear-icon XML parsing passed.
  - Angular build remains unavailable because `personal-finance-pwa/node_modules` is absent.
  - Android Gradle build cannot resolve Capacitor plugin variants for the same missing dependency checkout state.

## 2026-05-31 - Daily Voice Expense And Comment Dictation Separation
- Problem:
  - Daily showed one mic beside the optional comment field, but that control also invoked Gemini smart-fill for amount, date, and category.
  - The field-level placement made the advanced expense-log behavior undiscoverable and made the comment behavior misleading.
- Product decision:
  - Place whole-expense voice capture near the start of the form as an explicit Gemini smart-fill action.
  - Keep comment dictation attached to the comment input because it only edits that field.
- Implemented:
  - Added a compact top-of-form `Speak expense` card with a Gemini badge, example utterance, recording state, parsing state, and stop action.
  - Converted the comment-field mic into comment-only dictation.
  - Added mutually exclusive `expense` and `comment` recording modes so the two actions cannot run at the same time.
  - Preserved the existing smart-fill fallback that saves the full-expense transcript into comments when Gemini cannot fill the form.
  - Added English, Tamil, and Hindi labels for both voice intents.
- Verification:
  - Parsed all edited i18n JSON dictionaries successfully.
  - Ran `git diff --check`.
  - Ran `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`.
  - Full `ng build` terminated silently in the local execution environment before reporting a compiler diagnostic.

## 2026-05-31 - Native Widget Voice Expense And Comment Dictation Separation
- Problem:
  - The native Android widget sheet still exposed one mic in the bottom action row for both comment capture and Gemini expense smart-fill.
- Implemented:
  - Added an expense-only `Log with your voice` card near the top of the native sheet with a Gemini smart-fill label, example utterance, and mic-led `Speak expense` action.
  - Attached a separate compact `Dictate comment` mic directly beside the optional comment input.
  - Removed the ambiguous mic from the Save/Cancel action row.
  - Added explicit native voice modes: expense mode stores the transcript as fallback and invokes Gemini; comment mode appends dictated text and never modifies amount, date, or category.
  - Kept the smart-fill card hidden in credit mode, where comment dictation remains available.
- Verification:
  - Ran `git diff --check`.
  - Ran `./gradlew :app:compileDebugJavaWithJavac`.

## 2026-05-31 - Remove Custom Date-Picker Clear Affordance
- Problem:
  - Angular date inputs showed a custom clear icon alongside the browser's native date-picker controls, adding unnecessary visual clutter.
- Implemented:
  - Updated shared `appClearable` behavior to skip `type="date"` inputs entirely.
  - Date inputs no longer receive the custom icon, extra right padding, click-to-clear zone, or Escape-key clearing.
  - Other clearable inputs retain their existing behavior.
- Verification:
  - Ran `git diff --check`.
  - Ran `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`.
  - Ran `./node_modules/.bin/ngc -p tsconfig.app.json`.

## 2026-06-02 - Firebase Hosting, Subscription Payments, And Drive Recovery Sync
- Stable architecture synchronized from current code:
  - Firebase Hosting is now the canonical PWA host at `https://spenza-finance.web.app`; the `main` branch workflow deploys `hosting:spenza-site`.
  - Netlify remains in use for legacy AI and FCM serverless API endpoints only. It is no longer an app-page host.
  - Added Firebase Functions for Razorpay subscription creation/verification/webhooks and Stripe Checkout/webhooks.
  - Added Firebase-auth-backed `firebase_uid`, Firestore per-user subscription status, read-only client subscription rules, `/subscribe`, legal pages, Settings plan UI, Family-mode Pro gating, and Dashboard Gemini-insight Pro gating.
  - Native Android subscription navigation uses `@capacitor/browser` and always opens `https://spenza-finance.web.app/#/subscribe`; `/subscribe` remains web-only inside the Capacitor router.
- Drive recovery decisions:
  - A Drive config bootstrap 403 is treated as an OAuth consent/scope problem, not as missing setup: clear the in-memory token and route to `/auth/callback`.
  - If single-user Drive discovery cannot find a backup but the account-scoped local snapshot contains real data, restore the snapshot into the newly created Drive file before initializing empty state.
- Verification:
  - Ran `npm run build -- --configuration production`.
  - Ran `./gradlew :app:assembleDebug`.
  - Ran `git diff --check`.
  - Ran `./scripts/refresh-ai-context.sh`.

## 2026-06-02 - Native Subscription Browser Handoff
- Problem:
  - Android opens the Firebase-hosted subscription page in a separate browser context, so the PWA could not see the Capacitor WebView's signed-in session and asked existing users to sign in again.
- Implemented:
  - Added Firebase Functions endpoints to create and redeem five-minute, one-time subscription handoff codes.
  - Native Settings and Pro redirects request a handoff URL before opening `@capacitor/browser`.
  - `/subscribe` silently redeems the code into Firebase Auth and removes it from browser history before checkout.
  - Removed the Google-session route guard from `/subscribe`; the page must be reachable briefly before external-browser Firebase handoff redemption.
  - Hardened Razorpay and Stripe calls to send Firebase ID tokens. Firebase Functions now verify the token and derive UID server-side instead of trusting a client-controlled UID.
  - Updated the Firebase deployment workflow to build Functions and deploy Hosting plus the two handoff Functions together, without automatically revising payment/webhook Functions.
- Verification:
  - Ran `npm run build -- --configuration production`.
  - Ran `npm run build` from `personal-finance-pwa/functions`.
  - Ran `./gradlew :app:assembleDebug`.
  - Ran `git diff --check`.

## 2026-06-02 - Firebase Functions Node.js 22 Runtime
- Firebase CLI reported that Node.js 20 is deprecated and scheduled for decommissioning.
- Updated Firebase Functions runtime configuration and the Functions package engine to Node.js 22.

## 2026-06-02 - GitHub Actions Node.js 24 Compatibility
- GitHub Actions reported that JavaScript actions running on Node.js 20 will be forced to Node.js 24 starting 2026-06-16.
- Updated deploy workflow actions to Node.js 24-compatible majors:
  - `actions/checkout@v6`
  - `actions/setup-node@v5`
  - `google-github-actions/auth@v3`

## 2026-06-02 - Native Subscription Handoff Retry Hardening
- Problem:
  - Opening Manage Subscription from Android could show an expired-link error, then Pay could fail because the external browser did not retain a Firebase-authenticated user.
  - The backend deleted the handoff document during the first redemption request, so mobile-browser route re-entry or a client-side Firebase sign-in retry could not recover.
- Implemented:
  - The subscription page now removes the handoff query parameter from browser history before awaiting redemption.
  - The backend keeps the original five-minute handoff validity and permits same-code redemption retries for 60 seconds after the first redemption.
  - New handoff creation opportunistically deletes expired handoff documents in bounded batches.
- Verification:
  - Ran `npm run build -- --configuration production`.
  - Ran `npm run build` from `personal-finance-pwa/functions`.
  - Ran `./gradlew :app:assembleDebug`.
  - Ran `git diff --check`.

## 2026-06-02 - Razorpay-Only Checkout
- Problem:
  - Web checkout selected Stripe for non-India IP addresses even though Stripe setup was incomplete and client price IDs were placeholders.
- Implemented:
  - Removed IP country detection and provider selection from `PaymentService`.
  - `/subscribe` now always opens Razorpay checkout.
  - Removed Stripe client redirect code, Firebase exports, backend source, npm dependency, and Stripe/country-detection legal copy.
  - Added a durable rule to keep checkout Razorpay-only until another provider is fully implemented end to end.
- Cloud cleanup:
  - Deleted deployed Firebase Functions `createStripeSession` and `stripeWebhook` from `us-central1`.
- Production release:
  - Deployed Firebase Hosting plus `createSubscriptionHandoff` and `redeemSubscriptionHandoff`.
- Verification:
  - Ran `npm run build -- --configuration production`.
  - Ran `npm run build` from `personal-finance-pwa/functions`.
  - Ran `git diff --check`.
  - Ran `./scripts/refresh-ai-context.sh`.
  - Verified production Hosting returns `200`.
  - Verified removed Stripe endpoints return `404`.
  - Verified the production handoff endpoint still returns the expected `401` for an invalid probe code.

## 2026-06-02 - Subscription Handoff Custom-Token IAM Fix
- Problem:
  - Android Manage Subscription still showed an expired-link message before Razorpay checkout.
  - Production logs showed Firebase Admin custom-token creation failing with missing `iam.serviceAccounts.signBlob`.
- Implemented:
  - Granted `roles/iam.serviceAccountTokenCreator` to the Firebase Functions runtime service account on itself.
  - Updated redemption to write `redeemedAt` only after custom-token creation succeeds so infrastructure failures do not consume the browser handoff.
  - Redeployed `redeemSubscriptionHandoff`.
- Verification:
  - Ran the Firebase Functions TypeScript build.
  - Ran `git diff --check`.
  - Verified a temporary production handoff redeems successfully with HTTP `200`.
  - Verified an immediate same-link retry also redeems successfully with HTTP `200`.
  - Removed temporary production probe documents.

## 2026-06-02 - Razorpay Production Contract Redeploy
- Problem:
  - After handoff authorization succeeded, Razorpay subscription creation returned `uid is required`.
  - Production was still serving an older Node.js 20 Razorpay Function revision that expected a client-supplied UID.
- Implemented:
  - Redeployed `createRazorpaySubscription`, `verifyRazorpayPayment`, and `razorpayWebhook` from current Node.js 22 source.
  - Production now derives the account UID from a verified Firebase bearer token.
  - Updated the Firebase deploy workflow to ship Hosting, handoff Functions, and all Razorpay Functions together.
  - Razorpay creation now returns an explicit `401 Authentication required` when the bearer identity is missing.
- Verification:
  - Confirmed all three Razorpay Functions now run Node.js 22 in production.
  - Verified an unauthenticated create probe returns HTTP `401` with `Authentication required`, confirming the obsolete client-supplied `uid` contract is gone.
