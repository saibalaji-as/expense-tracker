# AI Operating Rules

## Mandatory Startup Rules
- Always read these memory files before architecture-affecting work:
  - `ai/PROJECT_CONTEXT.md`
  - `ai/CURRENT_STATE.md`
  - `ai/AI_RULES.md`
  - `ai/TASK_HISTORY.md`
- Verify code before changing it; do not assume current behavior from old docs.
- Treat `personal-finance-pwa/` as the application root.
- Treat Google Drive JSON backup as the active source of truth unless the task explicitly says Google Sheets migration/legacy.
- Do not create duplicate implementations when a service/helper/model already exists.
- Update AI memory files after every major task:
  - Always update `CURRENT_STATE.md`.
  - Always append/update `TASK_HISTORY.md`.
  - Update `PROJECT_CONTEXT.md` only for stable architecture changes.
  - Update `AI_RULES.md` only when conventions/rules change.

## Architecture Rules
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
  - Gemini receipt flow: `AiReceiptExtractionService`.
  - Gemini weekly insights: `AiInsightService`.
  - Notifications: `NotificationService`, `LocalNotificationService`, `FcmService`.
- Do not bypass `ExpenseStore` for active expense/limit/monthly-income mutations.
- Do not write directly to Drive backup JSON from components if a store method already exists.
- Do not use Google Sheets as the primary persistence path for new app behavior.
- Keep Sheets code explicitly migration/legacy-oriented.
- Keep family mode folder-based:
  - Shared user-facing folder ID is preferred.
  - Direct file ID support is backward compatibility only.

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
- Preserve full Drive scope unless a deliberate auth redesign is made:
  - Family partner access depends on shared-file/folder access.
- Preserve `SCOPE_VERSION` behavior when changing scopes.
- Drive errors should include operation context and flow through `driveError$` when user-visible.
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
- When writing backup JSON, preserve:
  - `metadata.monthlyIncome`
  - `metadata.currency`
  - `metadata.receiptFolderId` when known.
- Deduplicate expenses by `id` during migrations/merges.
- For family/single merges, shared/family entries currently take precedence on ID conflict.
- Settings data export should use the restore-compatible Spenza backup JSON shape, not CSV, so users can keep a complete local backup file.

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
  - `CategoryIconComponent`
  - `ProgressRingComponent`
  - `SparklineComponent`
  - `ChartBaseComponent`
  - shared pipes.
- Use `lucide-angular` icons and register needed icons through `LUCIDE_ICONS` provider in standalone components.
- Use Tailwind utility classes and design tokens from `src/styles.css`.
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

## i18n And Currency Rules
- Use `TranslatePipe` or `I18nService.t()` for user-facing text.
- Supported languages are `en`, `ta`, `hi`.
- Voice language follows selected app language through `I18nService.speechRecognitionLang()`.
- Use `CurrencyService.format()` or `CurrencyFormatPipe`; do not format money manually.
- Supported app currencies are `INR`, `USD`, `AED`.
- If backup metadata contains a supported currency, `ExpenseStore` may update `CurrencyService` during load/restore.

## AI / Gemini Rules
- AI features must remain optional and private.
- Never require a Gemini key for core app use.
- `AiSettingsService` currently normalizes to `user-key` or `disabled`; do not rely on a functional `default` provider without implementing it.
- Call Gemini only through Netlify functions, not directly from Angular UI code.
- Include `X-Gemini-Api-Key` only when user-key mode is active.
- Preserve deterministic local fallbacks for insights and receipt extraction.
- Preserve AI usage/cache limits unless intentionally changed:
  - Weekly insights max 2 calls/day.
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
  - Dashboard AI touch controls should not use mobile `hover:` / `group-hover:` effects that can remain visually stuck after tapping.
  - If the user has not added a Gemini API key, Dashboard AI should show a clear setup prompt explaining the API-key-enabled features and link to AI settings.
  - Before any Gemini request, reuse a cached weekly insight when the normalized expense-derived input has not changed.
  - Gemini weekly insight titles/details should match the selected app language/locale while keeping structured section labels valid for parsing.
  - Do not reuse a saved weekly Gemini fallback response from a different locale; after app language changes, call Gemini again when usage limits allow, otherwise show unavailable/status guidance instead of previous-language content.
  - Keep Dashboard weekly Gemini cache as a small locale-aware history, not a single overwritten entry, so switching languages can reuse the correct saved response.
  - Track Dashboard weekly Gemini usage per locale so one selected language does not block API calls for another selected language.
  - When the user changes app language in Settings, clear Dashboard weekly AI cache and usage state; the new language should start with `Ask AI` and generate fresh output on tap.
  - Gemini should answer deeper "why / what if / what should I try" questions such as anomaly explanations, cross-category behavior hacks, seasonal timing, simulations, and budget intent vs reality.
  - Do not use Gemini to merely rewrite local weekly summaries.
- For receipt AI, preserve file-size limits and local OCR fallback.
- Keep long-running receipt extraction state in `ReceiptExtractionSessionService`, not in `DailyExpenseComponent`.
- Do not cancel active receipt extraction on route/component teardown; cancel only when the user selects/clears/replaces the receipt or starts a newer extraction.
- Daily page UI should reattach to `ReceiptExtractionSessionService` signals and apply completed extraction results when available.
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
- Firestore private credentials must stay in Netlify env vars, not client code.
- Scheduler utilities must remain pure and unit-testable.

## Offline / Legacy Sheets Rules
- Treat `SyncService` as legacy/Sheets queue unless a task explicitly revives it.
- Do not wire new Drive-backed expense mutations into `SyncService`.
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
- Never persist OAuth access tokens outside `AuthService` memory.
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
