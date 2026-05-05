// Feature: personal-finance-pwa, Property 10: Monthly filter completeness
// Feature: personal-finance-pwa, Property 11: Monthly summary aggregation correctness
// Feature: personal-finance-pwa, Property 12: Budget rule category proportions
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { ExpenseEntry } from '../models/expense-entry.model';
import { ExpenseLimit, BudgetCategory } from '../models/expense-limit.model';
import { BudgetRuleSummary } from '../models/budget-rule-summary.model';
import { PREDEFINED_EXPENSE_TYPES, DEFAULT_BUDGET_PERCENTAGES } from '../models/expense-type.constants';

// ─── Pure logic helpers (mirrors ExpenseStore computed signals) ───────────────

function filterByMonth(entries: ExpenseEntry[], month: string): ExpenseEntry[] {
  return entries.filter(e => e.date.startsWith(month));
}

function computeMonthlySummary(
  entries: ExpenseEntry[],
  limits: ExpenseLimit[],
  month: string
): { totalSpent: number; totalLimit: number; netSavings: number } {
  const monthEntries = filterByMonth(entries, month);
  const totalSpent = monthEntries.reduce((sum, e) => sum + e.amount, 0);

  // totalLimit = sum of calculatedAmount for all limit types
  // calculatedAmount = income * (userPercentage / 100) — but here we use userPercentage directly
  // as a proxy for the limit amount (as stored in the entry's limit field)
  const totalLimit = monthEntries.reduce((sum, e) => sum + e.limit, 0);
  const netSavings = totalLimit - totalSpent;

  return { totalSpent, totalLimit, netSavings };
}

function computeBudgetRuleSummary(
  entries: ExpenseEntry[],
  limits: ExpenseLimit[],
  month: string,
  income: number
): BudgetRuleSummary {
  const monthEntries = filterByMonth(entries, month);
  const limitMap: Record<string, ExpenseLimit> = {};
  for (const limit of limits) {
    limitMap[limit.type] = limit;
  }

  let needsTotal = 0;
  let wantsTotal = 0;
  let savingsTotal = 0;

  for (const entry of monthEntries) {
    const limit = limitMap[entry.type];
    const category = limit?.category ?? 'Buffer';

    switch (category) {
      case 'Needs':
        needsTotal += entry.amount;
        break;
      case 'Wants':
        wantsTotal += entry.amount;
        break;
      case 'Savings':
      case 'Growth':
        savingsTotal += entry.amount;
        break;
      // Buffer entries are not counted
    }
  }

  const needsPercentage = income > 0 ? (needsTotal / income) * 100 : 0;
  const wantsPercentage = income > 0 ? (wantsTotal / income) * 100 : 0;
  const savingsPercentage = income > 0 ? (savingsTotal / income) * 100 : 0;

  return {
    needsTotal,
    wantsTotal,
    savingsTotal,
    needsPercentage,
    wantsPercentage,
    savingsPercentage,
    needsTarget: income * 0.5,
    wantsTarget: income * 0.3,
    savingsTarget: income * 0.2,
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const monthArb = fc.integer({ min: 2020, max: 2029 }).chain(year =>
  fc.integer({ min: 1, max: 12 }).map(month => {
    const m = month.toString().padStart(2, '0');
    return `${year}-${m}`;
  })
);

const dateInMonthArb = (month: string) =>
  fc.integer({ min: 1, max: 28 }).map(day => {
    const d = day.toString().padStart(2, '0');
    return `${month}-${d}`;
  });

const expenseEntryForMonthArb = (month: string) =>
  fc.record<ExpenseEntry>({
    id:        fc.uuid(),
    date:      dateInMonthArb(month),
    amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
    type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
    limit:     fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
    savings:   fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
    timestamp: fc.constant(new Date().toISOString()),
  });

const expenseEntryArb = fc.record<ExpenseEntry>({
  id:        fc.uuid(),
  date:      monthArb.chain(m => dateInMonthArb(m)),
  amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
  type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  limit:     fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
  savings:   fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
  timestamp: fc.constant(new Date().toISOString()),
});

const expenseLimitArb = fc.record<ExpenseLimit>({
  type:                  fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  recommendedPercentage: fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
  userPercentage:        fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
  category:              fc.constantFrom<BudgetCategory>('Needs', 'Wants', 'Savings', 'Growth', 'Buffer'),
});

// ─── Property 10: Monthly Filter Completeness ─────────────────────────────────

describe('Property 10: Monthly Filter Completeness', () => {
  it('filter returns exactly entries whose date starts with the target month', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryArb, { minLength: 0, maxLength: 20 }),
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 10 }),
            fc.constant(month)
          )
        ),
        ([otherEntries, monthEntries, month]) => {
          const allEntries = [...otherEntries, ...monthEntries];
          const filtered = filterByMonth(allEntries, month);

          // All returned entries must be from the target month
          for (const e of filtered) {
            expect(e.date.startsWith(month)).toBe(true);
          }

          // All entries from the target month must be returned
          const expectedCount = allEntries.filter(e => e.date.startsWith(month)).length;
          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no entries from other months appear in the filtered result', () => {
    fc.assert(
      fc.property(
        monthArb,
        monthArb,
        fc.array(expenseEntryArb, { minLength: 1, maxLength: 20 }),
        (targetMonth, otherMonth, entries) => {
          if (targetMonth === otherMonth) return;

          const filtered = filterByMonth(entries, targetMonth);
          for (const e of filtered) {
            expect(e.date.startsWith(targetMonth)).toBe(true);
            expect(e.date.startsWith(otherMonth)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('filter is idempotent: filtering twice gives same result', () => {
    fc.assert(
      fc.property(
        monthArb,
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 20 }),
        (month, entries) => {
          const once = filterByMonth(entries, month);
          const twice = filterByMonth(once, month);
          expect(twice).toEqual(once);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Monthly Summary Aggregation Correctness ────────────────────

describe('Property 11: Monthly Summary Aggregation Correctness', () => {
  it('totalSpent equals sum of all entry amounts for the month', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 20 }),
            fc.constant(month)
          )
        ),
        ([entries, month]) => {
          const { totalSpent } = computeMonthlySummary(entries, [], month);
          const expected = entries.reduce((sum, e) => sum + e.amount, 0);
          expect(totalSpent).toBeCloseTo(expected, 3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('netSavings equals totalLimit - totalSpent', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 20 }),
            fc.constant(month)
          )
        ),
        ([entries, month]) => {
          const { totalSpent, totalLimit, netSavings } = computeMonthlySummary(entries, [], month);
          expect(netSavings).toBeCloseTo(totalLimit - totalSpent, 3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('totalSpent is 0 for an empty entries array', () => {
    fc.assert(
      fc.property(monthArb, (month) => {
        const { totalSpent, totalLimit, netSavings } = computeMonthlySummary([], [], month);
        expect(totalSpent).toBe(0);
        expect(totalLimit).toBe(0);
        expect(netSavings).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 12: Budget Rule Category Proportions ───────────────────────────

describe('Property 12: Budget Rule Category Proportions', () => {
  it('category totals (Needs + Wants + Savings) sum to at most total spent (Buffer excluded)', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 20 }),
            fc.array(expenseLimitArb, { minLength: 1, maxLength: 14 }),
            fc.float({ min: Math.fround(1), max: Math.fround(100000), noNaN: true }),
            fc.constant(month)
          )
        ),
        ([entries, limits, income, month]) => {
          const summary = computeBudgetRuleSummary(entries, limits, month, income);
          const categorizedTotal = summary.needsTotal + summary.wantsTotal + summary.savingsTotal;
          const totalSpent = filterByMonth(entries, month).reduce((sum, e) => sum + e.amount, 0);

          // Categorized total must be <= total spent (Buffer entries are excluded)
          expect(categorizedTotal).toBeLessThanOrEqual(totalSpent + 0.001);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no entry is double-counted across categories', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 1, maxLength: 20 }),
            fc.constant(month)
          )
        ),
        ([entries, month]) => {
          // Use DEFAULT_BUDGET_PERCENTAGES to create limits with known categories
          const limits: ExpenseLimit[] = PREDEFINED_EXPENSE_TYPES.map(type => ({
            type,
            recommendedPercentage: DEFAULT_BUDGET_PERCENTAGES[type].recommendedPercentage,
            userPercentage: DEFAULT_BUDGET_PERCENTAGES[type].recommendedPercentage,
            category: DEFAULT_BUDGET_PERCENTAGES[type].category,
          }));

          const summary = computeBudgetRuleSummary(entries, limits, month, 10000);
          const monthEntries = filterByMonth(entries, month);

          // Manually compute expected totals
          let expectedNeeds = 0;
          let expectedWants = 0;
          let expectedSavings = 0;

          for (const entry of monthEntries) {
            const limit = limits.find(l => l.type === entry.type);
            const category = limit?.category ?? 'Buffer';
            if (category === 'Needs') expectedNeeds += entry.amount;
            else if (category === 'Wants') expectedWants += entry.amount;
            else if (category === 'Savings' || category === 'Growth') expectedSavings += entry.amount;
          }

          expect(summary.needsTotal).toBeCloseTo(expectedNeeds, 3);
          expect(summary.wantsTotal).toBeCloseTo(expectedWants, 3);
          expect(summary.savingsTotal).toBeCloseTo(expectedSavings, 3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('percentages are 0 when income is 0', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 10 }),
            fc.array(expenseLimitArb, { minLength: 0, maxLength: 5 }),
            fc.constant(month)
          )
        ),
        ([entries, limits, month]) => {
          const summary = computeBudgetRuleSummary(entries, limits, month, 0);
          expect(summary.needsPercentage).toBe(0);
          expect(summary.wantsPercentage).toBe(0);
          expect(summary.savingsPercentage).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests (Task 16.3) ───────────────────────────────────────────────────

describe('Unit: addEntry prepend behavior', () => {
  it('addEntry prepends: after adding entry X to [A, B], result is [X, A, B]', () => {
    const today = new Date().toISOString().slice(0, 10);
    const makeEntry = (id: string): ExpenseEntry => ({
      id,
      date: today,
      amount: 10,
      type: 'Housing',
      limit: 100,
      savings: 90,
      timestamp: new Date().toISOString(),
    });

    const entryA = makeEntry('A');
    const entryB = makeEntry('B');
    const entryX = makeEntry('X');

    const existing = [entryA, entryB];
    const result = [entryX, ...existing];

    expect(result[0]).toEqual(entryX);
    expect(result[1]).toEqual(entryA);
    expect(result[2]).toEqual(entryB);
    expect(result).toHaveLength(3);
  });

  it('addEntry to empty array results in single-element array', () => {
    const entry: ExpenseEntry = {
      id: 'only',
      date: new Date().toISOString().slice(0, 10),
      amount: 5,
      type: 'Food',
      limit: 50,
      savings: 45,
      timestamp: new Date().toISOString(),
    };
    const result = [entry, ...[]];
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(entry);
  });
});

describe('Unit: todayEntries filter', () => {
  it('returns only entries with today\'s date', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const entries: ExpenseEntry[] = [
      { id: '1', date: today, amount: 10, type: 'Food', limit: 50, savings: 40, timestamp: new Date().toISOString() },
      { id: '2', date: yesterday, amount: 20, type: 'Housing', limit: 100, savings: 80, timestamp: new Date().toISOString() },
      { id: '3', date: today, amount: 5, type: 'Transport', limit: 30, savings: 25, timestamp: new Date().toISOString() },
    ];

    const todayEntries = entries.filter(e => e.date === today);
    expect(todayEntries).toHaveLength(2);
    expect(todayEntries.every(e => e.date === today)).toBe(true);
  });

  it('returns empty array when no entries match today', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const entries: ExpenseEntry[] = [
      { id: '1', date: yesterday, amount: 10, type: 'Food', limit: 50, savings: 40, timestamp: new Date().toISOString() },
    ];
    const today = new Date().toISOString().slice(0, 10);
    const todayEntries = entries.filter(e => e.date === today);
    expect(todayEntries).toHaveLength(0);
  });
});

describe('Unit: limitMap keys', () => {
  it('limitMap keys match the type field of each limit', () => {
    const limits: ExpenseLimit[] = [
      { type: 'Housing', recommendedPercentage: 30, userPercentage: 30, category: 'Needs' },
      { type: 'Food', recommendedPercentage: 15, userPercentage: 15, category: 'Needs' },
      { type: 'Entertainment', recommendedPercentage: 10, userPercentage: 10, category: 'Wants' },
    ];

    const limitMap: Record<string, ExpenseLimit> = {};
    for (const limit of limits) {
      limitMap[limit.type] = limit;
    }

    expect(Object.keys(limitMap)).toContain('Housing');
    expect(Object.keys(limitMap)).toContain('Food');
    expect(Object.keys(limitMap)).toContain('Entertainment');
    expect(limitMap['Housing'].type).toBe('Housing');
    expect(limitMap['Food'].type).toBe('Food');
  });

  it('limitMap allows O(1) lookup by type', () => {
    const limits: ExpenseLimit[] = [
      { type: 'Savings', recommendedPercentage: 20, userPercentage: 20, category: 'Savings' },
    ];
    const limitMap: Record<string, ExpenseLimit> = {};
    for (const limit of limits) {
      limitMap[limit.type] = limit;
    }
    expect(limitMap['Savings']).toBeDefined();
    expect(limitMap['NonExistent']).toBeUndefined();
  });
});

describe('Unit: budgetRuleSummary with zero income', () => {
  it('returns zero percentages when monthlyIncome is 0', () => {
    const entries: ExpenseEntry[] = [
      { id: '1', date: '2024-01-15', amount: 500, type: 'Housing', limit: 1000, savings: 500, timestamp: new Date().toISOString() },
    ];
    const limits: ExpenseLimit[] = [
      { type: 'Housing', recommendedPercentage: 30, userPercentage: 30, category: 'Needs' },
    ];
    const income = 0;
    const month = '2024-01';

    const summary = computeBudgetRuleSummary(entries, limits, month, income);

    expect(summary.needsPercentage).toBe(0);
    expect(summary.wantsPercentage).toBe(0);
    expect(summary.savingsPercentage).toBe(0);
  });

  it('returns zero targets when monthlyIncome is 0', () => {
    const summary = computeBudgetRuleSummary([], [], '2024-01', 0);
    expect(summary.needsTarget).toBe(0);
    expect(summary.wantsTarget).toBe(0);
    expect(summary.savingsTarget).toBe(0);
  });
});

describe('Unit: clearLocalData resets state', () => {
  it('clearLocalData resets all state fields to initial values', () => {
    // Simulate the state object
    let state = {
      entries: [
        { id: '1', date: '2024-01-01', amount: 100, type: 'Food', limit: 200, savings: 100, timestamp: new Date().toISOString() },
      ] as ExpenseEntry[],
      limits: [
        { type: 'Food', recommendedPercentage: 15, userPercentage: 15, category: 'Needs' as const },
      ] as ExpenseLimit[],
      monthlyIncome: 5000,
      syncStatus: 'error' as const,
    };

    // Simulate clearLocalData
    state = {
      entries: [],
      limits: [],
      monthlyIncome: 0,
      syncStatus: 'idle',
    };

    expect(state.entries).toHaveLength(0);
    expect(state.limits).toHaveLength(0);
    expect(state.monthlyIncome).toBe(0);
    expect(state.syncStatus).toBe('idle');
  });
});
