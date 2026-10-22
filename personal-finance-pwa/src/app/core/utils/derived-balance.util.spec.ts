// TC-MONEY-03 — Derived balances must replay the record ledger exactly.
// Guards the 2026-07-25 migration off mutable stored balances (family-mode LWW
// drift: +37,909 Cash / +86,056.86 HDFC on the live dataset).
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { AssetAccount, AccountBalanceAdjustment } from '../models/asset-account.model';
import type { DebtAccount, DebtAdjustment, DebtPayment } from '../models/debt-account.model';
import type { ExpenseEntry } from '../models/expense-entry.model';
import {
  computeDerivedBalances,
  computeDerivedOutstandings,
  findBalanceDiscrepancies,
  findCardOutstandingDiscrepancies,
} from './derived-balance.util';

function makeAccount(overrides: Partial<AssetAccount> = {}): AssetAccount {
  return {
    id: 'acct-1', name: 'Cash', type: 'cash', balance: 0, initialBalance: 0,
    allowOverdraft: false, isDefault: false, archived: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
function makeAdjustment(overrides: Partial<AccountBalanceAdjustment> = {}): AccountBalanceAdjustment {
  return {
    id: 'adj-' + Math.random().toString(36).slice(2), accountId: 'acct-1',
    amount: 0, kind: 'increase', createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}
function makeEntry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: 'e-' + Math.random().toString(36).slice(2), date: '2026-01-03', amount: 0,
    type: 'Miscellaneous', limit: 0, savings: 0, timestamp: '2026-01-03T00:00:00.000Z',
    ...overrides,
  } as ExpenseEntry;
}
function makeCashWithdrawal(overrides: Partial<DebtAdjustment> = {}): DebtAdjustment {
  return {
    id: 'da-' + Math.random().toString(36).slice(2), debtId: 'card-1',
    kind: 'cash-withdrawal', amount: 0, date: '2026-01-04',
    createdAt: '2026-01-04T00:00:00.000Z',
    ...overrides,
  };
}
const empty = { accountAdjustments: [], entries: [], debtAdjustments: [] };

describe('computeDerivedBalances', () => {
  it('starts from initialBalance when there are no records', () => {
    const balances = computeDerivedBalances([makeAccount({ initialBalance: 25000 })], empty);
    expect(balances.get('acct-1')).toBe(25000);
  });

  it('replays the live-dataset Cash reconciliation exactly', () => {
    // 25,000 start + 48,000 adjustments − 33,310 linked spends = 39,690
    const balances = computeDerivedBalances([makeAccount({ initialBalance: 25000 })], {
      accountAdjustments: [
        makeAdjustment({ amount: 25000 }),
        makeAdjustment({ amount: 4000 }),
        makeAdjustment({ amount: 19000 }),
      ],
      entries: [makeEntry({ accountId: 'acct-1', amount: 33310 })],
      debtAdjustments: [],
    });
    expect(balances.get('acct-1')).toBe(39690);
  });

  it('applies decrease adjustments, entry deductions, and cash-withdrawal credits per account', () => {
    const balances = computeDerivedBalances(
      [makeAccount({ id: 'a', initialBalance: 100 }), makeAccount({ id: 'b', initialBalance: 50 })],
      {
        accountAdjustments: [makeAdjustment({ accountId: 'a', amount: 30, kind: 'decrease' })],
        entries: [makeEntry({ accountId: 'b', amount: 20 })],
        debtAdjustments: [
          makeCashWithdrawal({ linkedAccountId: 'a', amount: 500 }),
          // refunds/charges never touch asset accounts
          makeCashWithdrawal({ linkedAccountId: 'a', amount: 999, kind: 'refund' }),
        ],
      }
    );
    expect(balances.get('a')).toBe(570); // 100 − 30 + 500
    expect(balances.get('b')).toBe(30);  // 50 − 20
  });

  it('ignores entries with no account link and records pointing at unknown accounts', () => {
    const balances = computeDerivedBalances([makeAccount({ initialBalance: 10 })], {
      accountAdjustments: [makeAdjustment({ accountId: 'ghost', amount: 999 })],
      entries: [makeEntry({ amount: 999 }), makeEntry({ accountId: 'ghost', amount: 999 })],
      debtAdjustments: [makeCashWithdrawal({ linkedAccountId: 'ghost', amount: 999 })],
    });
    expect(balances.get('acct-1')).toBe(10);
  });

  it('property: order of records never changes the result, and totals stay paisa-exact', () => {
    const paise = () => fc.integer({ min: 1, max: 10_000_000 }).map((p) => p / 100);
    fc.assert(fc.property(
      paise(),
      fc.array(fc.record({ amount: paise(), increase: fc.boolean() }), { maxLength: 30 }),
      fc.array(paise(), { maxLength: 30 }),
      (initial, adjRows, entryAmounts) => {
        const account = makeAccount({ initialBalance: initial });
        const adjustments = adjRows.map((r) =>
          makeAdjustment({ amount: r.amount, kind: r.increase ? 'increase' : 'decrease' }));
        const entries = entryAmounts.map((amount) => makeEntry({ accountId: 'acct-1', amount }));
        const records = { accountAdjustments: adjustments, entries, debtAdjustments: [] };
        const shuffled = {
          accountAdjustments: [...adjustments].reverse(),
          entries: [...entries].reverse(),
          debtAdjustments: [],
        };
        const a = computeDerivedBalances([account], records).get('acct-1')!;
        const b = computeDerivedBalances([account], shuffled).get('acct-1')!;
        expect(a).toBe(b);
        const expectedPaise = Math.round(initial * 100)
          + adjRows.reduce((s, r) => s + Math.round(r.amount * 100) * (r.increase ? 1 : -1), 0)
          - entryAmounts.reduce((s, x) => s + Math.round(x * 100), 0);
        expect(Math.round(a * 100)).toBe(expectedPaise);
      }
    ));
  });
});

function makeCard(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'card-1', name: 'Pixel', type: 'credit-card',
    principalAmount: 249000, remainingBalance: 0, creditLimit: 249000,
    startDate: '2026-07-03', status: 'active',
    createdAt: '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}
function makePayment(overrides: Partial<DebtPayment> = {}): DebtPayment {
  return {
    id: 'p-' + Math.random().toString(36).slice(2), debtId: 'card-1',
    expenseId: 'e-x', accountId: 'acct-1', amount: 0, date: '2026-07-20',
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeDerivedOutstandings', () => {
  it('replays the live Pixel card: opening + charges − payment', () => {
    // 52,993.86 + 8,736 − 33,479.86 = 28,250
    const outstandings = computeDerivedOutstandings(
      [makeCard({ openingOutstanding: 52993.86, remainingBalance: 28250 })],
      {
        entries: [
          makeEntry({ debtId: 'card-1', amount: 8736 }),
          // the payment's own linked entry must NOT count as a charge
          makeEntry({ debtId: 'card-1', amount: 33479.86, source: 'debt-payment' } as Partial<ExpenseEntry>),
        ],
        debtPayments: [makePayment({ amount: 33479.86 })],
        debtAdjustments: [],
      }
    );
    expect(outstandings.get('card-1')).toBe(28250);
  });

  it('applies adjustment signs (charge/cash-withdrawal up, refund/cashback down) and floors at 0', () => {
    const records = {
      entries: [],
      debtPayments: [],
      debtAdjustments: [
        makeCashWithdrawal({ debtId: 'card-1', amount: 500 }),
        makeCashWithdrawal({ debtId: 'card-1', amount: 200, kind: 'charge' }),
        makeCashWithdrawal({ debtId: 'card-1', amount: 300, kind: 'refund' }),
        makeCashWithdrawal({ debtId: 'card-1', amount: 1500, kind: 'cashback' }),
      ],
    };
    const outstandings = computeDerivedOutstandings([makeCard({ openingOutstanding: 100 })], records);
    expect(outstandings.get('card-1')).toBe(0); // 100+500+200−300−1500 → floored
  });

  it('skips cards without an opening anchor and non-card debts', () => {
    const outstandings = computeDerivedOutstandings(
      [makeCard(), makeCard({ id: 'loan-1', type: 'personal-loan', openingOutstanding: 5 })],
      { entries: [], debtPayments: [], debtAdjustments: [] }
    );
    expect(outstandings.size).toBe(0);
  });
});

describe('findCardOutstandingDiscrepancies', () => {
  it('reports drift only for anchored cards', () => {
    const card = makeCard({ openingOutstanding: 1000, remainingBalance: 1600 });
    const out = findCardOutstandingDiscrepancies([card, makeCard({ id: 'c2', remainingBalance: 99 })], {
      entries: [makeEntry({ debtId: 'card-1', amount: 100 })],
      debtPayments: [],
      debtAdjustments: [],
    });
    expect(out).toEqual([{ debtId: 'card-1', cardName: 'Pixel', stored: 1600, derived: 1100, drift: 500 }]);
  });
});

describe('findBalanceDiscrepancies', () => {
  it('reports stored-vs-derived drift with direction', () => {
    const account = makeAccount({ balance: 77599, initialBalance: 25000 });
    const discrepancies = findBalanceDiscrepancies([account], {
      accountAdjustments: [makeAdjustment({ amount: 48000 })],
      entries: [makeEntry({ accountId: 'acct-1', amount: 33310 })],
      debtAdjustments: [],
    });
    expect(discrepancies).toEqual([{
      accountId: 'acct-1', accountName: 'Cash',
      stored: 77599, derived: 39690, drift: 37909,
    }]);
  });

  it('is silent when stored matches derived (incl. sub-paisa float noise)', () => {
    const account = makeAccount({ balance: 0.1 + 0.2, initialBalance: 0.3 });
    expect(findBalanceDiscrepancies([account], empty)).toEqual([]);
  });
});
