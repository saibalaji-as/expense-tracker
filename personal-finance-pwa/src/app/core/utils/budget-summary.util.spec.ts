import { describe, expect, it } from 'vitest';
import { ExpenseEntry } from '../models/expense-entry.model';
import { ExpenseLimit } from '../models/expense-limit.model';
import {
  computeBudgetRuleSummary,
  dailyBudgetAmount,
  dailyTypeLimit,
  monthlyLimitAmount,
} from './budget-summary.util';

const entry = (type: string, amount: number): ExpenseEntry => ({
  id: `${type}-${amount}`,
  date: '2026-10-05',
  amount,
  type,
  limit: 0,
  savings: 0,
  timestamp: '2026-10-05T10:00:00Z',
});

const limits: ExpenseLimit[] = [
  { type: 'Food', recommendedPercentage: 15, userPercentage: 20, category: 'Needs' },
  { type: 'Shopping', recommendedPercentage: 10, userPercentage: 10, category: 'Wants' },
  { type: 'SIP', recommendedPercentage: 10, userPercentage: 15, category: 'Savings' },
];

describe('budget-summary.util', () => {
  it('splits spending into buckets, unknown types count as Buffer', () => {
    const s = computeBudgetRuleSummary(
      [entry('Food', 3000), entry('Food', 1000), entry('Shopping', 2500), entry('Gifts', 500)],
      limits,
      50000,
    );
    expect(s.needsTotal).toBe(4000);
    expect(s.wantsTotal).toBe(2500);
    expect(s.bufferTotal).toBe(500);
    expect(s.savingsTotal).toBe(0);
    expect(s.needsPercentage).toBe(8);
    expect(s.needsTarget).toBe(10000);
    expect(s.wantsTarget).toBe(5000);
    expect(s.savingsTarget).toBe(7500);
    expect(s.bufferTarget).toBe(0);
  });

  it('returns zero percentages without income', () => {
    const s = computeBudgetRuleSummary([entry('Food', 100)], limits, 0);
    expect(s.needsTotal).toBe(100);
    expect(s.needsPercentage).toBe(0);
    expect(s.needsTarget).toBe(0);
  });

  it('daily budget is income / 30 rounded', () => {
    expect(dailyBudgetAmount(50000)).toBe(1667);
    expect(dailyBudgetAmount(0)).toBe(0);
  });

  it('per-type limits use the month length and round up', () => {
    expect(monthlyLimitAmount(limits[0], 50000)).toBe(10000);
    expect(monthlyLimitAmount(undefined, 50000)).toBe(0);
    // October has 31 days: ceil(10000 / 31) = 323
    expect(dailyTypeLimit(limits[0], 50000, new Date(2026, 9, 21))).toBe(323);
    // February 2026 has 28 days: ceil(10000 / 28) = 358
    expect(dailyTypeLimit(limits[0], 50000, new Date(2026, 1, 10))).toBe(358);
  });
});
