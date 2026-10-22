import {
  addDaysStr,
  cardCycleActivity,
  cardCycleState,
  cardCycleWindows,
  CardRecords,
  dayOfMonthAfter,
  dayOfMonthOnOrBefore,
  isCleanConfirmation,
  outstandingAsOf,
  planStatementConfirmation,
  upsertStatementHistory,
} from './credit-card-cycle';
import { computeDerivedOutstandings } from './derived-balance.util';
import { CardStatement, DebtAccount, DebtAdjustment, DebtPayment, ExpenseEntry } from '../models';

/**
 * A tiny ledger that mirrors the store: the outstanding is re-derived from the
 * records after every mutation, exactly like normalizeCardOutstandings does.
 */
class Ledger {
  card: DebtAccount = {
    id: 'cc-1',
    name: 'HDFC Card',
    type: 'credit-card',
    principalAmount: 100000,
    remainingBalance: 20000,
    openingOutstanding: 20000,
    startDate: '2026-08-10',
    status: 'active',
    billGenerationDay: 25,
    paymentDueDay: 15,
    createdAt: '2026-08-10T00:00:00Z',
    updatedAt: '2026-08-10T00:00:00Z',
  };
  entries: ExpenseEntry[] = [];
  payments: DebtPayment[] = [];
  adjustments: DebtAdjustment[] = [];
  private seq = 0;

  constructor(overrides: Partial<DebtAccount> = {}) {
    this.card = { ...this.card, ...overrides };
  }

  get records(): CardRecords {
    return { entries: this.entries, adjustments: this.adjustments, payments: this.payments };
  }

  private settle(): void {
    const derived = computeDerivedOutstandings([this.card], {
      entries: this.entries,
      debtPayments: this.payments,
      debtAdjustments: this.adjustments,
    }).get(this.card.id);
    this.card = { ...this.card, remainingBalance: derived ?? this.card.remainingBalance };
  }

  spend(date: string, amount: number): void {
    this.entries.push({
      id: `e${++this.seq}`, date, amount, type: 'Shopping', limit: 0, savings: 0,
      timestamp: `${date}T10:00:00Z`, debtId: this.card.id, source: 'manual',
    });
    this.settle();
  }

  pay(date: string, amount: number): void {
    const expenseId = `e${++this.seq}`;
    this.entries.push({
      id: expenseId, date, amount, type: 'Debt Payment', limit: 0, savings: 0,
      timestamp: `${date}T10:00:00Z`, accountId: 'bank', debtId: this.card.id, source: 'debt-payment',
    });
    this.payments.push({
      id: `p${this.seq}`, debtId: this.card.id, expenseId, accountId: 'bank', amount, date, createdAt: `${date}T10:00:00Z`,
    });
    this.settle();
  }

  adjust(date: string, kind: DebtAdjustment['kind'], amount: number): void {
    this.adjustments.push({
      id: `a${++this.seq}`, debtId: this.card.id, kind, amount, date, createdAt: `${date}T10:00:00Z`,
    });
    this.settle();
  }

  /** Mirrors ExpenseStore.confirmCardStatement for a plan that needs no extra adjustment. */
  confirm(now: string, amount: number, source: CardStatement['source'] = 'user'): void {
    const plan = planStatementConfirmation(this.card, this.records, new Date(now), amount)!;
    if (plan.shortfall > 0) this.adjust(plan.billDateStr, 'charge', plan.shortfall);
    const statement: CardStatement = {
      billDateStr: plan.billDateStr,
      amount: plan.statementAmount,
      paymentsFromStr: plan.paymentsFromStr,
      source,
      updatedAt: new Date(now).toISOString(),
    };
    this.card = { ...this.card, statement, statementHistory: upsertStatementHistory(this.card, statement) };
  }

  state(now: string) {
    return cardCycleState(this.card, this.records, new Date(now));
  }
}

const reconciles = (state: ReturnType<Ledger['state']>): void => {
  expect(Number((state.billDue + state.unbilledSpend).toFixed(2))).toBe(state.totalOutstanding);
};

describe('date helpers', () => {
  it('finds the bill date on or before today, regardless of the time of day', () => {
    expect(dayOfMonthOnOrBefore(25, '2026-08-25')).toBe('2026-08-25');
    expect(dayOfMonthOnOrBefore(25, '2026-08-24')).toBe('2026-07-25');
    expect(dayOfMonthOnOrBefore(25, '2026-01-03')).toBe('2025-12-25');
  });

  it('clamps day 31 to short months', () => {
    expect(dayOfMonthOnOrBefore(31, '2026-03-01')).toBe('2026-02-28');
    expect(dayOfMonthAfter(31, '2026-01-31')).toBe('2026-02-28');
    expect(dayOfMonthAfter(31, '2026-02-28')).toBe('2026-03-31');
  });

  it('finds the next occurrence strictly after a date', () => {
    expect(dayOfMonthAfter(15, '2026-08-25')).toBe('2026-09-15');
    expect(dayOfMonthAfter(15, '2026-08-15')).toBe('2026-09-15');
    expect(dayOfMonthAfter(15, '2026-08-14')).toBe('2026-08-15');
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('cardCycleState — the three numbers always reconcile', () => {
  it('treats the opening outstanding as billed and never asks about a bill that predates the card', () => {
    const ledger = new Ledger();
    const state = ledger.state('2026-08-10T10:00');
    expect(state.status).toBe('estimated');
    expect(state.needsStatement).toBe(false);
    expect(state.billDateStr).toBe('2026-07-25');
    expect(state.dueDateStr).toBe('2026-08-15');
    expect(state.totalOutstanding).toBe(20000);
    expect(state.billDue).toBe(20000);
    expect(state.unbilledSpend).toBe(0);
  });

  it('records new spends as unbilled and pays the bill without touching them', () => {
    const ledger = new Ledger();
    ledger.spend('2026-08-12', 3000);
    let state = ledger.state('2026-08-12T10:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend]).toEqual([23000, 20000, 3000]);

    ledger.pay('2026-08-14', 20000);
    state = ledger.state('2026-08-14T10:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend]).toEqual([3000, 0, 3000]);
  });

  it('goes "statement pending" on the bill date instead of freezing a guess', () => {
    const ledger = new Ledger();
    ledger.spend('2026-08-12', 3000);
    ledger.pay('2026-08-14', 20000);
    ledger.spend('2026-08-20', 2000);

    const morning = ledger.state('2026-08-25T06:00');
    expect(morning.status).toBe('pending');
    expect(morning.needsStatement).toBe(true);
    expect(morning.billDateStr).toBe('2026-08-25');
    expect([morning.totalOutstanding, morning.billDue, morning.unbilledSpend]).toEqual([5000, 5000, 0]);

    // A bill-day spend joins the running estimate — nothing is lost.
    ledger.spend('2026-08-25', 800);
    const evening = ledger.state('2026-08-25T18:00');
    expect(evening.status).toBe('pending');
    expect([evening.totalOutstanding, evening.statementAmount, evening.billDue, evening.unbilledSpend]).toEqual([5800, 5800, 5800, 0]);
    reconciles(evening);
  });

  it('splits by the bank truth on confirmation: bill 20,300 of 20,500 → 200 unbilled', () => {
    const ledger = new Ledger({ remainingBalance: 20300, openingOutstanding: 20300, startDate: '2026-07-01' });
    ledger.spend('2026-08-25', 200); // bill-day spend the bank did NOT include
    expect(ledger.state('2026-08-25T20:00').statementAmount).toBe(20500);

    const plan = planStatementConfirmation(ledger.card, ledger.records, new Date('2026-08-26T09:00'), 20300)!;
    expect(isCleanConfirmation(plan)).toBe(true);
    expect([plan.billDue, plan.unbilledSpend]).toEqual([20300, 200]);

    ledger.confirm('2026-08-26T09:00', 20300, 'sms');
    const state = ledger.state('2026-08-26T09:00');
    expect(state.status).toBe('confirmed');
    expect(state.needsStatement).toBe(false);
    expect([state.totalOutstanding, state.statementAmount, state.billDue, state.unbilledSpend]).toEqual([20500, 20300, 20300, 200]);
  });

  it('keeps reconciling through late entries, edits and overpayment after confirmation', () => {
    const ledger = new Ledger();
    ledger.spend('2026-08-12', 3000);
    ledger.pay('2026-08-14', 20000);
    ledger.spend('2026-08-20', 2000);
    ledger.spend('2026-08-25', 800);
    ledger.confirm('2026-08-26T09:00', 5000); // bank billed 5,000 → the 800 is unbilled
    ledger.spend('2026-08-27', 1500);
    let state = ledger.state('2026-08-27T10:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend]).toEqual([7300, 5000, 2300]);

    // A forgotten pre-bill spend logged later cannot change the bank's bill.
    ledger.spend('2026-08-22', 1000);
    state = ledger.state('2026-08-28T10:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend]).toEqual([8300, 5000, 3300]);

    // Part payment: bill due drops, unbilled untouched.
    ledger.pay('2026-09-05', 2000);
    state = ledger.state('2026-09-05T10:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend, state.paidTowardsBill]).toEqual([6300, 3000, 3300, 2000]);

    // Paying everything clears bill due AND unbilled — nothing is left over.
    ledger.pay('2026-09-10', 6300);
    state = ledger.state('2026-09-10T10:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend]).toEqual([0, 0, 0]);
  });

  it('carries an unpaid bill into the next statement estimate', () => {
    const ledger = new Ledger({ startDate: '2026-07-01' });
    ledger.confirm('2026-08-01T09:00', 20000);
    ledger.pay('2026-08-10', 5000);
    ledger.spend('2026-08-20', 1000);
    const state = ledger.state('2026-08-25T09:00');
    expect(state.status).toBe('pending');
    expect([state.totalOutstanding, state.statementAmount, state.billDue]).toEqual([16000, 16000, 16000]);
  });

  it('uses the bank due date when the statement carries one', () => {
    const ledger = new Ledger({ startDate: '2026-07-01' });
    ledger.confirm('2026-08-26T09:00', 20000);
    ledger.card = {
      ...ledger.card,
      statementHistory: [{ ...ledger.card.statementHistory![0], dueDateStr: '2026-09-14', minDue: 1000 }],
      statement: undefined,
    };
    const state = ledger.state('2026-08-27T09:00');
    expect(state.dueDateStr).toBe('2026-09-14');
    expect(state.minDue).toBe(1000);
  });

  it('ignores legacy auto-derived snapshots but honours legacy user-confirmed ones', () => {
    const base = new Ledger({ startDate: '2026-07-01' });
    base.card = { ...base.card, statement: { billDateStr: '2026-08-25', amount: 999, source: 'derived', updatedAt: 'x' } };
    expect(base.state('2026-08-26T09:00').status).toBe('pending');
    expect(base.state('2026-08-26T09:00').statementAmount).toBe(20000);

    base.card = { ...base.card, statement: { billDateStr: '2026-08-25', amount: 18000, source: 'user', updatedAt: 'x' } };
    const state = base.state('2026-08-26T09:00');
    expect(state.status).toBe('confirmed');
    expect([state.billDue, state.unbilledSpend]).toEqual([18000, 2000]);
  });

  it('does not ask for a statement on a zero-balance card', () => {
    const ledger = new Ledger({ remainingBalance: 0, openingOutstanding: 0, startDate: '2026-07-01' });
    const state = ledger.state('2026-08-26T09:00');
    expect(state.status).toBe('pending');
    expect(state.needsStatement).toBe(false);
  });

  it('treats the whole outstanding as due when no bill day is configured', () => {
    const ledger = new Ledger({ billGenerationDay: undefined });
    const state = ledger.state('2026-08-16T09:00');
    expect(state.status).toBe('none');
    expect([state.billDue, state.unbilledSpend]).toEqual([20000, 0]);
    expect(state.dueDateStr).toBe('2026-09-15');
  });
});

describe('planStatementConfirmation', () => {
  it('flags a bank bill higher than everything recorded as a shortfall', () => {
    const ledger = new Ledger({ startDate: '2026-07-01' });
    const plan = planStatementConfirmation(ledger.card, ledger.records, new Date('2026-08-26T09:00'), 20450)!;
    expect(plan.shortfall).toBe(450);
    expect(isCleanConfirmation(plan)).toBe(false);

    ledger.confirm('2026-08-26T09:00', 20450); // posts the 450 as a charge
    const state = ledger.state('2026-08-26T09:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend]).toEqual([20450, 20450, 0]);
  });

  it('flags a total that the bank bill and logged spends cannot explain', () => {
    const ledger = new Ledger({ startDate: '2026-07-01' });
    ledger.spend('2026-08-26', 300);
    const plan = planStatementConfirmation(ledger.card, ledger.records, new Date('2026-08-27T09:00'), 15000)!;
    expect(plan.spendSinceBillDate).toBe(300);
    expect(plan.unbilledSpend).toBe(5300);
    expect(plan.unexplainedCarry).toBe(5000);
    expect(isCleanConfirmation(plan)).toBe(false);
  });

  it('counts a bill-day payment against the bill only when the numbers say it came after generation', () => {
    // Paid BEFORE generation: the bank amount is already net of the payment.
    const before = new Ledger({ startDate: '2026-07-01' });
    before.pay('2026-08-25', 5000);
    const netPlan = planStatementConfirmation(before.card, before.records, new Date('2026-08-26T09:00'), 15000)!;
    expect(netPlan.paymentsFromStr).toBe('2026-08-26');
    expect([netPlan.billDue, netPlan.unbilledSpend]).toEqual([15000, 0]);
    expect(isCleanConfirmation(netPlan)).toBe(true);

    // Paid AFTER generation: the bank amount still includes it.
    const after = new Ledger({ startDate: '2026-07-01' });
    after.pay('2026-08-25', 5000);
    const grossPlan = planStatementConfirmation(after.card, after.records, new Date('2026-08-26T09:00'), 20000)!;
    expect(grossPlan.paymentsFromStr).toBe('2026-08-25');
    expect([grossPlan.billDue, grossPlan.unbilledSpend, grossPlan.paidTowardsBill]).toEqual([15000, 0, 5000]);
    expect(isCleanConfirmation(grossPlan)).toBe(true);
  });

  it('subtracts payments made between the bill date and the confirmation', () => {
    const ledger = new Ledger({ startDate: '2026-07-01' });
    ledger.pay('2026-08-27', 8000);
    ledger.confirm('2026-08-28T09:00', 20000);
    const state = ledger.state('2026-08-28T09:00');
    expect([state.totalOutstanding, state.billDue, state.unbilledSpend, state.paidTowardsBill]).toEqual([12000, 12000, 0, 8000]);
  });

  it('returns null without a bill day', () => {
    const ledger = new Ledger({ billGenerationDay: undefined });
    expect(planStatementConfirmation(ledger.card, ledger.records, new Date('2026-08-26T09:00'), 100)).toBeNull();
  });
});

describe('cycle windows and activity', () => {
  it('lists the open window then closed statement windows back to the card start', () => {
    const ledger = new Ledger({ startDate: '2026-06-10' });
    const windows = cardCycleWindows(ledger.card, new Date('2026-09-02T10:00'));
    expect(windows.map((w) => [w.billDateStr, w.fromStr, w.toStr])).toEqual([
      [null, '2026-08-26', '2026-09-02'],
      ['2026-08-25', '2026-07-26', '2026-08-25'],
      ['2026-07-25', '2026-06-26', '2026-07-25'],
      ['2026-06-25', '2026-05-26', '2026-06-25'],
    ]);
  });

  it('has no open window on the bill date itself', () => {
    const ledger = new Ledger({ startDate: '2026-08-01' });
    const windows = cardCycleWindows(ledger.card, new Date('2026-08-25T10:00'));
    expect(windows[0].billDateStr).toBe('2026-08-25');
  });

  it('summarises a window so that opening + activity = closing', () => {
    const ledger = new Ledger({ startDate: '2026-07-01' });
    ledger.spend('2026-08-01', 1200);
    ledger.adjust('2026-08-03', 'refund', 200);
    ledger.adjust('2026-08-05', 'charge', 50);
    ledger.pay('2026-08-14', 20000);
    ledger.spend('2026-08-27', 999); // next window
    const window = cardCycleWindows(ledger.card, new Date('2026-08-28T10:00'))[1];
    const activity = cardCycleActivity(ledger.card, ledger.records, window);
    expect(activity.openingBalance).toBe(20000);
    expect(activity.lines.map((line) => line.kind)).toEqual(['purchase', 'refund', 'charge', 'payment']);
    expect([activity.totalPurchases, activity.totalOtherDebits, activity.totalCredits, activity.totalPayments]).toEqual([1200, 50, 200, 20000]);
    expect(activity.closingBalance).toBe(1050);
    expect(activity.closingBalance).toBe(outstandingAsOf(ledger.card, ledger.records, '2026-08-25'));
  });
});

describe('expense reporting', () => {
  it('drops card bill payments but keeps purchases and loan repayments', async () => {
    const { expenseOnlyEntries } = await import('./credit-card-cycle');
    const ledger = new Ledger();
    ledger.spend('2026-08-12', 3000);
    ledger.pay('2026-08-14', 20000);
    const loan: DebtAccount = { ...ledger.card, id: 'loan-1', type: 'personal-loan' };
    const emi: ExpenseEntry = {
      id: 'emi', date: '2026-08-05', amount: 9000, type: 'Debt Payment', limit: 0, savings: 0,
      timestamp: 'x', accountId: 'bank', debtId: 'loan-1', source: 'debt-payment',
    };
    const result = expenseOnlyEntries([...ledger.entries, emi], [ledger.card, loan]);
    expect(result.map((entry) => entry.amount)).toEqual([3000, 9000]);
  });

  it('returns the same array when there is nothing to drop', async () => {
    const { expenseOnlyEntries } = await import('./credit-card-cycle');
    const ledger = new Ledger();
    ledger.spend('2026-08-12', 3000);
    expect(expenseOnlyEntries(ledger.entries, [ledger.card])).toBe(ledger.entries);
  });
});

describe('resolveDetectionCard', () => {
  it('matches by last-4, falls back to the only card, and refuses to guess', async () => {
    const { resolveDetectionCard } = await import('./credit-card-cycle');
    const a: DebtAccount = { ...new Ledger().card, id: 'a', cardLast4: '1111' };
    const b: DebtAccount = { ...new Ledger().card, id: 'b', cardLast4: '2222' };
    const plain: DebtAccount = { ...new Ledger().card, id: 'c' };
    expect(resolveDetectionCard([a, b], { cardLast4: '2222' })?.id).toBe('b');
    expect(resolveDetectionCard([a, b], { cardLast4: '9999' })).toBeNull();
    expect(resolveDetectionCard([a, b], {})).toBeNull();
    expect(resolveDetectionCard([a], {})?.id).toBe('a');
    expect(resolveDetectionCard([a, plain], { cardLast4: '9999' })?.id).toBe('c');
    expect(resolveDetectionCard([a, b], { debtId: 'a', cardLast4: '2222' })?.id).toBe('a');
    expect(resolveDetectionCard([{ ...a, status: 'archived' }], {})).toBeNull();
  });
});
