import {
  deriveStatementAmount,
  latestBillDate,
  pendingDerivedStatement,
  statementIsCurrent,
  statementRemainingDue,
} from './credit-card-statement';
import { CardStatement, DebtAccount, DebtAdjustment, DebtPayment, ExpenseEntry } from '../models';

function card(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'cc-1',
    name: 'HDFC Card',
    type: 'credit-card',
    principalAmount: 100000,
    remainingBalance: 5000,
    startDate: '2026-01-01',
    status: 'active',
    billGenerationDay: 3,
    paymentDueDay: 22,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function charge(amount: number, date: string): ExpenseEntry {
  return {
    id: `e-${date}-${amount}`,
    date,
    amount,
    type: 'Miscellaneous',
    limit: 0,
    savings: 0,
    timestamp: `${date}T10:00:00Z`,
    debtId: 'cc-1',
    source: 'widget',
  };
}

function payment(amount: number, date: string): DebtPayment {
  return {
    id: `p-${date}`,
    debtId: 'cc-1',
    expenseId: `pe-${date}`,
    accountId: 'acc-1',
    amount,
    date,
    createdAt: `${date}T10:00:00Z`,
  };
}

function adjustment(kind: DebtAdjustment['kind'], amount: number, date: string): DebtAdjustment {
  return { id: `a-${kind}-${date}`, debtId: 'cc-1', kind, amount, date, createdAt: `${date}T10:00:00Z` };
}

const billDate = new Date(2026, 6, 3); // 3 Jul 2026
const now = new Date(2026, 6, 19, 12, 0); // 19 Jul 2026

describe('credit-card-statement', () => {
  describe('latestBillDate', () => {
    it('resolves the most recent bill day on or before now', () => {
      const bill = latestBillDate(card(), now)!;
      expect(bill.getMonth()).toBe(6);
      expect(bill.getDate()).toBe(3);
    });

    it('returns null without a billGenerationDay', () => {
      expect(latestBillDate(card({ billGenerationDay: undefined }), now)).toBeNull();
    });
  });

  describe('deriveStatementAmount', () => {
    it('reconstructs the outstanding as of the bill date', () => {
      // Outstanding 5000 today = statement + 1500 post-bill purchases − 1000 post-bill payment
      const c = card({ remainingBalance: 5000 });
      const entries = [charge(1500, '2026-07-10'), charge(700, '2026-07-01')];
      const payments = [payment(1000, '2026-07-08')];
      // 5000 − 1500 + 1000 = 4500 (the 700 pre-bill charge is already in the statement)
      expect(deriveStatementAmount(c, entries, [], payments, billDate)).toBe(4500);
    });

    it('nets post-bill adjustments: fees/cash up, refunds/cashback down', () => {
      const c = card({ remainingBalance: 5000 });
      const adjustments = [
        adjustment('charge', 300, '2026-07-05'),
        adjustment('cash-withdrawal', 1000, '2026-07-06'),
        adjustment('refund', 200, '2026-07-07'),
        adjustment('cashback', 50, '2026-07-08'),
      ];
      // 5000 − 300 − 1000 + 200 + 50 = 3950
      expect(deriveStatementAmount(c, [], adjustments, [], billDate)).toBe(3950);
    });

    it('treats bill-day activity as part of the statement', () => {
      const c = card({ remainingBalance: 5000 });
      expect(deriveStatementAmount(c, [charge(900, '2026-07-03')], [], [], billDate)).toBe(5000);
    });

    it('never goes negative', () => {
      const c = card({ remainingBalance: 100 });
      expect(deriveStatementAmount(c, [charge(500, '2026-07-10')], [], [], billDate)).toBe(0);
    });
  });

  describe('statementRemainingDue', () => {
    const statement: CardStatement = {
      billDateStr: '2026-07-03',
      amount: 15000,
      source: 'user',
      updatedAt: '2026-07-03T10:00:00Z',
    };

    it('subtracts only payments made after the bill date', () => {
      const payments = [payment(5000, '2026-07-10'), payment(2000, '2026-07-02')];
      expect(statementRemainingDue(statement, payments, 'cc-1')).toBe(10000);
    });

    it('clamps at zero when overpaid', () => {
      expect(statementRemainingDue(statement, [payment(20000, '2026-07-10')], 'cc-1')).toBe(0);
    });

    it('ignores other cards’ payments', () => {
      const other = { ...payment(5000, '2026-07-10'), debtId: 'cc-2' };
      expect(statementRemainingDue(statement, [other], 'cc-1')).toBe(15000);
    });
  });

  describe('statementIsCurrent', () => {
    it('is true only for a snapshot matching the latest bill date', () => {
      const current: CardStatement = { billDateStr: '2026-07-03', amount: 1, source: 'derived', updatedAt: '' };
      const stale: CardStatement = { billDateStr: '2026-06-03', amount: 1, source: 'user', updatedAt: '' };
      expect(statementIsCurrent(card(), current, now)).toBe(true);
      expect(statementIsCurrent(card(), stale, now)).toBe(false);
      expect(statementIsCurrent(card(), undefined, now)).toBe(false);
      expect(statementIsCurrent(card({ billGenerationDay: undefined }), current, now)).toBe(false);
    });
  });

  describe('pendingDerivedStatement', () => {
    it('derives a snapshot when none covers the latest bill', () => {
      const snapshot = pendingDerivedStatement(card(), [charge(1500, '2026-07-10')], [], [], now)!;
      expect(snapshot.billDateStr).toBe('2026-07-03');
      expect(snapshot.amount).toBe(3500);
      expect(snapshot.source).toBe('derived');
    });

    it('replaces a previous cycle’s snapshot when a new bill generates', () => {
      const c = card({
        statement: { billDateStr: '2026-06-03', amount: 999, source: 'user', updatedAt: '' },
      });
      const snapshot = pendingDerivedStatement(c, [], [], [], now)!;
      expect(snapshot.billDateStr).toBe('2026-07-03');
      expect(snapshot.source).toBe('derived');
    });

    it('is a no-op when the snapshot already covers the latest bill (even if user-confirmed)', () => {
      const c = card({
        statement: { billDateStr: '2026-07-03', amount: 15000, source: 'user', updatedAt: '' },
      });
      expect(pendingDerivedStatement(c, [], [], [], now)).toBeNull();
    });

    it('skips non-cards, inactive cards, and cards without a bill day', () => {
      expect(pendingDerivedStatement(card({ type: 'personal-loan' }), [], [], [], now)).toBeNull();
      expect(pendingDerivedStatement(card({ status: 'archived' }), [], [], [], now)).toBeNull();
      expect(pendingDerivedStatement(card({ billGenerationDay: undefined }), [], [], [], now)).toBeNull();
    });
  });
});
