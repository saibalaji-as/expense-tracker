# Credit Card Feature — BA Analysis & Spec (2026-07-03)

> **Status: IMPLEMENTED 2026-07-03** — all corrections 1–8, the reminder ladder, and ideas 1–2 (last-4 match, utilization). Ideas 3–6 (interest-saved framing, cycle summary, bill-paid streak, Pro hooks) remain open. See `ai/TASK_HISTORY.md` 2026-07-03 for decisions. Native Gradle build not run in this environment — build locally before shipping.

## What already works (verified in code)

| Expectation | Status | Where |
|---|---|---|
| 1. Add credit card in Add Debt | **Done** | `finances.component.ts` — type `credit-card` with `billGenerationDay`, `paymentDueDay`, `minimumPaymentAmount`, `cardNetworkOrBank` |
| 2. Notification analysed for CC expense | **Partially done** | `SpendNotificationClassifier.isCreditCard` → `WIDGET_IS_CREDIT_CARD_EXTRA` → queue entry `isCreditCard: true` → `ExpenseStore.flushPendingWidgetExpenses`: 1 active card = auto-charge, >1 = in-app `credit-card-picker`, 0 = default account |
| 3. Due reminder 3 days before | **Partially done** | `LocalNotificationService.scheduleCreditCardDueReminders` — monthly repeating, 9:00, deep-links to `/finances` |

## Immediate corrections (bugs / broken promises)

1. **Widget account selector hides credit cards** (the exact complaint).
   `WidgetExpenseUtils.activeAccounts()` reads only `doc.accounts`. Fix: also read `doc.debts`, filter `type === 'credit-card' && status === 'active'`, render as a "Credit cards" group in the widget dropdown. When `WIDGET_IS_CREDIT_CARD_EXTRA = true`, preselect the credit card. Queue entry then carries an explicit `debtId` — the deferred in-app picker becomes a fallback, not the main flow.

2. **Silent account override.** In flush, `isCreditCard && 1 card` replaces the user-chosen `accountId` with the card. A classifier false positive silently charges the wrong ledger. Once cards are selectable in the widget (fix 1), trust the explicit widget selection and drop the override for entries that carry `accountId` deliberately chosen.

3. **Reminder date math breaks for due days 1–3.** `nextCreditCardReminderDate`: `reminderDay = paymentDueDay - 3` goes ≤ 0, `new Date(y, m, 0/-1/-2)` rolls into the previous month and lands on the wrong day. Use month-aware math: reminder = dueDate minus 3 days, computed on a real due Date.

4. **Reminders are never scheduled on app init.** The method's own doc says "call on app init" but only `finances.component.ts` calls it. Reinstall / permission-granted-later / widget-only users get no reminders. Call after store hydration in `app.ts`.

5. **Stale reminder amount.** Body text freezes `remainingBalance` at scheduling time; widget CC spends and auto-assigned entries change the balance without rescheduling. Reschedule after every debt-balance mutation in `ExpenseStore` (flush, recordDebtPayment, resolvePendingCcExpense).

6. **Wrong ordinal.** `"${paymentDueDay}th"` → "1th", "2th", "21th". Add an ordinal helper.

7. **Outstanding ≠ bill due.** Reminder shows total `remainingBalance`, but what's due is the statement amount (spends up to `billGenerationDay`). Showing the wrong number erodes trust — the #1 churn driver for a reminder feature. Compute statement amount from cycle: sum of `debtId` entries + carried balance up to last bill date.

8. **Daily expense form also lacks cards.** `activeAccounts()` only; a manual CC spend can't be logged against the card. Add a grouped payment-method selector (Accounts / Credit cards) that sets `debtId` instead of `accountId`.

## Reminder design (decision delegated to us)

Notification ladder per active card, all local, all recomputed on every debt/payment mutation and app init:

- **Bill day** (`billGenerationDay`): "Bill ready for {card}: ₹{statementAmount}. Due {dueDate}."
- **Due − 3 days, 9:00**: "₹{statementAmount} due {dueDate} on {card}. Min due ₹{min}." Action buttons: *Record payment* (deep-link to prefilled record-payment) / *Remind me on due day*.
- **Due day, 9:00** — *only if no `DebtPayment` recorded this cycle* (smart suppression: never nag a user who already paid).
- **Due + 1**: "Did you miss {card}'s bill? Paying min ₹{min} avoids late fees." Then stop — no infinite nagging.

## Efficiency / retention ideas (ranked by impact-per-effort)

1. **Card last-4 auto-match.** Add `cardLast4?: string` to `DebtAccount`; bank SMS almost always contains "card ending 1234" / "XX1234". Classifier extracts last-4 → flush matches the exact card even with multiple cards → true zero-tap logging. Kills the picker dialog for multi-card users.
2. **Credit limit + utilization.** Add `creditLimit?: number`; show a utilization bar per card (green <30%, amber <70%, red above) on Finances + a dashboard chip. Utilization anxiety is a proven daily-open habit loop.
3. **Interest-saved reinforcement.** On full statement payment: "You saved ~₹X interest this month." On min-only payment: projected interest cost. Positive framing converts the reminder from nag to reward.
4. **Cycle summary notification** on bill day: "This cycle on {card}: ₹X across N spends, top category {cat}." One tap → filtered view.
5. **Bill-paid streak.** Extend the existing streak system: "{n} bills paid on time in a row." Reuses shipped `StreakCalculator` mechanics.
6. **Pro-tier hook** (aligns with `Spenza_Tier_Gating_Audit.md`): multi-card analytics, utilization history, interest projections as Pro; capture + reminders stay free so the safety net is universal.

## Suggested build order

1. Corrections 3, 4, 5, 6 (reminder correctness) — smallest, restores trust.
2. Correction 1 + 2 (widget card selection, preselect on CC detection) — the requested UX.
3. Correction 7 + reminder ladder (statement-amount engine — needed by both).
4. Correction 8 (Daily form parity).
5. Ideas 1–2 (last-4 match, utilization), then 3–6.

Risks: keep all balance math inside `ExpenseStore` (double-deduction rule in `ai/AI_RULES` plan); widget prefs schema change must stay backward-compatible with older cached backup docs; native build must be run locally (no SDK in agent env).
