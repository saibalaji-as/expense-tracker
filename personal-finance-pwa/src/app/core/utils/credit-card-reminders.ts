import { DebtAccount, DebtAdjustment, DebtPayment, ExpenseEntry } from '../models';

/**
 * Pure planning logic for credit-card bill notifications.
 *
 * The plan is recomputed (and fully rescheduled) on app init and after every
 * debt-affecting mutation, so every notification is a one-shot with amounts
 * that were correct at scheduling time. Repeating notifications are not used —
 * they cannot update their body text and drift on short months.
 *
 * Ladder per active credit card:
 *  - bill day        → "statement ready" (no amount, can never be wrong)
 *  - due − 3 days    → statement amount due (or outstanding fallback)
 *  - due day         → only when no payment has been recorded this cycle
 *  - due + 1 day     → single overdue nudge, then stop
 *  - next cycle −3d  → generic safety net in case the app is not opened
 */

export interface PlannedCcNotification {
  id: number;
  debtId: string;
  title: string;
  body: string;
  at: Date;
}

/** Slot offsets from the per-card notification ID base. */
const SLOT_BILL_READY = 0;
const SLOT_DUE_SOON = 1;
const SLOT_DUE_TODAY = 2;
const SLOT_OVERDUE = 3;
const SLOT_NEXT_CYCLE = 4;
const SLOTS_PER_CARD = 8; // reserved (5 used) so the scheme can grow without ID migration

const NOTIFY_HOUR = 9;

function debtIdHash(debtId: string): number {
  let hash = 0;
  for (let i = 0; i < debtId.length; i++) {
    hash = (Math.imul(31, hash) + debtId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic ID base in range 20000–29592 (1200 cards × 8 slots). */
export function creditCardNotificationBase(debtId: string): number {
  return 20000 + (debtIdHash(debtId) % 1200) * SLOTS_PER_CARD;
}

/**
 * Every ID that may ever have been scheduled for this card, including the
 * legacy single monthly-repeat ID (10000–19999) from older app builds.
 */
export function creditCardNotificationIdsForCancel(debtId: string): number[] {
  const base = creditCardNotificationBase(debtId);
  const legacyId = 10000 + (debtIdHash(debtId) % 10000);
  const ids = [legacyId];
  for (let slot = 0; slot < SLOTS_PER_CARD; slot++) ids.push(base + slot);
  return ids;
}

/** Local YYYY-MM-DD for comparisons against ExpenseEntry/DebtPayment dates. */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Day-of-month clamped to the target month's length (31st → 30 Apr, 28 Feb…). */
function clampedDate(year: number, monthIndex: number, day: number): Date {
  const normalized = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(normalized.getFullYear(), normalized.getMonth() + 1, 0).getDate();
  return new Date(normalized.getFullYear(), normalized.getMonth(), Math.min(day, daysInMonth), NOTIFY_HOUR, 0, 0, 0);
}

/** Next occurrence of a day-of-month strictly after `after`. Month-aware (fixes due days 1–3). */
export function nextOccurrence(day: number, after: Date): Date {
  let candidate = clampedDate(after.getFullYear(), after.getMonth(), day);
  if (candidate <= after) {
    candidate = clampedDate(after.getFullYear(), after.getMonth() + 1, day);
  }
  return candidate;
}

/** Most recent occurrence of a day-of-month on or before `ref`. */
export function lastOccurrenceOnOrBefore(day: number, ref: Date): Date {
  let candidate = clampedDate(ref.getFullYear(), ref.getMonth(), day);
  if (candidate > ref) {
    candidate = clampedDate(ref.getFullYear(), ref.getMonth() - 1, day);
  }
  return candidate;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(NOTIFY_HOUR, 0, 0, 0);
  return next;
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Fallback estimate of the amount still due for the cycle billed on
 * `billDate`, used only when the card has no statement snapshot for that
 * bill: current remaining balance minus post-bill charges (purchases AND
 * debit adjustments) plus post-bill credits (refunds/cashback). Payments
 * since the bill already reduced remainingBalance, so they are implicitly
 * subtracted — this equals statement balance minus payments made.
 */
export function statementDueAmount(
  card: DebtAccount,
  entries: readonly ExpenseEntry[],
  billDate: Date,
  adjustments: readonly DebtAdjustment[] = []
): number {
  const billStr = toDateStr(billDate);
  const chargesSinceBill = entries
    .filter((e) => e.debtId === card.id && e.source !== 'debt-payment' && e.date > billStr)
    .reduce((sum, e) => sum + e.amount, 0);
  const adjustmentsSinceBill = adjustments
    .filter((a) => a.debtId === card.id && a.date > billStr)
    .reduce((sum, a) => sum + (a.kind === 'refund' || a.kind === 'cashback' ? -a.amount : a.amount), 0);
  return Math.max(0, Number((card.remainingBalance - chargesSinceBill - adjustmentsSinceBill).toFixed(2)));
}

/**
 * Amount still due for a snapshotted statement: the (possibly user-corrected)
 * statement amount minus payments recorded after the bill date.
 * Duplicated from credit-card-statement.ts to keep this planner dependency-light.
 */
function snapshotRemainingDue(card: DebtAccount, payments: readonly DebtPayment[]): number {
  const statement = card.statement!;
  const paidSinceBill = payments
    .filter((p) => p.debtId === card.id && p.date > statement.billDateStr)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, Number((statement.amount - paidSinceBill).toFixed(2)));
}

/** A payment recorded on/after the cycle start suppresses due-day and overdue nudges. */
function paidSince(payments: readonly DebtPayment[], debtId: string, sinceStr: string): boolean {
  return payments.some((p) => p.debtId === debtId && p.date >= sinceStr);
}

export function buildCreditCardReminderPlan(
  debts: readonly DebtAccount[],
  entries: readonly ExpenseEntry[],
  payments: readonly DebtPayment[],
  now: Date,
  formatMoney: (amount: number) => string,
  adjustments: readonly DebtAdjustment[] = []
): PlannedCcNotification[] {
  const plan: PlannedCcNotification[] = [];

  const activeCards = debts.filter(
    (d) => d.type === 'credit-card' && d.status === 'active' && !!d.paymentDueDay
  );

  for (const card of activeCards) {
    const base = creditCardNotificationBase(card.id);
    const dueDay = card.paymentDueDay!;
    const dueDate = nextOccurrence(dueDay, now);

    // "Statement ready" ping on the next bill-generation day. Amount-free by
    // design — it now asks the user to confirm the estimated statement so
    // later reminders carry the exact bank amount.
    if (card.billGenerationDay && card.remainingBalance > 0) {
      const nextBill = nextOccurrence(card.billGenerationDay, now);
      plan.push({
        id: base + SLOT_BILL_READY,
        debtId: card.id,
        title: `${card.name} statement is ready`,
        body: `Your ${card.name} bill was generated today. Confirm the statement amount in Spenza so reminders match your bank's bill.`,
        at: nextBill,
      });
    }

    // Resolve the statement that the upcoming due date belongs to.
    const billDate = card.billGenerationDay
      ? lastOccurrenceOnOrBefore(card.billGenerationDay, dueDate)
      : null;
    const statementKnown = billDate !== null && billDate <= now;

    // Best amount available, most-trusted first:
    //  1. statement snapshot for this bill (user-confirmed or derived) minus
    //     payments made since the bill,
    //  2. live estimate netting post-bill charges/adjustments,
    //  3. raw outstanding when no bill day is configured.
    const snapshotCurrent =
      statementKnown && !!card.statement && card.statement.billDateStr === toDateStr(billDate);
    const dueAmount = snapshotCurrent
      ? snapshotRemainingDue(card, payments)
      : statementKnown
        ? statementDueAmount(card, entries, billDate, adjustments)
        : card.remainingBalance;
    const confirmed = snapshotCurrent && card.statement!.source === 'user';
    // Unconfirmed amounts are honest about being estimates — the user can
    // correct any bank discrepancy from the Finances screen.
    const estimateHint = statementKnown && !confirmed ? ' (estimated — confirm in Spenza)' : '';
    const cycleStartStr = statementKnown ? toDateStr(billDate) : toDateStr(addDays(dueDate, -30));
    const alreadyPaid = paidSince(payments, card.id, cycleStartStr);

    const nothingDue = dueAmount <= 0;
    const minDue = snapshotCurrent && card.statement!.minDue !== undefined
      ? card.statement!.minDue
      : card.minimumPaymentAmount;
    const minDueHint = minDue && minDue > 0 ? ` Min due ${formatMoney(minDue)}.` : '';

    if (!nothingDue) {
      const dueSoonAt = addDays(dueDate, -3);
      if (dueSoonAt > now) {
        plan.push({
          id: base + SLOT_DUE_SOON,
          debtId: card.id,
          title: `${card.name} bill due ${shortDate(dueDate)}`,
          body: statementKnown
            ? `${formatMoney(dueAmount)}${estimateHint} due on ${shortDate(dueDate)}.${minDueHint}`
            : `${card.name}: ${formatMoney(dueAmount)} outstanding. Due on ${shortDate(dueDate)}.`,
          at: dueSoonAt,
        });
      }

      if (!alreadyPaid) {
        if (dueDate > now) {
          plan.push({
            id: base + SLOT_DUE_TODAY,
            debtId: card.id,
            title: `${card.name} bill due today`,
            body: `${formatMoney(dueAmount)}${estimateHint} is due today.${minDueHint} Record the payment in Spenza once done.`,
            at: dueDate,
          });
        }
        plan.push({
          id: base + SLOT_OVERDUE,
          debtId: card.id,
          title: `Did you miss ${card.name}'s bill?`,
          body: minDueHint
            ? `Yesterday was the due date. Paying at least the minimum (${formatMoney(minDue!)}) avoids late fees.`
            : `Yesterday was the due date. Pay soon to avoid late fees and interest.`,
          at: addDays(dueDate, 1),
        });
      }
    }

    // Safety net for the following cycle in case the app is not opened again
    // before then. Generic wording — amounts for a future statement are unknowable.
    if (card.remainingBalance > 0) {
      const nextDueDate = nextOccurrence(dueDay, dueDate);
      plan.push({
        id: base + SLOT_NEXT_CYCLE,
        debtId: card.id,
        title: `${card.name} bill due ${shortDate(nextDueDate)}`,
        body: `Your ${card.name} payment is due on ${shortDate(nextDueDate)}. Open Spenza for the exact amount.`,
        at: addDays(nextDueDate, -3),
      });
    }
  }

  // Never schedule anything in the past.
  return plan.filter((n) => n.at > now);
}
