// GENERATED from src/app/core/utils/credit-card-cycle.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
import { CardStatement, DebtAccount, DebtAdjustment, DebtPayment, ExpenseEntry } from '../models';
import { toLocalDateString } from './local-date';
import { confirmedStatementFor } from './credit-card-statement';

export {
  confirmedStatementFor,
  confirmedStatements,
  isConfirmedStatement,
  STATEMENT_HISTORY_LIMIT,
  upsertStatementHistory,
} from './credit-card-statement';

/**
 * Credit-card cycle engine (2026-10-02). Pure, record-derived, no stored guesses.
 *
 * Three numbers describe a card, and they ALWAYS reconcile:
 *
 *   Total outstanding = Bill due + Unbilled spend
 *
 *  - Total outstanding: everything owed right now (`DebtAccount.remainingBalance`,
 *    itself derived from records — see derived-balance.util.ts).
 *  - Statement amount: what the bank billed on the latest bill date. This is
 *    the bank's truth (message, PDF or user entry). Bill due = statement amount
 *    − payments counted against it, never more than the total outstanding.
 *  - Unbilled spend: whatever else is outstanding — it lands on the next bill.
 *
 * Why a difference instead of date-bucketing spends: on the bill date nobody
 * knows which spends the bank included. Once the bank's amount is known the
 * split is exact by arithmetic (bill 20,300 of 20,500 outstanding → 200
 * unbilled) without guessing per transaction, and late/backdated entries, edits
 * and deletes can never fall between the two buckets.
 *
 * Until the bank's amount is known the cycle is "statement pending": the same
 * formula runs on a live ESTIMATE (outstanding as of the end of the bill date),
 * so the numbers still reconcile and are clearly labelled as estimated.
 */

const round2 = (n: number): number => Number(n.toFixed(2));

const isCardCredit = (kind: DebtAdjustment['kind']): boolean =>
  kind === 'refund' || kind === 'cashback';

export interface CardRecords {
  entries: readonly ExpenseEntry[];
  adjustments: readonly DebtAdjustment[];
  payments: readonly DebtPayment[];
}

// ─── Date-only helpers (local calendar; never time-of-day dependent) ─────────

const pad2 = (n: number): string => `${n}`.padStart(2, '0');

/** Day-of-month in a month, clamped to that month's length (31st → 30 Apr, 28 Feb…). */
function clampedDateStr(year: number, monthIndex: number, day: number): string {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  // Number(): cards saved by older builds may carry the day as a string from a native <select>.
  return `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(Math.min(Number(day), daysInMonth))}`;
}

function splitDateStr(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m, d];
}

export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = splitDateStr(dateStr);
  return toLocalDateString(new Date(y, m - 1, d + days));
}

/** Most recent occurrence of a day-of-month on or before `todayStr`. */
export function dayOfMonthOnOrBefore(day: number, todayStr: string): string {
  const [y, m] = splitDateStr(todayStr);
  const candidate = clampedDateStr(y, m - 1, day);
  return candidate > todayStr ? clampedDateStr(y, m - 2, day) : candidate;
}

/** Next occurrence of a day-of-month strictly after `afterStr`. */
export function dayOfMonthAfter(day: number, afterStr: string): string {
  const [y, m] = splitDateStr(afterStr);
  const candidate = clampedDateStr(y, m - 1, day);
  return candidate <= afterStr ? clampedDateStr(y, m, day) : candidate;
}

/** The occurrence of a day-of-month immediately before the one on `billDateStr`. */
export function previousBillDateStr(day: number, billDateStr: string): string {
  return dayOfMonthOnOrBefore(day, addDaysStr(billDateStr, -1));
}

// ─── Record sums ─────────────────────────────────────────────────────────────

/**
 * Net card usage (purchases + fee/cash-advance adjustments − refunds/cashback)
 * dated within [fromStr, toStr]; either bound may be omitted.
 */
export function netCardCharges(
  cardId: string,
  records: Pick<CardRecords, 'entries' | 'adjustments'>,
  fromStr?: string,
  toStr?: string
): number {
  const inRange = (date: string): boolean =>
    (fromStr === undefined || date >= fromStr) && (toStr === undefined || date <= toStr);
  const purchases = records.entries
    .filter((e) => e.debtId === cardId && e.source !== 'debt-payment' && inRange(e.date))
    .reduce((sum, e) => sum + e.amount, 0);
  const adjusted = records.adjustments
    .filter((a) => a.debtId === cardId && inRange(a.date))
    .reduce((sum, a) => sum + (isCardCredit(a.kind) ? -a.amount : a.amount), 0);
  return round2(purchases + adjusted);
}

/** Bill payments dated within [fromStr, toStr]; either bound may be omitted. */
export function cardPaymentsTotal(
  cardId: string,
  payments: readonly DebtPayment[],
  fromStr?: string,
  toStr?: string
): number {
  return round2(
    payments
      .filter(
        (p) =>
          p.debtId === cardId &&
          (fromStr === undefined || p.date >= fromStr) &&
          (toStr === undefined || p.date <= toStr)
      )
      .reduce((sum, p) => sum + p.amount, 0)
  );
}

/**
 * The card's outstanding as of the END of `dateStr`, reconstructed from the
 * current outstanding by undoing everything dated after it.
 */
export function outstandingAsOf(card: DebtAccount, records: CardRecords, dateStr: string): number {
  const after = addDaysStr(dateStr, 1);
  return Math.max(
    0,
    round2(
      card.remainingBalance -
        netCardCharges(card.id, records, after) +
        cardPaymentsTotal(card.id, records.payments, after)
    )
  );
}

// ─── Cycle state ─────────────────────────────────────────────────────────────

/**
 * - 'none'      — no bill day configured: the whole outstanding is treated as due.
 * - 'estimated' — the latest bill date predates tracking (card added after it):
 *                 estimate shown, nobody is asked to confirm it.
 * - 'pending'   — the bill date has passed and the bank's amount is not known yet.
 * - 'confirmed' — the bank's statement amount is stored for the latest bill date.
 */
export type CardCycleStatus = 'none' | 'estimated' | 'pending' | 'confirmed';

export interface CardCycleState {
  status: CardCycleStatus;
  /** Latest bill-generation date on or before today, or null without a bill day. */
  billDateStr: string | null;
  nextBillDateStr: string | null;
  /** Due date of the latest bill (bank's exact date when known), or null. */
  dueDateStr: string | null;
  totalOutstanding: number;
  /** Bank's statement amount when confirmed, otherwise the live estimate. */
  statementAmount: number;
  /** Payments counted against the latest statement (capped at its amount). */
  paidTowardsBill: number;
  billDue: number;
  unbilledSpend: number;
  minDue?: number;
  /** The confirmed statement for the latest bill date, when there is one. */
  statement: CardStatement | null;
  /** True when the user should be asked for the bank's statement amount. */
  needsStatement: boolean;
}

export function cardCycleState(card: DebtAccount, records: CardRecords, now: Date): CardCycleState {
  const totalOutstanding = Math.max(0, round2(card.remainingBalance));
  const todayStr = toLocalDateString(now);

  if (card.type !== 'credit-card' || !card.billGenerationDay) {
    return {
      status: 'none',
      billDateStr: null,
      nextBillDateStr: null,
      dueDateStr: card.paymentDueDay ? dayOfMonthAfter(card.paymentDueDay, addDaysStr(todayStr, -1)) : null,
      totalOutstanding,
      statementAmount: totalOutstanding,
      paidTowardsBill: 0,
      billDue: totalOutstanding,
      unbilledSpend: 0,
      ...(card.minimumPaymentAmount ? { minDue: card.minimumPaymentAmount } : {}),
      statement: null,
      needsStatement: false,
    };
  }

  const billDateStr = dayOfMonthOnOrBefore(card.billGenerationDay, todayStr);
  const nextBillDateStr = dayOfMonthAfter(card.billGenerationDay, todayStr);
  const statement = confirmedStatementFor(card, billDateStr);
  const paymentsFromStr = statement?.paymentsFromStr ?? addDaysStr(billDateStr, 1);
  const paid = cardPaymentsTotal(card.id, records.payments, paymentsFromStr);
  const statementAmount = statement ? round2(statement.amount) : outstandingAsOf(card, records, billDateStr);
  const billDue = Math.min(totalOutstanding, Math.max(0, round2(statementAmount - paid)));
  const unbilledSpend = round2(totalOutstanding - billDue);
  const dueDateStr =
    statement?.dueDateStr ??
    (card.paymentDueDay ? dayOfMonthAfter(card.paymentDueDay, billDateStr) : null);
  const minDue = statement?.minDue ?? card.minimumPaymentAmount;

  const tracked = billDateStr >= card.startDate;
  const status: CardCycleStatus = statement ? 'confirmed' : tracked ? 'pending' : 'estimated';

  return {
    status,
    billDateStr,
    nextBillDateStr,
    dueDateStr,
    totalOutstanding,
    statementAmount,
    paidTowardsBill: Math.min(paid, statementAmount),
    billDue,
    unbilledSpend,
    ...(minDue !== undefined && minDue > 0 ? { minDue } : {}),
    statement,
    // A zero-balance card with nothing billed has nothing to confirm.
    needsStatement: status === 'pending' && (statementAmount > 0 || totalOutstanding > 0),
  };
}

// ─── Confirming the bank's statement amount ──────────────────────────────────

export interface StatementConfirmationPlan {
  billDateStr: string;
  /** Bank's statement amount being confirmed. */
  statementAmount: number;
  /** Spenza's live estimate for the same bill, for comparison. */
  estimatedAmount: number;
  paymentsFromStr: string;
  paidTowardsBill: number;
  /** Bill due / unbilled spend once confirmed (after `shortfall` is added to the total). */
  billDue: number;
  unbilledSpend: number;
  /** Net card spend logged on or after the bill date — the most that can honestly be unbilled. */
  spendSinceBillDate: number;
  /**
   * Bank's bill is HIGHER than everything Spenza has recorded: fees, interest or
   * spends that were never logged. Confirming adds this to the total outstanding.
   */
  shortfall: number;
  /**
   * Spenza's total is higher than the bank's bill plus the spends logged since
   * the bill date: an unrecorded payment/refund or a duplicate entry. It is
   * carried as unbilled unless the user chooses to correct the total.
   */
  unexplainedCarry: number;
}

/**
 * Works out what confirming `bankAmount` for the card's latest bill would do.
 * Pure — the store applies it. Returns null when the card has no bill day.
 *
 * Bill-day payments are ambiguous (made before or after the bank generated the
 * bill?). Both readings are evaluated and the one whose unbilled figure fits
 * the logged spends is chosen; on a tie the payment is assumed to be already
 * inside the bank's amount (the safer reading — bill due is not understated).
 */
export function planStatementConfirmation(
  card: DebtAccount,
  records: CardRecords,
  now: Date,
  bankAmount: number
): StatementConfirmationPlan | null {
  if (card.type !== 'credit-card' || !card.billGenerationDay) return null;
  const todayStr = toLocalDateString(now);
  const billDateStr = dayOfMonthOnOrBefore(card.billGenerationDay, todayStr);
  const dayAfter = addDaysStr(billDateStr, 1);
  const totalOutstanding = Math.max(0, round2(card.remainingBalance));
  const statementAmount = Math.max(0, round2(bankAmount));
  const spendSinceBillDate = Math.max(0, netCardCharges(card.id, records, billDateStr));

  const evaluate = (paymentsFromStr: string) => {
    const paid = cardPaymentsTotal(card.id, records.payments, paymentsFromStr);
    const due = Math.max(0, round2(statementAmount - paid));
    const rawUnbilled = round2(totalOutstanding - due);
    const shortfall = rawUnbilled < 0 ? round2(-rawUnbilled) : 0;
    const unexplainedCarry = rawUnbilled > spendSinceBillDate ? round2(rawUnbilled - spendSinceBillDate) : 0;
    return { paymentsFromStr, paid, due, rawUnbilled, shortfall, unexplainedCarry, misfit: shortfall + unexplainedCarry };
  };

  const afterBillDay = evaluate(dayAfter);
  const paidOnBillDay = cardPaymentsTotal(card.id, records.payments, billDateStr, billDateStr);
  const fromBillDay = paidOnBillDay > 0 ? evaluate(billDateStr) : null;
  const chosen = fromBillDay && fromBillDay.misfit < afterBillDay.misfit ? fromBillDay : afterBillDay;

  return {
    billDateStr,
    statementAmount,
    estimatedAmount: outstandingAsOf(card, records, billDateStr),
    paymentsFromStr: chosen.paymentsFromStr,
    paidTowardsBill: Math.min(chosen.paid, statementAmount),
    billDue: chosen.due,
    unbilledSpend: Math.max(0, chosen.rawUnbilled),
    spendSinceBillDate,
    shortfall: chosen.shortfall,
    unexplainedCarry: chosen.unexplainedCarry,
  };
}

/** True when a plan can be applied without asking the user anything. */
export const isCleanConfirmation = (plan: StatementConfirmationPlan): boolean =>
  plan.shortfall < 0.01 && plan.unexplainedCarry < 0.01;

// ─── Cycle windows & activity (statement view, export, PDF check) ────────────

export interface CardCycleWindow {
  /** Bill date that closes this window; null for the open (unbilled) window. */
  billDateStr: string | null;
  /** First day covered (day after the previous bill date). */
  fromStr: string;
  /** Last day covered (the bill date, or today for the open window). */
  toStr: string;
}

/**
 * The open (unbilled) window followed by the `count` most recent closed
 * statement windows, newest first. Windows before the card existed are dropped.
 */
export function cardCycleWindows(card: DebtAccount, now: Date, count = 12): CardCycleWindow[] {
  if (!card.billGenerationDay) return [];
  const todayStr = toLocalDateString(now);
  const day = card.billGenerationDay;
  const latestBill = dayOfMonthOnOrBefore(day, todayStr);
  const windows: CardCycleWindow[] = [];
  if (todayStr > latestBill) {
    windows.push({ billDateStr: null, fromStr: addDaysStr(latestBill, 1), toStr: todayStr });
  }
  let billDateStr = latestBill;
  for (let i = 0; i < count; i++) {
    const previous = previousBillDateStr(day, billDateStr);
    if (billDateStr < card.startDate) break;
    windows.push({ billDateStr, fromStr: addDaysStr(previous, 1), toStr: billDateStr });
    billDateStr = previous;
  }
  return windows;
}

export type CardActivityKind = 'purchase' | 'payment' | DebtAdjustment['kind'];

export interface CardActivityLine {
  id: string;
  date: string;
  kind: CardActivityKind;
  description: string;
  /** Positive number; `direction` says whether it raised or lowered the outstanding. */
  amount: number;
  direction: 'debit' | 'credit';
}

export interface CardCycleActivity {
  window: CardCycleWindow;
  openingBalance: number;
  lines: CardActivityLine[];
  totalPurchases: number;
  totalOtherDebits: number;
  totalCredits: number;
  totalPayments: number;
  /** openingBalance + debits − credits − payments, as recorded in Spenza. */
  closingBalance: number;
  /** Bank's statement for this window's bill date, when confirmed. */
  statement: CardStatement | null;
}

export function cardCycleActivity(
  card: DebtAccount,
  records: CardRecords,
  window: CardCycleWindow
): CardCycleActivity {
  const inWindow = (date: string): boolean => date >= window.fromStr && date <= window.toStr;
  const lines: CardActivityLine[] = [];
  for (const entry of records.entries) {
    if (entry.debtId !== card.id || entry.source === 'debt-payment' || !inWindow(entry.date)) continue;
    lines.push({
      id: entry.id,
      date: entry.date,
      kind: 'purchase',
      description: entry.comment?.trim() ? `${entry.type} — ${entry.comment.trim()}` : entry.type,
      amount: entry.amount,
      direction: 'debit',
    });
  }
  for (const adjustment of records.adjustments) {
    if (adjustment.debtId !== card.id || !inWindow(adjustment.date)) continue;
    lines.push({
      id: adjustment.id,
      date: adjustment.date,
      kind: adjustment.kind,
      description: adjustment.reason?.trim() || adjustment.kind,
      amount: adjustment.amount,
      direction: isCardCredit(adjustment.kind) ? 'credit' : 'debit',
    });
  }
  for (const payment of records.payments) {
    if (payment.debtId !== card.id || !inWindow(payment.date)) continue;
    lines.push({
      id: payment.id,
      date: payment.date,
      kind: 'payment',
      description: 'Bill payment',
      amount: payment.amount,
      direction: 'credit',
    });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const sum = (predicate: (line: CardActivityLine) => boolean): number =>
    round2(lines.filter(predicate).reduce((total, line) => total + line.amount, 0));
  const totalPurchases = sum((line) => line.kind === 'purchase');
  const totalOtherDebits = sum((line) => line.direction === 'debit' && line.kind !== 'purchase');
  const totalCredits = sum((line) => line.direction === 'credit' && line.kind !== 'payment');
  const totalPayments = sum((line) => line.kind === 'payment');
  const openingBalance = outstandingAsOf(card, records, addDaysStr(window.fromStr, -1));

  return {
    window,
    openingBalance,
    lines,
    totalPurchases,
    totalOtherDebits,
    totalCredits,
    totalPayments,
    closingBalance: round2(openingBalance + totalPurchases + totalOtherDebits - totalCredits - totalPayments),
    statement: window.billDateStr ? confirmedStatementFor(card, window.billDateStr) : null,
  };
}

// ─── Expense reporting ───────────────────────────────────────────────────────

/**
 * Paying a credit-card bill is NOT spending: every purchase was already an
 * expense on the day it was made, so counting the repayment again would double
 * it. The generated 'Debt Payment' entry stays in the ledger (it is the record
 * that debits the paying account) but is excluded from every expense view,
 * total and budget. Loan/EMI repayments are real cash-out and stay expenses.
 */
export function isCardBillPaymentEntry(entry: ExpenseEntry, creditCardIds: ReadonlySet<string>): boolean {
  return entry.source === 'debt-payment' && !!entry.debtId && creditCardIds.has(entry.debtId);
}

export function expenseOnlyEntries(
  entries: readonly ExpenseEntry[],
  debts: readonly DebtAccount[]
): ExpenseEntry[] {
  const creditCardIds = new Set(debts.filter((debt) => debt.type === 'credit-card').map((debt) => debt.id));
  if (creditCardIds.size === 0) return entries as ExpenseEntry[];
  const filtered = entries.filter((entry) => !isCardBillPaymentEntry(entry, creditCardIds));
  return filtered.length === entries.length ? (entries as ExpenseEntry[]) : filtered;
}

// ─── Bank-message detections ─────────────────────────────────────────────────

/** Days after a bill date within which a captured bank message is applied automatically. */
export const STATEMENT_AUTO_CONFIRM_WINDOW_DAYS = 10;

/** The active card a captured statement message belongs to, or null when it is ambiguous. */
export function resolveDetectionCard(
  debts: readonly DebtAccount[],
  detection: { debtId?: string; cardLast4?: string }
): DebtAccount | null {
  const cards = debts.filter(
    (debt) => debt.type === 'credit-card' && debt.status === 'active' && !!debt.billGenerationDay
  );
  if (detection.debtId) return cards.find((card) => card.id === detection.debtId) ?? null;
  if (detection.cardLast4) {
    const matches = cards.filter((card) => card.cardLast4 === detection.cardLast4);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
    // No card carries this last-4: only a card WITHOUT a stored last-4 can be it.
    const unlabelled = cards.filter((card) => !card.cardLast4);
    return unlabelled.length === 1 ? unlabelled[0] : null;
  }
  return cards.length === 1 ? cards[0] : null;
}

/** Whole days from `fromStr` to `toStr` (negative when `toStr` is earlier). */
export function daysBetweenStr(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = splitDateStr(fromStr);
  const [ty, tm, td] = splitDateStr(toStr);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
