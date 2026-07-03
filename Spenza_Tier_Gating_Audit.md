# Spenza — Free vs Pro Tier Gating Audit

**Date:** 2026-07-02
**Scope:** Angular client (`personal-finance-pwa/src`), Firebase Functions (`functions/src`), Firestore rules.

## 1. Free vs Pro feature matrix

| Feature | Free | Pro | Enforced where (before today) |
|---|---|---|---|
| Daily/Monthly expense logging, Limits, Settings, local Dashboard insights | ✅ | ✅ | n/a |
| Reminders — datetime type | ✅ | ✅ | n/a |
| Reminders — location type (map pin, geofence) | ❌ | ✅ | UI button only |
| Finances (asset accounts, debts/EMI, net worth) | ❌ | ✅ | Angular route guard |
| Family / Shared mode (owner) | ❌ | ✅ | UI redirect only |
| Family / Shared mode (partner joining) | ✅ (by design) | ✅ | n/a |
| Dashboard "Ask AI" deep-dive insights (Groq/Gemini) | ❌ | ✅ | UI button only |
| Daily Expense "Speak expense" voice smart-fill | ❌ | ✅ | UI button only |
| Daily Expense receipt-camera AI extraction | ❌ | ✅ | UI button only |
| Home-screen widget, budget-warning toggle, spend-notification prompts | ❌ | ✅ | UI only, local/native — no server cost |
| Bring-your-own-key AI (Settings) | ✅ (any tier) | ✅ | n/a — intentionally tier-independent |

## 2. Gaps found

Every Pro feature that calls a Firebase Function or writes to Firestore was gated **only in the Angular UI** (`subscriptionService.isPro()` hiding a button, or a route redirect). None of that is a security boundary — any signed-in user can call a Firebase Function directly (curl, devtools, a rebuilt APK) and the backend never checked subscription tier. Two of these gaps have a direct cost: they spend Spenza's own Groq/Gemini API quota.

## 3. Corrections made (today, verified via `tsc`/`npm run build` after each)

1. **`functions/src/auth.ts`** — added `requireProTier(uid)`, reading `users/{uid}/subscription/status` the same way the client `SubscriptionService` does (tier === 'pro' and not expired).
2. **`generateInsights`** (`ai-insights.ts`) — hosted (server-key) path now 403s for non-Pro users. Closes a live cost leak: free users could no longer call the AI insights endpoint directly.
3. **`parseVoiceExpense`** (`ai-voice.ts`) — same fix, closes the voice smart-fill leak.
4. **Receipt extraction** (`ai-receipt.ts`) — same fix, closes the receipt-OCR leak.
5. **`createFamily`** (`family.ts`) — now requires Pro for the caller (who becomes owner). `redeemFamilyInvite` (partner join), `createFamilyInvite`, `dissolveFamily`, `leaveFamily` deliberately left ungated — partners are free-tier by design, and those actions don't create new Pro-gated access.
6. **`firestore.rules`** — reminders of `type: 'location'` now require an active Pro subscription to create/update (`isProUser()` rule helper). Read/delete unchanged.

All fixes gate only the **hosted** path (server pays for the API call). BYOK (bring-your-own-key) AI usage is untouched — a free user supplying their own Groq/Gemini key costs Spenza nothing, so it wasn't a leak.

**Action needed from you:** rule change only takes effect after `firebase deploy --only firestore:rules --project spenza-notifications` (this repo's CI does not auto-deploy rules, per existing project notes) and Functions redeploy for the four edited files.

## 4. Residual / accepted risk (not fixed today — flagging, not blocking)

- **Finances (accounts/debts) has no server boundary at all.** The route guard blocks navigation, but the underlying data lives in the user's own Drive JSON — there's no Cloud Function in the write path to check tier against. A free user with browser devtools access could theoretically call `ExpenseStore` methods directly and use Finances without paying. This costs Spenza nothing (it's the user's own storage) and would require real console access, so I'd treat it as low-severity — but flagging it since it's the one Pro feature with zero enforcement depth beyond the UI.
- **Native Android widget/budget-warnings/spend-prompts** read a locally-cached `spenza_pro_tier` flag. Bypassable only via a rooted device or rebuilt APK, and the feature is purely local (no server cost). Not investigated at the native Kotlin/Java layer in this pass.

## 5. Ideas

- **Turn the new 403s into a hook, not a dead end.** Dashboard already opens a Pro-upgrade modal on denial — wire the same pattern into Daily Expense's voice/receipt buttons so a stale client (cached JS, old APK) still lands the user on `/subscribe` instead of a silent failure.
- **Meter a free taste of AI.** Now that the boundary is real, you can safely offer e.g. 1 free Gemini/Groq call per week to free users without risking runaway cost — a low-cost way to demonstrate the "Ask AI" payoff before asking for money.
- **Log the 403s.** Each denied hosted-AI/family/location-reminder call is now a clean signal of "free user wanted this Pro feature." Cheap to pull from Cloud Functions logs and a direct roadmap/pricing signal.
- **Partner trial window.** Give a newly-joined family partner a 7-day preview of Finances/Dashboard AI — they're already in the app because someone paid; a short taste could convert them into their own subscriber later (or a household upgrade).
- **Location reminders as a cheap upsell ladder.** It's a small, well-defined feature — could work as a standalone low-price tier or trial unlock to get free users into a paid habit before pitching full Pro.
