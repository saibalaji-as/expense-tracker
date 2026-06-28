# Payments — Razorpay via Firebase Functions

> **In one sentence:** Razorpay (run through secure server-side Firebase Functions) lets Spenza take subscription payments and *verify* them safely, so paid features unlock only after a genuinely confirmed payment.

---

## 1. What it is (plain English)

**Razorpay** is a payment gateway (popular in India) that handles the actual money movement — cards, UPI, netbanking — so Spenza never touches raw card details. Spenza offers paid subscriptions (monthly/yearly), and Razorpay is what collects the money.

But taking a payment safely is more than showing a "Pay" button. You must **create** an order, let the user pay, then **verify on a trusted server** that the payment really happened and wasn't faked — and also listen for **webhooks** (Razorpay calling your server to report events like renewals or failures). Spenza runs all of that secret-bearing logic in **Firebase Functions** (see [05-firebase.md](05-firebase.md)).

Think of it as: the **app** is the cashier's counter (shows the price, opens the card machine), but the **server** is the bank's back office that confirms the money actually cleared before handing over the goods.

---

## 2. The pain point it solves

- **Don't handle card data.** Razorpay takes on the heavy PCI-compliance burden; Spenza never stores card numbers.
- **Can't trust the client.** A determined user could fake a "payment succeeded" message in the app. Server-side **verification** (with a secret key the device never sees) is the only safe way to unlock paid features.
- **Subscriptions are stateful.** Renewals, failures, and cancellations happen *outside* the app over time; **webhooks** let Razorpay notify the server so subscription status stays correct.

---

## 3. How Spenza uses it

### The pieces (all in Firebase Functions)
The deploy pipeline ships **three Razorpay Functions** plus two subscription-handoff Functions together. They cover:
- **Order creation** — start a payment for the chosen plan.
- **Verification** — confirm a completed payment using the Razorpay secret + signature, then mark the user subscribed.
- **Webhooks** — receive Razorpay's server-to-server events (renewal, failure, etc.) and update status accordingly.

### Where status lives
The confirmed **subscription status is stored per-user in Firestore**. The app reads it (`subscription.service.ts`) to know whether to unlock premium screens, and a **route guard** (`subscription.guard.ts`) blocks premium routes for non-subscribers.

### The native handoff
On Android, the subscription/payment page is **Firebase-hosted** and opened in a real system browser via `@capacitor/browser` (rather than inside the app's WebView). This keeps the payment flow on a trusted web origin. After payment, the app re-checks subscription status.

### Secrets and safety in deployment
The required secrets live only on the server:
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_MONTHLY_ID`, `RAZORPAY_PLAN_YEARLY_ID`, `RAZORPAY_WEBHOOK_SECRET`.

The GitHub Actions deploy workflow injects the **live publishable key** into `index.html` at build time from secrets, and **refuses to deploy unless the placeholder was replaced with a real `rzp_live_` key** — a guardrail against shipping a broken or test-key payments config to production.

---

## 4. Key files to look at

- `personal-finance-pwa/functions/` — the Razorpay order/verify/webhook Functions.
- `personal-finance-pwa/src/app/core/services/subscription.service.ts` — reads subscription status from Firestore.
- `personal-finance-pwa/src/app/core/guards/subscription.guard.ts` — gates premium routes.
- `personal-finance-pwa/src/app/features/subscribe/` — the subscribe UI.
- `.github/workflows/deploy-firebase.yml` — key injection + the `rzp_live_` safety check.

---

## 5. Gotchas worth knowing

- **Never verify a payment on the client.** Verification must happen in a Function with the secret key; trusting the app is a security hole.
- **Webhooks need signature verification.** Use `RAZORPAY_WEBHOOK_SECRET` to confirm a webhook truly came from Razorpay — don't act on unverified calls.
- **Test vs live keys.** The deploy guard exists because shipping a non-`rzp_live_` key would break real payments; respect it.
- **Status is the source of truth, not the receipt.** Unlock features based on the verified Firestore subscription status, not on a client-side "I paid" flag.
- **Native opens payments in a real browser.** Don't try to force the payment flow into the WebView; the `@capacitor/browser` handoff is intentional.

---

## TL;DR

Spenza charges for subscriptions through Razorpay, but all the trust-critical work — creating orders, verifying payments with a secret signature, and handling renewal/failure webhooks — runs in Firebase Functions. Confirmed status lives in Firestore and gates premium routes, the native app hands payment off to a hosted browser page, and the deploy pipeline refuses to ship without a real live key.
