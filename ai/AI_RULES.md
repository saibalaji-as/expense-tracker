# AI Operating Rules

## Mandatory Startup Rules
- Use project memory selectively. For substantial code changes, read:
  - `ai/PROJECT_CONTEXT.md`
  - `ai/AI_RULES.md`
- Check `ai/CURRENT_STATE.md` for active bugs, blockers, unfinished work, or immediate next steps when relevant.
- Search `ai/TASK_HISTORY.md` with `rg` when historical reasoning, prior fixes, or rejected approaches matter. Do not read the full archive by default.
- Verify code before changing it; do not assume current behavior from old docs.
- Treat `/ai` files as curated decision memory and `graphify-out/graph.json` as generated live code intelligence.
- When `graphify-out/graph.json` exists, query Graphify before broad code searches:
  - `graphify query "<question>"` for codebase questions.
  - `graphify explain "<concept>"` for focused symbol/concept questions.
  - `graphify path "<A>" "<B>"` for relationship questions.
- After code changes, run `graphify update .` to keep the local AST graph current.
- Do not paste generated Graphify output into `/ai` memory unless it captures a durable decision, risk, or completed task.
- Treat `personal-finance-pwa/` as the application root.
- Treat Google Drive JSON backup as the active source of truth unless the task explicitly says Google Sheets migration/legacy.
- Do not create duplicate implementations when a service/helper/model already exists.
- Update AI memory files after every major task:
  - Always update `CURRENT_STATE.md`.
  - Always append/update `TASK_HISTORY.md`.
  - Update `PROJECT_CONTEXT.md` only for stable architecture changes.
  - Update `AI_RULES.md` only when conventions/rules change.

## Architecture Rules
- Never use `overflow-x: hidden` on html/body/app-shell/main or any ancestor of sticky UI — it creates a scroll container and silently disables position:sticky app-wide. Use `overflow-x: clip` for horizontal-bleed clipping (2026-07-24).
- Keep feature code aligned with the current Angular standalone architecture.
- Prefer existing services:
  - Auth: `AuthService`.
  - Drive backup/config/files: `GoogleDriveService`.
  - App state: `ExpenseStore`.
  - Backup mode: `BackupModeService`.
  - Local preferences: `StorageService`.
  - Currency: `CurrencyService`.
  - i18n: `I18nService`.
  - Theme: `ThemeService`.
  - AI settings: `AiSettingsService`.
  - Local OCR: `ReceiptExtractionService`.
  - AI receipt flow: `AiReceiptExtractionService`.
  - AI weekly insights: `AiInsightService`.
  - AI voice parsing: `AiVoiceExpenseService`.
  - Notifications: `NotificationService`, `LocalNotificationService`, `FcmService`.
- Do not bypass `ExpenseStore` for active expense/limit/monthly-income mutations.
- Do not write directly to Drive backup JSON from components if a store method already exists.
- Do not use Google Sheets as the primary persistence path for new app behavior.
- Keep Sheets code explicitly migration/legacy-oriented.
- Keep family mode folder-based:
  - Shared user-facing folder ID is preferred.
  - Direct file ID support is backward compatibility only.
- CSP × service worker rule: on the ngsw-controlled origin (spenza.site), every cross-origin
  subresource is re-fetched INSIDE the service worker, and that fetch is governed by the
  worker's own CSP `connect-src` (same `/**` header in firebase.json). Therefore any host
  added to `script-src`/`style-src`/`font-src` for runtime-loaded resources MUST also be in
  `connect-src`, or the resource fails only in production with a bare onerror (2026-07-04:
  this silently broke Razorpay checkout for all users).

## State Management Rules
- Use Angular signals/computed/effect and `@ngrx/signals` patterns already present.
- Keep the authoritative state in `ExpenseStore`.
- Any expense/limit/income mutation must persist to Drive or deliberately document why it is local-only.
- Preserve `persistQueue`, `localRevision`, and `persistedRevision` semantics when editing store persistence.
- Do not introduce unqueued overlapping Drive writes.
- When adding computed data, prefer deriving from store signals instead of storing duplicate derived state.
- Use `toLocalDateString()`/`parseLocalDate()` for app-local date logic.
- Store expense dates as `YYYY-MM-DD`; do not use UTC slicing when local date matters.

## Google Auth / Drive Rules
- Use `AuthService.ensureToken()` for Google API access.
- Do not manually cache or pass access tokens outside existing service boundaries.
- The latest short-lived Google access token + expiry are persisted via `AuthService` on BOTH web and native (keys `gapi_access_token` / `gapi_access_token_expires_at`; the Android widget reads these key strings natively — never rename them). Restore on startup with a 5-minute expiry buffer; clear them on sign-out, scope mismatch, `clearToken()`, and account-local clears. Product rule: a signed-in user must not be asked to sign in again before token expiry.
- After any Google sign-in, verify the granted scopes include `drive.appdata` (web: token response `scope`; native: tokeninfo). On a missing scope, throw `MissingDriveScopeError`, force `prompt: 'consent'` on the next web sign-in, and show the `auth.error.driveAccess` message — never let a scope-less token reach Drive calls (it causes a 403 sign-in loop).
- Do not clear persisted signed-in state just because a silent web access-token refresh fails; users should remain locally signed in and re-consent only when Drive access is actually needed.
- Do not re-add the full drive scope. Family sync uses Firestore. Only drive.appdata is needed.
- Keep family mode folder-based logic deprecated. Do not add new features against GoogleDriveService shared-folder methods (`createFamilyFolderBundle`, `findExistingFamilyFolderBundle`, `findBackupFileInFolder`, `findOrCreateReceiptsFolderInFamilyFolder`). These are marked for removal after 2026-09-01.
- Family sync uses the Firestore **Family Ledger** (`families/{id}/ledger/{type:id}`, one doc per record; see `docs/family-sync-centralization-plan.md`). ALL shared records (expenses, adjustments, debt payments, accounts, debts, limits, income/currency) sync through it; Drive is a per-user backup only, never part of family correctness. Never add a new sync path: mutations must flow through `ExpenseStore` so `pushFamilyLedger()` diff-reconciliation covers them automatically; deletions are tombstones, never Firestore doc deletes. Firestore access must go through `getSharedFirestore()` (persistent cache).
- Preserve `SCOPE_VERSION` behavior when changing scopes.
- Keep one stable Android signing keystore for distributed APK updates. Before testing native Google sign-in, register the exact final APK signer SHA-1 with the Google Cloud Android OAuth client for `com.spenza.app`; do not rely on machine-specific debug keystores for production updates.
- Drive errors should include operation context and flow through `driveError$` when user-visible.
- Treat Drive config bootstrap 403 as an auth/scope failure:
  - Re-throw it from `BackupModeService.loadFromDrive()`.
  - Clear the in-memory Google token and route to `/auth/callback` for fresh consent.
  - Do not fall through to new-user mode selection.
- If single-user Drive discovery returns no backup file but the account-scoped local backup snapshot contains real data, restore that snapshot into the newly created Drive backup before initializing empty state.
- Returning users with a valid local backup snapshot should not be blocked on Drive bootstrap before entering the app.
- Keep Drive JSON as authoritative, but maintain the local backup snapshot (`spenza_drive_backup_snapshot_v1`) for fast startup and offline read access.
- Scope local backup snapshots and backup-mode/config caches to the signed-in Google account; when explicit sign-in returns a different email, clear account-scoped local state before loading that account's Drive config.
- Explicit sign-out must clear account-scoped local state immediately, including active store data, local backup snapshot, backup-mode/config cache, offline queue, Daily draft, AI key/insight cache, notification state, and auth/preferences cache, then navigate away from guarded routes to `/auth/callback`.
- Web sign-out should clear local auth state before attempting best-effort Google token revocation so script/network failures cannot leave the app locally authenticated.
- When cached backup data has rendered, background Drive sync failures should not replace the app with the boot retry screen.
- If local backup changes are cached before a Drive write succeeds, preserve that dirty snapshot and flush it to Drive before reading remote data on the next successful Drive bootstrap.
- Keep no-cache headers/cache-busting on Drive reads where stale data would break multi-device/family sync.
- Keep `spenza-config.json` in `appDataFolder`.
- Keep private single-user `spenza-backup.json` in `appDataFolder`.
- Keep family backup inside `Spenza Family`.
- Do not delete user Drive data outside explicit account-delete/reset flows.

## Data Model Rules
- Preserve `ExpenseEntry` schema compatibility:
  - `id`, `date`, `amount`, `type`, `limit`, `savings`, `timestamp`.
  - Optional `comment`, `receipt`, actor metadata.
- Preserve `BackupDocument.version = '1.0'` until an explicit migration is implemented.
- Add backward-compatible optional fields when extending backup schema.
- When reading older backup JSON, tolerate missing optional fields.
- When a remote Drive backup is missing newer finance arrays because an older app build rewrote the file, preserve cached/in-memory finance arrays if present and upgrade the backup instead of treating the missing arrays as an intentional delete.
- When writing backup JSON, preserve:
  - `metadata.monthlyIncome`
  - `metadata.currency`
  - `metadata.receiptFolderId` when known.
- Deduplicate expenses by `id` during migrations/merges.
- For family/single merges, shared/family entries currently take precedence on ID conflict.
- Settings data export should use the restore-compatible Spenza backup JSON shape, not CSV, so users can keep a complete local backup file.
- Keep account balance side effects centralized in `ExpenseStore`; components should set/link `ExpenseEntry.accountId` but must not directly mutate account balances.
- When changing balance-affecting expense mutations, preserve reverse/apply behavior for create, split-create, edit, and delete so account balances stay consistent.
- Keep debt/EMI payment side effects centralized in `ExpenseStore.recordDebtPayment`, `updateDebtPayment`, and `deleteDebtPayment`; components must not independently create/delete debt-payment expenses, mutate debt balances, or deduct/restore accounts.
- Keep generic Daily edit/delete blocked for `source: 'debt-payment'` or `debtId` entries; debt-payment history must be managed from Finances through the dedicated reversal/edit store methods.
- Hide generic Daily edit/delete controls for debt-payment entries so the UI does not advertise operations that are intentionally rejected by the store.

## Budget And Category Rules
- Use `category-definitions.ts` as the only source of truth for predefined categories.
- Use `CATEGORY_DEFS` for canonical category IDs, expense type names, visual metadata, budget groups, and recommended percentages.
- Use derived exports from `category-definitions.ts`:
  - `PREDEFINED_EXPENSE_TYPES`
  - `DEFAULT_BUDGET_PERCENTAGES`
  - `getCategoryDef()`
  - `getCategoryDefByName()`
  - `getCategoryIdByName()`
- Do not recreate hardcoded category maps such as `TYPE_TO_CAT_ID` or `CAT_ID_TO_TYPE`.
- Keep `CATEGORY_DEFS.recommendedPct` balanced to 100 total unless product requirements explicitly change default allocation behavior.
- Keep default `CATEGORY_DEFS.recommendedPct` aligned with the app’s 50/30/20 promise:
  - Needs total 50%.
  - Wants total 30%.
  - Savings + Growth total 20%.
  - Buffer defaults to 0% unless product requirements explicitly reintroduce a separate buffer allocation.
- Preserve budget categories exactly:
  - `Needs`
  - `Wants`
  - `Savings`
  - `Growth`
  - `Buffer`
- Preserve limit calculation:
  - `limitAmount = userPercentage * monthlyIncome / 100`.
- Preserve entry savings calculation:
  - `savings = limit - amount`.
- Treat monthly income as required before expense tracking/budget analytics:
  - `/daily`, `/monthly`, and `/dashboard` should remain gated when `monthlyIncome <= 0` after Drive backup data loads.
  - Redirect zero-income users to `/limits?onboarding=income`.
  - Keep `/limits` available for setup and `/settings` available for backup restore/import while gated.
- Budget threshold alerts fire when monthly category spend reaches `>= 80%` of its configured limit.
- Keep allocation-save validation around total percentage approximately `100%`.
- Preserve low Savings/Growth warning threshold at `< 20%` unless product requirement changes.

## Component And UI Rules
- Use standalone Angular components.
- Prefer shared UI components before creating new visual primitives:
  - `SectionCardComponent`
  - `ModalComponent`
  - `ThemedSelectComponent` for app dropdowns/selectors.
  - `CategoryIconComponent`
  - `ProgressRingComponent`
  - `SparklineComponent`
  - `ChartBaseComponent`
  - shared pipes.
- Use `lucide-angular` icons and register needed icons through `LUCIDE_ICONS` provider in standalone components.
- Use Tailwind utility classes and design tokens from `src/styles.css`.
- Do not add native `<select>` controls in Angular templates for visible app dropdowns; use `ThemedSelectComponent` so menus match the Spenza theme.
- Use CSS variables for semantic/category colors; avoid hardcoded color duplicates where tokens exist.
- Keep dark mode compatible with `.dark` class and tokenized colors.
- Do not add new in-app explanatory/marketing text where a functional UI control would suffice.
- Avoid browser `alert()`/`confirm()` in new code; use `ModalComponent` or toast/status UI.
- Add new user-facing strings to i18n JSON and/or fallback translations.
- Preserve mobile-first responsiveness.
- Watch for text overflow in compact cards/buttons.
- User-triggered save/update/delete actions should give explicit feedback:
  - Show a success acknowledgment after confirmed persistence.
  - If validation fails, explain what the user needs to fix in plain language.
  - If persistence fails, explain the likely next step, such as checking internet connection, Google Drive access, or file selection.
  - Prefer `UserFeedbackService` for app-wide save acknowledgments and guided errors.
- All route changes should reset page scroll to top at the root app level.

## i18n And Currency Rules
- Use `TranslatePipe` or `I18nService.t()` for user-facing text.
- Supported languages are `en`, `ta`, `hi`.
- Voice language follows selected app language through `I18nService.speechRecognitionLang()`.
- Use `CurrencyService.format()` or `CurrencyFormatPipe`; do not format money manually.
- Supported app currencies are `INR`, `USD`, `AED`.
- If backup metadata contains a supported currency, `ExpenseStore` may update `CurrencyService` during load/restore.

## AI / Gemini Rules
- AI features must remain optional and private. Never require any AI key for core app use.
- Default AI provider is `'hosted'` — all users get AI without supplying a key.
- `AiSettingsService.normalize()` maps unknown/legacy values to `'hosted'`. Only explicit `'user-key'` or `'disabled'` values are preserved.
- Call AI only through Firebase Functions, never directly from Angular UI code.
- For hosted mode (`isHosted() === true`): do NOT include `X-Gemini-Api-Key` header in requests. Firebase Functions use the server-side `GROQ_API_KEY` (text) or `GEMINI_API_KEY` (receipts).
- For user-key mode: include `X-Gemini-Api-Key` header with the user's key; Firebase Functions use it directly.
- Do not route AI calls through Netlify. All AI endpoints are on Firebase Functions.
- Preserve deterministic local fallbacks for insights and receipt extraction.
- Preserve AI usage/cache limits unless intentionally changed:
  - Weekly insights max 2 fresh calls per locale per day and max 5 fresh weekly-insight calls total per day across locales.
  - Count weekly Gemini attempts before the network call so failed/malformed/rate-limited responses cannot be retried repeatedly and drain credits.
  - Weekly Gemini insight cache should be reused whenever the exact normalized insight input is unchanged, even across Dashboard route re-entry.
  - 7d stale cache fallback.
- Do not show the Dashboard weekly insight refreshing/loading badge when a reusable cached Gemini insight can be displayed.
- Weekly Gemini insights should be regenerated only when expense-derived insight input changes, no reusable cache exists, or fallback/usage-limit behavior applies.
- Do not send expense comments to weekly AI prompts unless privacy requirements change.
- Dashboard weekly AI should stay hybrid:
  - Local deterministic insights answer "what happened" and remain visible.
  - Dashboard Gemini deep dives should be user-triggered from the AI button, not generated automatically on Dashboard landing.
  - On Dashboard entry, hydrate a matching saved Gemini response for the current normalized payload so the button can show `View AI`.
  - When the normalized expense-derived Dashboard AI payload changes, clear the displayed Gemini response and show `Ask AI` until the user requests a fresh response.
  - When Dashboard Gemini output is shown or already available, the UI should scroll the Gemini deep-dive section into view after the user taps the AI/View AI button.
  - Dashboard AI scroll should use a stable target and tolerate cached/immediate responses; do not rely on a single early `ViewChild.scrollIntoView()` call.
  - `View AI` should align the Gemini insight block to the top of the document viewport target without subtracting sticky-header offset, and should correct the final scroll position after smooth scrolling.
  - Dashboard AI scroll must work inside Android/Capacitor WebView; write/correct scroll position through `window`, `document.documentElement`, and `document.body` instead of relying on desktop-only scroll behavior.
  - Dashboard AI requests must enter loading state before async key/cache checks so rapid repeated taps cannot start duplicate AI requests.
  - When Gemini/API quota or rate limit is reached, show a specific credit-limit/reset message instead of the generic unavailable AI panel.
  - Dashboard AI touch controls should not use mobile `hover:` / `group-hover:` effects that can remain visually stuck after tapping.
  - If the user has not added a Gemini API key, Dashboard AI should show a clear setup prompt explaining the API-key-enabled features and link to AI settings.
  - Before any Gemini request, reuse a cached weekly insight when the normalized expense-derived input has not changed.
  - Gemini weekly insight titles/details should match the selected app language/locale while keeping structured section labels valid for parsing.
  - Do not reuse a saved weekly Gemini fallback response from a different locale; after app language changes, call Gemini again when usage limits allow, otherwise show unavailable/status guidance instead of previous-language content.
  - Keep Dashboard weekly Gemini cache as a small locale-aware history, not a single overwritten entry, so switching languages can reuse the correct saved response.
  - Track Dashboard weekly Gemini usage per locale plus a small total daily cap across locales, so language switching does not multiply credit use without bound.
  - When the user changes app language in Settings, preserve Dashboard weekly AI cache and usage state. Locale-aware signatures prevent wrong-language reuse, while preserving cache avoids unnecessary fresh calls after language switching.
  - Keep Dashboard weekly AI payload compact. Preserve deep-dive value, but avoid sending long empty daily vectors or excessive history rows when summarized baselines already carry the signal.
  - Keep Gemini weekly deep-dive output concise enough to protect user credits; current target is 20-40 words per detail and `generate-insights` uses a reduced output token budget.
  - Gemini should answer deeper "why / what if / what should I try" questions such as anomaly explanations, cross-category behavior hacks, seasonal timing, simulations, and budget intent vs reality.
  - Do not use Gemini to merely rewrite local weekly summaries.
- For receipt AI, preserve file-size limits and local OCR fallback.
- Keep long-running receipt extraction state in `ReceiptExtractionSessionService`, not in `DailyExpenseComponent`.
- Do not cancel active receipt extraction on route/component teardown; cancel only when the user selects/clears/replaces the receipt or starts a newer extraction.
- Daily page UI should reattach to `ReceiptExtractionSessionService` signals and apply completed extraction results when available.
- Unsaved Daily expense form data should survive same-session page navigation until the user saves or explicitly clears/cancels the form. Keep this as in-memory app-session state unless persistent draft storage is intentionally added.
- When receipt extraction cannot determine a type but has usable expense data, apply a real valid fallback category, currently `Miscellaneous`, so the form is submit-ready.
- Do not show the receipt smart-fill `Apply` button after suggestions have already auto-applied.
- Split bill row dropdowns must render the actual row type selected; if using native `<select>`, explicitly bind the matching option selected state for mobile reliability.
- For receipt storage, keep extraction quality and upload storage quality separate:
  - Run Gemini/local OCR on the selected or edited receipt file.
  - Compress the Drive upload copy after extraction, at save time.
  - Current Drive upload target for image receipts is JPEG <=120 KB, starting from max dimension 1600px and quality `0.8`.
  - If the first JPEG is too large, reduce quality and dimensions until the <=120 KB target is reached.
  - Current Drive upload target for PDF-to-image receipts is also <=120 KB.
  - Never silently fall back to uploading the original full-size image when compression fails.

## Notifications Rules
- Do not request notification permissions at app startup.
- Permission requests should be explicit user actions from Settings or relevant UI.
- Device notification/SMS-derived spend detection must remain Android-only and explicit opt-in:
  - Use Android notification-listener access rather than SMS inbox permissions.
  - Require both OS notification-listener access and Spenza's own local toggle before parsing notifications.
  - Spend prompt parsing should only accept SMS/messaging-source notification packages; ignore payment apps, wallet apps, bank apps, app stores, and other non-SMS sources.
  - Parse notification text locally on-device only.
  - Classify notification intent locally before extracting an amount or prompting; only high-confidence expense-transaction or income/received classifications should open the review sheet.
  - Require the detected amount to include a marker for the currently selected app currency before prompting:
    - INR: `₹`, `INR`, `Rs`, rupee/rupees.
    - USD: `$`, `US$`, `USD`, dollar/dollars.
    - AED: `AED`, `د.إ`, `dh/dhs`, dirham/dirhams.
  - Do not send notification contents to Gemini, Drive, Netlify functions, or other network services.
  - Ask the user to review/save before creating an expense or account adjustment; do not auto-log detected spend/credit notifications.
- Native widget received-money flow must write account-balance increases as `accountAdjustments`, not as expense entries or income pseudo-expenses.
- Keep `spenza_widget_expense_queue_v1` backward compatible:
  - Legacy raw expense entries and `{ entry }` items remain valid.
  - New adjustment items use `{ kind: 'adjustment', adjustment }` and must update both the selected account balance and the adjustment audit log.
- Preserve local notification initialization as non-blocking.
- Prefer local daily notifications for user-controlled richer reminder content because they respect the user’s chosen time and do not require server/network availability.
- Browser/PWA local reminder fallback cannot deliver while the app process is closed; use FCM push as the closed-app delivery path.
- When daily reminder settings are enabled or changed, keep the FCM backend reminder preferences in sync with the selected local hour/minute.
- Reminder tip copy must be deterministic/static unless a trusted fresh backend data source is explicitly added.
- Do not call Gemini just to generate notification reminder copy; preserve AI credits for user-triggered/insight features.
- Do not add finance current-affairs/news notification claims without a reliable source, freshness policy, and failure behavior.
- Keep budget-alert dedupe behavior unless changing product behavior.
- FCM token registration must go through Netlify functions.
- Native function URLs must use `environment.netlifyFunctionsUrl`.
- Web function URLs should use `/.netlify/functions`.
- Firestore Admin and payment-provider private credentials must stay in backend environment variables for Netlify or Firebase Functions as appropriate, never in client code.
- Scheduler utilities must remain pure and unit-testable.

## Hosting And Subscription Rules
- Treat Firebase Hosting as the canonical web-app host: `https://spenza-finance.web.app`.
- Use `https://spenza-finance.web.app/#/subscribe` for subscription-page navigation from Android and external redirects.
- Do not use `https://spenzaio.netlify.app` as an app-page destination. Netlify remains valid only for legacy serverless API calls under `/.netlify/functions`.
- Keep `/subscribe` web-only inside the Angular router. Native Android should request a short-lived Firebase handoff code and open the Firebase-hosted subscription page through `@capacitor/browser`.
- Keep subscription handoff codes short-lived. Redeem them transactionally, allow only a brief same-code retry window for mobile-browser route re-entry, and exchange them for Firebase custom tokens only in Firebase Functions.
- Keep `roles/iam.serviceAccountTokenCreator` granted to the Firebase Functions runtime service account on itself. Mark a subscription handoff as redeemed only after custom-token creation succeeds.
- Payment API identity must come from a verified Firebase ID token. Never trust a client-supplied UID for subscription creation or verification.
- Keep checkout Razorpay-only until another provider is fully implemented end to end. Do not add country-based provider selection or expose placeholder payment routes.
- Keep payment-provider secrets, signature verification, and Firestore subscription writes in Firebase Functions; never move them into Angular client code.
- Keep Firestore subscription rules read-only for clients and scoped to the authenticated user's own `users/{uid}/subscription/status` path.
- Firebase Auth failure must not block Drive-backed expense features; it may prevent subscription-state lookup until identity is available.

## Native Android Widget Rules
- Keep the home screen widget standalone and removable:
  - Main app/PWA routes and Angular feature flows must not depend on widget classes.
  - The widget should be hideable by disabling/removing `ExpenseWidgetProvider` and `ExpenseWidgetActivity` manifest entries.
- Widget expenses must queue locally first under `spenza_widget_expense_queue_v1`; never block user confirmation on Drive/network.
- Widget sync must merge into the same Drive backup JSON schema as `ExpenseStore` and dedupe by expense `id`.
- When active finance accounts exist, native widget expenses must carry the selected/default `accountId`; both Android WorkManager sync and the Angular queue flush must apply the linked expense deduction exactly once and keep rejected items queued.
- Because Android WorkManager can delay background jobs, the Angular `ExpenseStore` must also flush current-account pending widget queue entries during cached startup, Drive bootstrap, and Drive refresh.
- Widget queue entries must be tagged with the active Google email and must not sync into a different active account after account switching.
- Widget sync may use cached native access tokens written by `AuthService`, but if the token is missing/expired/rejected it must keep the queue rather than prompting login or launching the full app.
- When Angular writes `spenza_drive_backup_snapshot_v1` on native Android, refresh the home-screen widget through `ExpenseWidgetPlugin.refresh()` so widget insight reflects app-created Drive-backed changes such as debt payments without waiting for a later widget action.
- Widget Gemini voice parsing must use the existing Netlify `parse-voice-expense` endpoint and user-supplied Gemini key from `spenza_ai_settings_private`; it must degrade to plain comment capture when AI is unavailable.
- Native widget and widget Activity styling must match Spenza's PWA theme:
  - Use light/night Android resources for system theme adaptation.
  - Use the app's indigo/violet glass surface feel and canonical category colors.
  - Keep widget visuals launcher-safe because `RemoteViews` supports limited animation; put richer motion in `ExpenseWidgetActivity`.
- Widget should remain useful at a glance by showing daily insight from local app data:
  - Today's spend.
  - Daily budget derived from current limits/monthly income when possible.
  - Progress toward budget.
  - Comparison with yesterday.
  - Include current-account queued widget expenses before Drive sync completes.
- Widget Activity must remain keyboard-safe:
  - Use a scrollable bottom-sheet layout.
  - Use `adjustResize`/translucent theme behavior so the keyboard does not hide amount/comment/actions.
  - Avoid a lonely full black background; use translucent dim over the launcher/app instead.
- Keep widget categories mapped to canonical app types:
  - Food -> `Food & Groceries`
  - Transport -> `Transportation`
  - Entertainment -> `Entertainment`
  - Misc -> `Miscellaneous`

## Offline / Legacy Sheets Rules
- Treat `SyncService` as legacy/Sheets queue unless a task explicitly revives it.
- Do not delete `SyncService` or any of its methods; the service is retained for Google Sheets migration import compatibility.
- Do not wire new Drive-backed expense mutations into `SyncService`.
- All `SyncService` enqueue methods and `flushQueue()` guard on `pf_sheet_id` and return immediately when absent; existing callers in `DailyExpenseComponent` are harmless — do not remove or change those call sites.
- Do not change the IndexedDB DB name (`pf-pwa-db`) or store name (`offline-queue`).
- Keep Google Sheets import flow bulk-based:
  - Read Sheets data.
  - Write once to Drive through `ExpenseStore.importFromSheets()`.
- If modifying Sheets serialization, preserve existing column order for compatibility.

## Error Handling Rules
- Surface user-facing Drive failures through existing app/toast/loading mechanisms.
- Do not swallow critical Drive persistence errors silently.
- Noncritical setup migrations may warn and continue only when user data remains safe elsewhere.
- Netlify functions must handle:
  - `OPTIONS`
  - non-POST methods
  - malformed/missing required body fields.
- AI failure should degrade to local behavior when possible.
- Keep errors actionable and avoid exposing secret values.

## Security And Privacy Rules
- Never commit private Firebase Admin credentials or service account JSON.
- Never commit generated mobile/web Firebase client config or signing material such as `google-services.json`, `GoogleService-Info.plist`, `sha-keys.md`, `*.keystore`, `*.jks`, or `*.p12`.
- Never persist OAuth access tokens outside `AuthService` ownership. The only current exception is the native-only short-lived widget sync cache described in Google Auth / Drive Rules.
- Do not log Gemini API keys, OAuth tokens, FCM tokens, raw receipts, or sensitive receipt text.
- Existing code logs some FCM tokens/debug data; do not add more sensitive logging.
- Treat receipt files and Drive links as private user data.
- Destructive account deletion flows must remain explicit and guarded.

## Testing Rules
- For service/business logic changes, add or update focused specs.
- For Drive/family mode changes, test:
  - single bootstrap.
  - family owner setup.
  - partner folder ID join.
  - direct file ID compatibility if touched.
  - 403/404 handling.
  - single/family migration merge behavior.
- For budget changes, test limit calculations and threshold events.
- For receipt extraction changes, test amount/category/date/comment parsing and fallback behavior.
- For scheduler changes, test timezone behavior including half-hour timezones.
- Before finalizing code changes, run at least targeted tests or `npm run build` when feasible.
- If tests/build are not run, explicitly say so in final response.

## Refactoring Restrictions
- Do not refactor large components opportunistically during unrelated feature work.
- Do not remove legacy Sheets code unless the user explicitly asks or a migration plan exists.
- Do not change OAuth scopes casually.
- Do not alter backup file names or locations without migration support.
- Do not break backward compatibility for existing backup JSON.
- Do not replace Capacitor Preferences storage without migration.
- Do not introduce new dependencies unless existing stack cannot reasonably solve the task.

## Logging Rules
- Prefer `console.warn`/`console.error` for actionable failures.
- Avoid adding `console.log` in production paths.
- Remove temporary debug logging before completing feature work.
- Never log secrets or full private payloads.

## Memory Maintenance Rules
- `PROJECT_CONTEXT.md` should remain stable and architectural.
- `CURRENT_STATE.md` should stay concise and current.
- `TASK_HISTORY.md` should record why decisions were made, not just what changed.
- `AI_RULES.md` should contain enforceable project rules.
- When updating memory, remove outdated claims and preserve important historical decisions.
