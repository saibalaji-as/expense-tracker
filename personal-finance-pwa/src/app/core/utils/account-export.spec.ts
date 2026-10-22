import { AssetAccount, DebtAccount, ExpenseEntry } from '../models';
import { computeDerivedBalances } from './derived-balance.util';
import {
  AccountExportRecords,
  accountExportFileName,
  allAccountsCsv,
  assetAccountCsv,
  assetAccountLedger,
  debtCsv,
  debtLedger,
} from './account-export';

const bank: AssetAccount = {
  id: 'acc-1', name: 'HDFC Savings', type: 'bank', balance: 0, initialBalance: 10000,
  allowOverdraft: false, isDefault: true, archived: false, createdAt: '2026-09-01T04:00:00Z', updatedAt: 'x',
};
const card: DebtAccount = {
  id: 'cc-1', name: 'ICICI Amazon', type: 'credit-card', principalAmount: 0, remainingBalance: 3400,
  startDate: '2026-09-01', status: 'active', openingOutstanding: 1000, createdAt: 'x', updatedAt: 'x',
};
const loan: DebtAccount = {
  id: 'loan-1', name: 'Car loan', type: 'vehicle-loan', principalAmount: 500000, remainingBalance: 480000,
  startDate: '2026-01-01', status: 'active', monthlyEmi: 10000, createdAt: 'x', updatedAt: 'x',
};

const entry = (over: Partial<ExpenseEntry>): ExpenseEntry => ({
  id: 'e', date: '2026-09-05', amount: 0, type: 'Food', limit: 0, savings: 0, timestamp: '2026-09-05T10:00:00Z', ...over,
});

const records: AccountExportRecords = {
  accounts: [bank],
  debts: [card, loan],
  entries: [
    entry({ id: 'e1', date: '2026-09-03', amount: 500, accountId: 'acc-1', comment: 'Lunch, "team"' }),
    entry({ id: 'e2', date: '2026-09-04', amount: 1600, debtId: 'cc-1', type: 'Shopping' }),
    entry({ id: 'e3', date: '2026-09-10', amount: 200, accountId: 'acc-1', debtId: 'cc-1', source: 'debt-payment', type: 'Debt Payment' }),
    entry({ id: 'e4', date: '2026-09-12', amount: 10000, accountId: 'acc-1', debtId: 'loan-1', source: 'debt-payment', type: 'Debt Payment' }),
    entry({ id: 'e5', date: '2026-09-13', amount: 50, accountId: 'acc-1', comment: '=cmd()' }),
  ],
  accountAdjustments: [
    { id: 'a1', accountId: 'acc-1', amount: 3000, kind: 'increase', reason: 'Salary', createdAt: '2026-09-02T05:00:00Z' },
  ],
  debtPayments: [
    { id: 'p1', debtId: 'cc-1', expenseId: 'e3', accountId: 'acc-1', amount: 200, date: '2026-09-10', createdAt: '2026-09-10T05:00:00Z' },
    { id: 'p2', debtId: 'loan-1', expenseId: 'e4', accountId: 'acc-1', amount: 10000, date: '2026-09-12', createdAt: '2026-09-12T05:00:00Z' },
  ],
  debtAdjustments: [
    { id: 'd1', debtId: 'cc-1', kind: 'cash-withdrawal', amount: 1000, date: '2026-09-08', linkedAccountId: 'acc-1', createdAt: '2026-09-08T05:00:00Z' },
    { id: 'd2', debtId: 'cc-1', kind: 'cashback', amount: 0, date: '2026-09-09', createdAt: '2026-09-09T05:00:00Z' },
  ],
};

describe('account export', () => {
  it('asset ledger closes on the derived balance shown in the app', () => {
    const ledger = assetAccountLedger(bank, records);
    const derived = computeDerivedBalances([bank], records).get('acc-1');
    expect(ledger.opening).toBe(10000);
    expect(ledger.closing).toBe(derived);
    expect(ledger.closing).toBe(10000 + 3000 - 500 + 1000 - 200 - 10000 - 50);
    expect(ledger.lines.map((l) => l.date)).toEqual([...ledger.lines.map((l) => l.date)].sort());
    expect(ledger.lines.find((l) => l.type === 'Debt payment')?.description).toBe('Payment to ICICI Amazon');
  });

  it('card ledger runs from the opening anchor to the outstanding', () => {
    const ledger = debtLedger(card, records);
    expect(ledger.opening).toBe(1000);
    expect(ledger.closing).toBe(1000 + 1600 + 1000 - 200);
    expect(ledger.lines.some((l) => l.description.includes('Debt Payment'))).toBe(false);
  });

  it('loan ledger back-solves its opening so it closes on the remaining balance', () => {
    const ledger = debtLedger(loan, records);
    expect(ledger.closing).toBe(480000);
    expect(ledger.opening).toBe(490000);
    expect(ledger.lines).toHaveLength(1);
    expect(ledger.lines[0].description).toBe('Paid from HDFC Savings');
  });

  it('writes Excel-safe CSV with BOM, quoting and formula neutralising', () => {
    const csv = assetAccountCsv(bank, records, 'INR', new Date('2026-10-22T06:00:00Z'));
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Food — Lunch, ""team"""');
    expect(csv).not.toMatch(/,=cmd/);
    expect(csv).toContain('Closing balance,3250.00');
  });

  it('card / loan CSVs and the combined file include every account', () => {
    expect(debtCsv(card, records, 'INR')).toContain('Closing outstanding,3400.00');
    expect(debtCsv(card, records, 'INR')).not.toContain('Outstanding shown in Spenza');
    expect(debtCsv({ ...card, remainingBalance: 2400 }, records, 'INR')).toContain('Outstanding shown in Spenza,2400.00');
    expect(debtCsv(loan, records, 'INR')).toContain('Monthly EMI,10000.00');
    const all = allAccountsCsv(records, 'INR');
    expect(all).toContain('HDFC Savings,Bank account,Balance,3250.00');
    expect(all).toContain('ICICI Amazon,Credit card,Outstanding,3400.00');
    expect(all).toContain('Car loan,Vehicle loan,Outstanding,480000.00');
  });

  it('builds a filesystem-safe file name', () => {
    expect(accountExportFileName('HDFC / Savings ₹', new Date(2026, 9, 22))).toBe('spenza-hdfc-savings-transactions-2026-10-22.csv');
  });
});
