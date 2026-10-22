<h1 align="center">Spenza — Application Guide</h1>

<p align="center">
  <em>Your smart expense tracking companion.</em><br>
  Angular 21 PWA · Capacitor Android · Google Drive + Firebase · <code>com.spenza.app</code> · <a href="https://spenza.site">spenza.site</a>
</p>

<p align="center">
  <b>Companion documents</b><br>
  <a href="./VISUAL_ATLAS.html">📊 Visual Atlas (open in a browser)</a> ·
  <a href="./ai/CODE_MAP.md">🧭 Code Map (where to change what)</a> ·
  <a href="./ai/PROJECT_CONTEXT.md">📐 Project Context</a> ·
  <a href="./ai/CURRENT_STATE.md">🚧 Current State</a>
</p>

---

# Index

Click any line to jump to its explanation. Everything below the index is the explanation.

### Part 1 — The product
- [1.1 What Spenza does](#11-what-spenza-does)
- [1.2 Who uses it and how](#12-who-uses-it-and-how)
- [1.3 The mental model — five ledgers, one document](#13-the-mental-model--five-ledgers-one-document)
- [1.4 Free vs Pro](#14-free-vs-pro)

### Part 2 — The screens
- [2.1 Screen map at a glance](#21-screen-map-at-a-glance)
- [2.2 Welcome (public landing)](#22-welcome-public-landing)
- [2.3 Sign in / Auth callback](#23-sign-in--auth-callback)
- [2.4 Mode selection](#24-mode-selection)
- [2.5 Family setup](#25-family-setup)
- [2.6 Daily — log an expense](#26-daily--log-an-expense)
- [2.7 Monthly — the month report](#27-monthly--the-month-report)
- [2.8 Limits — budget allocation](#28-limits--budget-allocation)
- [2.9 Finances — accounts, cards and debts](#29-finances--accounts-cards-and-debts)
- [2.10 Dashboard — analytics and AI insights](#210-dashboard--analytics-and-ai-insights)
- [2.11 Splits — circles and group expenses](#211-splits--circles-and-group-expenses)
- [2.12 Reminders](#212-reminders)
- [2.13 Notification inbox](#213-notification-inbox)
- [2.14 Settings](#214-settings)
- [2.15 Subscribe](#215-subscribe)
- [2.16 Privacy and Terms](#216-privacy-and-terms)
- [2.17 The shell — navigation and theming](#217-the-shell--navigation-and-theming)

### Part 3 — The business flows
- [3.1 Cold start and bootstrap](#31-cold-start-and-bootstrap)
- [3.2 Onboarding a brand-new user](#32-onboarding-a-brand-new-user)
- [3.3 Logging an expense — the full path](#33-logging-an-expense--the-full-path)
- [3.4 Receipt capture — OCR and AI extraction](#34-receipt-capture--ocr-and-ai-extraction)
- [3.5 Split bill](#35-split-bill)
- [3.6 Budget allocation and the 50/30/20 rule](#36-budget-allocation-and-the-503020-rule)
- [3.7 Account balances — why they are derived](#37-account-balances--why-they-are-derived)
- [3.8 Credit card lifecycle](#38-credit-card-lifecycle)
- [3.9 Debt and EMI](#39-debt-and-emi)
- [3.10 Family sync — the ledger](#310-family-sync--the-ledger)
- [3.11 Circle splits — the settlement algorithm](#311-circle-splits--the-settlement-algorithm)
- [3.12 Notifications — every trigger](#312-notifications--every-trigger)
- [3.13 Subscription and payments](#313-subscription-and-payments)
- [3.14 Backup, restore and account deletion](#314-backup-restore-and-account-deletion)
- [3.15 Offline behaviour](#315-offline-behaviour)

### Part 4 — Under the hood
- [4.1 Architecture at a glance](#41-architecture-at-a-glance)
- [4.2 The state store](#42-the-state-store)
- [4.3 Persistence and conflict resolution](#43-persistence-and-conflict-resolution)
- [4.4 The data model](#44-the-data-model)
- [4.5 Backend — Firebase Functions](#45-backend--firebase-functions)
- [4.6 Security model](#46-security-model)
- [4.7 Native Android](#47-native-android)
- [4.8 AI stack](#48-ai-stack)
- [4.9 Storage keys](#49-storage-keys)

### Part 5 — Working on it
- [5.1 Repository layout](#51-repository-layout)
- [5.2 Running, building, deploying](#52-running-building-deploying)
- [5.3 Testing](#53-testing)
- [5.4 Conventions and invariants](#54-conventions-and-invariants)
- [5.5 Known risks and debt](#55-known-risks-and-debt)

---
---

# Part 1 — The product

## 1.1 What Spenza does

Spenza is a personal and household expense tracker that answers four questions, in order:

1. **Where did the money go?** — you log expenses in seconds (typed, spoken, scanned from a receipt, captured from a bank SMS, or tapped from a home-screen widget).
2. **Was that within plan?** — every expense is measured against a percentage-of-income budget you set once, per category.
3. **What do I actually own and owe?** — asset accounts, credit cards and loans roll up into a live net-worth figure.
4. **What should I change?** — a dashboard of deterministic insights, optionally deepened by an AI pass.

Around that core sit four multipliers: **household sharing** (a partner logs into the same ledger), **group splitting** (circles, Splitwise-style), **automation** (reminders, budget alerts, bank-notification capture, widgets), and **offline-first durability** (nothing is lost when the network is not there).

Data lives in the user's **own Google Drive** as a single JSON document. Spenza never hosts your financial records on its servers — Firestore holds only sync metadata, group-split data, subscription status and push tokens.

[↑ Index](#index)

## 1.2 Who uses it and how

| Persona | Entry point | What they get |
|---|---|---|
| **Solo tracker** | Sign in → Single mode | Daily logging, limits, monthly report, dashboard, reminders |
| **Household owner** (Pro) | Single → Family mode, creates a family, shares an invite code | A shared ledger with a partner, with attribution on every entry |
| **Household partner** (free) | Redeems the owner's 8-character invite code | The same shared ledger; no Pro subscription required |
| **Group organiser** | Splits → creates a Circle, shares a link | Equal-split bills, family roll-ups, one-tap settle-up |
| **Group participant** | Opens the `/join/:code` link | Claims a seat and sees balances; no subscription required |
| **Android power user** | Adds the home-screen widgets | Two-tap expense logging and a daily streak, working with the app closed |

**Platforms:** installable web PWA (Firebase Hosting) and an Android app via Capacitor. iOS is not shipped.
**Languages:** English, Tamil, Hindi. **Currencies:** INR, USD, AED.

[↑ Index](#index)

## 1.3 The mental model — five ledgers, one document

Everything Spenza knows is five append-mostly lists plus two settings, all inside one Drive file, `spenza-backup.json`:

| Ledger | Holds | Screen that owns it |
|---|---|---|
| **Expenses** | every `ExpenseEntry` | [Daily](#26-daily--log-an-expense) |
| **Limits** | percentage allocation per category | [Limits](#28-limits--budget-allocation) |
| **Accounts + adjustments** | cash / bank / wallet balances and manual corrections | [Finances](#29-finances--accounts-cards-and-debts) |
| **Debts + payments + adjustments** | credit cards and loans | [Finances](#29-finances--accounts-cards-and-debts) |
| **Metadata** | monthly income, currency, receipt folder | [Limits](#28-limits--budget-allocation) / [Settings](#214-settings) |

Two things are deliberately **not** in that document: **circles** (they live in Firestore because non-family members must read them) and the **notification inbox** (device-local only, because it contains SMS-derived text).

The most important design decision in the app: **balances are derived, not stored.** An account's `balance` field is a cache recomputed from `initialBalance + adjustments − linked expenses + cash withdrawals`. See [§3.7](#37-account-balances--why-they-are-derived) for why.

[↑ Index](#index)

## 1.4 Free vs Pro

Spenza Pro is ₹499/month or ₹3,999/year (33 % saving), sold through Razorpay.

| Capability | Free | Pro |
|---|---|---|
| Daily logging, limits, monthly report, dashboard charts | ✅ | ✅ |
| Deterministic local insights | ✅ | ✅ |
| Reminders (date/time) | ✅ | ✅ |
| **Circle splits** (create, join, settle) | ✅ | ✅ |
| Finances — accounts, cards, debts | — | ✅ |
| AI dashboard insights ("Ask AI") | — | ✅ |
| Receipt scanning (AI extraction) | — | ✅ |
| Voice expense smart-fill | — | ✅ |
| Family mode — **creating** a family | — | ✅ |
| Family mode — **joining** as partner | ✅ | ✅ |
| Location (geofence) reminders | — | ✅ |
| Budget warning notifications | — | ✅ |
| Bank-notification spend prompts (Android) | — | ✅ |

> Group splitting is free **by design** — it is the viral surface. The partner seat is free **by design** — one subscription covers a household.

Enforcement is two-layered: the client `isPro()` controls what is shown, and the server (`requireProTier` in Functions, `isProUser()` in Firestore rules) is the actual boundary. Never rely on the client gate alone.

[↑ Index](#index)

---

# Part 2 — The screens

## 2.1 Screen map at a glance

| # | Route | Screen | Guards | Tab? |
|---|---|---|---|---|
| 1 | `/` | [Welcome](#22-welcome-public-landing) | public | — |
| 2 | `/auth/callback` | [Sign in](#23-sign-in--auth-callback) | public | — |
| 3 | `/mode-select` | [Mode selection](#24-mode-selection) | auth, setup | — |
| 4 | `/family-setup` | [Family setup](#25-family-setup) | auth, setup | — |
| 5 | `/daily` | [Daily](#26-daily--log-an-expense) | auth, setup, income | ✅ |
| 6 | `/monthly` | [Monthly](#27-monthly--the-month-report) | auth, setup, income | ✅ |
| 7 | `/limits` | [Limits](#28-limits--budget-allocation) | auth, setup | ✅ |
| 8 | `/finances` | [Finances](#29-finances--accounts-cards-and-debts) | auth, setup, **Pro** | ✅ |
| 9 | `/dashboard` | [Dashboard](#210-dashboard--analytics-and-ai-insights) | auth, setup, income | ✅ |
| 10 | `/splits` · `/splits/:id` · `/join/:code` | [Splits](#211-splits--circles-and-group-expenses) | auth, setup (join is public) | ✅ |
| 11 | `/reminders` · `/reminders/:id` | [Reminders](#212-reminders) | auth, setup | ✅ |
| 12 | `/notifications` | [Inbox](#213-notification-inbox) | auth, setup | ✅ |
| 13 | `/settings` | [Settings](#214-settings) | auth, setup | ✅ |
| 14 | `/subscribe` | [Subscribe](#215-subscribe) | web only | — |
| 15 | `/privacy` · `/terms` | [Legal](#216-privacy-and-terms) | public | — |

Routing is **hash-based** (`/#/daily`) so the PWA and the Capacitor WebView share one strategy. Every route is lazily loaded, and all chunks are preloaded in the background after first paint so no tab has a first-tap stall.

Three guards run in order: `authGuard` (waits for session restore, else `/auth/callback`), `setupGuard` (mode/family completeness, then the income gate), `subscriptionGuard` (only on `/finances`).
The **income gate** sends anyone with `monthlyIncome <= 0` from `/daily`, `/monthly` or `/dashboard` to `/limits?onboarding=income`.

[↑ Index](#index)

## 2.2 Welcome (public landing)

**Route** `/` · **File** `features/welcome/welcome.component.ts`

The unauthenticated marketing page, rendered without the app shell. It exists for three audiences: prospective users, search crawlers, and **Google OAuth reviewers** — which is why the Google data-use disclosure (what `drive.appdata` is used for, and why `openid/email/profile` is requested) is a first-class section rather than buried in the privacy policy.

Sections: sticky nav → hero with an animated product mockup → selling-point marquee → six feature cards → an animated numbers strip → three-step "how it works" → Free vs Pro pricing → FAQ → Google data-use scope cards → footer CTA.

Behaviour worth knowing:
- A signed-in visitor is redirected to `/daily` as soon as the session restores — you never see the landing page twice.
- All animation runs through `IntersectionObserver` and only hides below-the-fold elements, so the page is fully readable with JavaScript disabled.
- Internal links use a manual scroll with a −72 px sticky-nav offset, because with hash routing an `href="#features"` would be interpreted as a route change.
- The page is **light-only** and uses its own local tokens; it deliberately does not inherit the app's theme system.
- No testimonials: fabricated social proof was ruled out.

[↑ Index](#index)

## 2.3 Sign in / Auth callback

**Route** `/auth/callback` · **File** `features/auth/auth-callback.component.ts`

Where every unauthenticated request lands. It is a full sign-in landing page — hero, a live glass dashboard mock with a rotating expense feed, a lifecycle explainer, feature grid and pricing — with the actual Google sign-in button repeated top and bottom. Unlike Welcome, this page is theme-aware.

**`onSignIn()` is the routing hub of the whole app:**

```
signIn()
  ├─ accountChanged?  → wipe account-scoped local state (store, backup cache, mode cache)
  ├─ subscriptionService.ensureStarted(uid)
  ├─ backupModeService.loadFromDrive(force)
  └─ route:
        mode === null                             → /mode-select
        mode === 'family' && no sharedFileId && no familyId → /family-setup
        otherwise                                 → /daily
                                                     (+ background Drive load, + family listener)
```

Error handling has one case that matters: if the user **unticked the Google Drive checkbox** on the consent screen, the app raises `MissingDriveScopeError` (or sees a 403) and shows a specific "Drive access is required" message rather than a generic failure — without it the user would loop through sign-in forever with a token that can never read Drive.

[↑ Index](#index)

## 2.4 Mode selection

**Route** `/mode-select` · **File** `features/mode-selection/mode-selection.component.ts`

A one-time fork with two cards.

- **Single user** — writes `mode: 'single'` into the Drive config and returns to the auth callback to finish bootstrapping. The backup lives in Drive's private `appDataFolder`, invisible in the user's Drive UI.
- **Family / shared** — Pro-gated. Non-Pro users are routed to `/subscribe`; Pro users continue to `/family-setup`. Note this card does **not** set the mode; family mode is only committed once setup actually succeeds, so an abandoned attempt leaves no half-configured state.

If a mode is already set, the screen redirects to `/daily` immediately, so onboarding cannot be re-entered by accident.

[↑ Index](#index)

## 2.5 Family setup

**Route** `/family-setup` · **File** `features/family-setup/family-setup.component.ts`

A six-step wizard driven by one `step` signal.

**Owner path:** `role-select` → (`owner-paywall` if not Pro) → `owner-creating` → `owner-ready`.
`createFamily` creates the Firestore family document; `createFamilyInvite` mints an 8-character uppercase code valid for **24 hours**. The created `familyId` is held so that a failed invite call can be retried without creating a second family. The code is shown with a copy button.

**Partner path:** `role-select` → `partner-enter-code` → `partner-joining`.
The code input force-uppercases as you type. Redemption maps errors precisely: **404** → "this code has expired", **409** → "already used" (only when a *different* user redeemed it — the same user retrying is idempotent server-side), anything else → a network message that returns you to the code step with your input intact.

On success both sides store the `familyId`, set their role (`owner` / `partner`), start the Firestore ledger listener and land on `/daily`.

> Legacy note: families created before the Firestore migration have a `sharedFileId` but no `familyId`. Settings shows a migration prompt, and `setupGuard` forces them back through this screen.

[↑ Index](#index)

## 2.6 Daily — log an expense

**Route** `/daily` · **File** `features/daily-expense/daily-expense.component.ts` (3 416 lines — the largest screen)

The home screen. Everything about logging happens here.

**Layout**
1. **Hero card** — the selected date, spent-of-budget, and a progress ring. The daily budget is `monthlyIncome / 30`.
2. **Log Expense** — the form.
3. **Today's Entries** — the day's expenses grouped by category, each row showing time, actor, payment source and comment, with a savings figure per group.
4. **Detail popup** — tap a group to see individual entries, receipts and per-entry edit/delete.

**The form, field by field**

| Field | Rules |
|---|---|
| Category | Chips from the 15 canonical categories plus any custom ones you defined in Limits; four shown, "Show more" reveals the rest with the selected chip hoisted to front |
| Amount | Required, minimum 0.01 |
| Date | Required, defaults to today, **cannot be in the future**; backdating is allowed |
| Payment source | Optional. Asset accounts (with live balance) and credit cards in one dropdown; defaults to your default account |
| Comment | Optional, with a dictation mic (free for everyone) |
| Receipt | Optional image or PDF, max 10 MB — see [§3.4](#34-receipt-capture--ocr-and-ai-extraction) |

Live feedback while typing: remaining-today, the savings this entry produces, and a green/red border once you cross the category limit.

**Behaviours that surprise people**
- **Drafts survive navigation.** An in-progress entry is held in memory and restored when you come back — but deliberately not persisted across app restarts.
- **A receipt scan survives navigation too.** The extraction session is root-scoped, so leaving Daily mid-OCR and returning re-attaches to the running job and auto-applies the result.
- **Debt-payment entries are read-only here.** Credit-card repayments (`source: 'debt-payment'`) are hidden from the day list and cannot be edited or deleted from Daily — they are managed in Finances, because editing one has to reverse an account deduction *and* a debt balance atomically.
- **Overspend nudge.** If you overspent this category last month, a toast says so — once per category per session.
- **Leaving with unsaved work** triggers a browser confirm on web (disabled on native).

**Pro gates on this screen:** voice smart-fill and receipt scanning. The comment mic is free.

[↑ Index](#index)

## 2.7 Monthly — the month report

**Route** `/monthly` · **File** `features/monthly-expense/monthly-expense.component.ts`

The retrospective view for one month.

- **Month picker** — previous/next around a month label. **Future months are blocked**, and so are past months with no entries; both show a toast that clears after 3.5 s.
- **Three KPI cards** — Total Spent (with a trend chip vs last month and a 30-day sparkline), Total Limit, Net Savings (`totalLimit − totalSpent`, with an "Over budget" state and its own cumulative sparkline clamped at zero).
- **Budget rule breakdown** — a doughnut of Needs / Wants / Savings / Growth / Buffer with the month total in the centre and a legend that hides empty groups.
- **Category breakdown** — one row per category: spent vs limit, a progress bar, a sparkline and an entry count. Tapping opens a detail modal listing that category's entries.

Trends use a ±5 % dead-band: below that the chip reads "stable" rather than flapping on noise. A category with a zero limit but non-zero spend shows as 100 % and "over" — deliberate, so a 0 % allocation you keep spending in stays visible.

[↑ Index](#index)

## 2.8 Limits — budget allocation

**Route** `/limits` · **File** `features/expense-limit/expense-limit.component.ts`

Where the whole budget model is configured, and the mandatory first stop for a new user (the income gate points here).

1. **Monthly income** — required, greater than zero. Everything else is a percentage of it.
2. **Spending limits** — a table (desktop) / cards (mobile) of every category with its budget group, the recommended percentage, your percentage, and the resulting rupee amount recomputed live. You can add custom categories; only custom rows can be deleted.
3. **Running total** — a badge and a stacked group bar. **Save is disabled until the total is within 0.05 of 100 %.**
4. **Save** — if Savings + Growth is under 20 %, a confirmation modal appears first, because that breaks the 50/30/20 principle the defaults encode.

Defaults ship as Needs 50 / Wants 30 / Savings 12 / Growth 8 / Buffer 0. See [§3.6](#36-budget-allocation-and-the-503020-rule) for the full table.

[↑ Index](#index)

## 2.9 Finances — accounts, cards and debts

**Route** `/finances` · **Pro-gated** · **File** `features/finances/finances.component.ts` (2 034 lines)

The net-worth ledger, in three sections under four KPI chips (total assets, total liabilities, account count, active debts).

### Accounts
Cash, bank, wallet or other. Each has a name, a balance, an overdraft flag and an optional default marker (exactly one account can be default). Per account you get:
- **Adjustments** — manual corrections that do *not* create an expense; negative adjustments respect the overdraft flag. Each is logged with its reason and shows a "local only" chip until it syncs.
- **A reconcile banner** — when the stored balance drifts from the balance derived from records by ≥ 0.01, you are asked to accept the derived figure or keep the stored one (which posts an audited correcting adjustment). See [§3.7](#37-account-balances--why-they-are-derived).
- Deletion is blocked while any expense references the account.

### Credit cards
Cards are modelled as debts with `type: 'credit-card'`, but get their own form and their own UI: credit limit, current outstanding, bill generation day, payment due day, minimum payment, network/bank and last four digits.

Per card the screen shows:
- **Utilisation bar** — green under 30 %, amber to 69 %, red at 70 %+, with the "keep it under 30 %" guidance.
- **The cycle box** — spend in the current unbilled cycle, the statement due, and either "paid" or "pay by ⟨date⟩".
- **Statement confirm-or-edit** — Spenza derives a statement amount when the bill date passes and shows it in amber as an estimate; confirming or editing it flips it to a user-confirmed figure that all later reminders quote exactly.
- **Adjustments** — four kinds: `refund` and `cashback` reduce the outstanding, `charge` raises it, and `cash-withdrawal` raises the outstanding *and* credits a chosen asset account in one atomic step (it is not an expense, so it never double-counts). A refund can be matched to the original purchase from up to three candidates within a 90-day window.
- **Pay bill** — records a payment from an asset account.

### Loans
Personal, vehicle, home and other. Principal, remaining balance, interest rate, monthly EMI, start date and next due date, with a progress bar and a payment history. Recording a payment is a single transaction — see [§3.9](#39-debt-and-emi).

A zero-outstanding credit card deliberately stays `active` rather than flipping to `paid`, so it remains selectable as a payment method.

[↑ Index](#index)

## 2.10 Dashboard — analytics and AI insights

**Route** `/dashboard` · **File** `features/dashboard/dashboard.component.ts`

Five bands:

1. **Quick stats** — today, last 7 days, average per day this month.
2. **Net worth** — the value, an asset/liability split bar, counts, the next debt due, and a link into Finances.
3. **Insights** — three tiles (week total, delta vs last week, month forecast) plus deterministic insight cards computed entirely on-device. Month forecast is `spent this month ÷ day of month × days in month`. A category crossing **80 %** of its limit surfaces as a warning.
4. **Activity timeline** — the last eight entries, attributed to the family member who created or last updated them.
5. **Four charts** — a 30-day daily line, a month-by-category doughnut coloured from the canonical category palette, a six-month comparison bar, and the budget-rule doughnut.

**"Ask AI"** (Pro) sends an anonymised statistical payload — never raw comments — and returns five labelled sections: *Anomaly*, *Behaviour hack*, *What if*, *Seasonal timing*, *Intent check*. The payload is built from a dozen local analyses: category z-scores against a 13-week baseline, repeated-expense detection, large-purchase thresholds, weekday/weekend patterns, budget-intent drift, seasonality, and "what if you cut this" scenarios (25 % for Needs categories, 50 % elsewhere).

Rate limits are strict on purpose: **2 calls per locale per day, 5 total**, a 12-hour cache, a 7-day stale fallback, and change-detection gates so an unchanged month never triggers a new call. Free users see a Pro upgrade modal instead.

[↑ Index](#index)

## 2.11 Splits — circles and group expenses

**Files** `features/splits/splits-list.component.ts`, `circle-detail.component.ts`, `join-circle.component.ts`

A Circle is a shared group ledger for trips, flatmates and dinners. Circles are **free for everyone**.

### Splits list (`/splits`)
Your circles with member counts and settled badges, a "join by code" field (minimum 4 characters, force-uppercased), and a create dialog where you name the circle and add up to 19 member names alongside yourself (20 total).

### Circle detail (`/splits/:id`)
Three tabs.

- **Expenses** — bills with description, amount, date, who paid and who participates. Each can carry a bill photo. You can edit or delete your own bills; the owner can edit anyone's. Bills are stored as **images only** — a PDF is converted to a stacked image of its first four pages — and the expense is saved *before* the image uploads, so a failed upload never loses the bill.
- **Balances** — per-member paid / share / net, rolled up into **family groups** when members have been assigned to a head. Families never change anyone's per-person share; they only aggregate the resulting balances so one person can settle for their household.
- **Settle** — the minimal set of "A pays B" transfers, a shareable plain-text summary for WhatsApp, and an owner-only Settle Up.

The owner can also manage members: rename, assign to a family, add, and remove. Removal is blocked when the member paid a live bill, is the sole participant of one, or is a family head others still point at. When a member joins after bills exist, you are asked whether they share the existing bills or only future ones — and even "share existing" only widens bills whose participants were exactly everyone, so a deliberately custom split is never silently changed.

**Settling** marks the circle `settled` and locks writes. Each member's own share is then auto-logged once into their personal Daily ledger, tagged `circle-settle`, and never re-logged even if they delete it.

### Join (`/join/:code`)
A public landing page. If you are not signed in, the code is parked in device storage and you are sent to sign-in, then resumed automatically. You can either **claim an unclaimed seat** (the organiser typed your name already) or **join as a new member**.

Full algorithm in [§3.11](#311-circle-splits--the-settlement-algorithm).

[↑ Index](#index)

## 2.12 Reminders

**Routes** `/reminders`, `/reminders/:id` · **Files** `features/reminders/reminder-list.component.ts`, `reminder-form.component.ts`

Two kinds of reminder:

- **Date/time** — free. Fires as a local notification on native and a web push on the browser.
- **Location (geofence)** — **Pro**. Pick a place by search or by dropping a pin on a map, set a radius, and get reminded when you are near it. The Pro gate is enforced in Firestore rules, not just the UI, so it cannot be bypassed with the SDK.

The form supports **voice entry**: you speak, the transcript goes to the AI parser, and it comes back as a structured reminder. If it is ambiguous the parser says so and asks a clarifying question; if you are not Pro and it parsed a location reminder, it is quietly downgraded to date/time rather than failing. If the AI is unavailable, the raw transcript becomes the title.

The list has Active and Completed tabs with complete and delete actions. Expired date/time reminders are swept to `expired` after a three-minute grace period.

[↑ Index](#index)

## 2.13 Notification inbox

**Route** `/notifications` · **File** `features/notifications/notifications.component.ts` · **Android only in practice**

A safety net for Android's bank-notification capture. When Spenza detects a spend in a bank or UPI notification it posts a review prompt — but prompts get swiped away. Everything detected is written to a **device-local** inbox first, so nothing is lost.

The screen shows setup state (listener permission, prompt toggle), a recovery banner totalling unlogged detections, filter chips, pending items grouped by day, and a collapsible history.

Tapping an item opens a log dialog whose fields depend on what was detected:
- **Expense / card spend** → category + payment source (account or card), prefilled with the matched card by last-4 or the sole active card.
- **Income / salary** → target account. Salary credits are tagged so the missing-salary reminder knows the month is covered.
- **Card payment** → source account + target card, with the **amount capped at the card's tracked outstanding**, because an SMS total can exceed what Spenza knows about.

Anything you log manually that matches a pending detection (same day, amount within ±1) is auto-marked handled, so you are never nagged about an expense you already entered.

**Privacy:** inbox contents never leave the device — not to Drive, not to family sync, not to any AI call. Only a local dedupe fingerprint is kept.

[↑ Index](#index)

## 2.14 Settings

**Route** `/settings` · **File** `features/settings/settings.component.ts` (2 958 lines)

The control panel, in ten cards.

| Card | What it does |
|---|---|
| **Spenza Pro** | Active: renewal/cancellation date and Cancel. Inactive: the upgrade card (native opens the web checkout in the system browser via a signed handoff) |
| **Appearance** | Theme (light/dark/system), **5 palettes** (violet, rose, azure, emerald, amber), **4 design styles** (glass, neumorphism, claymorphism, neobrutalism) with a live preview |
| **Language** | English, Tamil, Hindi — also sets the voice-recognition language |
| **Currency** | INR, USD, AED with a formatted sample |
| **AI Insights** | Hosted (default, no key needed), bring-your-own-key (Gemini and/or Groq, masked, stored locally and mirrored into the Drive config), or disabled |
| **Google Drive Backup** | Current mode, family owner/partner state, generate an invite, leave the family, switch modes, legacy-family migration prompt, sign in/out |
| **Sync & sign-in log** | The last 50 Drive/auth failures, copyable — the first thing to check when sync misbehaves |
| **Notifications** | Push toggle; local notifications: permission, daily reminder + time, budget warnings (Pro), salary reminder on a day 1–28 (native), Android spend prompts (Pro), test notification |
| **Data Management** | Export the backup JSON, restore a backup JSON, clear local cache, **delete all Spenza data** |
| **Legal** | Privacy policy and terms |

Two flows deserve care:

**Switching family → single** merges the shared backup into your private one before disconnecting: expenses deduped by id with the shared copy winning, shared limits/accounts/debts winning when non-empty, audit logs concatenated. Owners with an active shared file get a second confirmation. A failed merge is non-fatal — you keep your data.

**Deleting the account** runs a 10-second countdown, then leaves or dissolves the family, deletes the Drive backup file, the receipt folder, the shared file and the family folder, and wipes local state. Failures are surfaced rather than silently swallowed.

[↑ Index](#index)

## 2.15 Subscribe

**Route** `/subscribe` (web only — native redirects to Settings) · **File** `features/subscribe/subscribe.component.ts`

Plan cards with a savings badge, a Pro feature list, and a pay button that opens Razorpay checkout with your Firebase ID token. Two subtleties:

- **Cross-device handoff.** On Android the checkout cannot run inside the WebView, so the app requests a five-minute one-time code, opens `spenza.site/#/subscribe?handoff=…` in the system browser, and that page silently exchanges the code for a Firebase custom token — so you are already signed in and do not have to log in again. The code is scrubbed from browser history immediately, and the backend allows the same code to be re-redeemed for 60 seconds so a mobile browser re-entering the route does not strand checkout.
- **Restore subscription.** A manual escape hatch: paste a Razorpay subscription id and the server re-verifies it against your uid. This covers the "payment succeeded but verification failed" case.

If you are already Pro, the page switches to upgrade mode and only shows the plan you are *not* on. Plan IDs and prices are resolved **server-side** — the client cannot choose what it pays.

[↑ Index](#index)

## 2.16 Privacy and Terms

**Routes** `/privacy`, `/terms` · public, unauthenticated, no shell. They exist as real app routes (with hosting rewrites) because Google OAuth verification requires reachable, crawlable policy URLs. Settings also links to the hosted copies.

[↑ Index](#index)

## 2.17 The shell — navigation and theming

**File** `shared/components/app-shell/app-shell.component.ts`

Everything authenticated renders inside the shell, which adapts to three form factors:
- **Desktop (≥ 887 px)** — a sticky top nav with all nine destinations.
- **Mobile portrait** — a floating glass pill with the five primary tabs (Daily, Monthly, Limits, Finances, Dashboard) and a sliding gradient highlight; Splits, Inbox, Alerts and Settings sit in the top bar, where the Inbox shows a live pending-count badge.
- **Mobile landscape** — a gradient left rail with the same five.

The shell also hosts the global credit-card picker that appears whenever a widget-captured card expense needs you to say which card it was, resumes a parked Circle-Link join after sign-in, and starts the circle listener app-wide.

**Navigation is hidden entirely** unless you are authenticated *and* your backup mode is fully configured — that is the single reason the nav disappears.

**Theming** is two orthogonal axes on the root element — `data-palette` (five palettes) and `data-style` (four visual styles) — layered on top of the independent light/dark class. Every palette and style ships both a light and a dark variant, so there are 40 valid combinations, and components stay agnostic by consuming only semantic CSS variables (`--primary`, `--card`, `--cat-food`, …). The Android widgets read the same `pf-palette` / `pf-style` values and redraw themselves to match.

[↑ Index](#index)

---

# Part 3 — The business flows

## 3.1 Cold start and bootstrap

**File** `src/app/app.ts`

```
ngOnInit
  └─ 30 s watchdog · diagnostics · driveError$ subscription · visibility/focus/online/resume listeners
     └─ bootstrapData()
          1. await session restore + backup-mode cache
          2. start the subscription listener (must precede any guard)
          3. native: START (do not await) a silent Google token refresh
          4. FAST PATH — hydrate from the local snapshot, paint, then finish Drive work in the background
          5. no cache → await the token; still need consent → /auth/callback
          6. load the Drive config (3 attempts, 750/2000 ms; a 403 means re-auth, not a new user)
          7. route on mode: null → /mode-select · family without ids → /family-setup
          8. family OWNERS must be Pro (partners are free) → else /subscribe
          9. load the Drive backup → start family sync → start 30 s polling → apply the income gate
```

Two design notes. The **fast path** is why a returning user sees data almost instantly: the app renders from `spenza_drive_backup_snapshot_v1` and reconciles with Drive afterwards. And the **non-awaited token refresh** was the single biggest startup win — an expired token otherwise chains a Firebase chunk load, an ID-token refresh, a Cloud Function round trip and possibly a credential-manager fallback before anything paints.

Resume, focus and visibility events are coalesced into one 200 ms debounce, because three concurrent `ensureToken()` calls would each spawn a Google account picker.

[↑ Index](#index)

## 3.2 Onboarding a brand-new user

```
/ (Welcome) → Get Started → /auth/callback → Google sign in (Drive appdata scope)
   → Drive config missing → create it → mode is null → /mode-select
       ├─ Single → mode='single' → create spenza-backup.json in appDataFolder
       └─ Family (Pro) → /family-setup → create family + invite → share code
   → back to bootstrap → backup loaded → monthlyIncome = 0
   → income gate → /limits?onboarding=income
   → set income + allocate to 100 % → Save
   → /daily — ready to log
```

A partner's path is shorter: sign in → mode-select → Family → enter the owner's code → straight to `/daily` on the shared ledger.

[↑ Index](#index)

## 3.3 Logging an expense — the full path

```
Daily form  →  onSubmit()
  ├─ validate (amount ≥ 0.01, date ≤ today, category chosen)
  ├─ snapshot the category's monthly limit onto the entry (limit, savings = limit − amount)
  ├─ attach the actor (email + role) for family attribution
  ├─ upload the receipt if present  ── failure NEVER blocks the save
  └─ ExpenseStore.addEntry()
       ├─ validate ALL balance deltas FIRST (throws before any mutation)
       │     · card charge?  → the card must be active
       │     · account link? → overdraft rules apply
       ├─ patchState (entry + account balance + card outstanding)
       ├─ emit budgetThresholdExceeded$ if the category crosses 80 %
       └─ markLocalChangeAndPersist()
            ├─ write the local snapshot (durable) → THEN write Drive
            └─ push the record to the family Firestore ledger
```

The ordering is the point: validation happens before any state changes, the local snapshot is durable before the network is touched, and a Drive failure never propagates to the UI because the data is already safe.

[↑ Index](#index)

## 3.4 Receipt capture — OCR and AI extraction

```
pick or shoot a bill
   ├─ PDF  → straight to extraction
   └─ image → the editor opens: rotate 90°, crop with 8 handles, optional contrast enhance
        └─ extraction session (root-scoped, survives leaving the screen)
             ├─ AI first (Pro): Gemini via the extractReceipt function, files ≤ 5 MB
             └─ fallback: local Tesseract OCR (English + Tamil + Hindi), ≤ 3 PDF pages
                  → amount scoring, line items, date parsing, multilingual category keywords, merchant
        └─ apply to the form
             · amount auto-fills only at ≥ 0.70 confidence
             · only fields the scan filled before are overwritten
             · an unmatched category falls back to Miscellaneous
             · line items can be exploded into a split bill in one tap
   └─ at save: compress for upload (long edge 1000 px, target 200 KB, hard cap 700 KB),
      upload to the private Drive appDataFolder as `date_entryId_name.jpg`
```

Two hard rules: **receipts are stored as images only** — a PDF that cannot be converted fails rather than uploading the raw file — and **extraction runs on the original**, so OCR quality is never degraded by upload compression.

[↑ Index](#index)

## 3.5 Split bill

For a single receipt covering several categories. Enter the total, hit Split, and you get rows — seeded either as a half/remainder pair or, after a scan, one row per detected line item plus a rounding-adjustment row if anything is left over.

Rules: at least two rows, every row needs a known category and a positive amount, and the rows must sum to the total within one paisa. Saving creates several `ExpenseEntry` records in a single store call, so the linked account is debited once for the aggregate rather than row by row.

[↑ Index](#index)

## 3.6 Budget allocation and the 50/30/20 rule

Every category belongs to one of five groups. The shipped defaults total exactly 100 %:

| Category | Group | Default % |
|---|---|---|
| Housing | Needs | 30 |
| Food & Groceries | Needs | 10 |
| Transportation | Needs | 5 |
| Utilities | Needs | 3 |
| Healthcare | Needs | 2 |
| Entertainment | Wants | 6 |
| Dining Out | Wants | 7 |
| Shopping/Clothing | Wants | 7 |
| Personal Care | Wants | 5 |
| Subscriptions | Wants | 5 |
| Savings/Emergency Fund | Savings | 12 |
| Investments | Growth | 6 |
| Education | Growth | 2 |
| Miscellaneous | Buffer | 0 |
| Debt Payment | Buffer | 0 |

**Needs 50 · Wants 30 · Savings + Growth 20 · Buffer 0.**

Derived values used everywhere: a category's monthly limit is `userPercentage × monthlyIncome ÷ 100`; its daily limit is that divided by the days in the month, rounded up; the Daily hero uses the simpler `monthlyIncome ÷ 30`; and each entry stores `savings = limit − amount` at the moment it was created, so history is not rewritten when you later change your budget.

`core/models/category-definitions.ts` is the single source of truth for names, icons, colours, groups and percentages — everything else derives from it.

[↑ Index](#index)

## 3.7 Account balances — why they are derived

This is the most important correctness decision in the app, and it came from a real bug.

Originally each account carried a mutable `balance` that synced as part of the record. Under last-writer-wins merging, two devices editing around the same time would each drop the other's delta — audited drift reached **+37 909** on one account and **+86 056.86** on another. The underlying *records* (adjustments, expenses, withdrawals) were add-only with tombstones and had converged perfectly; only the summary number had not.

So the balance became a **cache**:

```
balance = initialBalance
        + increase adjustments − decrease adjustments
        − every linked ExpenseEntry.amount (debt payments included)
        + cash-withdrawal adjustments credited into this account
```

It is recomputed at every boundary — loading the local cache, applying a Drive document, applying a ledger change, and building any document that gets persisted. Because it derives from records that converge, drift is structurally impossible.

When a stored balance disagrees with the derived one by 0.01 or more, Finances raises a **reconcile banner**: accept the derived figure, or keep the stored one and have Spenza post an audited correcting adjustment so the records explain the difference. Credit cards use the same mechanism against an `openingOutstanding` anchor.

[↑ Index](#index)

## 3.8 Credit card lifecycle

```
add the card (limit, outstanding, bill day, due day, min payment)
   │
   ├─ spend → an expense with debtId → outstanding rises
   │            utilisation crossing 30 % or 80 % UPWARD fires one alert
   │
   ├─ bill day passes → Spenza DERIVES the statement amount by reconstructing
   │                     the outstanding as of that date from current records
   │                  → shown in amber as an estimate, with "confirm" prompts
   │            you confirm or edit → it becomes a user-confirmed figure
   │                                  and every later reminder quotes it exactly
   │
   ├─ reminder ladder (all one-shots, recomputed after every change):
   │     bill ready · due − 3 days · due day · due + 1 day (once) · next cycle − 3 days
   │
   ├─ adjustments: refund ↓ · cashback ↓ · charge ↑
   │               cash-withdrawal ↑ outstanding AND ↑ the receiving account, atomically
   │               a refund can be matched to its purchase (90 days, exact amount, max 3 candidates)
   │
   └─ pay the bill → an expense of type "Debt Payment" from an asset account
                     → account debited, outstanding reduced, audit record written, all in one step
```

Reminders are recomputed rather than repeated because a repeating notification cannot update its body — it would drift on short months and quote a stale amount.

[↑ Index](#index)

## 3.9 Debt and EMI

Loans (personal, vehicle, home, other) carry principal, remaining balance, optional interest rate and EMI, start date and next due date.

`recordDebtPayment()` is a single transaction boundary. It validates that the debt is active, the account exists and is not archived, the amount is positive and **does not exceed the remaining balance**, and that overdraft rules allow the deduction. Then, atomically, it: deducts the account, reduces the debt, creates an `ExpenseEntry` of type `Debt Payment` linked to both the account and the debt, writes a `DebtPayment` audit record, marks the debt `paid` if it reaches zero, and persists once.

Editing or deleting a payment reverses all of that in the same disciplined way (a loan's restored balance is capped at its principal; a card's is not). Deleting a debt is blocked while any payment or linked expense still references it.

`Debt Payment` is a real, visible category with a 0 % recommendation so it never distorts the budget allocation.

[↑ Index](#index)

## 3.10 Family sync — the ledger

Owner and partner share one Drive backup, but they do not fight over the file. Real-time convergence runs through a **Firestore record ledger** at `families/{familyId}/ledger`:

```
local change → diffLedgerState(current state, last server-acked copy)
             → the minimal set of record operations
             → committed in batches of ≤ 400, resolved only on SERVER ACK
partner's device ← onSnapshot → applyLedgerChanges → merged into the store → persisted to Drive
```

Each record carries a content **signature**, so a device can tell "unchanged", "changed remotely" and "changed locally" apart. Four guards make this safe:

- **Tombstones only.** Ledger documents are never deleted — deletion sets `deleted: true`. Rules enforce this. Record ids are UUIDs and never reused, so a tombstone wins forever.
- **Pending-delete flags** are persisted to device storage *before* the local deletion and enforced in both directions until the server acknowledges the tombstone. This is what fixed deletions resurrecting themselves.
- **Pending-verify flags** cover widget-captured records that a Cloud Function already pushed: re-pushing the capture-time snapshot would revert the partner's later edit.
- **The divergence guard.** If a device's local signature differs from what the server last acknowledged, an incoming change is skipped — there is an unpushed local edit, and the next push resolves it as last-writer-wins.

Family mode also merges rather than replaces when reading Drive: expenses merge by timestamp, accounts and debts by `updatedAt`, and audit logs are union-only. A partner's write can never wipe the other side's entries.

Android has a second path: the home-screen widget calls `commitFamilyLedger` directly with the app closed, and a Firestore trigger pushes a data message to the partner's device so their local overlay updates.

[↑ Index](#index)

## 3.11 Circle splits — the settlement algorithm

All arithmetic is in **integer paise**, so every member's device computes byte-identical results.

**Splitting one bill.** Participants are deduplicated, filtered to current members, and **sorted by member id**. Each gets `floor(total ÷ n)`, and the first `remainder` participants in that sorted order each get one extra paisa. Sorting is what makes the leftover paisa deterministic rather than device-dependent.

**Balances.** For every live bill, the payer is credited the full amount and each participant is charged their share. `net = paid − share`; positive means they should receive.

**Families inside a circle.** Members can be assigned to a head. Families **never change anyone's per-person share** — they only aggregate the resulting balances so a head can settle for their household. The head carries the whole family's share; dependants carry zero.

**Who pays whom.** A greedy matcher splits members into creditors and debtors, sorts each by amount descending with member id as a deterministic tie-break, and repeatedly transfers `min(largest creditor, largest debtor)`. That yields at most *n − 1* transfers.

**Settle up** is owner-only. It marks the circle `settled` (locking writes), and each member's own share is auto-logged once into their personal Daily ledger tagged `circle-settle`. The "already logged" mark is persistent, so deleting the auto-logged entry does not cause it to come back.

[↑ Index](#index)

## 3.12 Notifications — every trigger

| Notification | Source | When |
|---|---|---|
| Daily logging reminder | local + push | your chosen time (default 21:00) |
| Monthly nudge | local | the 28th at 09:00 |
| Budget warning (**Pro**) | local | a category crosses 80 % of its limit, deduped 1 h |
| Card utilisation | local | crossing 30 % or 80 % **upward**, deduped 6 h |
| Credit-card ladder | local | bill ready · due − 3 d · due day · due + 1 d · next cycle − 3 d, all at 09:00 |
| Salary reminder | local (native) | your salary day at 20:00, skipped if a salary credit landed within 5 days |
| Date/time reminder | local (native) / push (web) | at the time you set |
| Location reminder (**Pro**) | local | when you enter the radius |
| Streak reminder | native | 20:00 if today has no expense and the streak widget is installed |
| Spend prompt (**Pro**) | native | a bank/UPI notification classified as a high-confidence spend or credit |
| Partner ledger push | data message | a family member writes a fresh record |

Server-side scheduling runs every minute and claims each delivery slot in a Firestore transaction, so overlapping runs can never double-send. Push tokens that come back invalid are pruned automatically. Native devices are deliberately excluded from server-pushed reminders — they schedule locally, and pushing too would double-notify.

[↑ Index](#index)

## 3.13 Subscription and payments

```
/subscribe → pay → createRazorpaySubscription   (plan id resolved SERVER-side)
                 → Razorpay checkout
                 → verifyRazorpayPayment
                      HMAC-SHA256 with timing-safe comparison
                      re-fetch the subscription for the authoritative plan and period
                      write users/{uid}/subscription/status
           ↘ razorpayWebhook — the async source of truth for renewals and cancellations
```

The client is never trusted with a plan id, a price, or a tier. Cancellation is cycle-end (`cancelPending: true`) rather than immediate. Upgrading monthly → yearly cancels the old subscription at cycle end; the webhook knows to skip a downgrade whose subscription id has been superseded. A "paid but unverified" user can self-recover through the restore path, which checks that the subscription's stored `notes.uid` matches the caller.

Native Android uses the [signed handoff](#215-subscribe) because checkout cannot run in the WebView.

[↑ Index](#index)

## 3.14 Backup, restore and account deletion

- **Export** — Settings writes `spenza-backup-YYYY-MM-DD.json` containing everything, including debt adjustments (omitting them once corrupted card outstandings on restore).
- **Restore** — validates that the file is JSON and has `expenses` and `limits` arrays, defaults optional arrays, then writes into the active Drive backup through the store.
- **Clear local data** — wipes the device cache only. Drive is untouched, and the next load re-hydrates.
- **Delete account** — a 10-second countdown, then: leave or dissolve the family, delete `spenza-backup.json`, `spenza-config.json`, `Spenza Receipts` and `Spenza Family` from Drive, and clear all local state.

Drive holds two files: `spenza-backup.json` (the data) and `spenza-config.json` (mode, shared file/folder ids, role, AI settings). In single mode both live in the private `appDataFolder`, invisible in the Drive UI. Legacy family mode used a visible `Spenza Family` folder; current family mode uses Firestore.

[↑ Index](#index)

## 3.15 Offline behaviour

- **Reads** — the app starts from a local snapshot and renders before any network call.
- **Writes** — every mutation is written to that snapshot *before* the network is attempted, and marked dirty. On the next launch or reconnect, dirty local data wins and is uploaded before anything is read down.
- **Retry** — transient Drive failures (network, 429, 5xx) schedule a background flush with exponential backoff from 5 s to 5 min. The sync chip shows "syncing" rather than "error".
- **Family** — Firestore's persistent IndexedDB cache accepts ledger writes offline and replays them on reconnect. This is exactly why `getSharedFirestore()` must be the only Firestore factory: a stray `getFirestore()` silently downgrades the app to a memory-only cache and offline writes are lost on restart.
- **Widget** — expenses captured on the home screen queue locally and are drained by WorkManager, or immediately when the app next opens.
- **Service worker** — the Angular service worker caches the shell in production, so the app opens with no network at all.

[↑ Index](#index)

---

# Part 4 — Under the hood

## 4.1 Architecture at a glance

```
┌───────────────────────────────────────────────────────────────────────┐
│  CLIENT — Angular 21, standalone, zoneless, signals, hash routing     │
│                                                                       │
│   Features (16 lazy screens)                                          │
│        │                                                              │
│   ExpenseStore  ── the single source of truth for money               │
│        │                                                              │
│   Core services: Auth · Drive · BackupMode · FamilySync · CircleSync  │
│                  Subscription · Payment · Notification · FCM · AI     │
│                  Theme · i18n · Currency · Storage                    │
└──────┬──────────────────────┬──────────────────────┬──────────────────┘
       │                      │                      │
   Google Drive           Firestore            Firebase Functions
   ───────────            ─────────            ─────────────────
   spenza-backup.json     families/*/ledger    Razorpay ×5
   spenza-config.json     circles/*            family ×5 + ledger commit
   receipts (appdata)     users/*/subscription circles ×7
                          users/*/reminders    FCM register ×2
                          users (fcm tokens)   schedulers ×2 + trigger ×1
                          googleTokens         AI ×4 · Google token broker ×2
                                                                │
                          ┌─────────────────────────────────────┘
                          ▼
             Groq (Llama 3.3 70B) · Gemini (multimodal)

┌───────────────────────────────────────────────────────────────────────┐
│  ANDROID — Capacitor shell + 25 native classes                        │
│  2 home-screen widgets · notification listener · WorkManager sync     │
└───────────────────────────────────────────────────────────────────────┘
```

**Stack:** Angular 21 · TypeScript 5.9 strict · `@ngrx/signals` · Tailwind 3.4 · Chart.js 4.5 · Firebase 12 · Capacitor 8 · Tesseract.js 7 · pdf.js 5 · Playwright · Vitest.

[↑ Index](#index)

## 4.2 The state store

`core/services/expense-store.service.ts` is a single `signalStore` holding entries, limits, accounts, account adjustments, debts, debt payments, debt adjustments, monthly income, the selected month, sync status, offline state, Drive file ids, pending sync ids, pending credit-card expenses, and both kinds of reconciliation discrepancy.

On top of that sit derived signals — today's entries, the selected month, the limit map, the budget-rule summary, active accounts, the default account, total assets, active debts, total liabilities, net worth, and the next debt due.

Every mutation follows the same discipline: **validate all balance deltas before touching state**, apply them, then hand off to the persistence pipeline. Because validation is complete before mutation, a rejected overdraft cannot leave the store half-updated.

[↑ Index](#index)

## 4.3 Persistence and conflict resolution

```
mutation
  → localRevision += 1
  → persistToDrive() joins a single serialised promise queue
       · if a later write already covered this revision, skip (coalescing)
       · build the document (self-healing balances and outstandings as it goes)
       · snapshot which ids are being persisted
       · write the LOCAL snapshot (dirty) ── before the network
       · write Drive
       · advance persistedRevision, clear only the snapshotted ids
       · rewrite the snapshot (clean)
  → pushFamilyLedger()  (fire and forget; resolves only on server ack)
```

The defences, all in one list:

| Risk | Defence |
|---|---|
| Two overlapping writes racing on Drive | one serialised promise queue |
| Redundant writes | revision coalescing |
| A concurrent entry losing its "syncing" chip | the ids being persisted are snapshotted |
| A crash between mutation and upload | the local snapshot is written first and marked dirty |
| Polling clobbering unsynced local work | refresh is skipped while `localRevision ≠ persistedRevision` |
| Echoing a partner's change back at them | an `applyingRemote` flag |
| A deletion resurrecting | pending-delete flags persisted before the mutation |
| A widget record reverting a partner's edit | pending-verify flags |
| Duplicate expense ids | dedupe on every document apply |
| A family read replacing instead of merging | family reads always merge |

[↑ Index](#index)

## 4.4 The data model

**`ExpenseEntry`** — `id` (UUID), `date` (local `YYYY-MM-DD`), `amount`, `type`, `limit` (snapshot), `savings` (`limit − amount`), `timestamp`, optional `comment`, `receipt`, `accountId`, `debtId`, `source` (`manual | widget | notification-prompt | debt-payment | circle-settle`), and actor fields (`createdByEmail/Role`, `updatedByEmail/Role`).

**`ExpenseLimit`** — `type`, `recommendedPercentage`, `userPercentage`, `category` (Needs/Wants/Savings/Growth/Buffer).

**`AssetAccount`** — `id`, `name`, `type` (bank/wallet/cash/other), `balance` (**derived cache**), `initialBalance`, `allowOverdraft`, `isDefault`, `archived`, timestamps, actor fields. **`AccountBalanceAdjustment`** — `increase` or `decrease` with an optional reason.

**`DebtAccount`** — `id`, `name`, `type` (credit-card / personal / vehicle / home / other), `principalAmount`, `remainingBalance`, optional `interestRate`, `monthlyEmi`, `startDate`, `nextDueDate`, `status`; credit-card extras: `billGenerationDay`, `paymentDueDay`, `minimumPaymentAmount`, `creditLimit`, `cardNetworkOrBank`, `cardLast4`, `statement`, `openingOutstanding`. **`DebtPayment`** links a payment to its expense and source account. **`DebtAdjustment`** is one of `refund | cash-withdrawal | charge | cashback`.

**`CircleDocument`** — members keyed by member id (each with an optional `familyHeadMemberId`), `memberUids`, `currency`, `status`. **`CircleExpense`** — description, amount, date, `paidByMemberId`, `participantMemberIds`, `authorUid`, `deleted` tombstone, `hasBill`.

**`LedgerRecord`** — `type` (expense / adjustment / debt-payment / debt-adjustment / account / debt / limits / meta), `id`, `payload`, `deleted`, `updatedAt`, `updatedBy`.

Full field-by-field reference: [`ai/CODE_MAP.md` §6](./ai/CODE_MAP.md).

[↑ Index](#index)

## 4.5 Backend — Firebase Functions

Node 22, in `personal-finance-pwa/functions/`. Thirty-two exports. Every HTTPS endpoint is a raw `onRequest` with a manual `Authorization: Bearer <Firebase ID token>` check — never a callable — and Pro-gated endpoints re-check the subscription document server-side.

| Group | Endpoints |
|---|---|
| **Payments** | `createRazorpaySubscription`, `verifyRazorpayPayment`, `cancelRazorpaySubscription`, `restoreRazorpaySubscription`, `razorpayWebhook`, `webhookHealthCheck` |
| **Handoff** | `createSubscriptionHandoff`, `redeemSubscriptionHandoff` |
| **Family** | `createFamily` (Pro), `createFamilyInvite`, `redeemFamilyInvite`, `leaveFamily`, `dissolveFamily`, `commitFamilyLedger` |
| **Circles** | `createCircle`, `createCircleInvite`, `previewCircleInvite`, `redeemCircleInvite`, `updateCircle`, `settleCircle`, `deleteCircle` |
| **Push** | `registerToken`, `unregisterToken`, `sendReminders` (every minute), `sendDueReminders` (every minute), `notifyPartnerLedgerWrite` (Firestore trigger) |
| **Google tokens** | `exchangeGoogleAuthCode`, `getGoogleAccessToken` |
| **AI** | `extractReceipt`, `generateInsights`, `parseVoiceExpense`, `parseVoiceReminder` |

Deliberately **not** deployed: `stripe.ts` (incomplete) and `testNotification` (it allowed unauthenticated push to every user).

[↑ Index](#index)

## 4.6 Security model

**Firestore rules default to deny.** Everything reachable is explicitly listed:

| Path | Read | Write |
|---|---|---|
| `users/{uid}/subscription/**` | own only | **denied** — Functions only |
| `users/{uid}/reminders/*` | own only | own, and location reminders require Pro |
| `families/{id}` | owner or partner | denied — Functions only |
| `families/{id}/ledger/*` | members | create/update; **delete denied** (tombstones only) |
| `families/{id}/state/*` | members | write-locked legacy |
| `circles/{id}` | members only | denied — Functions only |
| `circles/{id}/expenses/*` | members | active members; author immutable; author or owner may edit; **delete denied** |
| `.../bill/*` | members | uploader or owner may replace **and delete** |
| `familyInvites` / `circleInvites` | owner or unredeemed/unrevoked | denied |
| `googleTokens/*` | **denied** | **denied** — holds long-lived refresh tokens |

Other properties worth stating:
- **Google scopes are minimal.** Only `drive.appdata` plus `openid email profile`. Full Drive and Spreadsheets scopes were removed in v8 and v9. A scope-version bump forces re-consent.
- **Data residency.** Financial records live in the user's own Drive. Spenza's Firestore holds sync metadata, group splits, subscription status and push tokens.
- **Receipts** go to the private appDataFolder — not visible in the user's Drive UI, not shared with family.
- **SMS-derived text never leaves the device.** Only a local dedupe fingerprint is stored, and nothing is sent to any AI endpoint.
- **Hosting** sets `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a full CSP.

[↑ Index](#index)

## 4.7 Native Android

Package `com.spenza.app`, Capacitor 8, 25 Java classes, three custom plugins.

**Quick Expense widget** — resizable, with three height tiers. Category buttons plus dedicated "More" and "Credit" actions, a native bottom-sheet form with voice capture, an on-device category predictor (recency decay, time-of-day proximity, weekday bonus — no network, no AI), and a daily insight showing today's spend against the calculated budget with a yesterday comparison.

**Daily Streak widget** — Duolingo-style. A day counts when at least one expense is logged; the streak survives until midnight, and a 20:00 reminder fires only if today is still empty.

Both widgets read the app's palette and style from shared preferences and render their body to a Bitmap on a software canvas, because RemoteViews XML cannot express blur or per-palette gradients.

**Spend notification capture** — a notification listener reads bank and UPI notifications on-device, runs a deterministic nine-way classifier, and prompts only on high-confidence spends or credits. It ignores its own notifications, OTP and security messages, balance statements, and failed or pending transactions. Everything detected is written to the local inbox first, so a swiped prompt is recoverable.

**Background sync** — a WorkManager job drains the widget queue with the app closed: it applies effects locally, then either calls `commitFamilyLedger` (Firestore families) or performs a full Drive round trip using a stored refresh token.

All widget-facing storage key names live in one file, `WidgetExpenseConstants.java` — rename a key on the web side without mirroring it there and the widget silently stops working.

[↑ Index](#index)

## 4.8 AI stack

Three provider modes:

- **Hosted** (default, everyone) — text tasks go to **Groq** (Llama 3.3 70B), receipt extraction to **Gemini** (it needs multimodal). Keys are server-side; the user supplies nothing.
- **Bring your own key** — a personal Gemini and/or Groq key stored locally and mirrored into the Drive config, with a preference for which to try first. Sent as request headers, and it overrides hosted.
- **Disabled** — no AI calls at all; receipt scanning falls back to local OCR.

Four endpoints: `extractReceipt` (base64 ≤ 7 MB), `generateInsights` (Groq first, hosted Gemini fallback, five labelled sections), `parseVoiceExpense` (transcript ≤ 1 000 characters), `parseVoiceReminder` (the only one that needs sign-in but **not** Pro).

Gemini model fallback chain: `gemini-2.5-flash-lite` → `2.0-flash-lite` → `2.5-flash` → `2.0-flash`.

Guardrails: hard daily call limits, aggressive caching with change detection, a 7-day stale fallback, size caps that return 413 rather than burning quota, and a local OCR path that keeps receipt scanning working when AI is off or unavailable.

[↑ Index](#index)

## 4.9 Storage keys

Roughly thirty-five Capacitor Preferences keys, grouped as: auth (`gapi_*`, `firebase_*`), backup mode (`spenza_backup_mode`, `spenza_shared_file_id`, `spenza_family_folder_id`, `spenza_owner_role`, `spenza_config_file_id`, `spenza_firestore_family_id`), family sync (ledger copy, pending deletes, pending verify), circles (active cache, settle-logged, pending join), queues and the Drive snapshot, reconciliation state, notification state, and user preferences (theme, palette, style, language, currency, Pro tier, AI settings, diagnostics).

Fifteen of them are read by native Java and **must not be renamed** without mirroring the change in `WidgetExpenseConstants.java`. Two contract tests exist to catch exactly that. The full inventory is in [`ai/CODE_MAP.md` §7](./ai/CODE_MAP.md).

[↑ Index](#index)

---

# Part 5 — Working on it

## 5.1 Repository layout

```
expense-tracker/
├── APPLICATION_GUIDE.md          ← this document
├── VISUAL_ATLAS.html             ← the interactive visual explanation
├── CLAUDE.md / AGENTS.md         ← AI assistant operating rules
├── README.md · TEST_CASES.md
├── ai/                           ← curated project memory
│   ├── CODE_MAP.md               ← navigation index (where to change what)
│   ├── PROJECT_CONTEXT.md · CURRENT_STATE.md · TASK_HISTORY.md · AI_RULES.md
├── docs/                         ← feature specs and launch checklists
├── tech-stack-docs/              ← per-technology deep dives (00–10)
├── graphify-out/                 ← generated code-knowledge graph
├── .github/workflows/            ← deploy-firebase.yml · e2e.yml
└── personal-finance-pwa/
    ├── src/app/
    │   ├── app.ts · app.routes.ts · app.config.ts
    │   ├── core/{services,models,utils,guards,interceptors,config}
    │   ├── features/             ← 16 route-level screens
    │   └── shared/{components,pipes,directives}
    ├── src/assets/i18n/          ← en · ta · hi
    ├── functions/                ← Firebase Functions
    ├── android/                  ← Capacitor Android
    ├── e2e/                      ← Playwright suites
    ├── firestore.rules · firestore.indexes.json · firebase.json
    └── angular.json · tailwind.config.js · capacitor.config.ts
```

[↑ Index](#index)

## 5.2 Running, building, deploying

```bash
cd personal-finance-pwa
npm ci
npm start                 # dev server
npm run build             # production build → dist/personal-finance-pwa/browser
npm run emulators:start   # Firebase auth + firestore emulators

# Android
npx cap sync android && ./rebuild-android.sh
```

Deployment is automatic: pushing to `main` runs `.github/workflows/deploy-firebase.yml`, which generates the production environment file from repository secrets, builds, deploys Hosting plus the Functions, and refuses to ship unless the Razorpay live-key placeholder was actually replaced.

Budgets are enforced by the build: 500 kB warning / 1 MB error on the initial bundle, 4 kB / 8 kB on component styles.

[↑ Index](#index)

## 5.3 Testing

| Layer | Command | Covers |
|---|---|---|
| Unit (Vitest) | `npm test` | services, utils, models — the money maths in particular |
| Firestore rules | `npm run test:rules` | every rule against the emulator |
| End-to-end (Playwright) | `npm run e2e` | 16 suites, ~100 cases, gating merges in CI |

The E2E suites map one-to-one onto the screens: auth, onboarding, daily expense, monthly, limits, finance accounts, finance debt, dashboard, AI features, settings, subscription, offline/PWA, route guards, reminders, theming and landing.

Property-based testing (`fast-check`) backs the settlement and merge algorithms. Contract specs lock the storage keys and the backup document shape.

[↑ Index](#index)

## 5.4 Conventions and invariants

1. **One store.** All money state lives in `ExpenseStore`; nothing mutates it from outside.
2. **`getSharedFirestore()` only.** Never `getFirestore()` — it breaks offline durability app-wide.
3. **Dates through `core/utils/local-date.ts`.** Never `toISOString().slice(0,10)` — it is UTC and silently shifts days.
4. **Categories from `category-definitions.ts`.** Never hard-code a category name or colour.
5. **Semantic CSS variables only.** A component that reaches for a palette value breaks under the other four palettes and four styles.
6. **Validate before mutating.** Balance deltas are checked in full before any state changes.
7. **Local durability before the network.** Always.
8. **Pro gates on both sides.** Client for UX, server for security.
9. **Money maths lives in `core/utils/`** and has a spec. Change one, update the other.
10. **After a change:** run `graphify update .`, update `ai/CURRENT_STATE.md`, append to `ai/TASK_HISTORY.md`.

Before editing anything shared, walk the change-safety checklist in [`ai/CODE_MAP.md` §14](./ai/CODE_MAP.md).

[↑ Index](#index)

## 5.5 Known risks and debt

- **Three oversized files** — `daily-expense.component.ts` (3 416), `expense-store.service.ts` (3 388) and `settings.component.ts` (2 958) each mix UI, orchestration and business logic. Expect a wide blast radius; prefer extracting into `core/utils/` with a spec over adding another method.
- **Legacy Google Sheets code and the IndexedDB queue** still exist after Drive became the source of truth. Do not reactivate Sheets as primary persistence.
- **`stripe.ts` and `testNotification`** are intentionally unexported. Re-exporting `testNotification` would allow unauthenticated push to every user.
- **`families/*/state/**`** is a write-locked legacy path kept only so an old device can migrate into the ledger.
- **`PaymentService.detectProvider()`** is dead legacy; do not reconnect country-based provider selection to checkout.
- **Some strings are hardcoded English** despite the i18n infrastructure — notably several Settings and Limits toasts.
- **Production `console.log` calls** remain in a few paths.
- **`Spenza_Tier_Gating_Audit.md`** at the repo root tracks the Pro-gating audit; check it before changing what is gated.

[↑ Index](#index)

---

<p align="center">
  <sub>Generated 2026-09-02 from a full source sweep · keep in step with <a href="./ai/CODE_MAP.md">ai/CODE_MAP.md</a></sub>
</p>
