# Task History

## 2026-07-03 (later-2) - CC bill-payment SMS auto-tally + salary detection/fallback reminder

### Context
- User: when the card bill is paid from the same phone, the debit SMS should tally the paying bank account AND settle the card; salary SMS should be treated distinctly, and if no salary notification arrives, the app should remind the user to enter it.

### Key decisions and why
- **CC payments are a first-class classifier type**, resolved before the income check — card-side confirmations ("payment received on your credit card") would otherwise classify as income and bank-side debits ("debited towards your credit card") as CC spends, both of which would corrupt balances in opposite directions.
- **Payments never sync through the WorkManager worker.** A debt payment mutates four linked pieces of state (account, card, expense entry, audit record); per the existing AI rule that stays centralized in `ExpenseStore.recordDebtPayment`. The queue item kind `cc-payment` is explicitly requeued by the worker and excluded from the family Firestore push (partner receives it via Drive polling after the app resolves it).
- **Dedup by card+amount+date** at flush: one real-world payment produces up to two SMS (bank-side + card-side); the second prompt, if saved, must not double-pay. Amount is capped at the tracked outstanding (SMS amount can exceed it when older spends were never logged); zero-outstanding payments are skipped.
- **Last-4 extraction prefers digits after the "credit card" mention** — bank-side payment SMS name the debited bank a/c (XX1234) before the card (XX7788); matching the first masked number picked the wrong instrument.
- **Salary reminder is a fallback, not the primary path.** Primary capture is the salary SMS prompt (income classified with new `isSalary` flag → widget credit mode tags the adjustment reason "Salary"). The reminder (pure planner, one-shot at salaryDay 20:00, ID 30001) is suppressed when a salary-tagged increase adjustment exists within a 5-day grace window before the occurrence, and is rescheduled from the store effect on every adjustment change — so recording salary through ANY path silences it. Prefs (`salaryReminderEnabled`, `salaryDay` 1–28) are optional fields on `NotificationPreferences` with backward-compatible defaults; Settings UI is native-only since web cannot deliver closed-app local notifications.

### Verification
- `ng build` development clean; `salary-reminder.spec.ts` (8) + `credit-card-reminders.spec.ts` (14) green; 6 new Java classifier tests (bank-side, card-side, purchase-not-payment, salary, non-salary, last-4 scoping) — Gradle not run in env, build natively.

## 2026-07-03 (later) - Credit cards get their own creation flow, split from debts

### Context
- User hit "Remaining balance cannot be higher than the borrowed amount" when adding a card via Add Debt and correctly pointed out the mental-model mismatch: cards are limit + revolving outstanding, not borrowed + remaining. They asked for credit card to be removed from Add Debt and given its own Add button, account-creation style.

### Decisions
- **UI split, storage unchanged.** Cards stay `DebtAccount(type 'credit-card')` so payments, reminders, widget capture, Daily selector, family sync, and backup compatibility all keep working with zero migration. Only Finances presents them differently: dedicated modal (`cardForm`: limit, outstanding, bill/due days, min payment, bank, last-4) and a separate Credit Cards section; the Debts modal/section is loans-only.
- **Schema mapping:** `principalAmount` mirrors `creditLimit` when set (else `max(outstanding, 1)` to satisfy the >0 rule); `remainingBalance` = current outstanding. `startDebtEdit` routes card debts to the card modal defensively.
- **Store rules made type-aware:** "remaining ≤ principal" validation is loan-only (card spending can exceed the limit); zero balance no longer sets `status: 'paid'` for cards in any of the five derivation sites — a fully paid bill previously archived the card out of every payment selector (found while fixing the form; classic churn bug); deleteDebtPayment's `min(principal, restored)` cap is loan-only.

### Verification
- `ng build` development clean; planner + account-totals specs green (19/19). Native code untouched in this pass.

## 2026-07-03 - Credit-card capture + bill reminder overhaul (BA analysis → implementation)

### Context
- User expected: add-credit-card in Add Debt (already existed), notification-detected CC spends preselecting the card in the widget with cards visible in the account selector (missing), and a "meaningful" 3-days-before due reminder (existed but buggy/stale). Full analysis and retention ideas in `docs/credit-card-feature-spec.md`.

### Key decisions and why
- **One-shot notifications rescheduled on every mutation, not monthly-repeating.** Repeating notifications freeze body text (stale amounts) and drift on short months. The reschedule trigger is a debounced effect in `ExpenseStore` over debts+entries+debtPayments — chosen over per-mutation calls because widget flushes and Drive loads patch state at multiple points, and over the FinancesComponent effect because that only ran when the user visited /finances (reinstall/widget-only users got no reminders).
- **Reminder content computed by a pure planner** (`utils/credit-card-reminders.ts`) per the "scheduler utilities must remain pure" rule; the service only maps plan→Capacitor calls. Statement due = remainingBalance − charges after the last bill date (payments implicitly netted). Due-day/overdue steps are suppressed when a `DebtPayment` exists in the current cycle — reminders must never nag someone who already paid; that is the #1 churn driver for reminder features. Notification IDs moved to 20000–29599 (8 slots/card); legacy 10000-range IDs are cancelled on reschedule.
- **Explicit card choice at capture beats deferred resolution.** Widget selector now lists credit cards (`debt:` prefixed values); a detected CC spend preselects the matched card. Entries carry explicit `debtId`; the flush's silent accountId→card override was removed for entries where cards were offered (classifier false positives were charging ledgers the user never chose). The in-app picker remains only as fallback for devices whose cached backup has no cards.
- **Bug found during analysis:** the widget writes `isCreditCard` inside `entry`, but the Angular queue normalizer read it from the wrapper only — the entire CC auto-assign/picker path never fired for real widget items, and `WidgetExpenseSyncWorker` synced flagged entries straight to Drive charging the default asset account. Worker now keeps flagged-but-unresolved entries queued for the app; both worker and Angular flush charge `debtId` entries against the card; transport-only props (`isCreditCard`, `ccLast4`) are stripped before persist.
- **`cardLast4` matching** (new optional `DebtAccount` field): bank SMS almost always names the card ("ending 1234"/"xx1234"); classifier extracts it, widget/flush match the exact card among many — removes the picker dialog for multi-card users. `creditLimit` (optional) powers a Finances utilization bar (green <30 / amber <70 / red).
- Daily form: cards selectable on create only; edit of `debtId` entries stays blocked (existing product rule; attaching a card during edit would need reverse/apply in `updateEntry`). `addEntry`/`addEntries` charge cards via `applyDebtCharges` (validates active card before mutating, consistent with `applyAccountDeltas`).

### Verification
- `ng build` (development) clean; new planner spec 14/14 green; expense-store, account-totals, backup/storage contract specs green; 3 new Java classifier tests written (Gradle not run — no Android SDK in env, **build natively before shipping**).
- Fixed pre-existing TS compile errors blocking `ng test` in three spec files. Known remaining: `local-notification.service.spec.ts` fails at runtime under the Angular vitest builder (`vi.mock` relative-import unsupported) — pre-existing, needs a TestBed rewrite.

### Rejected approaches
- FCM/server-scheduled CC reminders — debt data lives only in the user's Drive JSON; local notifications need no backend and respect the offline-first rule.
- Widget-side statement math — the widget's cached doc can be stale; app-side planner recomputes on every open; the widget only captures.

## 2026-07-02 - Free/Pro tier gating audit + server-side enforcement fixes

### Context
- User asked for a business-analyst-style audit of free vs Pro tier restrictions across the app, and to verify every Pro-only area is actually guarded, not just gated in the UI.

### Findings
- All Pro feature checks (`SubscriptionService.isPro()`) live only in the Angular client — button visibility, route guards, redirects. None of the Firebase Functions or Firestore rules behind those features checked subscription tier at all. Two of the leaks were direct cost exposure (hosted Groq/Gemini API quota callable by any signed-in free user).

### What was changed
- `functions/src/auth.ts`: new `requireProTier(uid)` helper (Firestore read of `users/{uid}/subscription/status`, same tier+expiry logic as the client).
- `functions/src/ai-insights.ts` (`generateInsights`), `functions/src/ai-voice.ts` (`parseVoiceExpense`), `functions/src/ai-receipt.ts`: hosted (server-key) path now calls `requireProTier` after `requireFirebaseUid`, returns 403 for non-Pro. BYOK path untouched (not a cost leak).
- `functions/src/family.ts` (`createFamily`): now requires Pro for the caller (becomes owner). `redeemFamilyInvite`/`createFamilyInvite`/`dissolveFamily`/`leaveFamily` intentionally left ungated.
- `firestore.rules`: `users/{uid}/reminders` split into `read, delete` (unchanged) vs `create, update` (now requires new `isProUser(uid)` helper when `type == 'location'`).
- Verified via `npx tsc --noEmit` after each individual edit, then a full `npm run build` in `functions/` at the end — all clean.

### Not changed (flagged as residual risk, not fixed)
- Finances (accounts/debts/net worth): only an Angular route guard; data lives in the user's own Drive JSON with no Cloud Function in the write path, so there's no natural server boundary to add without a bigger architecture change. Low severity — costs Spenza nothing, needs devtools access to exploit.
- Native Android widget/budget-warnings/spend-prompt toggles: gated by a locally-cached `spenza_pro_tier` flag only; not investigated at the native Kotlin/Java layer this pass.

### Pending action
- Deploy: `firebase deploy --only firestore:rules,functions:generateInsights,functions:parseVoiceExpense,functions:createFamily --project spenza-notifications` (confirm the receipt-extraction function's export name before including it — CI does not auto-deploy rules).
- Full report (feature matrix, gaps, fixes, growth ideas) delivered as `Spenza_Tier_Gating_Audit.md` in repo root.

## 2026-06-30 - Widget UX: haptic confirm, smart category prediction, partner-aware header

### Context
- Reviewed five proposed "attractive ideas" for the widget. Two were already shipped and need no work: **instant family sync from the widget** (`WidgetExpenseSyncWorker.pushFamilyWidgetExpenses` → `syncWidgetExpenseToFamily` CF, Firestore-from-widget) and **background refresh-token auth** (`exchangeRefreshToken` via securetoken; plus 2026-06-22 silent Google refresh). The remaining three were genuinely missing and were implemented.

### What was changed (native Android only)
- **Haptic confirm on save** — `AndroidManifest.xml` adds `android.permission.VIBRATE`; `ExpenseWidgetActivity.confirmHaptic()` fires a short click vibration on successful expense and credit save (VibratorManager on API 31+, EFFECT_CLICK on Q+, one-shot on O+, legacy fallback). Best-effort/try-guarded so it never blocks saving. Toast already existed.
- **Smart category prediction** — new `WidgetCategoryPredictor.java`: local, read-only score over snapshot `doc.expenses` + current-account widget queue, weighting recency (half-life 21d), time-of-day (±hours from now), and same weekday; returns most-likely type or null below `MIN_CONFIDENCE`. `ExpenseWidgetActivity.resolveInitialType()` opens the More/generic form pre-selected to the prediction (not Misc), shows a "Suggested … from your recent habits" hint, and clears the flag on manual/voice type change. `ExpenseWidgetProvider.applyPredictedHighlight()` highlights the matching quick-action button (or More) via new drawable `widget_predicted_highlight.xml`. Spend-prompt and explicit-category opens are untouched.
- **Partner-aware header** — `ExpenseWidgetProvider.DailyInsight.familySubtitle()` repurposes the existing `expense_widget_subtitle` TextView (no new layout id) to read "FAMILY · YOU/<NAME> LOGGED LAST" in family mode. Today's spend total was already combined (partner deltas merge into the local backup), so the subtitle just frames it. Single mode keeps "DAILY INSIGHT". Avatar simplified to a text name/initials (RemoteViews can't do per-user bitmaps cheaply).

### Verification
- **Not built**: no Android SDK/Gradle in the work environment. Brace balance, symbol resolution, resource refs (`R.id.expense_widget_subtitle`, `R.drawable.widget_predicted_highlight`), and API-level guards checked by hand. **Run a local Gradle build / on-device smoke test before shipping** (per the project's standing native-build caveat).

## 2026-06-28 - Playwright E2E: final 7 failures fixed (suite green) + CI gating

### What was changed (test code only — no app behavior change)
- **`e2e/fixtures/auth.fixture.ts`**: `authenticatedPage` + `proUserPage` now `goto('/#/daily', { waitUntil: 'commit' })` and `await page.locator('#amount-input').waitFor({ state: 'visible' })` before `use(page)`.
- **`e2e/helpers/page-helpers.ts`**: `goOffline`/`goOnline` additionally `dispatchEvent(new Event('offline'|'online'))`.
- **`e2e/tests/03-daily-expense.spec.ts`**: `selectCat()` waits for the chip, clicks, verifies `aria-pressed`, retries once.
- **`e2e/tests/05-limits.spec.ts`** (TC-LMT-05): scoped custom-category fields to `:visible`; assert `toHaveValue('Pet Care')`.
- **`e2e/tests/16-landing.spec.ts`** (TC-LAND-03): assert against raw served HTML via `page.request.get('/')`.
- **`.github/workflows/e2e.yml`** (new): runs the suite on PRs/`main` under `firebase emulators:exec`, uploads the HTML report.

### Why
- Root cause for 4 of 7: `app.html` renders the router-outlet only when `!isLoading()`; the fixture's `waitForURL` returns immediately for hash routes, so tests hit a half-rendered page and going offline mid-bootstrap left an empty `<main>` (seen in the saved `error-context.md` snapshots). The `load`-event wait also hung intermittently → TC-LMT-01's 30s fixture timeout; `waitUntil:'commit'` avoids it.
- TC-PWA-02: `SyncService` keys off window online/offline events that `setOffline` doesn't reliably dispatch.
- TC-LMT-05: limits page renders duplicate mobile (`md:hidden`) + desktop (`hidden md:block`) DOM; `.first()` hit the hidden copy.
- TC-LAND-03: Angular clears the static `#spenza-info` block from `<app-root>` on bootstrap, so the live DOM check was racy; the raw HTTP response is the true no-JS view.

### Verification
- User re-ran `npm run e2e`: **164 passed / 0 failed / 40 skipped** (run 2026-06-28T11:00Z). All 204 specs also transpile via `npx playwright test --list`. Full diagnosis in `e2e/E2E_FIX_NOTES.md` (Pass 3). The 40 skips are intentional env-limits + conditional self-skips (selector-not-found) — candidate follow-up to convert into real assertions.

## 2026-06-13 - Widget palette + surface-style theming (glass/neu/clay/neobrutal)

### What was changed
- Widgets previously only adapted light/dark and used hardcoded violet tokens — they ignored the app's `pf-palette` (violet/rose/azure/emerald/amber) and `pf-style` (glass/neobrutalism/neumorphism/claymorphism) from `ThemeService`. Now both widgets read those keys from `CapacitorStorage` and render a matching body.
- **NEW `WidgetSurface.java`**: software-Canvas renderer that draws the widget body as a Bitmap for each of the 4 styles in the chosen palette + light/dark — glass (translucent gradient + hairline highlight + soft palette glow), neumorphism (rounded surface fill + dual blurred light/dark shadows), claymorphism (pastel radial wash + soft drop shadow + top lip), neobrutalism (flat card + thick ink border + hard offset shadow + palette top bar). Needed because RemoteViews XML drawables can't do blur or per-palette gradients.
- **NEW `WidgetTheme.java`**: reads `pf-palette`/`pf-style`, resolves palette primary/glow via new color resources (so light/dark is handled by resource qualifiers), determines dark via `Configuration.uiMode`, sizes the bitmap from widget options (capped to 400px longest side for the Binder limit), and pushes it via `setImageViewBitmap`. Exposes `primaryColor()` + `ctaDrawable()` for accents.
- **Layouts**: all 4 widget layouts (`streak_widget`, `streak_widget_compact`, `expense_widget`, `expense_widget_quick`) wrapped in a `FrameLayout` with a full-bleed `@id/widget_surface` ImageView (scaleType fitXY) behind transparent content; the FrameLayout keeps `expense_widget_background` as a static fallback. Added ids `streak_title`, `expense_widget_brand`.
- **Providers**: both `StreakWidgetProvider` and `ExpenseWidgetProvider` call `WidgetTheme.applySurface()` + recolor the title (palette primary) and CTA/brand badge (per-palette gradient drawable `widget_primary_grad_<palette>`).
- **Resources**: 10 palette color entries in light + `values-night/colors.xml`; 5 `widget_primary_grad_*` gradient drawables.

### Why these decisions were made
- Bitmap rendering over static drawables: 5 palettes × 4 styles × light/dark would be ~40 drawables, and neu/clay REQUIRE blurred shadows that shape XML cannot produce. One Canvas renderer covers all combinations and reads the exact app palette.
- Glass keeps the opaque fallback background behind it (frosted panel over the app gradient) rather than true wallpaper bleed — widgets can't do real backdrop blur, and this keeps text legible on any wallpaper.

### Verification
- Manual sweep: 4 layouts balance (FrameLayout/ImageView/content), palette colors present in both colors files, all R refs resolve, `pf-palette`/`pf-style` confirmed stored raw in `CapacitorStorage` by `StorageService`. **Gradle build NOT run** (no Android SDK in sandbox) — build locally; check `setImageViewBitmap` size on a real device.

## 2026-06-13 - Native Android Daily Streak Widget (Duolingo-style) + Expense Widget Restyle

### What was changed
- **NEW `StreakCalculator.java`**: Pure local logic. Streak rule = a day counts if ≥1 expense is logged on that local date (chosen over "stay under daily budget" / "log-or-open"). Reads logged dates from `spenza_drive_backup_snapshot_v1` (`doc.expenses[].date`) + current-account `spenza_widget_expense_queue_v1` entries (email-scoped, same filter as `DailyInsight`). Computes `currentStreak` (walks back from today if logged, else yesterday — so streak stays "alive" until midnight), `longestStreak` (max run; also persisted as `spenza_streak_best_v1`), `last7[]`, and a 3-way `state` (ACTIVE / AT_RISK / BROKEN).
- **NEW `StreakWidgetProvider.java`** + layouts `streak_widget.xml` (full: brand header, flame badge + count, reaction message, last-7-day dots, CTA) and `streak_widget_compact.xml` (short height, < 130dp). State drives flame icon (`ic_widget_flame` vs `ic_widget_flame_off`), badge bg, count/status colors, and message copy. Tapping opens `MainActivity` (per user choice). `xml/streak_widget_info.xml` registers it (4x3 target, resizable).
- **NEW `StreakReminderScheduler.java` + `StreakReminderReceiver.java`**: AlarmManager fires daily at **20:00**; if `!todayComplete` posts a "keep your streak alive 🔥" notification on a new `streak-reminders` channel (`NotificationChannelManager`). Message varies by streak>0 (at-risk) vs 0 (start). Re-arms next day + repaints widget. Scheduled from provider `onEnabled`/`onUpdate`, `MainActivity.onCreate`, and `BootReceiver` — all guarded on `hasStreakWidget()`; cancelled in provider `onDisabled`. Falls back to inexact alarm on `SecurityException` (Android 12+ exact-alarm).
- **NEW `StreakWidgetPlugin.java`** (registered in `MainActivity`): `refresh/isAdded/isSupported/requestPin`, mirrors `ExpenseWidgetPlugin`. Refresh is also automatic: `ExpenseWidgetProvider.updateAll()` now also calls `StreakWidgetProvider.updateAll()`, so existing `ExpenseWidgetPlugin.refresh()` on snapshot writes keeps the streak widget current with no Angular change.
- **Expense widget restyle**: `expense_widget.xml` header gained the shared brand-badge lockup (`widget_brand_badge` + `ic_widget_spark`) and matched subtitle type, so both widgets read as one family.
- **Resources**: 10 new flame/streak color tokens in light + `values-night/colors.xml`; vector icons `ic_widget_flame` (aapt gradient, OK since minSdk=24), `ic_widget_flame_off`, `ic_widget_spark`; badge/dot/pill/CTA drawables; streak widget strings. Manifest: `StreakWidgetProvider` + `StreakReminderReceiver`.

### Why these decisions were made
- Feature kept standalone/removable like the expense widget (own provider + manifest receiver; reminder cancels on `onDisabled`) per Native Android Widget Rules.
- Streak reminder posts the notification directly in the receiver (NotificationCompat) rather than relying on Capacitor LocalNotifications, since it must fire when the app process is closed.
- Reminder tied to widget presence so users who never add the widget aren't notified.

### Verification
- Manual reference sweep: all `R.id/drawable/layout/color/string/mipmap/xml` refs in new Java resolve to created resources; both colors files carry all 10 tokens; widget ids match layouts. **Gradle build NOT run** (no Android SDK in agent sandbox) — run `./gradlew :app:assembleDebug` locally before shipping.

## 2026-06-12 - Reminders Fix (Missing Firestore Rules) + Google Maps Location Picker

### What was changed
- **`firestore.rules`**: Added `match /users/{uid}/reminders/{reminderId}` with owner-only read/write. This was the root cause of the reminder screen "not working" — the catch-all deny rule blocked every reminder read/write (permission-denied on list load and save). **Must be deployed manually**: `npx firebase-tools deploy --only firestore:rules --project spenza-notifications` (the CI workflow does not deploy rules).
- **`src/index.html`**: Added `window.__GOOGLE_MAPS_API_KEY__ = 'GOOGLE_MAPS_API_KEY_PLACEHOLDER'` (same injection pattern as Razorpay key).
- **NEW `core/services/google-maps-loader.service.ts`**: Lazy one-time loader for the Google Maps JS API with minimal structural typings (no `@types/google.maps` dependency). `isConfigured()` returns false when the placeholder is unreplaced (local dev) so the UI falls back to search-only.
- **`reminder-form.component.ts`**: Interactive map picker for location reminders — tap-to-pick, draggable marker, radius circle synced to the slider, search results recenter the map. Map-picked points get a human-readable name via free Nominatim reverse geocoding (keeps Google billing to map loads only). Map block hidden entirely when key is missing or script fails.
- **`.github/workflows/deploy-firebase.yml`**: New warn-only injection step replacing `GOOGLE_MAPS_API_KEY_PLACEHOLDER` from the `GOOGLE_MAPS_API_KEY` GitHub secret. Deliberately non-fatal (unlike Razorpay validation) so deploys don't break before the secret exists.
- i18n: `reminders.form.mapHint`, `reminders.form.pinnedLocation` in en/ta/hi.

### Why these decisions were made
- Firestore denies by default; the reminders feature shipped without rules, so the failure was silent (generic error toast / empty list). Rules deploy is manual because CI `--only` list excludes `firestore:rules`.
- Google Maps JS chosen by user over Leaflet/OSM despite key+billing requirement. Key exposure client-side is normal for Maps JS; must be HTTP-referrer-restricted (`https://spenza-finance.web.app/*` and `https://localhost/*` for Capacitor Android WebView).
- Reverse geocoding stays on Nominatim (free) rather than Google Geocoder to avoid per-call billing.

### Verification
- `tsc -p tsconfig.app.json --noEmit` clean. Full `ng build --configuration production` could not run in the agent sandbox (macOS esbuild binaries) — run locally before deploy.

---

## 2026-06-10 - Netlify → Firebase Migration + Hosted AI Tier (C1 Fix)

### What was changed
- **`netlify.toml`**: Removed `functions = "netlify/functions"` and `send-reminders` schedule block. Netlify is now hosting-only. `personal-finance-pwa/netlify/` folder is dead code (cannot delete via agent — must be deleted manually).
- **`functions/src/ai-insights.ts`**: Added `callGroq()`. Removed mandatory `X-Gemini-Api-Key` guard. When no user key in header, uses `GROQ_API_KEY` env var (Llama 3.3 70B). Added `GROQ_API_URL` / `GROQ_MODEL` constants. Response now includes `provider: 'groq' | 'gemini'`.
- **`functions/src/ai-voice.ts`**: Same Groq pattern. `callGroq()` added. No key header → uses `GROQ_API_KEY`. Returns `provider: 'groq' | 'gemini'`.
- **`functions/src/ai-receipt.ts`**: User key takes priority; server-side `GEMINI_API_KEY` env var used when no user key (multimodal still requires Gemini).
- **`src/app/core/services/ai-settings.service.ts`**: Added `'hosted'` to `AiProviderMode`. Default changed `'disabled'` → `'hosted'`. `normalize()` maps all unknown/legacy to `'hosted'`. `isHosted()` method added.
- **`src/app/core/services/ai-insight.service.ts`**: `maxTotalCallsPerDay` 2→5, `maxCallsPerLocalePerDay` 1→2. Hosted mode skips key check and `X-Gemini-Api-Key` header. Accepts `'groq'` as valid provider in response. Added `'groq'` to `AiInsightProvider` type.
- **`src/app/core/services/ai-receipt-extraction.service.ts`**: Hosted mode sends no key header. `provider` type widened to `'gemini' | 'hosted'`. Error messages de-Gemini-ified.
- **`src/app/core/services/ai-voice-expense.service.ts`**: Same hosted mode handling. `provider` type widened to `'gemini' | 'groq'`. Error messages de-Gemini-ified.

### Why these decisions were made
- Groq chosen over Gemini free tier for hosted text tasks: Groq's free tier does not train on API data (critical for a personal finance app), offers 14,400 req/day for Llama 3.1 8B, and is OpenAI-API-compatible making integration trivial. Gemini free tier uses data for training which is unacceptable for financial data without explicit user disclosure.
- Receipt extraction stays on Gemini because Groq free tier does not support multimodal (vision) inference. `GEMINI_API_KEY` covers this. Cost is negligible (~₹0.003/call).
- `'hosted'` as default means AI is on for 100% of users on first open — no settings change required. Users who want to supply their own key still can (`'user-key'`). Users who want to opt out can (`'disabled'`).
- Netlify functions are not deleted from disk (agent cannot delete host files) but are fully unreferenced by app code and `netlify.toml`.

### Required Firebase secrets to deploy
```bash
firebase functions:secrets:set GROQ_API_KEY   # Groq console → API Keys
firebase functions:secrets:set GEMINI_API_KEY # aistudio.google.com → API Keys
firebase deploy --only functions
```

### Build verification
- `npx tsc --noEmit` in `personal-finance-pwa/` — zero errors.
- `npm run build` in `functions/` — zero errors.
- VM-side `npm run build --configuration production` fails due to esbuild platform mismatch (node_modules installed on macOS, VM runs Linux ARM64). This is a known VM limitation, not a code error. Build passes on the host machine.

## 2026-06-06 - Migration Path for Shared-Drive Family Users + Cleanup (Prompt 7 of Family Sync Migration)

### What was changed
- **`app.ts`**:
  - Added `needsFamilyMigration` and `migrationBannerDismissed` signals (both public, readonly).
  - Added `dismissMigrationBanner()` method (called from template).
  - Added `checkLegacyFamilyMode()` private method — reads mode/sharedFileId/familyFolderId/getFamilyId signals and sets `needsFamilyMigration` when user is in old Drive-based family mode with no Firestore ID.
  - Called `checkLegacyFamilyMode()` after `loadFromDrive()` in both `bootstrapData` (non-cached path) and `bootstrapDriveInBackground` (cached path).
  - Fixed `tryLoadCachedStartupData`: localSetupComplete now also accepts `!!getFamilyId()` so Firestore-backed family users (null sharedFileId) can use the fast cached startup path.
  - Fixed bootstrap redirect guard: `if (mode === 'family' && !getSharedFileId())` now also requires `!getFamilyId()` before redirecting to /family-setup. This prevents Firestore family users from being incorrectly bounced into family setup on every startup — a bug introduced when sharedFileId was set to null in Prompt 4.
  - Same guard fixed in `bootstrapDriveInBackground` early-return condition.
- **`app.html`**: Added dismissible amber banner inside the `@else` (loaded) block. Banner text: "Spenza's family sync has been updated. Please go to Settings → Family to reconnect with your partner." Dismiss button calls `dismissMigrationBanner()`.
- **`settings.component.ts`**:
  - Added migration prompt card (amber border, amber bg) before the owner/partner family status blocks. Shown when `mode === 'family' && !firestoreFamilyId()`. Contains "Update now" button navigating to `/family-setup` and subtext about reconnect time.
  - Updated Owner block condition to require `firestoreFamilyId()` — hides Firestore-dependent UI (partner email, generate invite) from old Drive users who can't use those flows.
  - Updated Partner block condition to require `firestoreFamilyId()` — same reason.
- **`google-drive.service.ts`**: Added `// TODO: Remove after 2026-09-01 — no users should be on old shared-Drive family mode by then.` above all four deprecated legacy family methods: `createFamilyFolderBundle`, `findExistingFamilyFolderBundle`, `findBackupFileInFolder`, `findOrCreateReceiptsFolderInFamilyFolder`.
- **`docs/DATA_SAFETY.md`**: Added "Family Sync" section — Firestore-only delta sync, amounts/categories/dates only (no comments/receipts), deleted on dissolve.
- **`docs/OAUTH_SCOPE_JUSTIFICATION.md`**: Updated `drive.appdata` section to clarify it applies to ALL users (single and family) now that family no longer uses shared Drive. Removed stale "Spenza Family folder" reference from What Spenza Does NOT Do list.
- **`ai/AI_RULES.md`**: Added two rules under Google Auth / Drive Rules:
  - Keep family mode folder-based logic deprecated; do not add new features against the four deprecated methods.
  - Family sync uses Firestore activity deltas for expenses only; accounts/debts/limits/income sync via Drive polling.
- **`ai/CURRENT_STATE.md`**: Updated Active Project Shape family mode description; prepended Prompt 7 to Recently Completed Features.

### Why these decisions were made
- Migration detection is non-blocking by design: old Drive family mode still works (sharedFileId is still stored and Drive polling still reads the shared backup). The banner is informational only.
- The Firestore bootstrap bug fix (null sharedFileId causing redirect to /family-setup) was a silent regression from Prompt 4. New Firestore family users with no sharedFileId were being incorrectly treated as "family setup incomplete". The fix correctly distinguishes old Drive mode (sharedFileId set, no firestoreFamilyId) from new Firestore mode (firestoreFamilyId set, null sharedFileId).
- Owner/partner blocks gated on `firestoreFamilyId()` prevents misleading UI: old users can't generate Firestore invite codes, and the partner email display would always be empty (null familyDoc). Migration card replaces that confused state with a clear action.
- TODO removal date set to 2026-09-01 — 3 months to ensure all active sessions have migrated.
- `docs/` updates keep OAuth verification and data safety documentation accurate after the family mode architecture change.

### Build verification
- `npm run build -- --configuration production` in `personal-finance-pwa/` — zero errors.
- `npm run build` in `functions/` — zero errors.
- `grep -r "createFamilyFolderBundle|findBackupFileInFolder|findExistingFamilyFolderBundle" personal-finance-pwa/src/app/features` — 0 results.

## 2026-06-06 - Settings Family Status UI for New Architecture (Prompt 6 of Family Sync Migration)

### What was changed
- **`functions/src/family.ts`**: Added `dissolveFamily` Firebase Function v2 — POST only, requires Firebase ID token, verifies caller is owner of `families/{familyId}`, sets `status: 'dissolved'` and `updatedAt`, returns `{ success: true }`.
- **`functions/src/index.ts`**: Imported and exported `dissolveFamily`.
- **`core/services/family-api.service.ts`**: Added `dissolveFamily(familyId)` method — same pattern as other family API methods (Bearer token, POST, throws FamilyApiError on non-200).
- **`features/settings/settings.component.ts`**:
  - Added imports: `FamilyDocument`, `FamilyApiService`, `firebaseConfig`.
  - Injected `FamilyApiService`.
  - New signals: `familyDoc`, `isGeneratingInvite`, `generatedInviteCode`, `inviteCodeExpiry`, `isLeavingFamily`, `isLeaveFamilyModalOpen`.
  - `ngOnInit` now calls `loadFamilyDoc()` when mode is 'family' and `firestoreFamilyId` is set.
  - `loadFamilyDoc()`: dynamic firebase import → `getDoc(doc(db, 'families', familyId))` → sets `familyDoc` signal.
  - `onGenerateInvite()`: calls `FamilyApiService.createFamilyInvite(familyId)`, sets `generatedInviteCode` and `inviteCodeExpiry`.
  - `onCopyInviteCode()`: copies invite code to clipboard.
  - `onLeaveFamily()`: opens leave family modal.
  - `onLeaveFamilyConfirmed()`: calls `dissolveFamily` (owner only, non-fatal), clears `firestoreFamilyId`, closes modal, then calls existing `#executeModeSwitch()`.
  - Family owner template block: replaced Drive folder ID input + Open-in-Drive link with partner email status + generate invite + leave family buttons.
  - Family partner template block: replaced Drive folder ID input with owner email + leave family button.
  - Added invite code modal (app-modal, showActions=false) with code field + copy button + done button.
  - Added leave family confirmation modal with owner/partner-specific messaging and loading state.
- **`assets/i18n/en.json`, `hi.json`, `ta.json`**: Added 6 keys — `settings.family.noPartner/partner/owner/generateInvite/inviteGenerated/inviteExpiry`.

### Why these decisions were made
- `dissolveFamily` as a Firebase Function keeps all write authority server-side — clients cannot directly modify `families/{familyId}` status per Firestore rules.
- `onLeaveFamilyConfirmed` calls `dissolveFamily` for owner only (non-fatal failure) because the partner leaving doesn't dissolve the family — the owner must do that. Partner leaving is just local state cleanup + mode switch.
- The existing `#executeModeSwitch()` already handles Drive family→single backup migration, `clearAll()`, sign-out, and navigation — reusing it avoids duplicating complex state cleanup.
- `loadFamilyDoc()` uses the same dynamic Firebase import pattern as `FamilySyncService` and `SubscriptionService` — no new static dependency added to the component.
- `familyDriveUrl()` and `onCopySharedFileId()` methods retained unchanged since they're still used by the owner switch-warning modal.

### Build verification
- `npm run build` in `functions/` — zero errors.
- `npm run build -- --configuration production` in `personal-finance-pwa/` — zero errors.

## 2026-06-06 - Remove Full Drive Scope + Auth Update (Prompt 5 of Family Sync Migration)

### What was changed
- **`auth.service.ts`**: Removed `DRIVE_SCOPE` constant (`https://www.googleapis.com/auth/drive`) and its explanatory comment. Updated `ALL_SCOPES` to exclude the full drive scope — now requests only `openid email profile spreadsheets drive.appdata`. Bumped `SCOPE_VERSION` from `'7'` to `'8'` with comment `v8 = removed full drive scope (family sync now uses Firestore)`. Removed `DRIVE_SCOPE` from the native `#nativeSignIn` scopes array.
- **`google-drive.service.ts`**: Added `@deprecated LEGACY — shared Drive folder family mode. No longer called by new Firestore-backed family sync. Safe to delete after confirming no existing users are on old family mode.` JSDoc to `createFamilyFolderBundle()`, `findExistingFamilyFolderBundle()`, `findBackupFileInFolder()`, `findOrCreateReceiptsFolderInFamilyFolder()`. Methods are retained for migration path.
- **`docs/OAUTH_SCOPE_JUSTIFICATION.md`**: Replaced the `## drive scope` section with `## drive scope — REMOVED` explaining the Firestore migration rationale.
- **`docs/DATA_SAFETY.md`**: Updated "Google Drive file access (backup files only)" to "Google Drive AppData folder access (private backup files only, not user-visible files)" to accurately reflect that no user-visible Drive files are accessed.
- **`ai/AI_RULES.md`**: Replaced the stale rule `Preserve full Drive scope unless a deliberate auth redesign is made: Family partner access depends on shared-file/folder access.` with `Do not re-add the full drive scope. Family sync uses Firestore. Only drive.appdata is needed.`
- **`ai/PROJECT_CONTEXT.md`**: Updated Required scopes list (removed Full Drive entry) and `SCOPE_VERSION` from `'6'` → `'8'`.

### Why
- Prompt 5 of the Firestore-backed family sync migration. Now that family sync runs entirely through Firestore (Prompts 1–4), no user reads another user's Drive file. The full `drive` scope was the only reason for requesting access beyond AppData.
- Dropping the scope shrinks the OAuth consent surface and removes the requirement that prompted Google's OAuth verification for the `drive` scope.
- `SCOPE_VERSION` bump to `'8'` forces all users with cached auth state to re-consent on their next sign-in, which drops the previously granted `drive` scope from their OAuth grant.
- `BackupModeService.setFamilyConfig()` null-handling was already done in Prompt 4 — no further changes needed.

### Verification
- `grep -r '"https://www.googleapis.com/auth/drive"' personal-finance-pwa/src` — 0 results.
- `npm run build -- --configuration production` — zero errors.

## 2026-06-06 - FamilySetupComponent: Invite-Code Flow (Prompt 4 of Family Sync Migration)

### What was changed
- **`family-setup.component.ts`** — complete rewrite:
  - New step union type: `'role-select' | 'owner-creating' | 'owner-ready' | 'partner-enter-code' | 'partner-joining' | 'done' | 'owner-paywall'`.
  - All `GoogleDriveService` references removed from the component (service itself kept for migration fallback).
  - Owner flow: Pro gate → `createFamily()` → `createFamilyInvite()` → `setFirestoreFamilyId()` → `setFamilyConfig(null, null, 'owner')` → `startListening()` → owner-ready step shows invite code.
  - Owner-ready: invite code displayed in large monospace font with copy-to-clipboard + 24h expiry note + instruction + "Continue to app" button.
  - `createFamily` failure → `userFeedback.error` toast, back to role-select.
  - `createFamilyInvite` failure → error banner in owner-creating step with retry button (retries from stored `#pendingFamilyId`).
  - Partner flow: enter 8-char invite code (uppercase, maxlength 8) → `redeemFamilyInvite()` → `setFirestoreFamilyId()` → `setFamilyConfig(null, null, 'partner')` → `startListening()` → `/daily`.
  - Partner errors: 404 → expired/invalid message; 409 → already-used message; other → network error message.
  - Error messages are i18n keys rendered via TranslatePipe in template.
  - Pro paywall step and `onGoToPro()` logic preserved unchanged.
  - Services injected: `FamilyApiService`, `FamilySyncService`, `BackupModeService`, `SubscriptionService`, `AuthService`, `UserFeedbackService`, `Router`.
  - Lucide icons: `Crown, Users, Copy, Check, Loader2, AlertCircle, Lock` (removed `ExternalLink` since Drive link is gone).
- **`family-api.service.ts`**: Added `export class FamilyApiError extends Error` with `status: number` field. All three methods now throw `FamilyApiError(status, message)` instead of generic `Error`.
- **`functions/src/family.ts`**: `redeemFamilyInvite` error handler now returns 409 for "already redeemed", 404 for "not found / expired / owner-self-redeem / family not found", 401 for unexpected failures. Was 400 for all client errors.
- **`backup-mode.service.ts`**: `setFamilyConfig(fileId: string | null, ...)` — first parameter widened from `string` to `string | null`. Storage write now removes the `CACHE_KEY_SHARED_FILE_ID` key when null, same pattern already used for `folderId`.
- **`en.json`, `ta.json`, `hi.json`**: 11 new `family.invite.*` keys: `ownerReady.title/expiry/instruction/continue`, `partner.title/description/placeholder/connect`, `error.expired/alreadyUsed/network`.

### Why
- Prompt 4 of the Firestore-backed family sync migration. Replaces the Drive-folder-sharing family setup with an invite-code flow backed by the Firebase Functions added in Prompt 1.
- Drive-based family setup remains in place as a migration fallback — this prompt only replaces the setup component UI/logic.
- `setFamilyConfig(null, null, role)` is intentional: the new flow does not create/share a Drive folder; `sharedFileId` and `familyFolderId` remain null for Firestore-backed families.
- `FamilyApiError` was needed so the component can distinguish 404 (expired) from 409 (already used) without parsing error message strings.
- Firebase function status codes were updated to match the semantics the component expects (404/409), making the HTTP contract explicit.

### Verification
- `npm run build -- --configuration production` — zero errors.

## 2026-06-06 - ExpenseStore: Push Deltas + Merge Incoming Deltas (Prompt 3 of Family Sync Migration)

### What was changed
- **`BackupModeService`**: Added `CACHE_KEY_FIRESTORE_FAMILY_ID = 'spenza_firestore_family_id'` cache key; `readonly firestoreFamilyId = signal<string | null>(null)` signal; loads and persists the signal in `#loadFromCache()`; clears it in `clearFamilyState()`, `clearAll()`, and `clearLocalCacheForAccountSwitch()`; added `getFamilyId(): string | null` getter and `setFirestoreFamilyId(id: string | null): Promise<void>` setter.
- **`expense-store.service.ts`**: Added imports for `FamilyActivityDelta` and `FamilySyncService`. Added module-level `buildDelta()` function that constructs an `Omit<FamilyActivityDelta, 'activityId'>` from an action, entry, and author context. Injected `familySyncService` in `withMethods`. Added `pushFamilyDelta()` private helper inside `withMethods` — fire-and-forget, only acts when mode is `'family'`, familyId, uid, and role are all set. Added delta pushes after `markLocalChangeAndPersist()` in: `addEntry` (create, skips debt-payment), `addEntries` (one create per entry), `deleteEntry` (delete, if entry was found), `updateEntry` (update), `recordDebtPayment` (create), `updateDebtPayment` (update), `deleteDebtPayment` (delete). Added `activity$` subscription before `return methods;` — merges partner deltas by skipping own-authored ones, handles create/update/delete on `entries` array only, sorts by timestamp desc, then increments `localRevision` and calls `persistToDrive()` fire-and-forget.
- **`app.ts`**: Imported and injected `FamilySyncService`. Added private `tryStartFamilySync()` method that calls `familySyncService.startListening(familyId, uid)` when mode is `'family'` and both familyId and uid are present. Called from `bootstrapData()` (after cached restore path) and `bootstrapDriveInBackground()` (after Drive bootstrap). Added `familySyncService.stopListening()` to `ngOnDestroy()`.

### Why
- Prompt 3 of the Firestore-backed family sync migration. Wires `FamilySyncService` into `ExpenseStore` so that every owner/partner expense mutation publishes a delta to Firestore, and incoming partner deltas are merged into local state and Drive backup in real time.
- Delta push is always fire-and-forget — never blocks the save path.
- Incoming deltas only modify `entries` array; accounts/debts/limits/income continue to sync via Drive polling.
- `getFamilyId()` in `BackupModeService` stores the Firestore family document ID (different from Drive folder ID) so the listener can be started from cached state on subsequent app loads.
- `tryStartFamilySync()` is guarded so it silently no-ops for existing users who have not yet gone through the Firestore family invite flow.

### Verification
- `npx vitest run src/app/core/services/expense-store.service.spec.ts` — 32 tests passed.
- `npm run build -- --configuration production` — zero errors.

## 2026-06-06 - FamilySyncService + FamilyApiService (Prompt 2 of Family Sync Migration)

### What was changed
- **`AuthService`**: Added `getFirebaseIdToken(): Promise<string | null>` — calls `auth.authStateReady()` then returns `currentUser.getIdToken()` or `null` if no Firebase user is available. Does not attempt re-authentication. Used by `FamilyApiService`.
- **NEW `family-sync.service.ts`**: providedIn root service that owns the real-time Firestore connection for family activity deltas.
  - Signals: `familyId`, `partnerEmail`, `syncStatus` (`'idle'|'connected'|'error'`), `lastSyncAt`.
  - `activity$: Observable<FamilyActivityDelta[]>` backed by a private RxJS `Subject`.
  - `startListening(familyId, currentUid)`: calls `ensureFirebaseSignedInSilently`, then attaches `onSnapshot` on `families/{familyId}/activity` ordered by `timestamp` desc, limit 200. Tracks processed IDs in a `Set`; emits only unseen deltas. Sets `syncStatus='connected'` on first snapshot, `'error'` on Firestore failure with one 3s retry. Updates `lastSyncAt` on every snapshot. Follows same lazy `#getDb()` / private-field pattern as `SubscriptionService`.
  - `stopListening()`: detaches listener, resets `familyId`/`partnerEmail`/`syncStatus` to idle.
  - `pushDelta(familyId, delta)`: uses `addDoc` directly; no pre-auth (caller responsibility).
- **NEW `family-api.service.ts`**: thin HTTP wrapper for the three Firebase Functions.
  - `createFamily()`, `createFamilyInvite(familyId)`, `redeemFamilyInvite(inviteCode)`.
  - Each method fetches a null-safe `getFirebaseIdToken()`, sends a POST with `Authorization: Bearer` and `Content-Type: application/json`, throws a descriptive `Error` on non-200.
  - `functionsBase` is a getter pointing to `https://us-central1-spenza-notifications.cloudfunctions.net`.

### Why
- Phase 2 of the Firestore-backed family sync migration. Phase 1 added the data model, rules, and Cloud Functions. This phase adds the Angular services that will be consumed by `ExpenseStore` (subscribe to `activity$`) and `FamilySetupComponent` (call `FamilyApiService` methods).
- `FamilySyncService` uses a `Subject` (not `BehaviorSubject`) deliberately — subscribers get only fresh deltas as they arrive; `ExpenseStore` is responsible for merging incoming deltas into Drive-backed state.
- `getFirebaseIdToken()` returns null rather than throwing so `FamilyApiService` can surface a clean error without an uncaught exception path when Firebase Auth is unavailable.
- No component or store wiring in this prompt — Drive-backed family mode remains unchanged.

### Verification
- `npm run build -- --configuration production` in `personal-finance-pwa` — passed, zero errors.

## 2026-06-06 - Firestore Data Model + Security Rules for Firestore-Backed Family Sync (Additive)

### What was changed
- **NEW** `personal-finance-pwa/src/app/core/models/family-sync.model.ts`: Four TypeScript interfaces for the new Firestore-backed family sync architecture — `FamilyDocument`, `FamilyActivityDelta`, `ExpenseDeltaPayload`, `FamilyInvite`. No existing code touched.
- **`personal-finance-pwa/src/app/core/models/index.ts`**: Added `export * from './family-sync.model'` at end of list.
- **`personal-finance-pwa/firestore.rules`**: Replaced with expanded rules covering the new collections (`families`, `families/{id}/activity`, `familyInvites`) plus the existing subscription rule. Includes a `isFamilyMember()` helper. Activity deltas are client-writable but immutable after creation; family doc and invite doc writes are Functions-only.
- **NEW** `personal-finance-pwa/functions/src/family.ts`: Three Firebase Functions v2 onRequest stubs — `createFamily` (idempotent), `createFamilyInvite` (owner-only, 24h TTL, 8-char code), `redeemFamilyInvite` (transactional partner join). Each uses a local `requireFamilyAuth` helper to get both `uid` and `email` from the bearer token (differs from the single-UID `requireFirebaseUid` helper because family flows also need email).
- **`personal-finance-pwa/functions/src/index.ts`**: Added import and exports for `createFamily`, `createFamilyInvite`, `redeemFamilyInvite`.
- **`personal-finance-pwa/functions/tsconfig.json`**: Added `"exclude": ["src/stripe.ts"]` — Stripe was removed from package.json and index.ts in a prior session but `stripe.ts` was left behind; without the exclusion TypeScript fails to find the `stripe` module type declarations, breaking the build.

### Why
- This is Phase 1 of the Drive-free family sync migration: replace the shared-Drive-folder model with Firestore so only the `drive.appdata` scope is needed (full Drive scope can be removed in a later prompt).
- Doing this additively (no changes to BackupModeService, ExpenseStore, GoogleDriveService, or Angular components) means existing Drive-backed family mode keeps working until the client integration is wired in a follow-up prompt.
- `FamilyDocument` and `FamilyActivityDelta` are intentionally separate collections so activity history can be queried and paginated independently of the family membership record.
- Invites use a random 8-char alphanumeric code (stored as the document ID) so the partner can enter a short human-readable code rather than a Firestore auto-ID.
- `redeemFamilyInvite` runs a Firestore transaction to prevent double-redemption under concurrent requests.

### Verification
- `npm run build` in `personal-finance-pwa/functions` — passed (0 errors).
- `npm run build -- --configuration production` in `personal-finance-pwa` — passed.

## 2026-06-05 - Replace Native Browser alert/confirm With Design System UI

### What was changed
- `daily-expense.component.ts`: updated voice-unsupported warning to use `feedback.warning()` with i18n key `daily.voice.unsupportedBrowser`.
- `daily-expense.component.ts` template: updated delete-expense modal title from interpolated `daily.deleteConfirm` to `daily.deleteConfirm.title`; added `daily.deleteConfirm.message` body paragraph.
- `expense-limit.component.ts` template: updated custom-category delete modal title from `limits.custom.deleteConfirm` to `limits.deleteConfirm.title`; added `limits.deleteConfirm.message` body paragraph.
- `settings.component.ts`: updated `onTestNotification()` feedback to use `i18n.t('settings.notifications.testSent')` instead of hardcoded English.
- `en.json`, `ta.json`, `hi.json`: added `daily.voice.unsupportedBrowser`, `daily.deleteConfirm.title`, `daily.deleteConfirm.message`, `limits.deleteConfirm.title`, `limits.deleteConfirm.message`, `settings.notifications.testSent`.

### Why
- Native `alert()`/`confirm()` dialogs block the main thread, ignore app theming, and fail on some mobile WebView environments.
- All user-facing confirmations and feedback must go through `ModalComponent` or `UserFeedbackService` to maintain design consistency and mobile reliability.
- The core implementations (modal signals/methods) were already in place from prior sessions; this session completed the i18n key alignment and message body paragraphs the task specification required.

### Verification
- `npx vitest run daily-expense/daily-expense.component.spec.ts expense-limit/expense-limit.component.spec.ts settings/settings.component.spec.ts` — 91 tests passed.
- `npm run build -- --configuration production` — passed.

## 2026-06-05 - SyncService Legacy Hardening

### What was changed
Made the legacy status of `SyncService` explicit and safe so that unexpected activation cannot silently write stale data to Google Sheets and new developers can clearly see this is not the primary persistence path.

### Changes made
- **`SyncService`** (`src/app/core/services/sync.service.ts`):
  - File-level comment block was already present (added previously); verified it correctly directs readers to Drive/ExpenseStore.
  - Added `pf_sheet_id` early-return guard to `enqueueDelete()` — if no Sheets ID is configured, logs a `console.warn` in dev mode and returns immediately.
  - Added `pf_sheet_id` early-return guard to `enqueueUpdate()` — same pattern.
  - Updated `flushQueue()` guard warning message to the canonical format `[SyncService] flushQueue skipped — no Sheets ID configured.` (was slightly different phrasing before).
  - The guard in `enqueue()` (create path) was already correct and required no change.
- **`ai/AI_RULES.md`**:
  - Added three explicit rules under "Offline / Legacy Sheets Rules": do not delete `SyncService` or any of its methods; do not change existing callers; do not change the IndexedDB DB name or store name.

### Key decisions
- Existing `DailyExpenseComponent` callers that enqueue after Drive persistence are intentionally left in place — they are now no-ops when `pf_sheet_id` is absent, which is the normal production state.
- No IndexedDB schema or DB name changes — preserving backward compatibility for any user who has items already in the queue.
- Code is not deleted — retained for potential future Sheets migration tooling.

### Files changed
- `src/app/core/services/sync.service.ts`
- `ai/AI_RULES.md`

### Build
- `npm run build -- --configuration production` — passed.

## 2026-06-05 - beforeunload Guard for Unsaved Daily Expense Drafts

### What was changed
Added a browser `beforeunload` guard to `DailyExpenseComponent` so users see the native "Leave site? Changes you made may not be saved" dialog when they have an unsaved draft or active receipt extraction and attempt to close/reload the tab.

### Changes made
- **`DailyExpenseComponent`** (`src/app/features/daily-expense/daily-expense.component.ts`):
  - Added `HostListener` to the `@angular/core` import.
  - Added `Capacitor` import from `@capacitor/core`.
  - Added `onBeforeUnload(event: BeforeUnloadEvent)` method decorated with `@HostListener('window:beforeunload', ['$event'])`.
  - Guard fires when: form is `touched` AND `amount > 0` (user has typed meaningful data), OR `receiptExtractionSession.extraction()` is non-null.
  - Guard is a no-op on `Capacitor.isNativePlatform() === true` (native apps don't use browser unload events).

### Key decisions
- No changes to `DailyExpenseDraftService` — the draft persistence behavior is correct and this guard is purely a warning layer.
- Used the existing `receiptExtractionSession` private field (already injected) rather than adding any new injection.
- `event.returnValue = ''` required for Chrome compatibility in addition to `event.preventDefault()`.

### Files changed
- `src/app/features/daily-expense/daily-expense.component.ts`

### Build
- `npm run build -- --configuration production` — passed.

## 2026-06-05 - Dead-code Removal: detectProvider() and DATA_SAFETY.md Stripe/ipapi cleanup

### What was changed
Two isolated cleanup items in one commit.

### Changes made
- **`PaymentService`** (`src/app/core/services/payment.service.ts`): Removed `detectProvider()` public method, `#readCountryCache()` private helper, `spenza_payment_country` cache key constant, 7-day TTL constant, `StorageService` import, and `StorageService` inject. Only Razorpay-related methods (`openRazorpay`, `restoreSubscription`, `cancelSubscription`, `#verifyPayment`, `#razorpayKey`, `#loadRazorpayScript`) and `AuthService` remain.
- **`docs/DATA_SAFETY.md`**: Payment Info section now references Razorpay only (removed "or Stripe (international)"); "Razorpay/Stripe are sub-processors" replaced with "Razorpay is a sub-processor under their own privacy policy"; country code detection bullet removed from Device Info; "No location" note simplified.

### Key decisions
- `StorageService` was injected only by the removed `#readCountryCache` helper, so the inject and import were safe to remove entirely.
- The two CSS comment occurrences of "stripe" (a visual design term) in `daily-expense.component.ts` are not payment-provider references and were correctly left untouched.

### Files changed
- `src/app/core/services/payment.service.ts`
- `docs/DATA_SAFETY.md`

### Build
- `grep -r "detectProvider\|ipapi\|stripe\|Stripe" src` — only two innocuous CSS design comments remain in `daily-expense.component.ts`; zero payment-provider references.
- `npm run build -- --configuration production` — passed.

## 2026-06-05 - Finances: Payment History UI Polish & Delete Confirmation Refactor

### What was built
Enhanced the `FinancesComponent` payment history section for each debt card.

### Changes made
- **Always-visible payment history section**: Removed the `@if (debtPaymentsForDebt.length > 0)` guard; section now always renders under each debt card, showing a "No payments recorded yet" empty state when empty.
- **Comment display**: Added `paymentComment(payment: DebtPayment): string` helper that resolves the linked `ExpenseEntry` comment; each history row now shows the comment (when present) below the date/account line.
- **Date formatting**: Payment date now uses `| dateFormat` pipe for consistent formatting.
- **New signals**: Replaced `deleteDebtPaymentTarget` with `confirmingDeletePayment = signal<DebtPayment | null>(null)` and added `isDeletingPayment = signal(false)` for isolated delete-in-progress state.
- **New methods**: Added `requestPaymentDelete`, `cancelPaymentDelete`, `confirmPaymentDelete`; removed `requestDebtPaymentDelete` and `confirmDebtPaymentDelete`.
- **Delete confirmation modal**: Changed from default ModalComponent actions to `showActions=false` with custom buttons matching the subscription-cancel confirmation pattern. Uses `isDeletingPayment` for spinner state.
- **i18n keys added** (en, ta, hi): `finances.payments.history`, `finances.payments.noHistory`, `finances.payments.deleteConfirmTitle`, `finances.payments.deleteConfirmMessage`, `finances.feedback.debtPaymentDeleteFailed`.
- **i18n keys updated**: `finances.feedback.debtPaymentDeleted` updated to shorter "Payment deleted." copy in all three locales.

### Key decisions
- Kept `saving` signal for all non-payment-delete loading states; `isDeletingPayment` scopes only the payment delete flow.
- `paymentComment` looks up the linked `ExpenseEntry` by `expenseId` at render time — no extra storage needed on the `DebtPayment` model.
- Old `deleteDebtPaymentTarget` and `finances.debts.deletePaymentTitle/Description` i18n keys are kept in place (they were in the i18n files) to avoid breaking anything that might reference them, but the modal no longer uses them.

### Files changed
- `src/app/features/finances/finances.component.ts` — signals, methods, template updates
- `src/assets/i18n/en.json`, `ta.json`, `hi.json` — new and updated i18n keys

### Build
- `npm run build` — passed

## 2026-06-05 - Phase 5: Debt Payment Reversal — Store Hardening & Tests

### What was built
Completed Phase 5 of `ACCOUNT_BALANCES_DEBT_EMI_PLAN.md`. The `deleteDebtPayment` and `updateDebtPayment` store methods were already present; this session closed the remaining gaps and added focused pure-logic tests.

### Gaps closed
- **`deleteDebtPayment` — missing ExpenseEntry validation**: Added explicit "throw if not found" for the linked `ExpenseEntry` before mutating state (step 2 of the spec). Previously `applyAccountDeltas` would catch a missing account, but a missing expense silently passed through.
- **`updateDebtPayment` — missing actor fields on updated entry**: Added `updatedByEmail: actor.email, updatedByRole: actor.role` to the updated `ExpenseEntry` so family activity attribution is preserved on edits.

### Key decisions
- **Pure-logic test pattern**: Tests follow the existing spec pattern — standalone pure helper functions that mirror store logic, tested without Angular `TestBed`. This avoids complex mocking of `GoogleDriveService`, `AuthService`, etc. in a vitest/node environment.
- **Status logic `nextRemainingBalance === 0 ? 'paid' : 'active'`**: Correct as-is. After reversing a payment, `nextRemainingBalance` is always > 0 (capped at `principalAmount`), so paid debts are automatically reopened to `active`.
- **`deleteDebtPayment` still doesn't validate the linked account explicitly** — `applyAccountDeltas` already throws with a user-friendly message if the account is missing or archived, so a redundant upfront check would duplicate that error path.

### Files changed
- `src/app/core/services/expense-store.service.ts` — added ExpenseEntry not-found guard in `deleteDebtPayment`; added `updatedByEmail/Role` to `updatedEntry` in `updateDebtPayment`
- `src/app/core/services/expense-store.service.spec.ts` — added 14 new tests across `deleteDebtPayment`, `updateDebtPayment`, and `deleteEntry` debt-payment rejection

### Verification
- `npx vitest run src/app/core/services/expense-store.service.spec.ts` — 32 tests passed (18 existing + 14 new)
- `npm run build` — passed

## 2026-06-04 - Subscription Cancellation Flow

### What was built
Full cancel-at-cycle-end subscription flow for Razorpay Pro users.

### Key decisions
- **cancel_at_cycle_end: true** — user paid for the period; they keep Pro access until `expiresAt`. Immediate cut-off without refund is only for fraud. This matches Spotify/Netflix behaviour.
- **Two-phase cancellation** — user action sets `cancelPending: true` in Firestore (tier stays `pro`); Razorpay fires `subscription.cancelled` webhook at period end which sets `tier: free` and clears `cancelPending: false`.
- **cancelPending guard** — function returns 400 if already `cancelPending: true`; prevents double-calling Razorpay on retry/double-tap.
- **UI: "Keep Pro" as primary button** — dark-pattern avoidance; destructive action should not be the visually dominant button.
- **No navigate-away after cancel** — `onSnapshot` listener updates the signal within milliseconds of Firestore write; UI reacts automatically.
- **Resubscription edge case** — if `cancelPending: true` and user subscribes the same plan again, `createRazorpaySubscription` clears the flag and proceeds (revenue recovery; user changed mind).
- **ModalComponent with showActions=false** — `ModalComponent` uses translation keys for buttons with no label override; custom buttons placed in `ng-content` slot to get "Keep Pro" / "Cancel subscription" labels without touching the shared component.
- **cancelPending: false in webhook** — clears the flag when `tier: free` is written so a future resubscription doesn't see stale `cancelPending: true` from the old sub.

### Files changed
- `functions/src/razorpay.ts` — new `cancelRazorpaySubscription` function; resubscription-after-cancel branch in `createRazorpaySubscription`
- `functions/src/index.ts` — exported `cancelRazorpaySubscription`
- `functions/src/razorpay-webhook.ts` — added `cancelPending: false` to cancel-event Firestore write
- `src/app/core/services/subscription.service.ts` — `cancelPending` field in interface, `FREE_STATUS`, `startListening()`, `fetchOnce()`
- `src/app/core/services/payment.service.ts` — `FN_CANCEL_SUBSCRIPTION` URL + `cancelSubscription()` method
- `src/app/features/settings/settings.component.ts` — cancel UI, modal, signals, method, `PaymentService` inject, `XCircle` icon
- `.github/workflows/deploy-firebase.yml` — `functions:cancelRazorpaySubscription` added to deploy command

### Verification
- `npm run build` in `personal-finance-pwa/functions` — passed
- `npm run build -- --configuration production` in `personal-finance-pwa` — passed

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

## 2026-06-03 - Curated AI Memory And Graphify Refresh
- Problem:
  - Recent Firebase/Razorpay verification, deployment, and secret-hygiene changes were ahead of the curated memory.
  - `CURRENT_STATE.md` also overstated some details, including the checkout workflow action version and Stripe provider-detection removal.
- Updated memory:
  - Aligned startup rules with selective memory loading: read `PROJECT_CONTEXT.md` and `AI_RULES.md` for substantial code changes, use `CURRENT_STATE.md` and `TASK_HISTORY.md` as targeted lookups.
  - Documented that the Firebase deploy workflow ships Hosting, both subscription-handoff Functions, and all three Razorpay Functions together.
  - Documented live Razorpay key injection and validation in the deploy workflow.
  - Documented that active checkout is Razorpay-only while the unused `PaymentService.detectProvider()` helper still exists and must not be wired back into checkout.
  - Documented that Razorpay verification resolves authoritative subscription plan/current-period data server-side before writing Firestore subscription status.
  - Added durable secret-hygiene guidance for generated Firebase config and signing files: `google-services.json`, `GoogleService-Info.plist`, `sha-keys.md`, `*.keystore`, `*.jks`, and `*.p12`.
- Verification:
  - Compared memory against current Angular subscription code, Firebase Functions source, deploy workflow, and ignore files.

## 2026-06-12 — Production-readiness security audit (Cowork)
- CRITICAL fixes: AI endpoints (generateInsights/parseVoiceExpense/extractReceipt) now require Firebase ID token on the hosted-key path (were an open unauthenticated AI proxy burning GROQ/GEMINI quota). Clients send Authorization header via AuthService.getFirebaseIdToken().
- CRITICAL: testNotification removed from functions/src/index.ts exports — it allowed unauthenticated push to ALL users. Delete live instance: `firebase functions:delete testNotification`.
- HIGH: registerToken/unregisterToken now require Firebase ID token; docs bound to ownerUid (legacy docs claimed on first authed write; cross-account 403).
- HIGH (Play policy): removed unused REQUEST_IGNORE_BATTERY_OPTIMIZATIONS from AndroidManifest.xml.
- Verified: functions tsc build green; app tsc -p tsconfig.app.json --noEmit green. Full ng prod build not run in sandbox (slow) — run in CI.
- Open decisions documented in docs/PRODUCTION_LAUNCH_CHECKLIST.md: Razorpay-vs-Play-Billing for Android, web/native OAuth client ID mismatch (index.html vs auth.service.ts), notification-listener Play declaration, google-services.json needed locally for release build.

## 2026-06-12 — Receipt upload fixed for drive.appdata-only scope + family sync receipt stripping
- Root cause found: receipt upload broke for ALL users after full `drive` scope removal (SCOPE_VERSION 8) — `findOrCreateReceiptsFolder`/`uploadReceiptFile` created "Spenza Receipts" in My Drive root, which 403s under drive.appdata-only.
- `GoogleDriveService.uploadReceiptFile` now uploads with `parents: ['appDataFolder']`; folder param removed; `viewUrl` is now always `''` (appData files have no Drive web view). Removed `ensureReceiptsFolder` + `findOrCreateReceiptsFolder`.
- `DailyExpenseComponent`: upload path no longer resolves/creates a receipt folder; PDF "Open PDF" template links changed from `<a [href]=viewUrl>` to buttons calling `previewReceipt()`, which now serves both images and PDFs from `downloadFile()` blobs (viewUrl kept as legacy fallback). New i18n key `daily.receipt.openFailed` (en/ta/hi + i18n.service fallback).
- `SettingsComponent`: removed the "Receipt Folder" setup card, `onSetupReceiptFolder()`, `receiptFolderUrl()`, `isSettingUpReceiptFolder`. `receiptFolderId` backup metadata passthrough kept for backward compat with old backups.
- `ExpenseStore.pushFamilyState` now strips `entry.receipt` from the BackupDocument pushed to Firestore `families/{id}/state/current` — receipts are device-private appData files; partner would only get dead links (also keeps the 1 MiB Firestore doc limit safer).
- Incoming family state merge preserves `local.receipt` when a newer remote copy of the same entry has no receipt, so partner edits don't wipe local attachments.
- Verified: `tsc -p tsconfig.app.json --noEmit` green; `ngc -p tsconfig.app.json --noEmit` (AOT template check) green; vitest expense-store (37), daily-expense + settings specs (80) all pass. Full ng prod build not run in sandbox (slow) — run in CI.
- Decision: family receipt image sharing deliberately NOT implemented yet. Agreed direction if demanded: transient base64 relay docs in `families/{id}/receipts/{entryId}` (~160 KB < 1 MiB), partner saves to own appDataFolder then deletes relay doc. Never embed base64 in backup doc or state doc.

## 2026-06-12 — Design themes (NeoBrutalism, Neumorphism, Claymorphism) with element-level theming

### What was changed
- **`theme.service.ts`**: Added `AppStyle` type (`'glass' | 'neobrutalism' | 'neumorphism' | 'claymorphism'`), `_style` signal, `setStyle()`, `#restoreStyle()`, `#applyStyle()` with `pf-style` persistence in Capacitor Preferences. `data-style` attribute on `<html>` mirrors existing `data-palette` pattern; `'glass'` removes the attribute (default).
- **`settings.component.ts`**: Added 4-option Design Style selector (Glassmorphism, Neumorphism, Claymorphism, NeoBrutalism) with icon badges and active check indicator.
- **`styles.css`**: Added ~442 lines of CSS variable overrides and per-style element rules:
  - Variable blocks for 3 new styles (light + dark) — radius, shadows, borders, gradients, card surfaces
  - Per-style element overrides: inputs (3px border / inset shadow / bottom lip), buttons (hard shadow / dual extruded / clay lip), dialogs (3px border / dual shadow / 4px bottom lip), `<hr>` dividers (thicker / subtle / rounded)
  - `--backdrop` variable: neo 0.8, glass 0.5, clay 0.4, neumorphism 0.25
  - Backdrop blur removed for non-glass styles
  - `::selection` styling using `--primary` at 30% opacity
  - Custom scrollbar per style: neo 12px chunky square, neumorphism inset round, clay rounded + bottom lip
- **`toast.component.ts`**: Hardcoded hex → `bg-success`/`bg-destructive`/`bg-warning`/`bg-primary` with foreground counterparts
- **`offline-banner.component.ts`**: Hardcoded `bg-yellow-500 text-white` → `bg-warning text-warning-foreground`
- **`privacy.component.ts`, `terms.component.ts`, `bottom-nav.component.ts`, `button.component.ts`, `input.component.ts`**: Replaced hardcoded Tailwind colors (`bg-gray-50`, `text-gray-900`, `hover:text-blue-600`, `border-gray-200`, `bg-blue-600`, `bg-red-600`, etc.) with CSS variable tokens (`bg-background`, `text-foreground`, `hover:text-primary`, `border-border`, `bg-primary`, `bg-destructive`, etc.)
- **`chart-base.component.ts`**: Added MutationObserver watching `class` and `data-palette` attributes on `<html>`; reads `--muted-foreground`, `--border`, `--popover`, `--popover-foreground` via `getComputedStyle` for Chart.js tick, grid, and tooltip colors; charts react to theme/style/palette switches without destroying/re-creating.

### Why these decisions were made
- CSS variables + per-style CSS overrides approach rather than component template changes, keeping all theme styling in `styles.css`
- Ghost buttons excluded from button shadow/lip overrides via `:not([class*="bg-transparent"])` selector
- NeoBrutalism light/dark blocks deliberately omit `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--ring`, and `--cat-*` so palette selections still work
- Backdrop targets `.fixed.inset-0.z-40` and `.fixed.inset-0.z-50` class selectors rather than adding a new CSS variable to component templates
- Chart.js theme observation uses MutationObserver rather than Angular effect because Chart.js is a non-Angular library managing its own canvas state

### Build verification
- `npm run build -- --configuration production` in `personal-finance-pwa/` — passes (existing initial bundle budget warning: 506.70 kB vs 500.00 kB; pre-existing auth-callback budget warning)

## 2026-06-12 — Design Themes Complete: Claymorphism + Hardcoded Color Fixes + Neumorphism/NeoBrutalism Enhanced Overrides

### What was changed

**CSS variable gaps filled:**
- **Claymorphism light** (style.css:428): Added `--foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--popover`, `--popover-foreground` with clay-harmonized oklch values
- **NeoBrutalism light** (style.css:494): Added `--background`, `--foreground`, `--popover`, `--popover-foreground`
- **NeoBrutalism dark** (style.css:529): Added `--popover`, `--popover-foreground`

**Enhanced element-level CSS overrides — all 3 non-glass styles:**
- **Claymorphism**: `app-card > div` bottom lip + rounded corners; `app-themed-select` trigger lip + dropdown shadow; ghost buttons subtle 2px clay border; all buttons pressed state (`:active`) compress lip + `translateY`; input focus 3px `--primary` ring at 25%; card hover lifts shadow + darkens lip
- **NeoBrutalism**: `app-card > div` chunky 3px bottom lip; themed-select trigger lip + dropdown with bold border + `--shadow-lg`; ghost buttons 2px bold border; buttons pressed compress shadow to 1px + `translateY(2px)`; input focus 3px solid `--primary` outline
- **Neumorphism**: `app-card > div` soft inset shadow; themed-select trigger inset shadow + background fill; dropdown extruded shadow; ghost buttons subtle extruded shadow; buttons pressed deeper inset + `translateY(1px)`; input focus combines existing inset shadow with `--primary` ring; card hover extrudes more

**Hardcoded color → CSS variable conversions across components:**
- `settings.component.ts`: Family migration banner `border-amber-400/60 bg-amber-50/60 text-amber-800` → `border-warning/40 bg-warning/10 text-warning-foreground`; notification permission text `text-amber-600 dark:text-amber-400` → `text-warning`; AI success message `text-emerald-600` → `text-success`
- `dashboard.component.ts`: All 3 insight card groups (local insights, Gemini insights, AI insight status) — warn-tone cards converted from `border-amber-400/30 bg-amber-400/10 text-amber-600` and `bg-amber-400/15` icon bg → `border-warning/30 bg-warning/10 text-warning` and `bg-warning/15`; good-tone cards from `border-emerald-400/30 bg-emerald-400/10 text-emerald-600` → `border-success/30 bg-success/10 text-success` with `bg-success/15` icon bg

**Backdrop selector broadened:**
- Changed from `.fixed.inset-0.z-40, .fixed.inset-0.z-50` to also include `.fixed.inset-0[class*="bg-black"]` — catches custom z-index values (`z-[100]`, `z-[110]`, `z-[120]`) used in daily-expense and monthly-expense modals

### Why
- Complete remaining hardcoded amber/emerald colors that visually jarred in non-glass themes
- Backdrop CSS needed broader selector to reach modals with non-standard z-index utilities
- All 4 design styles now have consistent element-level overrides for cards, inputs, buttons, ghost buttons, pressed states, focus rings, themed-select, and hover — matching the claymorphism treatment already approved

### Build verification
- `npx tsc --noEmit` — zero errors
- `npm run build` — zero errors (pre-existing budget warnings only)


## 2026-06-12 — Partner login loop fix, token-lifetime sessions, sub-500ms startup
- Bug: partner account looped "login error → sign in → login error" while owner was fine. Diagnosis: Google granular consent — partner had not ticked the Drive checkbox, so the token lacked `drive.appdata`; every Drive call 403'd, app cleared the token and redirected to `/auth/callback`, and the next sign-in silently returned the same scope-less token (Google does not re-show consent by default), looping forever.
- Fix: scope validation after every token grant (web token response `scope`; native tokeninfo lookup), `MissingDriveScopeError`, forced `prompt: 'consent'` on next web sign-in, and a precise i18n error (`auth.error.driveAccess`, en/ta/hi) in `AuthCallbackComponent`.
- Requirement "no re-sign-in until token expiry": web now persists the access token + expiry like native (shared `gapi_access_token*` keys), restored in `#restoreSession`; `clearToken()` also clears the persisted copy so revoked tokens (Drive 401) are not restored.
- Requirement "startup < 500 ms": batched `#restoreSession` Preferences reads into one `Promise.all`; made the `LocalNotificationService` `APP_INITIALIZER` non-blocking; `loadFromLocalCache` no longer awaits the widget-queue flush whose `persistToDrive` network write sat on the cached-startup critical path.
- Rejected approach: silent `ensureToken()` attempt during web bootstrap before redirecting to `/auth/callback` — GSI `requestAccessToken` outside a user gesture risks popup blocking and a visible popup flash; token persistence covers the requirement instead.
- Verification: `npx tsc --noEmit -p tsconfig.app.json` clean; `npx vitest run` auth.service.spec (11) + expense-store.service.spec (37) pass. Production build not completed in the (slow emulated) fix environment — run locally before deploy.

## 2026-06-12 — Mobile nav redesign: floating glass pill (app-shell)
- Decision: keep bottom nav for mobile (thumb reach, finance-app convention) but trim from 7 to 5 tabs; Alerts (`/reminders`) and Settings moved to mobile top bar as icon buttons (`.top-icon-btn`, active = primary tint).
- Portrait bottom nav rebuilt in `app-shell.component.ts`: detached floating pill (`.float-nav`, 14px inset + safe-area, blur/glass via color-mix + backdrop-filter) with a sliding `--gradient-primary` pill (`.nav-pill`) behind the active tab; position driven by `activeMobileIndex` signal updated on `NavigationEnd`; index -1 (route not in pill) fades the highlight. Old wave-peak/bump styles removed.
- `navItems` (7) still used by desktop top nav; new `mobileNavItems` (5: daily, monthly, limits, finances, dashboard) used by portrait pill and landscape side rail.
- Note: `shared/components/bottom-nav/bottom-nav.component.ts` is legacy/unused (app-shell renders the real nav) — candidate for deletion.
- Verification: `npx tsc --noEmit` clean; `ng build --configuration development` succeeds (built to /tmp due to sandbox EPERM on dist/).
- Follow-up (same day): fixed invisible header logo — `SpenzaLogoComponent` SVG defs used static ids while the logo renders twice (desktop + mobile headers); url(#id) resolved to the copy inside the display:none header, so gradients/filters didn't paint. Ids are now per-instance (`uid` counter + `ref()` helper, [attr.*] bindings).
- Follow-up: removed `<app-theme-toggle />` from both headers per user request — theme is changed in Settings (theme/palette/style pickers already exist there). ThemeToggleComponent no longer imported by app-shell; component file itself left in place.

## 2026-06-14 — Reminder flow loophole fixes (save button + map picker)
- Issue 1 (Save button never enabled): `canSave` in `reminder-form.component.ts` was a `computed()` that read reactive-form `.value` (not a signal). For the `datetime` branch it had ZERO signal dependencies, so it memoized `false` at construction and never recomputed when title/remindAt changed → submit stayed disabled forever. Fix: mirror the form via `toSignal(form.valueChanges)` + `toSignal(form.statusChanges)` and drive `canSave` off those signals.
- Issue 2 (Map not rendering despite GOOGLE_MAPS_API_KEY secret): the real prod blocker was CSP. `firebase.json` `script-src` did not allow `maps.googleapis.com`/`maps.gstatic.com`, so the Maps JS loader script was blocked → `GoogleMapsLoaderService.load()` onerror → `mapsAvailable=false` → map hidden. Fix: added `maps.googleapis.com maps.gstatic.com` to `script-src`. (img/connect already allowed via `*.googleapis.com`/`*.gstatic.com`.)
- Remaining non-code prerequisites for the map: (a) Maps JavaScript API must be enabled on the GCP key; (b) HTTP-referrer allowlist must include actual origins — prod `https://spenza-finance.web.app/*`, capacitor `https://localhost/*`, AND web dev `http://localhost:4200/*`; (c) localhost dev still shows placeholder (key injected only at deploy) so map is hidden locally by design.
- Known broader loophole (not fixed, flagged): web datetime reminders never fire a notification — `scheduleNotification` only schedules when `Capacitor.isNativePlatform()`; on web the reminder just gets marked `expired`. Location reminders are foreground-only and native-only (resume-based geofence check), fire once (`notifiedAt`), no recurrence.
- Verified: `npx tsc --noEmit -p tsconfig.app.json` exit 0; firebase.json valid JSON. Build/deploy of CSP rule pending (hosting redeploy).

## 2026-06-14 — Server-side delivery for datetime reminders (cross-device, no open tab)
- New scheduled fn `sendDueReminders` (`functions/src/send-due-reminders.ts`, every 1 min): collectionGroup('reminders') where type=datetime, status=active, notifiedAt=null, remindAt<=now → for each, resolves the owner's WEB fcm tokens (`users` where ownerUid==uid && platform=='web'), claims delivery atomically via a transaction stamping `notifiedAt`, then `sendEachForMulticast`. Prunes dead tokens. Pushes to WEB tokens only so native (which uses local OS notifications) isn't double-notified. Exported in `index.ts`.
- Token registry decoupling: `fcm.ts registerToken` now stores `platform` ('web'|'native') and supports `tokenOnly:true` — a tokenOnly registration updates fcmToken/ownerUid/platform/timezone only and does NOT write `enabled`/daily fields, so registering a device for datetime push never opts it into the legacy hourly nudge (`sendReminders` else-branch fires hourly 08–22 for any enabled doc without dailyReminderEnabled). Existing settings `enable()`/`syncDailyReminder()` paths unchanged (tokenOnly omitted ⇒ old behavior).
- Client: `fcm.service.registerForNotifications(..., options?)` now sends `platform` always + `tokenOnly` when set. `NotificationService.ensurePushRegistered()` (web-only, tokenOnly) registers the device token. `ReminderService` injects NotificationService and calls it on datetime create/update (web, best-effort). Added `EXPIRY_GRACE_MS = 3min`: `markExpiredDatetimeReminders` now expires only reminders older than now−grace so the 1-min server scheduler can claim+deliver before the client marks expired.
- Firestore: new `firestore.indexes.json` (collectionGroup reminders [type,status,notifiedAt,remindAt]; users [ownerUid,platform]) referenced from firebase.json.
- Verified: functions `tsc` exit 0; app `tsc --noEmit -p tsconfig.app.json` exit 0; notification.service spec green. Pre-existing unrelated red: fcm.service.spec inline-mirror asserts stale `/.netlify/functions/registerToken` URL (migration leftover, not my code).
- PENDING DEPLOY: `firebase deploy --only functions:sendDueReminders,functions:registerToken,firestore:indexes,firestore:rules` (indexes must build before the fn query works; rules still pending from prior session). Web users must have granted notification permission for a token to exist.

## 2026-06-22 — Brand icon rebrand: gold coin + 75% progress ring (full app)
- Replaced the old purple icon set everywhere with the new gold-coin/dark-tile set provided in repo-root `files/spenza-icons/` (master art in `files/spenza-icons/masters/*.svg`; colors: tile #2A2620→#121009, adaptive bg #1E1A14, ring/coin gold).
- PWA: `public/icons/*` now the new icons, kept `icon-NxN.png` naming so notification refs (`/icons/icon-192x192.png`, `icon-96x96.png` in firebase-messaging-sw.js, local-notification.service.ts, payment.service.ts) stay valid. Added `maskable-192/512x{}.png`. `manifest.webmanifest` now splits purpose into `any` (8 sizes) + `maskable` (2) instead of the prior "maskable any" on every entry.
- Favicons: new `favicon-16/32.png` + `apple-touch-icon.png` (180) in `public/`; regenerated multi-size `public/favicon.ico` (16+32, PNG-embedded) so `/favicon.ico` stays valid for ngsw. index.html now links the PNG favicons too.
- Android: replaced `mipmap-*/ic_launcher{,_round,_foreground}.png` (all 5 densities); set `values/ic_launcher_background.xml` to #1E1A14; removed stale capacitor leftovers `drawable/ic_launcher_background.xml` (teal vector) + `drawable-v24/ic_launcher_foreground.xml` (unreferenced — anydpi-v26 uses @color + @mipmap).
- In-app header logo: per user decision (full rebrand), `SpenzaLogoComponent` template rewritten from the purple theme-adaptive squircle to the gold coin+ring (fixed brand colors, no longer uses --logo-* theme vars). Kept the per-instance `uid`/`ref()` unique-id logic.
- Cleanup: deleted dead `public/spenza-logo.svg`, `public/logo/`, `src/assets/logo/` (none referenced) and obsolete `generate-icons.js`; replaced npm script `generate-icons` with `apply-icons` → new idempotent installer `scripts/apply-spenza-icons.mjs` (copies from `files/` + builds favicon.ico).
- Verified: `npm run build` succeeds (only pre-existing bundle-budget warnings); dist emits all new icons/favicons/manifest and no stale logo svg.

## 2026-06-22 — Public landing/home page for Google OAuth branding verification
- Problem: Google OAuth verification requires the app home page to explain the app's purpose, but the root URL previously redirected (`'' → /daily`) into the auth-gated app shell, so a logged-out reviewer/crawler only saw the login wall.
- New public route: `''` (root) now lazy-loads `features/welcome/welcome.component.ts` (no authGuard/setupGuard). The component renders the full landing markup immediately and only redirects to `/daily` *after* `authService.sessionRestored` if the visitor is already signed in — so the purpose text is always in the DOM for anonymous visitors. `/privacy` and `/terms` were already public; left as-is. `**` still redirects to `/daily`.
- Shell-less rendering: `app.ts` added `currentUrl` signal (kept in sync via the existing NavigationEnd subscription) + `isPublicPage` computed (`/`, `/privacy`, `/terms`). `app.html` now branches: public pages render a bare `<router-outlet />` with NO data-loading screen and NO `<app-shell>` chrome; everything else keeps the prior loading-screen/shell behavior. Note: app uses `withHashLocation()`, so `currentUrl` is seeded from `window.location.hash` (router.url is empty before initial navigation) to avoid a wrong-branch flash on hard reload of an app route.
- Landing content (plain text, present in initial render): app name Spenza, one-paragraph purpose (personal/family finance — expenses, accounts & net worth, debts/EMIs, budgets, dashboard insights), and a "How Spenza uses your Google account data" section. Scope justifications are accurate to code: `drive.appdata` = private hidden-folder backup of the user's own data; `spreadsheets` = read-only, user-initiated import of expense rows from a sheet the user owns (matches `GoogleSheetsService.read*` / `importFromSheets`, write never used); openid/email/profile = sign-in identity. Links to in-app `/privacy` and `/terms`.
- No auth logic changed for real app routes. No new dependencies. Reuses `SpenzaLogoComponent` + Tailwind tokens.
- Verified: `ng build` (development) succeeds; landing strings present in shipped chunk; headless-Chrome `--dump-dom` of `http://localhost/#/` (no auth) contains "How Spenza uses your Google account data", "drive.appdata", "personal and family finance tracker", and `#/privacy`/`#/terms` links; `/#/privacy` and `/#/terms` render "Privacy Policy" / "Terms of Service" without auth.
- NOTE: app is pure CSR (no SSR/prerender configured; `@angular/build:application`). Content renders fast client-side and is in the DOM after JS — acceptable for Google's JS-capable reviewer. Prerendering deferred (would add server build complexity for little gain).
- Follow-up (same day): removed the repo-root `files/spenza-icons/` source folder (icons already baked into `public/` + Android res — not needed for build/run) and the now-orphaned `scripts/apply-spenza-icons.mjs` installer + its npm script. Note: master SVGs are gone from disk; re-create from the in-app `SpenzaLogoComponent` SVG / `public/icons` if vector edits are ever needed.

## 2026-06-22 — Static server-served branding for OAuth crawler (no-JS)
- Follow-up to the landing page above: Google's OAuth *branding* crawler does NOT execute JS, so the CSR welcome component (text only in DOM after hydration) was invisible to it — verification failed on "home page purpose" and app-name match. Fixed without enabling SSR/SSG.
- Chose static-HTML over Angular prerender: app is a large CSR PWA with `withHashLocation()`, Capacitor, Firebase, ngsw. Prerender would run app code in Node (window/Capacitor refs) + add `@angular/ssr`/server bundle = invasive/risky. Hash routing means bare paths `/privacy` `/terms` are unused by the SPA (it uses `/#/privacy`), so dedicated static files at those paths don't conflict with in-app nav.
- `src/index.html`: static branding markup placed INSIDE `<app-root>` (Angular clears app-root children on bootstrap, so JS users get the SPA, no-JS crawlers get literal text). Contains `<h1>Spenza`, purpose paragraph, drive.appdata + spreadsheets + openid/email/profile scope explanations, and `/privacy` `/terms` links. Scoped inline `<style id="prerender-home-styles">` for readability. The build (`@angular/build:application`) preserves app-root inner content.
- `public/privacy.html` + `public/terms.html`: full standalone static pages (ported from the Angular privacy/terms components) — keep the `google-site-verification` meta, Spenza branding, the OAuth-scope "Limited Use" disclosure (privacy), and cross-links. Copied to dist root via the `public/` assets glob.
- `firebase.json`: rewrites `/privacy → /privacy.html`, `/terms → /terms.html` BEFORE the `**` → /index.html catch-all (first match wins).
- `ngsw-config.json`: added `navigationUrls` negating `!/privacy` `!/terms` so installed SW clients fetch the real static pages instead of the cached app shell.
- No auth/app-route logic changed; no new deps. The in-app hash-routed welcome/privacy/terms components are untouched and still serve JS users.
- Verified LIVE after `npm run build --configuration production` + `firebase deploy --only hosting`: `curl https://spenza-finance.web.app` returns "Spenza", the google-site-verification meta, the purpose paragraph, drive.appdata + "scope: spreadsheets", and /privacy /terms links; `curl .../privacy` and `.../terms` return "Privacy Policy"/"Terms of Service" + meta with HTTP 200, no auth.

## 2026-06-22 — Silent token refresh to stop recurring Google sign-in prompts
- Problem: users were re-prompted to sign in with Google frequently. Root cause: the app's *session* is the Google OAuth access token (~1h, no refresh token); Firebase Auth is only used for subscriptions/Firestore and is NOT the gate. When the access token expired, web cold-start bounced to `/auth/callback` and native `#nativeSignIn` always used the interactive Credential Manager account-picker. OAuth consent screen was also in GCP "Testing" status (7-day grant expiry) — user has now published it.
- Decision: keep the access-token-as-session architecture (Drive/Sheets need that exact token; full Firebase-session rearchitecture rejected as high-risk for now) and instead make re-acquisition silent.
- Changes:
  - `auth.service.ts` `#nativeSignIn(opts:{silent?})`: silent mode passes `style:'bottom', filterByAuthorizedAccounts:true, autoSelectEnabled:true, forceRefreshToken:true` so Android auto-selects the previously authorized account with NO picker UI; silent mode never falls back to the interactive retry (rejects so caller decides). `getTokenSilent()` native path now calls it with `{silent:true}`.
  - `app.ts` resumeHandler: proactively calls `authService.getTokenSilent()` on foreground when authenticated (no-op if token still valid) so the token rarely expires mid-session.
  - `app.ts` bootstrap: attempts `getTokenSilent()` before the `needsInteractiveWebToken()` → `/auth/callback` routing, so a returning web user with a live Google session enters uninterrupted.
- Not done (optional follow-ups): make Firebase Auth the session of record; soften the auth interceptor 401 path to try silent before interactive. Left to limit blast radius.
- Verified: `npx tsc --noEmit -p tsconfig.app.json` clean; `npx vitest run auth.service` 11/11 pass. Production build NOT run; native autoSelect behavior needs a real Android device test before shipping.

## 2026-06-29 — Android: sign-in popups, session persistence, widget live-sync, family instant sync
- Four reported Android bugs fixed across web (Angular), native (Java), and a new Cloud Function.
- **#1 Multiple Google sign-in popups + stray bottom-sheet.** Root cause: `getTokenSilent()` called `#nativeSignIn({silent:true})` OUTSIDE the `#nativeSignInPromise` dedup guard used by `signIn()`/`ensureToken()`, so a silent refresh could run concurrently with an interactive sign-in → two pickers. The bottom-sheet was the silent path's `style:'bottom'` (added 2026-06-22). Fix: new `#requestNativeSignIn(opts)` funnels ALL native sign-in (silent + interactive) through the single shared promise; removed `style:'bottom'` from silent options so a silent refresh no longer pops the Credential Manager menu. (Reverses part of the 2026-06-22 decision — `style:'bottom'` was the visible "lower menu" popup.)
- **#2 Re-sign-in on every app open within token life.** Native cold start hit an interactive picker because the first Drive read (`ensureToken`) ran before any silent renewal. Fix: `app.ts` bootstrap now calls `authService.getTokenSilent()` on native (authenticated) BEFORE Drive bootstrap, renewing the ~1h access token invisibly. Pairs with the existing resume-time silent refresh.
- **#3 Widget expense not visible in an already-open app.** `flushPendingWidgetExpenses()` only ran on cold start / when Drive `modifiedTime` changed (a local widget entry changes neither), and the plugin had no native→JS event. Fix: `ExpenseWidgetPlugin` keeps a static WeakReference + `notifyExpenseQueued()` → `notifyListeners('widgetExpenseQueued')`; `WidgetExpenseQueue.enqueueExpense/Adjustment` call it; web `expenseStore.listenForWidgetExpenses()` (registered in `app.ts`, native only) flushes on the event; resume handler also calls `flushPendingWidgetExpenses()`. Single-process app (no `android:process` on provider) so the static ref works while the app is alive.
- **#4 Family partner didn't get widget expense until app opened.** `WidgetExpenseSyncWorker` only wrote Google Drive; the modern Firestore-based family mode reaches the partner via `families/{id}/state/current`, which lived only in the web layer. Fix:
  - New Cloud Function `syncWidgetExpenseToFamily` (`functions/src/widget-sync.ts`): Bearer Firebase-ID-token auth, verifies family membership, transactionally merges new expenses/adjustments into the state doc (idempotent by id), applies account balance deltas, increments revision, sets `lastWriter` — same envelope the web `pushState` writes, so the partner's existing listener applies it unchanged.
  - `auth.service.ts` persists the Firebase **refresh token** (`firebase_refresh_token`) on Firebase sign-in / silent re-auth so the worker can mint ID tokens long after the app was last open; cleared on sign-out.
  - Worker: `resolveBackupFileId` now resolves the user's PERSONAL file for Firestore-family (was returning null → no-op); collects the new items; after the Drive write it mints an ID token via securetoken API (`exchangeRefreshToken`) and POSTs them to the function (`pushFamilyWidgetExpenses`). Push happens before clearing the queue; on failure → `Result.retry()` (Drive merge is idempotent).
- KNOWN LIMITATION (#4): the worker still writes Drive first, which needs a valid Google access token; if it's expired (app not foregrounded in ~1h) the whole run retries and the partner push waits until the token refreshes. Follow-up: push to Firestore independently of the Drive token for true app-never-opened instant sync.
- Verified: `tsc --noEmit -p tsconfig.app.json` (web) and `tsc --noEmit` (functions) both clean. NOT verified here: Android Gradle/APK build and Cloud Function deploy — must run on the user's machine (no Android SDK in this env). Needs a real two-device family test.

## 2026-06-29 — Refresh-token auth rework (native): stop hourly Google re-sign-in
- Goal: make returning native users never see a Google sign-in screen again (idea #2). Root cause recap: app used the ~1h Google OAuth access token as the session and held NO refresh token, so expiry forced interactive re-auth.
- Plugin constraint discovered: `@capgo/capacitor-social-login` v8 does NOT return an authorization code in online mode for Google (`useProperTokenExchange` is Apple-only). The only way to get a Google refresh token is OFFLINE mode (`mode` set at `initialize()` time, NOT per-login) which returns just a `serverAuthCode` to exchange on a backend.
- Scope chosen (asked user): FULL rework, NATIVE (Android) only; web keeps its existing silent GSI refresh.
- Backend (`functions/src/google-tokens.ts`, registered in index.ts):
  - `exchangeGoogleAuthCode`: no Firebase auth required (a valid serverAuthCode is the authorization). Exchanges code+client_secret at oauth2.googleapis.com/token → stores `refresh_token` in `googleTokens/{googleSub}` (keyed by Google `sub` so the first-ever sign-in, which has no Firebase session yet, can persist it). Returns accessToken + idToken + email.
  - `getGoogleAccessToken`: Bearer Firebase ID token → extracts Google sub from `firebase.identities['google.com']` → mints a fresh access token from the stored refresh token. 404 = none on file, 410 = revoked (deletes it). Never shows UI.
  - Secret: `GOOGLE_OAUTH_CLIENT_SECRET` (firebase functions:secrets:set) — the WEB client secret for 663004583066-vu5c3p5pcsg86thjftfts1t45690kll3.
- `firestore.rules`: explicit `googleTokens/{uid}` deny-all (server/Admin only). (Catch-all already denied; made intent explicit.)
- Client (`auth.service.ts`):
  - Plugin mode is now switched on demand via `#ensureSocialLoginMode('online'|'offline')` (re-inits the plugin) since mode is an initialize() option. Removed the eager constructor init.
  - `#nativeSignIn` dispatcher: interactive → `#nativeOfflineSignIn` (serverAuthCode → `#exchangeServerAuthCode` → set token + Firebase sign-in from returned id_token); on ANY failure falls back to legacy `#nativeOnlineSignIn` so sign-in never breaks pre-deploy. Silent → `#mintGoogleTokenFromServer` (uses Firebase ID token to call getGoogleAccessToken, zero UI) then falls back to Credential Manager silent.
  - `ensureToken()` native now tries `#mintGoogleTokenFromServer()` before any interactive prompt.
  - Anchor of the no-resignin guarantee: the PERSISTENT Firebase session (auto-refreshes its own ID token) authorizes silent Google-token minting indefinitely.
- Verified: web `tsc --noEmit` clean, functions `tsc --noEmit` clean, `vitest run auth.service.spec` 11/11 pass. NOT verified: device sign-in, Cloud Function deploy, real refresh-token issuance.
- DEPLOY/CONFIG required (user machine): (1) `firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET` with the Web client secret; (2) deploy functions (exchangeGoogleAuthCode, getGoogleAccessToken) + `firebase deploy --only firestore:rules`; (3) build APK (`cap sync android`). NOTE: Google returns a refresh token only on first consent / when forced — existing users may need to revoke prior access once (myaccount.google.com → Security → third-party access) so consent re-prompts and a refresh token is issued; until then getGoogleAccessToken 404s and the app falls back to interactive offline sign-in (which should capture it).

## 2026-06-29 (fix) — Family widget sync was gated behind the expired Drive token
- Bug report: kill app → log via widget → "queued for drive sync" toast → partner never receives it.
- Root cause: in WidgetExpenseSyncWorker.doWork the Firestore family push ran AFTER `validAccessToken` (Google Drive token). With the app killed for a while the cached Google access token is expired, so the worker returned `Result.retry()` at the token check and never reached the push.
- Fix: moved the family Firestore push to run FIRST, before the token check, independent of the Google access token (it only needs the long-lived Firebase refresh token via securetoken). Queue is still kept for the later Drive write (user's own device catches up on next app open). Removed the redundant post-Drive push block + dead newFamily* arrays.
- Still required for it to work end-to-end: (1) `syncWidgetExpenseToFamily` actually deployed (the earlier deploy errored with "No function matches filter" because functions/lib was stale — added a predeploy build hook to firebase.json); (2) `firebase_refresh_token` present in CapacitorStorage (persisted by auth.service on Firebase sign-in/silent); (3) family state doc exists (owner pushes on app open); (4) rebuilt APK with this worker change. Verify via `firebase functions:list`, `firebase functions:log --only syncWidgetExpenseToFamily`, and Android logcat tag "WidgetExpenseSync" (logs push result).

## 2026-06-29 (regression fix) — Offline-mode sign-in broke login; gated behind flag
- Symptom: native sign-in showed TWO Google account pickers and ended in "Sign-in cancelled by user". Cause: the offline serverAuthCode → backend-exchange flow failed (likely exchange function/secret/OAuth config), and the catch fell back to online mode → a second popup.
- Fix: added `ENABLE_NATIVE_OFFLINE_REFRESH` master switch in auth.service.ts, default FALSE. While off, `#nativeSignIn` (interactive + silent) and `ensureToken` use ONLY the proven online-mode flow + Credential Manager silent refresh — restoring the known-good single-popup sign-in. Offline `#nativeOfflineSignIn` / `#mintGoogleTokenFromServer` / `#exchangeServerAuthCode` remain in code for later on-device validation; flip the flag to re-enable.
- Unaffected: Family widget→partner Firestore sync (#4) does NOT depend on this flag — it uses the Firebase refresh token, still persisted by `#signIntoFirebase` during the online flow.
- Verified: web tsc clean, auth.service.spec 11/11 pass. Re-enable plan: deploy exchangeGoogleAuthCode/getGoogleAccessToken, set GOOGLE_OAUTH_CLIENT_SECRET, confirm the Android OAuth client + serverAuthCode config, then test with the flag on while watching logcat.

## 2026-07-03 (crash fix) — Android crash on enabling push-notification toggle in Settings
- Symptom: native app crashed the moment the Settings push toggle was enabled.
- Root cause: commit b870d5d (2026-06-03) removed `android/app/google-services.json` with plain `git rm` (instead of `--cached`), deleting it from disk too. `app/build.gradle` silently skipped the google-services plugin when the file was absent, so APKs built with NO Firebase config. On toggle → `PushNotifications.register()` → `FirebaseMessaging.getInstance()` → `IllegalStateException: Default FirebaseApp is not initialized`; Capacitor Bridge rethrows plugin exceptions as RuntimeException → process crash.
- Fix: restored `google-services.json` locally from git history (`git show b870d5d^:...`); it stays gitignored per the original security decision. Hardened `app/build.gradle`: missing file now throws GradleException with restore instructions instead of silently building a crashing APK.
- Rule: never `git rm` a config that must exist locally — use `git rm --cached`. Rebuild required (rebuild-android.sh) for the fix to take effect on device.
