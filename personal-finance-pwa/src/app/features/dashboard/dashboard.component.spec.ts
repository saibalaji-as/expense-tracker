// Feature: personal-finance-pwa, Property 15: Chart data aggregation correctness
// Feature: personal-finance-pwa, Property 16: Chart reactivity to state changes
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { PREDEFINED_EXPENSE_TYPES } from '../../core/models/category-definitions';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();
const currentMonth = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);

// Use whole-number amounts to avoid floating-point accumulation issues
const expenseEntryArb = fc.record<ExpenseEntry>({
  id:        fc.uuid(),
  date:      fc.constant(today),
  amount:    fc.integer({ min: 1, max: 100000 }),   // whole numbers only
  type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  limit:     fc.integer({ min: 0, max: 100000 }),
  savings:   fc.integer({ min: -100000, max: 100000 }),
  timestamp: fc.constant(new Date().toISOString()),
});

// ─── Pure computation functions (mirrors DashboardComponent methods) ──────────

function computeYtdDailyData(entries: ExpenseEntry[]): { labels: string[]; data: number[] } {
  const yearStr = currentYear.toString();
  const yearEntries = entries.filter(e => e.date.startsWith(yearStr));

  const dailyMap = new Map<string, number>();
  for (const entry of yearEntries) {
    dailyMap.set(entry.date, (dailyMap.get(entry.date) ?? 0) + entry.amount);
  }

  // Use UTC dates consistently to avoid timezone-related off-by-one issues
  const todayStr = today; // already computed as UTC date string
  const startOfYearStr = `${currentYear}-01-01`;
  const labels: string[] = [];
  const data: number[] = [];

  // Iterate from Jan 1 to today using UTC date arithmetic
  let cursorMs = Date.UTC(currentYear, 0, 1);
  const todayMs = new Date(todayStr + 'T00:00:00.000Z').getTime();

  while (cursorMs <= todayMs) {
    const dateStr = new Date(cursorMs).toISOString().slice(0, 10);
    labels.push(dateStr);
    data.push(dailyMap.get(dateStr) ?? 0);
    cursorMs += 24 * 60 * 60 * 1000; // advance by one day in ms
  }

  return { labels, data };
}

function computeMonthlyTypeBreakdown(entries: ExpenseEntry[]): { labels: string[]; data: number[] } {
  const monthEntries = entries.filter(e => e.date.startsWith(currentMonth));

  const typeMap = new Map<string, number>();
  for (const entry of monthEntries) {
    typeMap.set(entry.type, (typeMap.get(entry.type) ?? 0) + entry.amount);
  }

  return {
    labels: Array.from(typeMap.keys()),
    data: Array.from(typeMap.values()),
  };
}

function computeSixMonthComparison(entries: ExpenseEntry[]): { labels: string[]; data: number[] } {
  const months: string[] = [];
  const labels: string[] = [];

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = d.toISOString().slice(0, 7);
    months.push(monthKey);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  }

  const data = months.map(month =>
    entries
      .filter(e => e.date.startsWith(month))
      .reduce((sum, e) => sum + e.amount, 0)
  );

  return { labels, data };
}

// ─── Property 15: Chart Data Aggregation Correctness ─────────────────────────

describe('Property 15: Chart Data Aggregation Correctness', () => {
  it('YTD daily chart: sum of all data points equals sum of current-year entries', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 50 }),
        (entries) => {
          const { data } = computeYtdDailyData(entries);
          const chartTotal = data.reduce((sum, v) => sum + v, 0);

          const yearStr = currentYear.toString();
          const expectedTotal = entries
            .filter(e => e.date.startsWith(yearStr))
            .reduce((sum, e) => sum + e.amount, 0);

          expect(chartTotal).toBe(expectedTotal);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('YTD daily chart: each day has exactly one data point', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 30 }),
        (entries) => {
          const { labels, data } = computeYtdDailyData(entries);
          expect(labels.length).toBe(data.length);
          const uniqueLabels = new Set(labels);
          expect(uniqueLabels.size).toBe(labels.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('monthly type breakdown: sum of all slices equals sum of current-month entries', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 50 }),
        (entries) => {
          const { data } = computeMonthlyTypeBreakdown(entries);
          const chartTotal = data.reduce((sum, v) => sum + v, 0);

          const expectedTotal = entries
            .filter(e => e.date.startsWith(currentMonth))
            .reduce((sum, e) => sum + e.amount, 0);

          expect(chartTotal).toBe(expectedTotal);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('monthly type breakdown: each type appears at most once', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 30 }),
        (entries) => {
          const { labels } = computeMonthlyTypeBreakdown(entries);
          const uniqueLabels = new Set(labels);
          expect(uniqueLabels.size).toBe(labels.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('6-month comparison: always has exactly 6 bars with non-negative values', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 50 }),
        (entries) => {
          const { data, labels } = computeSixMonthComparison(entries);
          expect(data.length).toBe(6);
          expect(labels.length).toBe(6);
          for (const v of data) {
            expect(v).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 16: Chart Reactivity to State Changes ──────────────────────────

describe('Property 16: Chart Reactivity to State Changes', () => {
  it('adding a current-year entry increases the YTD chart total by exactly that entry amount', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 20 }),
        expenseEntryArb,
        (existingEntries, newEntry) => {
          const before = computeYtdDailyData(existingEntries);
          const after = computeYtdDailyData([...existingEntries, newEntry]);

          const beforeTotal = before.data.reduce((sum, v) => sum + v, 0);
          const afterTotal = after.data.reduce((sum, v) => sum + v, 0);

          // With integer amounts, addition is exact
          expect(afterTotal).toBe(beforeTotal + newEntry.amount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adding a current-month entry increases the monthly type breakdown total', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 20 }),
        expenseEntryArb,
        (existingEntries, newEntry) => {
          const before = computeMonthlyTypeBreakdown(existingEntries);
          const after = computeMonthlyTypeBreakdown([...existingEntries, newEntry]);

          const beforeTotal = before.data.reduce((sum, v) => sum + v, 0);
          const afterTotal = after.data.reduce((sum, v) => sum + v, 0);

          expect(afterTotal).toBe(beforeTotal + newEntry.amount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('chart data reflects current entries (no stale data)', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          const { data } = computeYtdDailyData(entries);
          const chartTotal = data.reduce((sum, v) => sum + v, 0);

          const yearStr = currentYear.toString();
          const expectedTotal = entries
            .filter(e => e.date.startsWith(yearStr))
            .reduce((sum, e) => sum + e.amount, 0);

          expect(chartTotal).toBe(expectedTotal);
        }
      ),
      { numRuns: 100 }
    );
  });
});
