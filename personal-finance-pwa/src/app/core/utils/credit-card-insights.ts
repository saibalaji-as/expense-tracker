import { DebtAccount, DebtAdjustment, ExpenseEntry } from '../models';
import { lastOccurrenceOnOrBefore, nextOccurrence } from './credit-card-reminders';

/**
 * Pure credit-card insight helpers (2026-07-16):
 *  - statement-cycle window + spend (Finances per-card cycle view),
 *  - statement amount due including DebtAdjustments,
 *  - utilization threshold crossings (30% / 80% alerts),
 *  - refund → original purchase matching (suggested linkedExpenseId).
 *
 * All functions are pure and covered by credit-card-insights.spec.ts.
 */

/** Local YYYY-MM-DD (matches ExpenseEntry/DebtAdjustment date fields). */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const round2 = (n: number): number => Number(n.toFixed(2));

/** Outstanding-increasing adjustment kinds vs outstanding-reducing ones. */
const isCardCredit = (kind: DebtAdjustment['kind']): boolean =>
  kind === 'refund' || kind === 'cashback';

// ─── Statement cycle ─────────────────────────────────────────────────────────

export interface CycleWindow {
  /** First day of the current (unbilled) cycle — the day after the last bill. */
  startStr: string;
  /** Last bill generation date (cycle boundary). */
  billDate: Date;
  /** Next bill generation date. */
  nextBillDate: Date;
  /** Payment due date for the LAST generated statement, when configured. */
  dueDate: Date | null;
}

/**
 * The card's current statement cycle relative to `now`.
 * Returns null when the card has no billGenerationDay configured.
 */
export function currentCycleWindow(card: DebtAccount, now: Date): CycleWindow | null {
  if (!card.billGenerationDay) return null;
  const billDate = lastOccurrenceOnOrBefore(card.billGenerationDay, now);
  const nextBillDate = nextOccurrence(card.billGenerationDay, now);
  const dayAfterBill = new Date(billDate);
  dayAfterBill.setDate(dayAfterBill.getDate() + 1);
  const dueDate = card.paymentDueDay ? nextOccurrence(card.paymentDueDay, billDate) : null;
  return { startStr: toDateStr(dayAfterBill), billDate, nextBillDate, dueDate };
}

/**
 * Net card usage in the current (unbilled) cycle: purchases + fee/cash-advance
 * adjustments, minus refunds/cashback — everything dated after the last bill.
 */
export function cycleSpend(
  card: DebtAccount,
  entries: readonly ExpenseEntry[],
  adjustments: readonly DebtAdjustment[],
  window: CycleWindow
): number {
  const purchases = entries
    .filter((e) => e.debtId === card.id && e.source !== 'debt-payment' && e.date >= window.startStr)
    .reduce((sum, e) => sum + e.amount, 0);
  const adjusted = adjustments
    .filter((a) => a.debtId === card.id && a.date >= window.startStr)
    .reduce((sum, a) => sum + (isCardCredit(a.kind) ? -a.amount : a.amount), 0);
  return round2(purchases + adjusted);
}

/**
 * Statement amount still due for the last generated bill:
 * outstanding minus post-bill debits plus post-bill credits.
 * (Payments since the bill already reduced the outstanding.)
 * Superset of credit-card-reminders.statementDueAmount — also nets
 * DebtAdjustments so refunds arriving after the bill show correctly.
 */
export function statementDueWithAdjustments(
  card: DebtAccount,
  entries: readonly ExpenseEntry[],
  adjustments: readonly DebtAdjustment[],
  window: CycleWindow
): number {
  const postBillCharges = entries
    .filter((e) => e.debtId === card.id && e.source !== 'debt-payment' && e.date >= window.startStr)
    .reduce((sum, e) => sum + e.amount, 0);
  const postBillAdjustments = adjustments
    .filter((a) => a.debtId === card.id && a.date >= window.startStr)
    .reduce((sum, a) => sum + (isCardCredit(a.kind) ? -a.amount : a.amount), 0);
  return Math.max(0, round2(card.remainingBalance - postBillCharges - postBillAdjustments));
}

// ─── Utilization alerts ──────────────────────────────────────────────────────

export const UTILIZATION_THRESHOLDS = [30, 80] as const;
export type UtilizationThreshold = (typeof UTILIZATION_THRESHOLDS)[number];

export function utilizationPercent(card: Pick<DebtAccount, 'creditLimit'>, outstanding: number): number | null {
  if (!card.creditLimit || card.creditLimit <= 0) return null;
  return Math.round((outstanding / card.creditLimit) * 100);
}

/**
 * The highest threshold newly crossed when the outstanding moves from
 * `prevOutstanding` to `nextOutstanding`, or null. Only fires on the upward
 * crossing itself, so paying the bill and re-approaching 30% alerts again but
 * hovering above a threshold never re-alerts.
 */
export function crossedUtilizationThreshold(
  card: Pick<DebtAccount, 'creditLimit'>,
  prevOutstanding: number,
  nextOutstanding: number
): UtilizationThreshold | null {
  if (!card.creditLimit || card.creditLimit <= 0) return null;
  if (nextOutstanding <= prevOutstanding) return null;
  const prevPct = (prevOutstanding / card.creditLimit) * 100;
  const nextPct = (nextOutstanding / card.creditLimit) * 100;
  let crossed: UtilizationThreshold | null = null;
  for (const threshold of UTILIZATION_THRESHOLDS) {
    if (prevPct < threshold && nextPct >= threshold) crossed = threshold;
  }
  return crossed;
}

// ─── Refund → purchase matching ──────────────────────────────────────────────

/** How far back a refund can plausibly reference its original purchase. */
const REFUND_MATCH_WINDOW_DAYS = 90;

/**
 * Suggests original purchases for a refund on `debtId`: same card, same amount
 * (2-decimal exact), purchased within 90 days before the refund date, not
 * already claimed by another refund's linkedExpenseId. Closest date first,
 * capped at 3 suggestions.
 */
export function matchRefundCandidates(
  entries: readonly ExpenseEntry[],
  adjustments: readonly DebtAdjustment[],
  debtId: string,
  amount: number,
  refundDateStr: string
): ExpenseEntry[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const wanted = round2(amount);
  const refundDate = new Date(`${refundDateStr}T00:00:00`);
  if (Number.isNaN(refundDate.getTime())) return [];
  const earliest = new Date(refundDate);
  earliest.setDate(earliest.getDate() - REFUND_MATCH_WINDOW_DAYS);
  const earliestStr = toDateStr(earliest);

  const claimedExpenseIds = new Set(
    adjustments
      .filter((a) => a.kind === 'refund' && a.linkedExpenseId)
      .map((a) => a.linkedExpenseId as string)
  );

  return entries
    .filter((e) =>
      e.debtId === debtId &&
      e.source !== 'debt-payment' &&
      round2(e.amount) === wanted &&
      e.date <= refundDateStr &&
      e.date >= earliestStr &&
      !claimedExpenseIds.has(e.id)
    )
    .sort((a, b) => b.date.localeCompare(a.date) || (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
    .slice(0, 3);
}

// ─── Cashback tracker ────────────────────────────────────────────────────────

/** Total cashback recorded on a card, optionally since a YYYY-MM-DD date. */
export function cashbackEarned(
  adjustments: readonly DebtAdjustment[],
  debtId: string,
  sinceStr?: string
): number {
  return round2(
    adjustments
      .filter((a) => a.debtId === debtId && a.kind === 'cashback' && (!sinceStr || a.date >= sinceStr))
      .reduce((sum, a) => sum + a.amount, 0)
  );
}
