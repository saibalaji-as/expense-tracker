import { CardStatement, DebtAccount, DebtAdjustment, DebtPayment, ExpenseEntry } from '../models';
import { lastOccurrenceOnOrBefore } from './credit-card-reminders';

/**
 * Pure statement-snapshot logic (2026-07-19).
 *
 * Why: reminder amounts were derived live from the current outstanding, so
 * post-bill activity (and bank-side interest/fees Spenza never sees) made the
 * reminder drift from the real payable bill. Now each card keeps ONE snapshot
 * of the latest generated statement (`DebtAccount.statement`):
 *  - derived automatically when a bill-generation day passes (`source: 'derived'`),
 *  - confirmable/editable by the user in Finances (`source: 'user'`) so any
 *    discrepancy with the actual bank statement can be corrected.
 *
 * Date semantics: everything strictly AFTER the bill date (`> billDateStr`) is
 * post-statement; activity dated on the bill day itself is treated as included
 * in the statement.
 */

const round2 = (n: number): number => Number(n.toFixed(2));

const isCardCredit = (kind: DebtAdjustment['kind']): boolean =>
  kind === 'refund' || kind === 'cashback';

/** Local YYYY-MM-DD (matches ExpenseEntry/DebtPayment/DebtAdjustment dates). */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The most recent bill-generation date for the card on or before `now`,
 * or null when the card has no billGenerationDay configured.
 */
export function latestBillDate(card: DebtAccount, now: Date): Date | null {
  if (!card.billGenerationDay) return null;
  return lastOccurrenceOnOrBefore(card.billGenerationDay, now);
}

/**
 * Reconstructs the card's outstanding AS OF the bill date from current state:
 * current outstanding, minus post-bill charges (purchases + debit adjustments),
 * plus post-bill credits (refunds/cashback) and post-bill payments (both
 * already reduced the outstanding but were NOT part of the statement).
 */
export function deriveStatementAmount(
  card: DebtAccount,
  entries: readonly ExpenseEntry[],
  adjustments: readonly DebtAdjustment[],
  payments: readonly DebtPayment[],
  billDate: Date
): number {
  const billStr = toLocalDateStr(billDate);
  const postBillCharges = entries
    .filter((e) => e.debtId === card.id && e.source !== 'debt-payment' && e.date > billStr)
    .reduce((sum, e) => sum + e.amount, 0);
  const postBillAdjustmentsNet = adjustments
    .filter((a) => a.debtId === card.id && a.date > billStr)
    .reduce((sum, a) => sum + (isCardCredit(a.kind) ? -a.amount : a.amount), 0);
  const postBillPayments = payments
    .filter((p) => p.debtId === card.id && p.date > billStr)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(
    0,
    round2(card.remainingBalance - postBillCharges - postBillAdjustmentsNet + postBillPayments)
  );
}

/**
 * What is still left to pay for a snapshotted statement: the (possibly
 * user-corrected) statement amount minus payments recorded after the bill
 * date. Never negative.
 */
export function statementRemainingDue(
  statement: CardStatement,
  payments: readonly DebtPayment[],
  debtId: string
): number {
  const paidSinceBill = payments
    .filter((p) => p.debtId === debtId && p.date > statement.billDateStr)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, round2(statement.amount - paidSinceBill));
}

/** True when `statement` covers the card's latest generated bill. */
export function statementIsCurrent(
  card: DebtAccount,
  statement: CardStatement | undefined,
  now: Date
): statement is CardStatement {
  if (!statement) return false;
  const billDate = latestBillDate(card, now);
  return billDate !== null && statement.billDateStr === toLocalDateStr(billDate);
}

/**
 * Builds the derived snapshot a card should carry for its latest bill, or
 * null when no snapshot update is needed (no bill day configured, or the
 * existing snapshot already covers the latest bill date).
 */
export function pendingDerivedStatement(
  card: DebtAccount,
  entries: readonly ExpenseEntry[],
  adjustments: readonly DebtAdjustment[],
  payments: readonly DebtPayment[],
  now: Date
): CardStatement | null {
  if (card.type !== 'credit-card' || card.status !== 'active') return null;
  const billDate = latestBillDate(card, now);
  if (billDate === null) return null;
  const billDateStr = toLocalDateStr(billDate);
  if (card.statement && card.statement.billDateStr === billDateStr) return null;
  return {
    billDateStr,
    amount: deriveStatementAmount(card, entries, adjustments, payments, billDate),
    source: 'derived',
    updatedAt: new Date().toISOString(),
  };
}
