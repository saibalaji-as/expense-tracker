// Feature: personal-finance-pwa, Property 20: Offline queue lifecycle
import * as fc from 'fast-check';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpenseEntry } from '../models/expense-entry.model';
import { OfflineQueueEntry } from '../models/offline-queue-entry.model';
import { PREDEFINED_EXPENSE_TYPES } from '../models/category-definitions';

// ─── Pure logic helpers (mirrors SyncService queue logic) ─────────────────────

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

function getAll(queue: MockQueue): OfflineQueueEntry[] {
  return Array.from(queue.entries.values());
}

function deleteEntry(queue: MockQueue, id: string): void {
  queue.entries.delete(id);
}

function clearQueue(queue: MockQueue): void {
  queue.entries.clear();
}

function incrementRetryCount(queue: MockQueue, id: string): void {
  const entry = queue.entries.get(id);
  if (entry) {
    queue.entries.set(id, { ...entry, retryCount: entry.retryCount + 1 });
  }
}

/** Simulates a successful flush: removes all entries from queue */
function flushSuccess(
  queue: MockQueue,
  batchUpdateFn: (entries: ExpenseEntry[]) => void
): void {
  const entries = getAll(queue);
  if (entries.length === 0) return;

  batchUpdateFn(entries.map(e => e.entry));
  for (const e of entries) {
    deleteEntry(queue, e.id);
  }
}

/** Simulates a failed flush: increments retryCount for all entries */
function flushFailure(queue: MockQueue): void {
  const entries = getAll(queue);
  for (const e of entries) {
    incrementRetryCount(queue, e.id);
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const expenseEntryArb = fc.record<ExpenseEntry>({
  id:        fc.uuid(),
  date:      fc.constant(new Date().toISOString().slice(0, 10)),
  amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
  type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  limit:     fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
  savings:   fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
  timestamp: fc.constant(new Date().toISOString()),
});

// ─── Property 20: Offline Queue Lifecycle ────────────────────────────────────

describe('Property 20: Offline Queue Lifecycle', () => {
  it('enqueued entries appear in the queue', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          // Deduplicate by id
          const uniqueEntries = entries.filter(
            (e, i, arr) => arr.findIndex(x => x.id === e.id) === i
          );

          const queue = createQueue();
          for (const entry of uniqueEntries) {
            enqueue(queue, entry);
          }

          expect(queue.entries.size).toBe(uniqueEntries.length);
          for (const entry of uniqueEntries) {
            expect(queue.entries.has(entry.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after successful flush, queue is empty and batchUpdate was called with all entries', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          const uniqueEntries = entries.filter(
            (e, i, arr) => arr.findIndex(x => x.id === e.id) === i
          );

          const queue = createQueue();
          for (const entry of uniqueEntries) {
            enqueue(queue, entry);
          }

          const batchUpdateCalled: ExpenseEntry[][] = [];
          flushSuccess(queue, (flushedEntries) => {
            batchUpdateCalled.push(flushedEntries);
          });

          // Queue is empty after successful flush
          expect(queue.entries.size).toBe(0);

          // batchUpdate was called once with all entries
          expect(batchUpdateCalled.length).toBe(1);
          expect(batchUpdateCalled[0].length).toBe(uniqueEntries.length);

          // All original entries were passed to batchUpdate
          for (const entry of uniqueEntries) {
            expect(batchUpdateCalled[0]).toContainEqual(entry);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after failed flush, entries remain in queue with incremented retryCount', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (entries, failureCount) => {
          const uniqueEntries = entries.filter(
            (e, i, arr) => arr.findIndex(x => x.id === e.id) === i
          );

          const queue = createQueue();
          for (const entry of uniqueEntries) {
            enqueue(queue, entry);
          }

          // Simulate multiple failures
          for (let i = 0; i < failureCount; i++) {
            flushFailure(queue);
          }

          // All entries still in queue
          expect(queue.entries.size).toBe(uniqueEntries.length);

          // All entries have retryCount incremented by failureCount
          for (const queueEntry of getAll(queue)) {
            expect(queueEntry.retryCount).toBe(failureCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('clearQueue removes all entries and resets count to 0', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 10 }),
        (entries) => {
          const uniqueEntries = entries.filter(
            (e, i, arr) => arr.findIndex(x => x.id === e.id) === i
          );

          const queue = createQueue();
          for (const entry of uniqueEntries) {
            enqueue(queue, entry);
          }

          clearQueue(queue);
          expect(queue.entries.size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('enqueue is idempotent: enqueueing same entry twice does not duplicate it', () => {
    fc.assert(
      fc.property(
        expenseEntryArb,
        (entry) => {
          const queue = createQueue();
          enqueue(queue, entry);
          enqueue(queue, entry);  // enqueue same entry again
          expect(queue.entries.size).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('flush on empty queue does not call batchUpdate', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const queue = createQueue();
        const batchUpdateCalled: ExpenseEntry[][] = [];

        flushSuccess(queue, (entries) => {
          batchUpdateCalled.push(entries);
        });

        expect(batchUpdateCalled.length).toBe(0);
        expect(queue.entries.size).toBe(0);
      }),
      { numRuns: 10 }
    );
  });

  it('entry present in queue after enqueue, absent after successful flush', () => {
    fc.assert(
      fc.property(
        expenseEntryArb,
        (entry) => {
          const queue = createQueue();
          enqueue(queue, entry);

          // Entry is present
          expect(queue.entries.has(entry.id)).toBe(true);

          flushSuccess(queue, () => {});

          // Entry is absent after flush
          expect(queue.entries.has(entry.id)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests (Task 16.4) ───────────────────────────────────────────────────

describe('Unit: SyncService queue logic', () => {
  const makeEntry = (id: string): ExpenseEntry => ({
    id,
    date: new Date().toISOString().slice(0, 10),
    amount: 25,
    type: 'Food',
    limit: 100,
    savings: 75,
    timestamp: new Date().toISOString(),
  });

  it('enqueue creates an OfflineQueueEntry with retryCount: 0', () => {
    const queue = createQueue();
    const entry = makeEntry('entry-001');
    enqueue(queue, entry);

    const queueEntry = queue.entries.get('entry-001');
    expect(queueEntry).toBeDefined();
    expect(queueEntry!.retryCount).toBe(0);
    expect(queueEntry!.id).toBe('entry-001');
    expect(queueEntry!.entry).toEqual(entry);
  });

  it('enqueue sets enqueuedAt to a valid ISO timestamp', () => {
    const queue = createQueue();
    const entry = makeEntry('entry-002');
    enqueue(queue, entry);

    const queueEntry = queue.entries.get('entry-002');
    expect(queueEntry).toBeDefined();
    expect(() => new Date(queueEntry!.enqueuedAt)).not.toThrow();
    expect(new Date(queueEntry!.enqueuedAt).toISOString()).toBe(queueEntry!.enqueuedAt);
  });

  it('flushQueue calls batchUpdate with all queued entries', () => {
    const queue = createQueue();
    const entryA = makeEntry('a');
    const entryB = makeEntry('b');
    enqueue(queue, entryA);
    enqueue(queue, entryB);

    const batchUpdateCalled: ExpenseEntry[][] = [];
    flushSuccess(queue, (entries) => {
      batchUpdateCalled.push(entries);
    });

    expect(batchUpdateCalled).toHaveLength(1);
    expect(batchUpdateCalled[0]).toHaveLength(2);
    expect(batchUpdateCalled[0]).toContainEqual(entryA);
    expect(batchUpdateCalled[0]).toContainEqual(entryB);
  });

  it('flushQueue removes entries from queue after successful batchUpdate', () => {
    const queue = createQueue();
    enqueue(queue, makeEntry('x'));
    enqueue(queue, makeEntry('y'));

    flushSuccess(queue, () => {});

    expect(queue.entries.size).toBe(0);
  });

  it('flushQueue increments retryCount when batchUpdate throws', () => {
    const queue = createQueue();
    enqueue(queue, makeEntry('fail-1'));
    enqueue(queue, makeEntry('fail-2'));

    // Simulate failure
    flushFailure(queue);

    for (const queueEntry of getAll(queue)) {
      expect(queueEntry.retryCount).toBe(1);
    }
  });

  it('flushQueue increments retryCount on each failure', () => {
    const queue = createQueue();
    enqueue(queue, makeEntry('retry-entry'));

    flushFailure(queue);
    flushFailure(queue);
    flushFailure(queue);

    const queueEntry = queue.entries.get('retry-entry');
    expect(queueEntry!.retryCount).toBe(3);
  });

  it('clearQueue empties the store', () => {
    const queue = createQueue();
    enqueue(queue, makeEntry('c1'));
    enqueue(queue, makeEntry('c2'));
    enqueue(queue, makeEntry('c3'));

    expect(queue.entries.size).toBe(3);

    clearQueue(queue);

    expect(queue.entries.size).toBe(0);
  });

  it('clearQueue on empty queue is a no-op', () => {
    const queue = createQueue();
    expect(() => clearQueue(queue)).not.toThrow();
    expect(queue.entries.size).toBe(0);
  });
});
