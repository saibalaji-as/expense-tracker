import { describe, expect, it } from 'vitest';
import {
  cashbackEarned,
  crossedUtilizationThreshold,
  matchRefundCandidates,
  utilizationPercent,
} from './credit-card-insights';
import type { DebtAccount, DebtAdjustment, ExpenseEntry } from '../models';

function card(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'card1',
    name: 'Visa',
    type: 'credit-card',
    principalAmount: 100000,
    remainingBalance: 5000,
    startDate: '2026-01-01',
    status: 'active',
    billGenerationDay: 5,
    paymentDueDay: 25,
    creditLimit: 100000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function entry(id: string, amount: number, date: string, extra: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id, amount, date,
    type: 'Shopping', limit: 0, savings: 0,
    timestamp: `${date}T10:00:00.000Z`,
    debtId: 'card1',
    ...extra,
  } as ExpenseEntry;
}

function adj(id: string, kind: DebtAdjustment['kind'], amount: number, date: string, extra: Partial<DebtAdjustment> = {}): DebtAdjustment {
  return { id, debtId: 'card1', kind, amount, date, createdAt: `${date}T10:00:00.000Z`, ...extra };
}

describe('utilization thresholds', () => {
  it('percent needs a positive creditLimit', () => {
    expect(utilizationPercent(card(), 25000)).toBe(25);
    expect(utilizationPercent(card({ creditLimit: undefined }), 25000)).toBeNull();
  });

  it('fires on upward crossings only, reporting the highest threshold crossed', () => {
    expect(crossedUtilizationThreshold(card(), 20000, 35000)).toBe(30);
    expect(crossedUtilizationThreshold(card(), 20000, 85000)).toBe(80); // jumped both → highest
    expect(crossedUtilizationThreshold(card(), 35000, 40000)).toBeNull(); // already above 30
    expect(crossedUtilizationThreshold(card(), 85000, 90000)).toBeNull(); // already above 80
    expect(crossedUtilizationThreshold(card(), 85000, 20000)).toBeNull(); // paying down never alerts
    expect(crossedUtilizationThreshold(card({ creditLimit: undefined }), 0, 99999)).toBeNull();
  });

  it('re-alerts after paying below and re-crossing', () => {
    expect(crossedUtilizationThreshold(card(), 85000, 20000)).toBeNull(); // pay down
    expect(crossedUtilizationThreshold(card(), 20000, 31000)).toBe(30);   // re-cross
  });
});

describe('matchRefundCandidates', () => {
  const entries = [
    entry('e1', 499, '2026-07-10', { comment: 'Amazon tee' }),
    entry('e2', 499, '2026-06-20'),
    entry('e3', 499, '2026-01-01'),                    // outside 90-day window
    entry('e4', 250, '2026-07-12'),                    // different amount
    entry('e5', 499, '2026-07-11', { debtId: 'card2' }), // different card
    entry('e6', 499, '2026-07-12', { source: 'debt-payment' }),
  ];

  it('matches same card + same amount within 90 days, closest first, max 3', () => {
    const matches = matchRefundCandidates(entries, [], 'card1', 499, '2026-07-16');
    expect(matches.map((m) => m.id)).toEqual(['e1', 'e2']);
  });

  it('excludes purchases already claimed by another refund', () => {
    const adjustments = [adj('a1', 'refund', 499, '2026-07-12', { linkedExpenseId: 'e1' })];
    const matches = matchRefundCandidates(entries, adjustments, 'card1', 499, '2026-07-16');
    expect(matches.map((m) => m.id)).toEqual(['e2']);
  });

  it('returns nothing for zero/invalid amounts', () => {
    expect(matchRefundCandidates(entries, [], 'card1', 0, '2026-07-16')).toEqual([]);
    expect(matchRefundCandidates(entries, [], 'card1', NaN, '2026-07-16')).toEqual([]);
  });
});

describe('cashbackEarned', () => {
  it('sums only cashback adjustments for the card, optionally since a date', () => {
    const adjustments = [
      adj('a1', 'cashback', 50, '2026-07-01'),
      adj('a2', 'cashback', 25, '2026-06-01'),
      adj('a3', 'refund', 500, '2026-07-02'),
      { ...adj('a4', 'cashback', 99, '2026-07-03'), debtId: 'card2' },
    ];
    expect(cashbackEarned(adjustments, 'card1')).toBe(75);
    expect(cashbackEarned(adjustments, 'card1', '2026-07-01')).toBe(50);
  });
});
