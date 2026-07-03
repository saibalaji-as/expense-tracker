import {
  buildCreditCardReminderPlan,
  creditCardNotificationBase,
  creditCardNotificationIdsForCancel,
  lastOccurrenceOnOrBefore,
  nextOccurrence,
  statementDueAmount,
} from './credit-card-reminders';
import { DebtAccount, DebtPayment, ExpenseEntry } from '../models';

const money = (n: number) => `₹${n}`;

function card(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'cc-1',
    name: 'HDFC Card',
    type: 'credit-card',
    principalAmount: 100000,
    remainingBalance: 5000,
    startDate: '2026-01-01',
    status: 'active',
    billGenerationDay: 20,
    paymentDueDay: 5,
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

describe('credit-card-reminders planner', () => {
  describe('date helpers', () => {
    it('nextOccurrence handles due days 1-3 without rolling into the wrong month (legacy bug)', () => {
      // Legacy code did `new Date(y, m, dueDay - 3)` which for dueDay 2 gave day -1.
      const now = new Date(2026, 6, 15); // 15 Jul 2026
      const due = nextOccurrence(2, now);
      expect(due.getMonth()).toBe(7); // August
      expect(due.getDate()).toBe(2);
    });

    it('nextOccurrence clamps day 31 in short months', () => {
      const now = new Date(2026, 3, 1); // 1 Apr
      const due = nextOccurrence(31, now);
      expect(due.getMonth()).toBe(3);
      expect(due.getDate()).toBe(30);
    });

    it('lastOccurrenceOnOrBefore crosses month boundary backwards', () => {
      const ref = new Date(2026, 6, 3); // 3 Jul, bill day 20 → 20 Jun
      const bill = lastOccurrenceOnOrBefore(20, ref);
      expect(bill.getMonth()).toBe(5);
      expect(bill.getDate()).toBe(20);
    });
  });

  describe('statementDueAmount', () => {
    it('excludes charges made after the bill date', () => {
      const c = card({ remainingBalance: 5000 });
      const entries = [charge(1200, '2026-06-25'), charge(300, '2026-06-10')];
      // Bill 20 Jun: 1200 charged after bill → statement due = 5000 - 1200
      expect(statementDueAmount(c, entries, new Date(2026, 5, 20))).toBe(3800);
    });

    it('excludes debt-payment entries from charges', () => {
      const c = card({ remainingBalance: 5000 });
      const paymentEntry: ExpenseEntry = { ...charge(2000, '2026-06-25'), source: 'debt-payment' };
      expect(statementDueAmount(c, [paymentEntry], new Date(2026, 5, 20))).toBe(5000);
    });

    it('never returns a negative due amount', () => {
      const c = card({ remainingBalance: 100 });
      expect(statementDueAmount(c, [charge(500, '2026-06-25')], new Date(2026, 5, 20))).toBe(0);
    });
  });

  describe('buildCreditCardReminderPlan', () => {
    const now = new Date(2026, 5, 25, 12, 0); // 25 Jun 2026 noon; bill 20 Jun passed; due 5 Jul upcoming

    it('schedules the full ladder with statement amount for an unpaid cycle', () => {
      const plan = buildCreditCardReminderPlan([card()], [], [], now, money);
      const base = creditCardNotificationBase('cc-1');
      const ids = plan.map((p) => p.id);

      expect(ids).toContain(base); // bill-ready (20 Jul)
      expect(ids).toContain(base + 1); // due-3 (2 Jul)
      expect(ids).toContain(base + 2); // due day (5 Jul)
      expect(ids).toContain(base + 3); // overdue (6 Jul)
      expect(ids).toContain(base + 4); // next-cycle safety net

      const dueSoon = plan.find((p) => p.id === base + 1)!;
      expect(dueSoon.at.getDate()).toBe(2);
      expect(dueSoon.at.getMonth()).toBe(6); // July
      expect(dueSoon.body).toContain('₹5000');
    });

    it('suppresses due-day and overdue when a payment exists this cycle', () => {
      const plan = buildCreditCardReminderPlan([card()], [], [payment(5000, '2026-06-22')], now, money);
      const base = creditCardNotificationBase('cc-1');
      const ids = plan.map((p) => p.id);
      expect(ids).not.toContain(base + 2);
      expect(ids).not.toContain(base + 3);
      expect(ids).toContain(base + 1); // gentle due-3 heads-up still allowed
    });

    it('skips due notifications entirely when nothing is due', () => {
      const plan = buildCreditCardReminderPlan(
        [card({ remainingBalance: 0 })], [], [], now, money
      );
      expect(plan.length).toBe(0);
    });

    it('subtracts post-bill charges from the notified amount', () => {
      const plan = buildCreditCardReminderPlan(
        [card()], [charge(1200, '2026-06-24')], [], now, money
      );
      const base = creditCardNotificationBase('cc-1');
      const dueSoon = plan.find((p) => p.id === base + 1)!;
      expect(dueSoon.body).toContain('₹3800');
    });

    it('ignores inactive cards and non-credit-card debts', () => {
      const plan = buildCreditCardReminderPlan(
        [card({ status: 'archived' }), card({ id: 'loan', type: 'personal-loan' })],
        [], [], now, money
      );
      expect(plan.length).toBe(0);
    });

    it('never schedules notifications in the past', () => {
      const plan = buildCreditCardReminderPlan([card()], [], [], now, money);
      expect(plan.every((p) => p.at > now)).toBe(true);
    });

    it('includes the min-due hint when configured', () => {
      const plan = buildCreditCardReminderPlan(
        [card({ minimumPaymentAmount: 250 })], [], [], now, money
      );
      const base = creditCardNotificationBase('cc-1');
      expect(plan.find((p) => p.id === base + 1)!.body).toContain('₹250');
    });

    it('cancel IDs include the legacy monthly-repeat ID range', () => {
      const ids = creditCardNotificationIdsForCancel('cc-1');
      const legacy = ids[0];
      expect(legacy).toBeGreaterThanOrEqual(10000);
      expect(legacy).toBeLessThan(20000);
      expect(ids.length).toBe(9);
      ids.slice(1).forEach((id) => expect(id).toBeGreaterThanOrEqual(20000));
    });
  });
});
