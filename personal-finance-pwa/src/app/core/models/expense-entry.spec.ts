// Feature: personal-finance-pwa, Property 1: Data model serialization round-trip
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { ExpenseEntry } from './expense-entry.model';
import { ExpenseLimit, BudgetCategory } from './expense-limit.model';
import { PREDEFINED_EXPENSE_TYPES } from './expense-type.constants';

// ─── Inline serialization helpers (mirrors GoogleSheetsService private methods)
// These are tested here as pure functions to validate the round-trip property.

function serializeExpenseEntry(entry: ExpenseEntry): string[] {
  return [
    entry.date,
    entry.amount.toString(),
    entry.type,
    entry.limit.toString(),
    entry.savings.toString(),
    entry.timestamp,
    entry.id,
  ];
}

function deserializeExpenseEntry(row: string[]): ExpenseEntry {
  return {
    date:      row[0],
    amount:    parseFloat(row[1]),
    type:      row[2],
    limit:     parseFloat(row[3]),
    savings:   parseFloat(row[4]),
    timestamp: row[5],
    id:        row[6],
  };
}

function serializeExpenseLimit(limit: ExpenseLimit): string[] {
  return [
    limit.type,
    limit.recommendedPercentage.toString(),
    limit.userPercentage.toString(),
    limit.category,
  ];
}

function deserializeExpenseLimit(row: string[]): ExpenseLimit {
  return {
    type:                  row[0],
    recommendedPercentage: parseFloat(row[1]),
    userPercentage:        parseFloat(row[2]),
    category:              row[3] as BudgetCategory,
  };
}

function serializeMetadata(key: string, value: string): string[] {
  return [key, value];
}

function deserializeMetadata(row: string[]): { key: string; value: string } {
  return { key: row[0], value: row[1] };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

// Use fround to keep floats representable as 32-bit floats, avoiding
// precision issues when converting to/from string via parseFloat.
const safeFloat = (min: number, max: number) =>
  fc.float({ min: Math.fround(min), max: Math.fround(max), noNaN: true });

const expenseEntryArb = fc.record<ExpenseEntry>({
  id:        fc.uuid(),
  date:      fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
               .map(n => new Date(n).toISOString().slice(0, 10)),
  amount:    safeFloat(0.01, 10000),
  type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  limit:     safeFloat(0, 10000),
  savings:   safeFloat(-10000, 10000),
  timestamp: fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
               .map(n => new Date(n).toISOString()),
});

const expenseLimitArb = fc.record<ExpenseLimit>({
  type:                  fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  recommendedPercentage: safeFloat(0, 100),
  userPercentage:        safeFloat(0, 100),
  category:              fc.constantFrom<BudgetCategory>('Needs', 'Wants', 'Savings', 'Growth', 'Buffer'),
});

const metadataArb = fc.record({
  key:   fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
  value: fc.string({ minLength: 0, maxLength: 200 }).filter(s => !s.includes('\0')),
});

// ─── Property 1: Data Model Serialization Round-Trip ─────────────────────────

describe('Property 1: Data Model Serialization Round-Trip', () => {
  describe('ExpenseEntry', () => {
    it('serialize → deserialize round-trip preserves all fields', () => {
      fc.assert(
        fc.property(expenseEntryArb, (entry) => {
          const row = serializeExpenseEntry(entry);
          const restored = deserializeExpenseEntry(row);

          expect(restored.id).toBe(entry.id);
          expect(restored.date).toBe(entry.date);
          expect(restored.type).toBe(entry.type);
          expect(restored.timestamp).toBe(entry.timestamp);
          // Numeric fields: use toBeCloseTo to handle float precision
          expect(restored.amount).toBeCloseTo(entry.amount, 4);
          expect(restored.limit).toBeCloseTo(entry.limit, 4);
          expect(restored.savings).toBeCloseTo(entry.savings, 4);
        }),
        { numRuns: 100 }
      );
    });

    it('serialized row has exactly 7 elements', () => {
      fc.assert(
        fc.property(expenseEntryArb, (entry) => {
          const row = serializeExpenseEntry(entry);
          expect(row).toHaveLength(7);
        }),
        { numRuns: 100 }
      );
    });

    it('column order is: date, amount, type, limit, savings, timestamp, id', () => {
      fc.assert(
        fc.property(expenseEntryArb, (entry) => {
          const row = serializeExpenseEntry(entry);
          expect(row[0]).toBe(entry.date);
          expect(row[1]).toBe(entry.amount.toString());
          expect(row[2]).toBe(entry.type);
          expect(row[3]).toBe(entry.limit.toString());
          expect(row[4]).toBe(entry.savings.toString());
          expect(row[5]).toBe(entry.timestamp);
          expect(row[6]).toBe(entry.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('ExpenseLimit', () => {
    it('serialize → deserialize round-trip preserves all fields', () => {
      fc.assert(
        fc.property(expenseLimitArb, (limit) => {
          const row = serializeExpenseLimit(limit);
          const restored = deserializeExpenseLimit(row);

          expect(restored.type).toBe(limit.type);
          expect(restored.category).toBe(limit.category);
          expect(restored.recommendedPercentage).toBeCloseTo(limit.recommendedPercentage, 4);
          expect(restored.userPercentage).toBeCloseTo(limit.userPercentage, 4);
        }),
        { numRuns: 100 }
      );
    });

    it('serialized row has exactly 4 elements', () => {
      fc.assert(
        fc.property(expenseLimitArb, (limit) => {
          const row = serializeExpenseLimit(limit);
          expect(row).toHaveLength(4);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Metadata key-value pairs', () => {
    it('serialize → deserialize round-trip preserves key and value', () => {
      fc.assert(
        fc.property(metadataArb, ({ key, value }) => {
          const row = serializeMetadata(key, value);
          const restored = deserializeMetadata(row);

          expect(restored.key).toBe(key);
          expect(restored.value).toBe(value);
        }),
        { numRuns: 100 }
      );
    });

    it('serialized row has exactly 2 elements', () => {
      fc.assert(
        fc.property(metadataArb, ({ key, value }) => {
          const row = serializeMetadata(key, value);
          expect(row).toHaveLength(2);
        }),
        { numRuns: 100 }
      );
    });
  });
});
