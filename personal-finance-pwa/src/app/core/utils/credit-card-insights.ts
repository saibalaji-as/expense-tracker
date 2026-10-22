import { DebtAccount, DebtAdjustment, ExpenseEntry } from '../models';

/**
 * Pure credit-card insight helpers (2026-07-16):
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
