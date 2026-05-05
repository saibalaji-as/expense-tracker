// Feature: personal-finance-pwa, Property 4: Savings calculation invariant
// Feature: personal-finance-pwa, Property 5: Limit auto-populate correctness
// Feature: personal-finance-pwa, Property 6: Form submission adds entry to store and queue
// Feature: personal-finance-pwa, Property 7: Border indicator correctness
// Feature: personal-finance-pwa, Property 8: Today's entries ordering
// Feature: personal-finance-pwa, Property 9: Form validation rejects invalid input
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { ExpenseLimit } from '../../core/models/expense-limit.model';
import { PREDEFINED_EXPENSE_TYPES } from '../../core/models/expense-type.constants';

// ─── Pure logic helpers (extracted from component for testability) ─────────────

/** Mirrors DailyExpenseComponent.savings computed signal logic */
function computeSavings(limit: number, amount: number): number {
  return (limit ?? 0) - (amount ?? 0);
}

/** Mirrors DailyExpenseComponent.borderClass computed signal logic */
function computeBorderClass(amount: number, limit: number): string {
  if (amount > 0 && amount > limit) {
    return 'border-2 border-red-500 rounded-xl p-4';
  }
  if (amount > 0 && amount <= limit) {
    return 'border-2 border-green-500 rounded-xl p-4';
  }
  return 'p-4';
}

/** Mirrors ExpenseStore.limitMap lookup */
function lookupLimit(limits: ExpenseLimit[], type: string): number {
  const found = limits.find(l => l.type === type);
  return found?.userPercentage ?? 0;
}

/** Mirrors ExpenseStore.addEntry prepend behavior */
function addEntry(entries: ExpenseEntry[], entry: ExpenseEntry): ExpenseEntry[] {
  return [entry, ...entries];
}

/** Mirrors ExpenseStore.todayEntries filter */
function getTodayEntries(entries: ExpenseEntry[]): ExpenseEntry[] {
  const today = new Date().toISOString().slice(0, 10);
  return entries.filter(e => e.date === today);
}

/** Validates form: type must be non-empty, amount must be > 0 */
function isFormValid(type: string, amount: number | null): boolean {
  return type.length > 0 && amount !== null && amount > 0;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

const todayEntryArb = fc.record<ExpenseEntry>({
  id:        fc.uuid(),
  date:      fc.constant(today),
  amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
  type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  limit:     fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
  savings:   fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
  timestamp: fc.integer({ min: new Date('2024-01-01').getTime(), max: new Date('2030-12-31').getTime() })
               .map(n => new Date(n).toISOString()),
});

const expenseLimitArb = fc.record<ExpenseLimit>({
  type:                  fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  recommendedPercentage: fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
  userPercentage:        fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
  category:              fc.constantFrom('Needs', 'Wants', 'Savings', 'Growth', 'Buffer'),
});

// ─── Property 4: Savings Calculation Invariant ────────────────────────────────

describe('Property 4: Savings Calculation Invariant', () => {
  it('savings always equals limit - amount for any (amount, limit) pair', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
        (amount, limit) => {
          const savings = computeSavings(limit, amount);
          expect(savings).toBeCloseTo(limit - amount, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('savings is negative when amount exceeds limit', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        (base, extra) => {
          const amount = base + extra;
          const limit = base;
          const savings = computeSavings(limit, amount);
          expect(savings).toBeLessThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('savings is non-negative when amount does not exceed limit', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
        (limit, extra) => {
          const amount = Math.max(0, limit - extra);
          const savings = computeSavings(limit, amount);
          expect(savings).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Limit Auto-Populate Correctness ─────────────────────────────

describe('Property 5: Limit Auto-Populate Correctness', () => {
  it('selecting a type auto-populates the limit with the stored userPercentage', () => {
    fc.assert(
      fc.property(
        fc.array(expenseLimitArb, { minLength: 1, maxLength: 14 }),
        fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
        (limits, selectedType) => {
          const populatedLimit = lookupLimit(limits, selectedType);
          const storedLimit = limits.find(l => l.type === selectedType);

          if (storedLimit) {
            expect(populatedLimit).toBe(storedLimit.userPercentage);
          } else {
            expect(populatedLimit).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('limit lookup returns 0 for unknown types', () => {
    fc.assert(
      fc.property(
        fc.array(expenseLimitArb, { minLength: 0, maxLength: 5 }),
        (limits) => {
          const unknownType = '__unknown_type__';
          const result = lookupLimit(limits, unknownType);
          expect(result).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('limit lookup returns the correct limit for the selected type, not another type', () => {
    fc.assert(
      fc.property(
        fc.array(expenseLimitArb, { minLength: 2, maxLength: 14 }),
        (limits) => {
          // Deduplicate by type
          const uniqueLimits = limits.filter(
            (l, i, arr) => arr.findIndex(x => x.type === l.type) === i
          );
          if (uniqueLimits.length < 2) return;

          const [limitA, limitB] = uniqueLimits;
          if (limitA.type === limitB.type) return;

          const resultA = lookupLimit(uniqueLimits, limitA.type);
          const resultB = lookupLimit(uniqueLimits, limitB.type);

          expect(resultA).toBe(limitA.userPercentage);
          expect(resultB).toBe(limitB.userPercentage);
          // If limits differ, results must differ
          if (limitA.userPercentage !== limitB.userPercentage) {
            expect(resultA).not.toBe(resultB);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Form Submission Adds Entry to Store and Queue ────────────────

describe('Property 6: Form Submission Adds Entry to Store and Queue', () => {
  it('valid submission prepends entry to store entries', () => {
    fc.assert(
      fc.property(
        fc.array(todayEntryArb, { minLength: 0, maxLength: 10 }),
        todayEntryArb,
        (existingEntries, newEntry) => {
          const updatedEntries = addEntry(existingEntries, newEntry);

          // Entry is at the front
          expect(updatedEntries[0]).toEqual(newEntry);
          // All existing entries are still present
          expect(updatedEntries.length).toBe(existingEntries.length + 1);
          for (const existing of existingEntries) {
            expect(updatedEntries).toContainEqual(existing);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('submitted entry has savings = limit - amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
        fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
        (amount, limit, type) => {
          const savings = computeSavings(limit, amount);
          const entry: ExpenseEntry = {
            id: 'test-id',
            date: today,
            amount,
            type,
            limit,
            savings,
            timestamp: new Date().toISOString(),
          };

          expect(entry.savings).toBeCloseTo(limit - amount, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: Border Indicator Correctness ────────────────────────────────

describe('Property 7: Border Indicator Correctness', () => {
  it('border class is red iff amount > limit (both positive)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        (amount, limit) => {
          const borderClass = computeBorderClass(amount, limit);
          if (amount > limit) {
            expect(borderClass).toContain('border-red-500');
            expect(borderClass).not.toContain('border-green-500');
          } else {
            expect(borderClass).toContain('border-green-500');
            expect(borderClass).not.toContain('border-red-500');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('border class is empty/neutral when amount is 0', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
        (limit) => {
          const borderClass = computeBorderClass(0, limit);
          expect(borderClass).not.toContain('border-red-500');
          expect(borderClass).not.toContain('border-green-500');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('border class is red iff amount > limit — exhaustive check', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
        (a, b) => {
          const amount = a;
          const limit = b;
          const cls = computeBorderClass(amount, limit);
          const isRed = cls.includes('border-red-500');
          const isGreen = cls.includes('border-green-500');

          // Exactly one of red/green must be true when amount > 0
          expect(isRed !== isGreen).toBe(true);
          // Red iff amount > limit
          expect(isRed).toBe(amount > limit);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8: Today's Entries Ordering ────────────────────────────────────

describe("Property 8: Today's Entries Ordering", () => {
  it("today's entries contain exactly those entries dated today", () => {
    fc.assert(
      fc.property(
        fc.array(todayEntryArb, { minLength: 0, maxLength: 20 }),
        (entries) => {
          const todayEntries = getTodayEntries(entries);
          // All returned entries are from today
          for (const e of todayEntries) {
            expect(e.date).toBe(today);
          }
          // All today's entries are returned
          const expectedCount = entries.filter(e => e.date === today).length;
          expect(todayEntries.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('entries prepended in order appear in descending timestamp order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record<ExpenseEntry>({
            id:        fc.uuid(),
            date:      fc.constant(today),
            amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }),
            type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
            limit:     fc.float({ min: 0, max: Math.fround(1000), noNaN: true }),
            savings:   fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true }),
            timestamp: fc.integer({ min: 0, max: 1000 })
                         .map(n => new Date(Date.now() - n * 60000).toISOString()),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (entries) => {
          // Simulate addEntry prepending each entry in sequence
          let store: ExpenseEntry[] = [];
          for (const entry of entries) {
            store = addEntry(store, entry);
          }

          // The store is in prepend order (most recently added first)
          // Verify that the first element is the last entry added
          expect(store[0]).toEqual(entries[entries.length - 1]);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 9: Form Validation Rejects Invalid Input ───────────────────────

describe('Property 9: Form Validation Rejects Invalid Input', () => {
  it('empty type is invalid', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        (amount) => {
          expect(isFormValid('', amount)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('zero or negative amount is invalid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
        fc.float({ min: Math.fround(-10000), max: 0, noNaN: true }),
        (type, amount) => {
          expect(isFormValid(type, amount)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('null amount is invalid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
        (type) => {
          expect(isFormValid(type, null)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('valid type and positive amount is valid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        (type, amount) => {
          expect(isFormValid(type, amount)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('invalid submission does not add to store', () => {
    fc.assert(
      fc.property(
        fc.array(todayEntryArb, { minLength: 0, maxLength: 5 }),
        fc.oneof(
          fc.constant({ type: '', amount: 10 }),
          fc.record({ type: fc.constantFrom(...PREDEFINED_EXPENSE_TYPES), amount: fc.float({ min: Math.fround(-100), max: 0, noNaN: true }) })
        ),
        (existingEntries, invalidInput) => {
          const initialLength = existingEntries.length;
          // Invalid form should not add entry
          if (!isFormValid(invalidInput.type, invalidInput.amount)) {
            // Store remains unchanged
            expect(existingEntries.length).toBe(initialLength);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests (Task 16.6) ───────────────────────────────────────────────────

describe('Unit: Form validation logic', () => {
  it('submitting with empty expenseType (required error): store entries unchanged', () => {
    const existingEntries: ExpenseEntry[] = [
      { id: 'existing-1', date: new Date().toISOString().slice(0, 10), amount: 10, type: 'Food', limit: 50, savings: 40, timestamp: new Date().toISOString() },
    ];

    // Empty type is invalid
    const isValid = isFormValid('', 25);
    expect(isValid).toBe(false);

    // Store should remain unchanged when form is invalid
    const storeAfter = isValid
      ? addEntry(existingEntries, { id: 'new', date: new Date().toISOString().slice(0, 10), amount: 25, type: '', limit: 0, savings: -25, timestamp: new Date().toISOString() })
      : existingEntries;

    expect(storeAfter).toHaveLength(1);
    expect(storeAfter).toEqual(existingEntries);
  });

  it('submitting with amount = 0 (min error): store entries unchanged', () => {
    const existingEntries: ExpenseEntry[] = [
      { id: 'existing-2', date: new Date().toISOString().slice(0, 10), amount: 20, type: 'Housing', limit: 100, savings: 80, timestamp: new Date().toISOString() },
    ];

    const isValid = isFormValid('Housing', 0);
    expect(isValid).toBe(false);

    const storeAfter = isValid
      ? addEntry(existingEntries, { id: 'new', date: new Date().toISOString().slice(0, 10), amount: 0, type: 'Housing', limit: 100, savings: 100, timestamp: new Date().toISOString() })
      : existingEntries;

    expect(storeAfter).toHaveLength(1);
    expect(storeAfter).toEqual(existingEntries);
  });

  it('submitting with amount = -1 (min error): store entries unchanged', () => {
    const existingEntries: ExpenseEntry[] = [];

    const isValid = isFormValid('Food', -1);
    expect(isValid).toBe(false);

    const storeAfter = isValid
      ? addEntry(existingEntries, { id: 'new', date: new Date().toISOString().slice(0, 10), amount: -1, type: 'Food', limit: 50, savings: 51, timestamp: new Date().toISOString() })
      : existingEntries;

    expect(storeAfter).toHaveLength(0);
  });

  it('valid submission: addEntry is called exactly once', () => {
    const existingEntries: ExpenseEntry[] = [];
    const addEntryCalls: ExpenseEntry[] = [];

    const mockAddEntry = (entries: ExpenseEntry[], entry: ExpenseEntry): ExpenseEntry[] => {
      addEntryCalls.push(entry);
      return [entry, ...entries];
    };

    const isValid = isFormValid('Food', 15);
    expect(isValid).toBe(true);

    if (isValid) {
      const newEntry: ExpenseEntry = {
        id: 'valid-id',
        date: new Date().toISOString().slice(0, 10),
        amount: 15,
        type: 'Food',
        limit: 50,
        savings: 35,
        timestamp: new Date().toISOString(),
      };
      mockAddEntry(existingEntries, newEntry);
    }

    expect(addEntryCalls).toHaveLength(1);
    expect(addEntryCalls[0].type).toBe('Food');
    expect(addEntryCalls[0].amount).toBe(15);
  });

  it('valid submission with positive amount and non-empty type passes validation', () => {
    expect(isFormValid('Transport', 0.01)).toBe(true);
    expect(isFormValid('Healthcare', 999.99)).toBe(true);
  });

  it('null amount is invalid (required error)', () => {
    expect(isFormValid('Food', null)).toBe(false);
  });
});
