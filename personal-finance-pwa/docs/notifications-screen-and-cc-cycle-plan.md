# Notifications Screen + Full Credit-Card Cycle — Plan

Status: PLAN (no code yet) · Date: 2026-07-05
Companion spec: `docs/credit-card-feature-spec.md`

## 1. Problem statement

The Android `SpendNotificationListenerService` detects spend/income/CC-payment SMS and posts a
one-shot "review & log" prompt on the `spend-prompts` channel. **Nothing is persisted except a
dedupe fingerprint.** If the user swipes the prompt away (or taps "Clear all"), the detected
transaction is lost forever — the exact complaint driving this feature.

Goal: a **Notification Inbox** — every classified detection is stored on-device first, the prompt
notification becomes just a pointer to it, and a new `/notifications` screen lets the user recover,
log, or dismiss anything they missed.

## 2. What the notification listener gives us today (inventory)

From `SpendNotificationListenerService` + `SpendNotificationClassifier`:

- Sources: SMS/messaging-app notifications only (title, body, expanded lines, messaging-style
  extras, group summaries). Payment/bank app notifications are deliberately ignored.
- Classifier types: `EXPENSE_TRANSACTION`, `INCOME_OR_REFUND`, `CREDIT_CARD_PAYMENT` (checked
  before income), balance/statement, payment request, failed/pending, OTP/security,
  app-update/system, unknown. Only the first three prompt today.
- Extracted fields: amount (must carry the selected app currency marker — ₹/INR/Rs, $/USD, AED…),
  normalized text → comment, `isCreditCard`, `cardLast4` (prefers digits after the "credit card"
  mention), `isSalary`, source package.
- Dedupe: single last-fingerprint + timestamp window in SharedPreferences.
- Privacy rule (must keep): notification text never leaves the device — not uploaded, not sent to
  Gemini.

## 3. Corrections to do immediately (BA findings)

1. **Detection loss on notification clear** — the core defect. Fix = persist-first inbox (§4).
2. **Statement SMS are thrown away.** "Total due ₹X, min due ₹Y, due by DD-MM" is classified
   balance/statement and ignored — yet it is exactly the data the CC cycle needs. Add a
   `CREDIT_CARD_STATEMENT` classifier type that goes to the inbox (no prompt) and auto-updates the
   card's statement amount/due date after user confirmation.
3. **Privacy boundary:** the inbox must live in device-local Capacitor Preferences
   (email-scoped, like `spenza_widget_expense_queue_v1`). It must NEVER be written into
   `spenza-backup.json` or family Firestore sync — that would upload notification text and break
   the existing privacy promise. Only the resulting `ExpenseEntry`/`DebtPayment` syncs.
4. **Single-fingerprint dedupe is weak.** Two different SMS in quick succession can evict each
   other's fingerprint. Inbox items become the dedupe source of truth (match on
   amount+last4+source+time window).
5. **`cc-payment` queue items are invisible until app open.** They deliberately stay queued for
   app-side resolution; the inbox should show them as "Pending confirmation" so the user knows why.
6. Carry-over: local Gradle build + device tests from 2026-07-03/05 sessions are still pending —
   run before layering this on.

## 4. Notification Inbox — data model

New Preferences key: `spenza_notification_inbox_v1` (email-scoped array, cap ~200 items or 60 days,
oldest evicted; written by the Java listener at classification time, read/mutated by Angular).

```ts
interface NotificationInboxItem {
  id: string;                 // uuid
  detectedAt: string;         // ISO
  kind: 'expense' | 'income' | 'cc-spend' | 'cc-payment' | 'cc-statement' | 'salary';
  amount: number;
  currency: string;
  comment: string;            // normalized SMS text (device-local only)
  sourceApp: string;          // package label
  cardLast4?: string;
  status: 'pending' | 'logged' | 'dismissed' | 'auto-handled';
  linkedEntryId?: string;     // ExpenseEntry / DebtPayment / adjustment id after action
  statusChangedAt?: string;
}
```

Java side: listener appends the item, then posts the prompt notification carrying the item id.
Prompt tap → `ExpenseWidgetActivity` (existing flows) → on save, queue item carries the inbox id →
flush marks the inbox item `logged` + links the entry. Swiped/cleared prompts cost nothing — the
item is already saved.

## 5. Notifications screen — what to show

Route `/notifications` (auth-guarded, lazy). Entry point: bell icon with unread badge in the app
shell header (bottom nav is full). Badge = count of `pending` items.

Layout, top to bottom:

1. **Recovery banner** — "₹4,320 across 3 transactions detected but not logged" with a one-tap
   `Review` scroll-to. This is the money shot for the "cleared my notifications" user.
2. **Pending review list** (grouped by day): amount, source app, parsed merchant/comment, kind
   chip (Expense / Income / Card ····1234 / Bill payment / Statement / Salary), detected time.
   Row actions: **Log** (opens the same prefilled flows: expense form, credit adjustment,
   cc-payment picker, statement confirm) and **Dismiss**. Swipe right = log, left = dismiss.
3. **Credit-card strip** (when cards exist): per card — outstanding, available credit
   (limit − outstanding), utilization bar, next due date + statement amount, `Pay bill` shortcut.
4. **Handled history** (collapsed): logged/dismissed/auto-handled items with links to the created
   entries; lets users audit what auto-tally did.
5. **Filters**: All · Expenses · Income · Credit cards · Dismissed.

Empty/permission states: if OS listener access or the Spenza toggle is off, show a setup card
deep-linking to the existing Settings controls — this screen doubles as the feature's front door.

## 6. Attractive ideas (ranked by value/effort)

1. **End-of-day sweep notification** (21:00, local): "3 detected transactions waiting — ₹4,320.
   Tap to review." One notification that survives even if the individual prompts were cleared.
2. **Duplicate auto-match**: if a manual/widget expense with the same amount ±1 on the same day
   already exists, mark the inbox item `auto-handled` and link it — no nagging about expenses the
   user already logged. Biggest trust-builder.
3. **Merchant memory**: remember category chosen per merchant/sender text; next detection from the
   same merchant pre-suggests it (extend `WidgetCategoryPredictor` pattern, fully local).
4. **Streak protection tie-in**: if today has no logged expense and pending items exist, the sweep
   copy becomes "Log one to keep your N-day streak" — reuses `StreakCalculator` state.
5. **Utilization alerts**: inbox item + notification when a card crosses 30% / 70% / 90% of limit,
   with "pay early" nudge at 90%.
6. **"Not an expense" feedback**: dismissing with a reason (promo/OTP/duplicate) builds a local
   per-sender ignore list — the classifier gets quieter over time without shipping model changes.
7. **Weekly digest card** on Dashboard: "Spenza caught 12 transactions this week; you logged 10."
8. (Later) **Bulk log**: multi-select pending items → one save batch via `addEntries`.

## 7. Credit-card full cycle — gap analysis

Already shipped (2026-07-03, see `credit-card-feature-spec.md` + CURRENT_STATE):

- Card model on `DebtAccount(type 'credit-card')`: credit limit, current outstanding, bill day,
  due day, min payment, `cardLast4`; dedicated Add-credit-card UI; utilization bar.
- CC spend detection: classifier extracts last-4, widget preselects the matched card, entries carry
  `debtId`, `applyDebtCharges` raises the card outstanding (Daily form too).
- Bill-payment detection: `CREDIT_CARD_PAYMENT` type → `cc-payment` widget mode (paid-from account
  + card pickers) → app-side `recordDebtPayment` atomic tally (account ↓, outstanding ↓,
  Debt Payment expense, audit record, reminder suppression, duplicate/over-payment guards).
- Reminder ladder: statement-ready, due−3 (with amount), due-day-if-unpaid, due+1 overdue,
  next-cycle safety net; rescheduled from `ExpenseStore` effects.

To add for the *complete* cycle:

1. **Statement capture (`CREDIT_CARD_STATEMENT`)**: parse total due / min due / due date from
   statement SMS → inbox item → user confirms → store per-card `statementAmount`,
   `statementDate`, `minDue` and feed the reminder ladder real numbers instead of the derived
   "charges since bill day" estimate. Derived estimate stays as fallback.
2. **Cycle ledger** (`ccCycles[]` per card, in the Drive backup — numbers only, no SMS text):
   cycle start/end, statement amount, paid this cycle, carry-forward. Powers a per-card cycle
   history view in Finances and month-over-month utilization trend.
3. **Partial-payment awareness**: if paid < statement amount by due date, flag carry-forward and
   show an interest-risk warning ("₹X carried — interest applies"); if paid ≥ min but < total,
   say so explicitly.
4. **Unknown card handling**: detection with a last-4 matching no card → inbox item with
   "Add this card?" CTA prefilling last-4.
5. **Missed-payment safety net**: if the due date passes with no detected/logged payment, the
   Notifications screen pins an overdue item (complements the due+1 push, which can be cleared).

## 8. Phasing

- **Phase 1 (core fix)**: inbox persistence in listener + `NotificationInboxService` (Angular) +
  `/notifications` screen (pending list, recovery banner, log/dismiss, badge) + duplicate
  auto-match. Ships the "never lose a detection" promise.
- **Phase 2 (CC cycle completion)**: `CREDIT_CARD_STATEMENT` classifier + statement confirm flow +
  cycle ledger + partial-payment warnings + unknown-card CTA + CC strip on the screen.
- **Phase 3 (delight)**: end-of-day sweep, merchant memory, streak tie-in, utilization alerts,
  ignore-list feedback, dashboard digest.

Each phase: i18n (en/ta/hi), planner-style pure utils with unit tests (follow
`credit-card-reminders.ts` pattern), and local Gradle build + device test for Java changes.
