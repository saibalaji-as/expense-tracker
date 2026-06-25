# Spenza — Production Launch Checklist
_Google OAuth verification (web) + Google Play Store launch_
_Last updated: 2026-06-12_

---

## 1. Security fixes applied in this pass (2026-06-12)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | **Critical** | `generateInsights`, `parseVoiceExpense`, `extractReceipt` were callable by **anyone on the internet with no auth** while spending your hosted `GROQ_API_KEY` / `GEMINI_API_KEY` quota (open AI proxy → billing drain). | Server now requires a Firebase ID token whenever the hosted (server-key) path is used. BYOK requests (user's own key) are unaffected. Clients now send `Authorization: Bearer <idToken>`. |
| 2 | **Critical** | `testNotification` was deployed publicly with **no auth** and, when called without `userId`, sent a push notification to **every registered user**. Anyone could spam your entire user base. | Removed from `functions/src/index.ts` exports. File kept for emulator-only testing. Run `firebase deploy --only functions` then `firebase functions:delete testNotification` to remove the already-deployed instance. |
| 3 | **High** | `registerToken` / `unregisterToken` were unauthenticated — anyone could overwrite another user's FCM token, change their reminder times, or delete their registration (DoS + notification hijack). | Both endpoints now require a Firebase ID token. Registrations are bound to `ownerUid` on first authenticated write; cross-account writes/deletes return 403. Legacy docs are claimed on next register. |
| 4 | **High (Play policy)** | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` was declared in `AndroidManifest.xml` but **never used in code**. It is a Play-restricted permission that triggers policy review and frequent rejection. | Removed from the manifest. |

### Re-deploy required
```bash
cd personal-finance-pwa/functions && npm run build
firebase deploy --only functions
firebase functions:delete testNotification   # remove the live insecure endpoint
# Then deploy hosting with the rebuilt app (CI does this on push)
```

---

## 2. Open items you must decide / verify (not auto-fixed)

1. **OAuth client ID mismatch.** `src/index.html` injects
   `663004583066-qlukpjhedfrr3s81gufarglktmqd07dg...` for web GSI, but
   `auth.service.ts` hardcodes a different web client ID
   (`663004583066-vu5c3p5pcsg86thjftfts1t45690kll3...`) for native SocialLogin.
   If both are valid web clients this works, but you must verify **both** in Google
   Cloud Console → Credentials, and both must belong to the same OAuth consent
   screen / verified brand. Prefer consolidating to one web client ID.
2. **`google-services.json` is not in the repo or working tree** (correctly
   gitignored). Ensure it exists locally at `android/app/google-services.json`
   before building the release AAB, otherwise FCM push silently won't work.
3. **Razorpay placeholder.** `index.html` ships `RAZORPAY_LIVE_KEY_PLACEHOLDER`;
   the CI deploy injects the live key. Never sideload a build where the
   placeholder is still present (subscriptions would fail).
4. **Notification Listener feature** (`SpendNotificationListenerService`): reads
   text of other apps' notifications to detect payments. It is opt-in
   (default off) — good — but on Play you must declare it (see §4.6) and it may
   trigger manual review. If launch speed matters more than the feature,
   consider removing the service for v1 and re-adding it later.
5. **Dead code to delete before review:** `personal-finance-pwa/netlify/` (deprecated
   functions), `functions/src/stripe.ts` (unused, not exported), `test-fcm.html`
   (dev page in app root, not shipped but confusing).
6. **versionCode/versionName** are `1` / `1.0` in `android/app/build.gradle` —
   bump on every Play upload.

---

## 3. Google OAuth verification (web) — step by step

Your app uses one **sensitive** scope: `drive.appdata`
(plus non-sensitive `openid email profile`). The `spreadsheets` scope was removed in v9 (Sheets import feature removed). Sensitive scopes require app
verification but **not** the expensive CASA security assessment (that's only
for *restricted* scopes like full Drive — which you correctly removed in v8).

1. **OAuth consent screen (Google Cloud Console → APIs & Services):**
   - User type: External, Publishing status: push to "In production".
   - App name "Spenza", support email, developer contact email.
   - App logo (120×120) — note: uploading a logo triggers brand verification.
   - Authorized domain: `spenza-finance.web.app` cannot be used as an
     *authorized domain* (you don't own `web.app`). You need your own domain
     (e.g. `spenza.app`) OR keep the privacy policy on a domain you control.
     Currently the privacy policy is at `saibalaji-as.github.io/spenza-legal/` —
     `github.io` subdomain ownership can be proven via Search Console; verify
     `saibalaji-as.github.io` in Search Console with the same Google account.
   - Homepage URL, Privacy Policy URL, Terms of Service URL — all must be live,
     reachable, and the privacy policy must explicitly describe Google user
     data use (what is read, stored, shared — see `docs/DATA_SAFETY.md`).
2. **Scopes tab:** add exactly `openid`, `email`, `profile`,
   `https://www.googleapis.com/auth/drive.appdata`.
   The `spreadsheets` scope has been removed (Sheets import removed in v9).
   Use the justifications already drafted in `docs/OAUTH_SCOPE_JUSTIFICATION.md`.
3. **Credentials:** verify redirect origins on the web client:
   `https://spenza-finance.web.app`, `http://localhost:4200` (dev only — remove
   dev origins from the production client before submitting).
   Android client: package `com.spenza.app` + **Play App Signing SHA-1**
   (from Play Console → App integrity), not just your upload key SHA-1.
   Your current SHA-1s are in `sha-keys.md` (debug machines); add the Play
   App Signing certificate SHA-1 after first upload.
4. **Demo video (required for sensitive scopes):** record a video showing
   sign-in with the Google account picker, the consent screen with your app
   name and scopes, and the features that use each scope (Drive backup in
   Settings). Upload unlisted to YouTube; link it in the
   verification request.
5. **Limited Use disclosure:** your privacy policy must contain the Google
   API Services User Data Policy "Limited Use" affirmation sentence.
6. Submit and respond to the verification emails (typically 3–7 business days
   for sensitive scopes; brand verification can add time). Until approved, the
   unverified-app warning shows and you're capped at 100 users.

---

## 4. Google Play Store launch — step by step

1. **Play Console setup:** create app (`com.spenza.app`), category Finance,
   free, contains in-app purchases? — **careful:** Spenza Pro is sold via
   Razorpay. Google Play Billing policy requires Play Billing for in-app
   digital subscriptions sold **inside the Android app**. Your current design
   (native app opens the external `spenza-finance.web.app/#/subscribe` page in
   a browser) is the pattern Google rejects unless you qualify for an
   exception. Safest options: (a) hide all purchase entry points in the
   Android build and let users subscribe on the web independently
   ("reader app" style — no links to the purchase page from the APK), or
   (b) implement Google Play Billing for Android. Decide before submission;
   this is the single biggest rejection risk.
2. **Signing:** enroll in Play App Signing. Build with
   `SPENZA_STORE_PASSWORD` / `SPENZA_KEY_PASSWORD` env vars set;
   `./gradlew bundleRelease` → upload the `.aab`.
3. **Target API:** compileSdk/targetSdk 36 — meets 2026 requirements. minSdk 24.
4. **Data safety form** — declare (source: `docs/DATA_SAFETY.md`):
   - Data collected: email (account), financial info (user-entered expenses —
     stored in user's own Google Drive appData), FCM token + timezone +
     reminder prefs (Firestore), voice input (processed, not stored),
     receipt images (processed via Gemini, not stored).
   - Encryption in transit: yes. Deletion mechanism: yes (Settings → reset +
     unregister).
5. **Permissions declarations in Play Console:**
   - `SCHEDULE_EXACT_ALARM` → declare "exact alarms for user-scheduled
     reminders" (allowed use).
   - `RECORD_AUDIO` → runtime-requested, voice expense entry; add a prominent
     in-app disclosure before first mic use if not already present.
   - `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — removed; do **not** declare.
6. **Notification Listener declaration:** Play flags
   `BIND_NOTIFICATION_LISTENER_SERVICE`. In the app content → sensitive
   permissions section, justify: "Optional, off-by-default feature that lets
   the user auto-capture expense amounts from payment notifications. Data is
   processed on-device only and never transmitted." Be ready for manual review.
7. **Store listing:** title, short/full description, screenshots (phone +
   7" tablet), 512×512 icon, 1024×500 feature graphic, privacy policy URL
   (same as OAuth one).
8. **Content rating questionnaire, target audience** (18+ recommended for
   finance), **ads declaration** (none).
9. **Testing track first:** upload to Internal testing, verify Google sign-in
   works with the Play App Signing SHA-1 (most common launch bug: sign-in
   works in debug, fails in the Play-signed build because the Android OAuth
   client only has the upload-key SHA-1).
10. Promote to Closed → Production. New personal dev accounts need 12 testers
    for 14 days on Closed testing before production access.

---

## 5. Verification checklist (quick reference)

- [ ] `firebase deploy --only functions` with the new auth-hardened code
- [ ] `firebase functions:delete testNotification`
- [ ] Confirm AI insights/voice/receipt still work signed-in (hosted mode)
- [ ] Confirm 401 returned when calling AI endpoints with `curl` and no token
- [ ] Resolve web-vs-native OAuth client ID question (§2.1)
- [ ] Remove `localhost` origins from prod OAuth client
- [ ] Privacy policy: Limited Use clause + Google user data section live
- [ ] Search Console domain verification for privacy-policy host
- [ ] OAuth demo video recorded and linked
- [ ] Decide Razorpay-vs-Play-Billing strategy (§4.1)
- [ ] `google-services.json` present for release build
- [ ] Android OAuth client updated with Play App Signing SHA-1
- [ ] Data safety form matches `docs/DATA_SAFETY.md`
- [ ] Notification-listener declaration filed (or feature removed for v1)
- [ ] Internal testing pass: sign-in, Drive backup, push reminder, AI features
