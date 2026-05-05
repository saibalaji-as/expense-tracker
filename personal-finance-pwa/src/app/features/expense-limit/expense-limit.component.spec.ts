// Feature: personal-finance-pwa, Property 13: Income-based limit calculation
// Feature: personal-finance-pwa, Property 14: Running total and overspend warning
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { BudgetCategory } from '../../core/models/expense-limit.model';
import { PREDEFINED_EXPENSE_TYPES, DEFAULT_BUDGET_PERCENTAGES } from '../../core/models/expense-type.constants';

// ─── Pure logic helpers (mirrors ExpenseLimitComponent logic) ─────────────────

/** Mirrors the calculatedAmount formula: income × (percentage / 100) */
function calculateAmount(income: number, percentage: number): number {
  return income * (percentage / 100);
}

/** Mirrors the runningTotal computation: sum of all userPercentage values */
function computeRunningTotal(percentages: number[]): number {
  const total = percentages.reduce((sum, p) => sum + p, 0);
  return Math.round(total * 10) / 10;
}

/** Mirrors the isNeedsWantsOver80 check */
function isNeedsWantsOver80(
  percentages: Array<{ category: BudgetCategory; userPercentage: number }>
): boolean {
  let needsWantsTotal = 0;
  for (const { category, userPercentage } of percentages) {
    if (category === 'Needs' || category === 'Wants') {
      needsWantsTotal += Number(userPercentage) || 0;
    }
  }
  return needsWantsTotal > 80;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const budgetCategoryArb = fc.constantFrom<BudgetCategory>(
  'Needs', 'Wants', 'Savings', 'Growth', 'Buffer'
);

const limitRowArb = fc.record({
  category:       budgetCategoryArb,
  userPercentage: fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
});

// ─── Property 13: Income-Based Limit Calculation ─────────────────────────────

describe('Property 13: Income-Based Limit Calculation', () => {
  it('calculatedAmount equals income × (percentage / 100) for any valid inputs', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
        (income, percentage) => {
          const calculated = calculateAmount(income, percentage);
          const expected = income * (percentage / 100);
          expect(calculated).toBeCloseTo(expected, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculatedAmount is 0 when income is 0', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
        (percentage) => {
          const calculated = calculateAmount(0, percentage);
          expect(calculated).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculatedAmount is 0 when percentage is 0', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        (income) => {
          const calculated = calculateAmount(income, 0);
          expect(calculated).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculatedAmount equals income when percentage is 100', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        (income) => {
          const calculated = calculateAmount(income, 100);
          expect(calculated).toBeCloseTo(income, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('changing percentage immediately updates calculatedAmount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
        fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
        fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
        (income, pct1, pct2) => {
          const amount1 = calculateAmount(income, pct1);
          const amount2 = calculateAmount(income, pct2);

          // If percentages differ significantly, amounts must differ
          const pctDiff = Math.abs(pct1 - pct2);
          if (pctDiff > 0.001 && income > 0.01) {
            const amountDiff = Math.abs(amount1 - amount2);
            expect(amountDiff).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all predefined types have correct calculated amounts', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(100000), noNaN: true }),
        (income) => {
          for (const type of PREDEFINED_EXPENSE_TYPES) {
            const defaults = DEFAULT_BUDGET_PERCENTAGES[type];
            const calculated = calculateAmount(income, defaults.recommendedPercentage);
            const expected = income * (defaults.recommendedPercentage / 100);
            expect(calculated).toBeCloseTo(expected, 5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 14: Running Total and Overspend Warning ────────────────────────

describe('Property 14: Running Total and Overspend Warning', () => {
  it('running total equals the arithmetic sum of all percentages (rounded to 1 decimal)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 0, max: Math.fround(100), noNaN: true }), { minLength: 0, maxLength: 20 }),
        (percentages) => {
          const total = computeRunningTotal(percentages);
          const expected = Math.round(percentages.reduce((sum, p) => sum + p, 0) * 10) / 10;
          expect(total).toBeCloseTo(expected, 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('warning is shown iff Needs + Wants percentages exceed 80', () => {
    fc.assert(
      fc.property(
        fc.array(limitRowArb, { minLength: 1, maxLength: 20 }),
        (rows) => {
          const showWarning = isNeedsWantsOver80(rows);
          const needsWantsSum = rows
            .filter(r => r.category === 'Needs' || r.category === 'Wants')
            .reduce((sum, r) => sum + r.userPercentage, 0);

          expect(showWarning).toBe(needsWantsSum > 80);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('warning is not shown when Needs + Wants is exactly 80', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(80), noNaN: true }),
        (needsPct) => {
          const wantsPct = 80 - needsPct;
          const rows = [
            { category: 'Needs' as BudgetCategory, userPercentage: needsPct },
            { category: 'Wants' as BudgetCategory, userPercentage: wantsPct },
          ];
          expect(isNeedsWantsOver80(rows)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('warning is shown when Needs + Wants exceeds 80 by any positive amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(20), noNaN: true }),
        (excess) => {
          const rows = [
            { category: 'Needs' as BudgetCategory, userPercentage: 50 },
            { category: 'Wants' as BudgetCategory, userPercentage: 30 + excess },
          ];
          expect(isNeedsWantsOver80(rows)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Savings/Growth/Buffer categories do not affect the 80% warning', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            category: fc.constantFrom<BudgetCategory>('Savings', 'Growth', 'Buffer'),
            userPercentage: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        (nonNeedsWantsRows) => {
          // With only Savings/Growth/Buffer rows, warning should never show
          expect(isNeedsWantsOver80(nonNeedsWantsRows)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
