import { DebtAccount, DebtAdjustment, DebtPayment, ExpenseEntry } from '../models';
import { addDaysStr, cardCycleState, dayOfMonthAfter } from './credit-card-cycle';

/**
 * Pure planning logic for credit-card notifications (2026-10-02 ladder).
 *
 * The plan is recomputed (and fully rescheduled) on app init and after every
 * debt-affecting mutation, so every notification is a one-shot whose text was
 * correct at scheduling time. Amounts come from the cycle engine
 * (credit-card-cycle.ts): the bank's statement when confirmed, otherwise the
 * live estimate, labelled as such.
 *
 * Per active credit card:
 *  - Statement ask   → bill date +1, +2, +3 days (09:00) while the bank's
 *                      statement amount is still unknown; plus one for the
 *                      NEXT bill (+1 day) in case the app is not opened.
 *  - Due reminders   → 3, 2 and 1 days before the due date (09:00), then on
 *                      the due date at 06:00, 09:00, 12:00 and 18:00.
 *  - Overdue         → one nudge the day after the due date.
 *  - Next cycle      → one generic reminder 3 days before the following due
 *                      date, in case the app is not opened again before then.
 *
 * Every due/overdue reminder exists only while Bill due > 0: paying the bill in
 * full reschedules the plan and they all disappear; a part payment keeps them
 * with the remaining amount.
 */

export interface PlannedCcNotification {
  id: number;
  debtId: string;
  title: string;
  body: string;
  at: Date;
}

/** Hours (local) of the due-date reminders. */
export const DUE_DAY_REMINDER_HOURS = [6, 9, 12, 18] as const;
/** Days before the due date that get one reminder each. */
export const DUE_LEAD_DAYS = [3, 2, 1] as const;
/** Days after an unconfirmed bill date on which the statement is asked for. */
export const STATEMENT_ASK_DAYS = [1, 2, 3] as const;

const DEFAULT_HOUR = 9;

/** Slot offsets from the per-card notification ID base. */
const SLOT_STATEMENT_ASK = 0; // 0,1,2 → bill +1, +2, +3
const SLOT_NEXT_STATEMENT_ASK = 3;
const SLOT_DUE_LEAD = 4; // 4,5,6 → due −3, −2, −1
const SLOT_DUE_DAY = 7; // 7,8,9,10 → 06:00, 09:00, 12:00, 18:00
const SLOT_OVERDUE = 11;
const SLOT_NEXT_CYCLE = 12;
const SLOTS_PER_CARD = 16;
const CARD_BUCKETS = 600;

/** The pre-2026-10 scheme (8 slots per card) — still cancelled so old reminders never fire. */
const LEGACY_SLOTS_PER_CARD = 8;
const LEGACY_CARD_BUCKETS = 1200;

function debtIdHash(debtId: string): number {
  let hash = 0;
  for (let i = 0; i < debtId.length; i++) {
    hash = (Math.imul(31, hash) + debtId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic ID base in range 20000–29584 (600 cards × 16 slots). */
export function creditCardNotificationBase(debtId: string): number {
  return 20000 + (debtIdHash(debtId) % CARD_BUCKETS) * SLOTS_PER_CARD;
}

/**
 * Every ID that may ever have been scheduled for this card: the current
 * slots, the previous 8-slot scheme, and the legacy single monthly-repeat ID
 * (10000–19999) from the oldest builds.
 */
export function creditCardNotificationIdsForCancel(debtId: string): number[] {
  const hash = debtIdHash(debtId);
  const ids = new Set<number>([10000 + (hash % 10000)]);
  const base = creditCardNotificationBase(debtId);
  for (let slot = 0; slot < SLOTS_PER_CARD; slot++) ids.add(base + slot);
  const legacyBase = 20000 + (hash % LEGACY_CARD_BUCKETS) * LEGACY_SLOTS_PER_CARD;
  for (let slot = 0; slot < LEGACY_SLOTS_PER_CARD; slot++) ids.add(legacyBase + slot);
  return [...ids];
}

function at(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

function shortDate(dateStr: string): string {
  return at(dateStr, DEFAULT_HOUR).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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
  const records = { entries, adjustments, payments };

  const activeCards = debts.filter((d) => d.type === 'credit-card' && d.status === 'active');

  for (const card of activeCards) {
    const base = creditCardNotificationBase(card.id);
    const state = cardCycleState(card, records, now);
    const push = (slot: number, when: Date, title: string, body: string): void => {
      plan.push({ id: base + slot, debtId: card.id, title, body, at: when });
    };

    // ── Statement asks: the bank's amount is the truth, so ask for it. ──────
    if (state.billDateStr && state.nextBillDateStr) {
      const askTitle = `Has your ${card.name} bill been generated?`;
      const askBody = `Confirm the statement amount in Spenza so your bill due and reminders are exact.`;
      if (state.needsStatement) {
        STATEMENT_ASK_DAYS.forEach((days, index) => {
          push(SLOT_STATEMENT_ASK + index, at(addDaysStr(state.billDateStr!, days), DEFAULT_HOUR), askTitle, askBody);
        });
      }
      if (state.totalOutstanding > 0) {
        push(SLOT_NEXT_STATEMENT_ASK, at(addDaysStr(state.nextBillDateStr, 1), DEFAULT_HOUR), askTitle, askBody);
      }
    }

    if (!card.paymentDueDay && !state.dueDateStr) continue;

    // ── Due reminders for the latest bill, only while something is due. ─────
    if (state.billDue > 0 && state.dueDateStr) {
      const dueDateStr = state.dueDateStr;
      const dueLabel = shortDate(dueDateStr);
      const estimated = state.status === 'pending' || state.status === 'estimated';
      const amount = `${formatMoney(state.billDue)}${estimated ? ' (estimated — confirm in Spenza)' : ''}`;
      const minDueHint = state.minDue && state.minDue > 0 && state.minDue < state.billDue
        ? ` Min due ${formatMoney(state.minDue)}.`
        : '';
      const subject = state.status === 'none' ? `${amount} outstanding` : amount;

      DUE_LEAD_DAYS.forEach((days, index) => {
        push(
          SLOT_DUE_LEAD + index,
          at(addDaysStr(dueDateStr, -days), DEFAULT_HOUR),
          days === 1 ? `${card.name} bill due tomorrow` : `${card.name} bill due ${dueLabel}`,
          days === 1
            ? `${subject} is due tomorrow (${dueLabel}).${minDueHint}`
            : `${subject} is due in ${days} days, on ${dueLabel}.${minDueHint}`
        );
      });

      DUE_DAY_REMINDER_HOURS.forEach((hour, index) => {
        push(
          SLOT_DUE_DAY + index,
          at(dueDateStr, hour),
          `${card.name} bill due today`,
          `${subject} is due today.${minDueHint} Record the payment in Spenza once done.`
        );
      });

      push(
        SLOT_OVERDUE,
        at(addDaysStr(dueDateStr, 1), DEFAULT_HOUR),
        `Did you miss ${card.name}'s bill?`,
        minDueHint
          ? `Yesterday was the due date. Paying at least the minimum (${formatMoney(state.minDue!)}) avoids late fees.`
          : `Yesterday was the due date. Pay soon to avoid late fees and interest.`
      );
    }

    // ── Safety net for the following cycle (app not opened before then). ────
    // Generic wording — the amount of a future statement is unknowable.
    if (state.totalOutstanding > 0 && card.paymentDueDay) {
      const nextDueDateStr = state.nextBillDateStr
        ? dayOfMonthAfter(card.paymentDueDay, state.nextBillDateStr)
        : state.dueDateStr
          ? dayOfMonthAfter(card.paymentDueDay, state.dueDateStr)
          : null;
      if (nextDueDateStr) {
        push(
          SLOT_NEXT_CYCLE,
          at(addDaysStr(nextDueDateStr, -3), DEFAULT_HOUR),
          `${card.name} bill due ${shortDate(nextDueDateStr)}`,
          `Your ${card.name} payment is due on ${shortDate(nextDueDateStr)}. Open Spenza for the exact amount.`
        );
      }
    }
  }

  // Never schedule anything in the past.
  return plan.filter((n) => n.at > now);
}
