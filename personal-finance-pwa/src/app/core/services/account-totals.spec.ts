// TC-MONEY-02 — Net-worth math must never drift from its parts.
// Pure logic mirrors of ExpenseStore's totalAssets / totalLiabilities / netWorth
// computed signals (expense-store.service.ts ~L250-273). Following the same
// "mirror the computed signal" convention as expense-store.service.spec.ts.
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { AssetAccount } from '../models/asset-account.model';
import type { DebtAccount } from '../models/debt-account.model';

// ─── Mirrors (keep in sync with the store's computed signals) ─────────────────
function computeTotalAssets(accounts: readonly AssetAccount[]): number {
  return accounts.filter((a) => !a.archived).reduce((sum, a) => sum + a.balance, 0);
}
function computeTotalLiabilities(debts: readonly DebtAccount[]): number {
  return debts.filter((d) => d.status === 'active').reduce((sum, d) => sum + d.remainingBalance, 0);
}
function computeNetWorth(accounts: readonly AssetAccount[], debts: readonly DebtAccount[]): number {
  return computeTotalAssets(accounts) - computeTotalLiabilities(debts);
}

// ─── Test data factories (full, type-valid objects) ───────────────────────────
function makeAccount(balance: number, archived: boolean): AssetAccount {
  return {
    id: 'a' + Math.random().toString(36).slice(2),
    name: 'acct', type: 'bank', balance, initialBalance: balance,
    allowOverdraft: false, isDefault: false, archived,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
function makeDebt(remainingBalance: number, status: DebtAccount['status']): DebtAccount {
  return {
    id: 'd' + Math.random().toString(36).slice(2),
    name: 'debt', type: 'credit-card', principalAmount: remainingBalance, remainingBalance,
    startDate: '2026-01-01', status,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const money = () => fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

describe('Account & debt totals', () => {
  it('totalAssets sums exactly the non-archived account balances', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ balance: money(), archived: fc.boolean() })),
      (rows) => {
        const accounts = rows.map((r) => makeAccount(r.balance, r.archived));
        const expected = rows.filter((r) => !r.archived).reduce((s, r) => s + r.balance, 0);
        expect(computeTotalAssets(accounts)).toBe(expected);
      },
    ));
  });

  it('archived accounts never affect totalAssets', () => {
    fc.assert(fc.property(
      fc.array(money()), money(),
      (balances, archivedBalance) => {
        const active = balances.map((b) => makeAccount(b, false));
        const before = computeTotalAssets(active);
        const after = computeTotalAssets([...active, makeAccount(archivedBalance, true)]);
        expect(after).toBe(before);
      },
    ));
  });

  it('totalLiabilities counts only ACTIVE debts (paid/archived excluded)', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        remaining: money(),
        status: fc.constantFrom<DebtAccount['status']>('active', 'paid', 'archived'),
      })),
      (rows) => {
        const debts = rows.map((r) => makeDebt(r.remaining, r.status));
        const expected = rows.filter((r) => r.status === 'active').reduce((s, r) => s + r.remaining, 0);
        expect(computeTotalLiabilities(debts)).toBe(expected);
      },
    ));
  });

  it('netWorth always equals totalAssets minus totalLiabilities', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ balance: money(), archived: fc.boolean() })),
      fc.array(fc.record({ remaining: money(), status: fc.constantFrom<DebtAccount['status']>('active', 'paid', 'archived') })),
      (a, d) => {
        const accounts = a.map((r) => makeAccount(r.balance, r.archived));
        const debts = d.map((r) => makeDebt(r.remaining, r.status));
        expect(computeNetWorth(accounts, debts)).toBe(
          computeTotalAssets(accounts) - computeTotalLiabilities(debts),
        );
      },
    ));
  });

  it('all-archived accounts and no active debts yield zero net worth', () => {
    const accounts = [makeAccount(500, true), makeAccount(999, true)];
    const debts = [makeDebt(300, 'paid'), makeDebt(100, 'archived')];
    expect(computeNetWorth(accounts, debts)).toBe(0);
  });
});
