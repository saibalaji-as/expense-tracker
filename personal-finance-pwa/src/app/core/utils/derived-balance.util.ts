import { AccountBalanceAdjustment, AssetAccount } from '../models/asset-account.model';
import { DebtAccount, DebtAdjustment, DebtPayment } from '../models/debt-account.model';
import { ExpenseEntry } from '../models/expense-entry.model';

/**
 * Derived account balances (2026-07-25).
 *
 * WHY: balances used to be mutable numbers on AssetAccount, synced whole-record
 * LWW across family devices. Every merge race silently dropped one side's
 * deltas while the underlying records (add-only + tombstones) survived —
 * audited drift of +37,909 (Cash) / +86,056.86 (HDFC) on the live dataset.
 * A balance DERIVED from the records converges wherever the records converge,
 * so drift is structurally impossible.
 *
 * The formula mirrors every balance-affecting store mutation:
 *   initialBalance
 *   + adjustments        (increase / decrease — the only manual lever)
 *   − linked entries     (any ExpenseEntry.accountId — incl. debt payments)
 *   + cash-withdrawals   (DebtAdjustment kind 'cash-withdrawal' into the account)
 *
 * Store mutations already reverse/apply record effects symmetrically on
 * edit/delete, so replaying the surviving records is exact.
 */

const roundMoney = (amount: number): number => Number(amount.toFixed(2));

export interface DerivedBalanceRecords {
  accountAdjustments: readonly AccountBalanceAdjustment[];
  entries: readonly ExpenseEntry[];
  debtAdjustments: readonly DebtAdjustment[];
}

/** Balance for every account id, derived purely from records. */
export function computeDerivedBalances(
  accounts: readonly AssetAccount[],
  records: DerivedBalanceRecords
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const account of accounts) {
    balances.set(account.id, roundMoney(account.initialBalance ?? 0));
  }
  const add = (accountId: string | undefined, delta: number): void => {
    if (!accountId || delta === 0) return;
    const current = balances.get(accountId);
    if (current === undefined) return; // record for a deleted/unknown account
    balances.set(accountId, roundMoney(current + delta));
  };

  for (const adjustment of records.accountAdjustments) {
    add(adjustment.accountId, adjustment.kind === 'increase' ? adjustment.amount : -adjustment.amount);
  }
  for (const entry of records.entries) {
    add(entry.accountId, -entry.amount);
  }
  for (const adjustment of records.debtAdjustments) {
    if (adjustment.kind === 'cash-withdrawal') add(adjustment.linkedAccountId, adjustment.amount);
  }
  return balances;
}

// ── Credit-card outstanding (same disease, same cure) ────────────────────────
// DebtAccount.remainingBalance is a mutable LWW-merged number like account
// balances were. For cards WITH an openingOutstanding anchor, outstanding is
// derived:  opening + charges (debtId entries, excl. debt-payment ones)
//           + charge/cash-withdrawal adjustments − refund/cashback adjustments
//           − bill payments,  floored at 0 (store ops clamp per-op).

export interface DerivedOutstandingRecords {
  entries: readonly ExpenseEntry[];
  debtPayments: readonly DebtPayment[];
  debtAdjustments: readonly DebtAdjustment[];
}

/** Per-card movement since tracking started (excludes the opening anchor). */
export function cardMovementTotals(
  records: DerivedOutstandingRecords
): Map<string, number> {
  const movements = new Map<string, number>();
  const add = (debtId: string | undefined, delta: number): void => {
    if (!debtId || delta === 0) return;
    movements.set(debtId, roundMoney((movements.get(debtId) ?? 0) + delta));
  };
  for (const entry of records.entries) {
    if (entry.debtId && entry.source !== 'debt-payment') add(entry.debtId, entry.amount);
  }
  for (const payment of records.debtPayments) {
    add(payment.debtId, -payment.amount);
  }
  for (const adjustment of records.debtAdjustments) {
    const sign = adjustment.kind === 'refund' || adjustment.kind === 'cashback' ? -1 : 1;
    add(adjustment.debtId, sign * adjustment.amount);
  }
  return movements;
}

/** Derived outstanding for every credit card that has an opening anchor. */
export function computeDerivedOutstandings(
  debts: readonly DebtAccount[],
  records: DerivedOutstandingRecords
): Map<string, number> {
  const movements = cardMovementTotals(records);
  const outstandings = new Map<string, number>();
  for (const debt of debts) {
    if (debt.type !== 'credit-card' || debt.openingOutstanding === undefined) continue;
    outstandings.set(
      debt.id,
      Math.max(0, roundMoney(debt.openingOutstanding + (movements.get(debt.id) ?? 0)))
    );
  }
  return outstandings;
}

export interface CardOutstandingDiscrepancy {
  debtId: string;
  cardName: string;
  stored: number;
  derived: number;
  /** stored − derived; positive means the stored outstanding was inflated. */
  drift: number;
}

export function findCardOutstandingDiscrepancies(
  debts: readonly DebtAccount[],
  records: DerivedOutstandingRecords
): CardOutstandingDiscrepancy[] {
  const derived = computeDerivedOutstandings(debts, records);
  const discrepancies: CardOutstandingDiscrepancy[] = [];
  for (const debt of debts) {
    const derivedOutstanding = derived.get(debt.id);
    if (derivedOutstanding === undefined) continue;
    const drift = roundMoney(debt.remainingBalance - derivedOutstanding);
    if (Math.abs(drift) >= 0.01) {
      discrepancies.push({
        debtId: debt.id,
        cardName: debt.name,
        stored: debt.remainingBalance,
        derived: derivedOutstanding,
        drift,
      });
    }
  }
  return discrepancies;
}

export interface BalanceDiscrepancy {
  accountId: string;
  accountName: string;
  /** The legacy stored (mutable) balance found on the account record. */
  stored: number;
  /** The balance derived from records. */
  derived: number;
  /** stored − derived; positive means the stored balance was inflated. */
  drift: number;
}

/**
 * Stored-vs-derived differences, for the one-time reconciliation banner.
 * Sub-paisa noise from float rounding is not a discrepancy.
 */
export function findBalanceDiscrepancies(
  accounts: readonly AssetAccount[],
  records: DerivedBalanceRecords
): BalanceDiscrepancy[] {
  const derived = computeDerivedBalances(accounts, records);
  const discrepancies: BalanceDiscrepancy[] = [];
  for (const account of accounts) {
    const derivedBalance = derived.get(account.id) ?? 0;
    const drift = roundMoney(account.balance - derivedBalance);
    if (Math.abs(drift) >= 0.01) {
      discrepancies.push({
        accountId: account.id,
        accountName: account.name,
        stored: account.balance,
        derived: derivedBalance,
        drift,
      });
    }
  }
  return discrepancies;
}
