# Firebase — The Backend Services

> **In one sentence:** Firebase is the set of Google-hosted backend services that host Spenza's website, send its reminder notifications, remember who's subscribed, and run its payment logic — without Spenza having to run and maintain its own servers.

---

## 1. What it is (plain English)

Most apps need a "backend" — servers that do things the user's device can't or shouldn't do alone: host the website, store shared data, send notifications, run secret code (like verifying a payment). Traditionally you'd rent servers and maintain them.

**Firebase** is Google's "backend-as-a-service." It provides ready-made backend building blocks you switch on and use, with Google handling the servers, scaling, and uptime. Spenza uses several Firebase pieces together.

Think of Firebase as a *serviced office*: instead of building and staffing your own office (servers), you rent fully-equipped rooms (auth, database, hosting, functions) and just move in.

---

## 2. The pain point it solves

- **No server ops.** No machines to provision, patch, scale, or keep online at 3am.
- **Identity without building it.** Firebase Auth turns the Google login token into a trusted backend identity (see [03-oauth-google-signin.md](03-oauth-google-signin.md)).
- **Reliable notifications.** Sending push notifications to phones is genuinely hard; Firebase Cloud Messaging (FCM) handles the delivery plumbing.
- **Secure secrets.** Payment verification needs secret keys that must never touch the user's device. Firebase Functions run that code safely on the server.

---

## 3. The Firebase pieces Spenza uses

| Service | What it does in Spenza |
|---------|------------------------|
| **Firebase Hosting** | Serves the web PWA at `https://spenza-finance.web.app`. The built Angular output (`dist/personal-finance-pwa/browser`) is deployed here. |
| **Firebase Auth** | Converts the Google sign-in credential into a backend user identity (`signInWithCredential`). This is the bridge from "logged in with Google" to "the backend knows it's you." |
| **Firestore** | A cloud database used for two narrow things: the **FCM token registry** (which device gets which notification) and **per-user subscription status** (is this user a paying subscriber?). *Note: the user's actual expense data does NOT live here — that's in Google Drive. See [07-google-drive-sync.md](07-google-drive-sync.md).* |
| **Firebase Cloud Messaging (FCM)** | Delivers push notifications to devices, even when the app is closed. Paired with the Capacitor push plugin. |
| **Firebase Functions** | Server-side code (Node.js 22) for things that need secrets: Razorpay payment creation/verification/webhooks (see [09-payments-razorpay.md](09-payments-razorpay.md)), the hosted AI proxy, and the scheduled reminder sender. |
| **Firebase Scheduler** | Runs the `send-reminders` function on a schedule (every minute) to fire daily reminders at each user's chosen local time. |

### How data responsibilities split (important mental model)
This trips people up, so be precise:

- **Identity** → Firebase Auth
- **Your expense data** → **Google Drive** (your own account), with a local device cache
- **Subscription status + notification tokens** → Firestore
- **Secret server logic (payments, AI proxy, reminders)** → Firebase Functions

Spenza deliberately keeps the user's financial data *out* of its own database (Drive instead), and uses Firestore only for the small operational facts the backend genuinely needs.

### Deployment
A GitHub Actions workflow (`.github/workflows/deploy-firebase.yml`) ships Hosting + the subscription Functions + the Razorpay Functions together. It even injects the live Razorpay key into `index.html` at build time and refuses to deploy unless the placeholder was replaced with a real `rzp_live_` key — a safety check against shipping a broken payments config.

---

## 4. Key files to look at

- `personal-finance-pwa/src/app/core/config/firebase.config.ts` — the Firebase web config + VAPID key (for push).
- `personal-finance-pwa/src/app/core/services/fcm.service.ts` — FCM token registration and push handling.
- `personal-finance-pwa/src/app/core/services/subscription.service.ts` — reads subscription status from Firestore.
- `personal-finance-pwa/functions/` — the server-side Functions (payments, AI proxy, reminders).
- `personal-finance-pwa/firebase.json` / `.firebaserc` — hosting + project config.
- `.github/workflows/deploy-firebase.yml` — the deploy pipeline.

---

## 5. Gotchas worth knowing

- **Project naming is split.** The Firebase *project* is `spenza-notifications`; the hosting *site* is `spenza-finance`. Don't assume one name everywhere.
- **Secrets live in Firebase, not the repo.** `GROQ_API_KEY`, `GEMINI_API_KEY`, and the Razorpay keys are set via `firebase functions:secrets:set` — never hardcoded.
- **Firestore is intentionally minimal.** Resist the temptation to stuff expense data into Firestore; the design keeps that in Drive. Adding it to Firestore would break the privacy model.
- **Emulators are used for testing.** Auth (9099) and Firestore (8080) emulators back the Playwright suite (see [02-playwright.md](02-playwright.md)); `npm run emulators:start` runs them locally.
- **Legacy Netlify functions are dead code.** All serverless endpoints have moved to Firebase Functions; the `netlify/` folder is pending deletion. Don't add new backend code there.

---

## TL;DR

Firebase is Spenza's managed backend: Hosting serves the website, Auth turns the Google login into a backend identity, FCM delivers push reminders, Firestore stores only subscription status and notification tokens, and Functions run the secret-bearing code for payments, AI, and scheduled reminders — all without Spenza running its own servers, and with the user's actual financial data kept in Drive instead.
