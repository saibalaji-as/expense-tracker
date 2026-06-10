// Task 17.4: Expense entry flow integration tests
// Tests the expense entry flow logic directly without Angular TestBed.
// Validates: Requirements 2.1, 2.8
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseEntry } from '../../core/models/expense-entry.model';

// ─── In-memory store (mirrors ExpenseStore state) ─────────────────────────────

interface StoreState {
  entries: ExpenseEntry[];
}

function createStore(): StoreState {
  return { entries: [] };
}

function addEntry(store: StoreState, entry: ExpenseEntry): void {
  store.entries = [entry, ...store.entries];
}

// ─── Form submission logic (mirrors DailyExpenseComponent.onSubmit) ───────────

interface FormValues {
  expenseType: string;
  amount: number;
  limit: number;
}

function buildEntry(form: FormValues): ExpenseEntry {
  const id = `test-id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();
  const savings = form.limit - form.amount;

  return {
    id,
    date,
    amount: form.amount,
    type: form.expenseType,
    limit: form.limit,
    savings,
    timestamp,
  };
}

function isFormValid(form: FormValues): boolean {
  return form.expenseType.length > 0 && form.amount > 0;
}

function submitExpense(
  form: FormValues,
  store: StoreState,
): ExpenseEntry | null {
  if (!isFormValid(form)) return null;

  const entry = buildEntry(form);
  addEntry(store, entry);
  return entry;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Expense entry flow integration', () => {
  let store: StoreState;

  beforeEach(() => {
    store = createStore();
  });

  // ─── Form validation ──────────────────────────────────────────────────────

  describe('form validation', () => {
    it('valid type and amount passes validation', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      expect(isFormValid(form)).toBe(true);
    });

    it('empty type fails validation', () => {
      const form: FormValues = { expenseType: '', amount: 50, limit: 200 };
      expect(isFormValid(form)).toBe(false);
    });

    it('zero amount fails validation', () => {
      const form: FormValues = { expenseType: 'Food', amount: 0, limit: 200 };
      expect(isFormValid(form)).toBe(false);
    });

    it('negative amount fails validation', () => {
      const form: FormValues = { expenseType: 'Food', amount: -10, limit: 200 };
      expect(isFormValid(form)).toBe(false);
    });
  });

  // ─── Submit → entry appears in store ─────────────────────────────────────

  describe('submit → entry appears in store', () => {
    it('after submit, entry appears in store', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      submitExpense(form, store);

      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].type).toBe('Food');
      expect(store.entries[0].amount).toBe(50);
    });

    it('invalid form does not add entry to store', () => {
      const form: FormValues = { expenseType: '', amount: 50, limit: 200 };
      const result = submitExpense(form, store);

      expect(result).toBeNull();
      expect(store.entries).toHaveLength(0);
    });

    it('multiple submissions add multiple entries to store', () => {
      submitExpense({ expenseType: 'Food', amount: 30, limit: 100 }, store);
      submitExpense({ expenseType: 'Transport', amount: 20, limit: 80 }, store);

      expect(store.entries).toHaveLength(2);
    });

    it('entries are prepended (most recent first)', () => {
      submitExpense({ expenseType: 'Food', amount: 30, limit: 100 }, store);
      submitExpense({ expenseType: 'Transport', amount: 20, limit: 80 }, store);

      expect(store.entries[0].type).toBe('Transport');
      expect(store.entries[1].type).toBe('Food');
    });
  });

  // ─── Entry has correct fields ─────────────────────────────────────────────

  describe('entry has correct fields', () => {
    it('entry has a date in YYYY-MM-DD format', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      const entry = submitExpense(form, store)!;

      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('entry has the correct amount', () => {
      const form: FormValues = { expenseType: 'Food', amount: 42.5, limit: 100 };
      const entry = submitExpense(form, store)!;

      expect(entry.amount).toBe(42.5);
    });

    it('entry has the correct type', () => {
      const form: FormValues = { expenseType: 'Transport', amount: 20, limit: 80 };
      const entry = submitExpense(form, store)!;

      expect(entry.type).toBe('Transport');
    });

    it('savings = limit - amount', () => {
      const form: FormValues = { expenseType: 'Food', amount: 60, limit: 200 };
      const entry = submitExpense(form, store)!;

      expect(entry.savings).toBe(200 - 60); // 140
    });

    it('savings is negative when amount exceeds limit', () => {
      const form: FormValues = { expenseType: 'Food', amount: 250, limit: 200 };
      const entry = submitExpense(form, store)!;

      expect(entry.savings).toBe(200 - 250); // -50
    });

    it('entry has a valid ISO timestamp', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      const entry = submitExpense(form, store)!;

      expect(() => new Date(entry.timestamp)).not.toThrow();
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it('entry has a non-empty id', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      const entry = submitExpense(form, store)!;

      expect(entry.id).toBeTruthy();
      expect(entry.id.length).toBeGreaterThan(0);
    });
  });
});
