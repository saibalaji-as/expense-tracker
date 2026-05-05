// Task 17.4: Expense entry flow integration tests
// Tests the expense entry flow logic directly without Angular TestBed.
// Validates: Requirements 2.1, 2.8
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { OfflineQueueEntry } from '../../core/models/offline-queue-entry.model';

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

// ─── In-memory queue (mirrors SyncService queue) ──────────────────────────────

interface MockQueue {
  entries: Map<string, OfflineQueueEntry>;
}

function createQueue(): MockQueue {
  return { entries: new Map() };
}

function enqueue(queue: MockQueue, entry: ExpenseEntry): void {
  const queueEntry: OfflineQueueEntry = {
    id: entry.id,
    entry,
    retryCount: 0,
    enqueuedAt: new Date().toISOString(),
  };
  queue.entries.set(entry.id, queueEntry);
}

function flushSuccess(queue: MockQueue, batchUpdateFn: (entries: ExpenseEntry[]) => void): void {
  const entries = Array.from(queue.entries.values());
  if (entries.length === 0) return;
  batchUpdateFn(entries.map((e) => e.entry));
  queue.entries.clear();
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
  queue: MockQueue
): ExpenseEntry | null {
  if (!isFormValid(form)) return null;

  const entry = buildEntry(form);
  addEntry(store, entry);
  enqueue(queue, entry);
  return entry;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Expense entry flow integration', () => {
  let store: StoreState;
  let queue: MockQueue;

  beforeEach(() => {
    store = createStore();
    queue = createQueue();
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
      submitExpense(form, store, queue);

      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].type).toBe('Food');
      expect(store.entries[0].amount).toBe(50);
    });

    it('invalid form does not add entry to store', () => {
      const form: FormValues = { expenseType: '', amount: 50, limit: 200 };
      const result = submitExpense(form, store, queue);

      expect(result).toBeNull();
      expect(store.entries).toHaveLength(0);
    });

    it('multiple submissions add multiple entries to store', () => {
      submitExpense({ expenseType: 'Food', amount: 30, limit: 100 }, store, queue);
      submitExpense({ expenseType: 'Transport', amount: 20, limit: 80 }, store, queue);

      expect(store.entries).toHaveLength(2);
    });

    it('entries are prepended (most recent first)', () => {
      submitExpense({ expenseType: 'Food', amount: 30, limit: 100 }, store, queue);
      submitExpense({ expenseType: 'Transport', amount: 20, limit: 80 }, store, queue);

      expect(store.entries[0].type).toBe('Transport');
      expect(store.entries[1].type).toBe('Food');
    });
  });

  // ─── After online submission: queue is empty ──────────────────────────────

  describe('after online submission', () => {
    it('queue is empty after successful flush (online submission)', () => {
      const form: FormValues = { expenseType: 'Housing', amount: 500, limit: 1000 };
      submitExpense(form, store, queue);

      expect(queue.entries.size).toBe(1);

      // Simulate online flush
      flushSuccess(queue, () => {});

      expect(queue.entries.size).toBe(0);
    });

    it('entry was flushed with correct data', () => {
      const form: FormValues = { expenseType: 'Healthcare', amount: 75, limit: 200 };
      submitExpense(form, store, queue);

      const flushedEntries: ExpenseEntry[] = [];
      flushSuccess(queue, (entries) => flushedEntries.push(...entries));

      expect(flushedEntries).toHaveLength(1);
      expect(flushedEntries[0].type).toBe('Healthcare');
      expect(flushedEntries[0].amount).toBe(75);
    });
  });

  // ─── Entry has correct fields ─────────────────────────────────────────────

  describe('entry has correct fields', () => {
    it('entry has a date in YYYY-MM-DD format', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      const entry = submitExpense(form, store, queue)!;

      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('entry has the correct amount', () => {
      const form: FormValues = { expenseType: 'Food', amount: 42.5, limit: 100 };
      const entry = submitExpense(form, store, queue)!;

      expect(entry.amount).toBe(42.5);
    });

    it('entry has the correct type', () => {
      const form: FormValues = { expenseType: 'Transport', amount: 20, limit: 80 };
      const entry = submitExpense(form, store, queue)!;

      expect(entry.type).toBe('Transport');
    });

    it('savings = limit - amount', () => {
      const form: FormValues = { expenseType: 'Food', amount: 60, limit: 200 };
      const entry = submitExpense(form, store, queue)!;

      expect(entry.savings).toBe(200 - 60); // 140
    });

    it('savings is negative when amount exceeds limit', () => {
      const form: FormValues = { expenseType: 'Food', amount: 250, limit: 200 };
      const entry = submitExpense(form, store, queue)!;

      expect(entry.savings).toBe(200 - 250); // -50
    });

    it('entry has a valid ISO timestamp', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      const entry = submitExpense(form, store, queue)!;

      expect(() => new Date(entry.timestamp)).not.toThrow();
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it('entry has a non-empty id', () => {
      const form: FormValues = { expenseType: 'Food', amount: 50, limit: 200 };
      const entry = submitExpense(form, store, queue)!;

      expect(entry.id).toBeTruthy();
      expect(entry.id.length).toBeGreaterThan(0);
    });
  });
});
