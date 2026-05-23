# Task History

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
