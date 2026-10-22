import {
  buildCreditCardReminderPlan,
  creditCardNotificationBase,
  creditCardNotificationIdsForCancel,
  DUE_DAY_REMINDER_HOURS,
} from './credit-card-reminders';
import { CardStatement, DebtAccount, DebtPayment, ExpenseEntry } from '../models';

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
    billGenerationDay: 25,
    paymentDueDay: 15,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const confirmed = (amount: number, extra: Partial<CardStatement> = {}): CardStatement => ({
  billDateStr: '2026-08-25',
  amount,
  source: 'user',
  updatedAt: '2026-08-26T00:00:00Z',
  ...extra,
});

function payment(amount: number, date: string): DebtPayment {
  return { id: `p-${date}`, debtId: 'cc-1', expenseId: `e-${date}`, accountId: 'bank', amount, date, createdAt: `${date}T10:00:00Z` };
}

function charge(amount: number, date: string): ExpenseEntry {
  return { id: `c-${date}`, date, amount, type: 'Shopping', limit: 0, savings: 0, timestamp: `${date}T10:00:00Z`, debtId: 'cc-1', source: 'manual' };
}

const stamp = (d: Date): string =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')} ${`${d.getHours()}`.padStart(2, '0')}:00`;

const plan = (
  cards: DebtAccount[],
  now: string,
  payments: DebtPayment[] = [],
  entries: ExpenseEntry[] = []
) => buildCreditCardReminderPlan(cards, entries, payments, new Date(now), money);

const slot = (items: ReturnType<typeof plan>, offset: number) =>
  items.find((item) => item.id === creditCardNotificationBase('cc-1') + offset);

describe('notification ids', () => {
  it('keeps every card inside the 20000–29599 range with 16 slots', () => {
    for (const id of ['a', 'cc-1', '7b1f0c1e-9d5e-4a53-8f43-0a4b2f1c9e77']) {
      const base = creditCardNotificationBase(id);
      expect(base).toBeGreaterThanOrEqual(20000);
      expect(base + 15).toBeLessThan(29600);
      expect((base - 20000) % 16).toBe(0);
    }
  });

  it('cancels current slots, the previous 8-slot scheme and the legacy repeat id', () => {
    const ids = creditCardNotificationIdsForCancel('cc-1');
    const base = creditCardNotificationBase('cc-1');
    for (let s = 0; s < 16; s++) expect(ids).toContain(base + s);
    expect(ids.some((id) => id >= 10000 && id < 20000)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(17);
  });
});

describe('due reminders', () => {
  it('fires 3, 2 and 1 days before, then at 06:00, 09:00, 12:00 and 18:00 on the due date', () => {
    const items = plan([card({ statement: confirmed(5000) })], '2026-09-01T10:00:00');
    expect([4, 5, 6].map((s) => stamp(slot(items, s)!.at))).toEqual(['2026-09-12 09:00', '2026-09-13 09:00', '2026-09-14 09:00']);
    expect([7, 8, 9, 10].map((s) => stamp(slot(items, s)!.at))).toEqual([
      '2026-09-15 06:00', '2026-09-15 09:00', '2026-09-15 12:00', '2026-09-15 18:00',
    ]);
    expect(DUE_DAY_REMINDER_HOURS).toEqual([6, 9, 12, 18]);
    expect(slot(items, 4)!.body).toContain('₹5000 is due in 3 days');
    expect(slot(items, 6)!.title).toBe('HDFC Card bill due tomorrow');
    expect(slot(items, 7)!.body).toContain('₹5000 is due today');
    expect(stamp(slot(items, 11)!.at)).toBe('2026-09-16 09:00');
  });

  it('keeps reminding with the remaining amount after a part payment', () => {
    const items = plan([card({ remainingBalance: 4900, statement: confirmed(5000) })], '2026-09-03T10:00:00', [payment(100, '2026-09-02')]);
    expect(slot(items, 4)!.body).toContain('₹4900');
    expect(slot(items, 10)).toBeDefined();
    expect(slot(items, 11)).toBeDefined();
  });

  it('stops every due and overdue reminder once the bill is paid in full', () => {
    const items = plan([card({ remainingBalance: 800, statement: confirmed(5000) })], '2026-09-06T10:00:00', [payment(5000, '2026-09-05')], [charge(800, '2026-08-28')]);
    for (const s of [4, 5, 6, 7, 8, 9, 10, 11]) expect(slot(items, s)).toBeUndefined();
    // The unbilled 800 still earns the generic next-cycle safety net.
    expect(stamp(slot(items, 12)!.at)).toBe('2026-10-12 09:00');
  });

  it('only schedules the reminders that are still in the future', () => {
    const items = plan([card({ statement: confirmed(5000) })], '2026-09-15T10:30:00');
    for (const s of [4, 5, 6, 7, 8]) expect(slot(items, s)).toBeUndefined();
    expect([9, 10].map((s) => stamp(slot(items, s)!.at))).toEqual(['2026-09-15 12:00', '2026-09-15 18:00']);
  });

  it("uses the bank's exact due date and the statement minimum due", () => {
    const items = plan([card({ statement: confirmed(5000, { dueDateStr: '2026-09-14', minDue: 250 }) })], '2026-09-01T10:00:00');
    expect(stamp(slot(items, 7)!.at)).toBe('2026-09-14 06:00');
    expect(slot(items, 7)!.body).toContain('Min due ₹250.');
  });

  it('labels an unconfirmed amount as estimated', () => {
    const items = plan([card()], '2026-09-01T10:00:00');
    expect(slot(items, 4)!.body).toContain('₹5000 (estimated — confirm in Spenza)');
  });

  it('reminds on the raw outstanding when no bill day is configured', () => {
    const items = plan([card({ billGenerationDay: undefined })], '2026-09-01T10:00:00');
    expect(slot(items, 7)!.body).toContain('₹5000 outstanding is due today');
    expect(stamp(slot(items, 7)!.at)).toBe('2026-09-15 06:00');
    expect(slot(items, 0)).toBeUndefined();
  });
});

describe('statement asks', () => {
  it('asks on the 3 days after a bill date while the statement is unconfirmed', () => {
    const items = plan([card()], '2026-08-25T10:00:00');
    expect([0, 1, 2].map((s) => stamp(slot(items, s)!.at))).toEqual(['2026-08-26 09:00', '2026-08-27 09:00', '2026-08-28 09:00']);
    expect(slot(items, 0)!.title).toBe('Has your HDFC Card bill been generated?');
  });

  it('stops asking once the statement is confirmed, but keeps the ask for the next bill', () => {
    const items = plan([card({ statement: confirmed(5000) })], '2026-08-26T08:00:00');
    for (const s of [0, 1, 2]) expect(slot(items, s)).toBeUndefined();
    expect(stamp(slot(items, 3)!.at)).toBe('2026-09-26 09:00');
  });

  it('does not ask about a bill that predates the card', () => {
    const items = plan([card({ startDate: '2026-08-27' })], '2026-08-27T08:00:00');
    for (const s of [0, 1, 2]) expect(slot(items, s)).toBeUndefined();
  });
});

describe('plan hygiene', () => {
  it('ignores loans, archived cards and zero-balance cards', () => {
    const items = plan(
      [
        card({ id: 'loan', type: 'personal-loan' }),
        card({ id: 'old', status: 'archived' }),
        card({ id: 'zero', remainingBalance: 0, statement: confirmed(0) }),
      ],
      '2026-09-01T10:00:00'
    );
    expect(items).toEqual([]);
  });

  it('never schedules in the past and never reuses an id', () => {
    const now = new Date('2026-09-13T10:00:00');
    const items = buildCreditCardReminderPlan([card({ statement: confirmed(5000) }), card({ id: 'cc-2', name: 'Axis' })], [], [], now, money);
    expect(items.every((item) => item.at > now)).toBe(true);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});
