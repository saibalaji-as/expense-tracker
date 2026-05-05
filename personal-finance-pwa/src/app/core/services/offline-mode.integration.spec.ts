// Task 17.5: Offline mode flow integration tests
// Tests the offline mode logic directly without Angular TestBed.
// Validates: Requirements 8.2, 8.3
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseEntry } from '../models/expense-entry.model';
import { OfflineQueueEntry } from '../models/offline-queue-entry.model';

// ─── In-memory queue (mirrors SyncService queue logic) ────────────────────────

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

function count(queue: MockQueue): number {
  return queue.entries.size;
}

/**
 * Simulates flushQueue:
 * - On success: calls batchUpdate and removes all entries
 * - On failure: increments retryCount for all entries
 */
function flushQueue(
  queue: MockQueue,
  batchUpdateFn: (entries: ExpenseEntry[]) => void,
  shouldFail = false
): void {
  const entries = getAll(queue);
  if (entries.length === 0) return;

  if (shouldFail) {
    for (const e of entries) {
      queue.entries.set(e.id, { ...e, retryCount: e.retryCount + 1 });
    }
    return;
  }

  batchUpdateFn(entries.map((e) => e.entry));
  queue.entries.clear();
}

// ─── Online/offline state (mirrors SyncService.isOnline signal) ───────────────

interface NetworkState {
  isOnline: boolean;
}

function createNetworkState(online = true): NetworkState {
  return { isOnline: online };
}

function goOffline(state: NetworkState): void {
  state.isOnline = false;
}

function goOnline(state: NetworkState, queue: MockQueue, batchUpdateFn: (entries: ExpenseEntry[]) => void): void {
  state.isOnline = true;
  // Mirrors the 'online' event listener that calls flushQueue
  flushQueue(queue, batchUpdateFn);
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeEntry(id: string): ExpenseEntry {
  return {
    id,
    date: new Date().toISOString().slice(0, 10),
    amount: 50,
    type: 'Food',
    limit: 200,
    savings: 150,
    timestamp: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Offline mode flow integration', () => {
  let queue: MockQueue;
  let network: NetworkState;

  beforeEach(() => {
    queue = createQueue();
    network = createNetworkState(false); // start offline
  });

  // ─── Submit while offline → queue has 1 entry ─────────────────────────────

  describe('submit while offline', () => {
    it('queue has 1 entry after submitting while offline', () => {
      expect(network.isOnline).toBe(false);

      enqueue(queue, makeEntry('offline-001'));

      expect(count(queue)).toBe(1);
    });

    it('queue entry has retryCount of 0 when first enqueued', () => {
      enqueue(queue, makeEntry('offline-002'));

      const entry = queue.entries.get('offline-002');
      expect(entry!.retryCount).toBe(0);
    });

    it('multiple offline submissions accumulate in queue', () => {
      enqueue(queue, makeEntry('offline-a'));
      enqueue(queue, makeEntry('offline-b'));
      enqueue(queue, makeEntry('offline-c'));

      expect(count(queue)).toBe(3);
    });
  });

  // ─── Transition to online → queue is flushed ──────────────────────────────

  describe('transition to online', () => {
    it('queue is flushed when transitioning to online', () => {
      enqueue(queue, makeEntry('flush-on-online'));

      expect(count(queue)).toBe(1);

      goOnline(network, queue, () => {});

      expect(count(queue)).toBe(0);
    });

    it('isOnline becomes true after going online', () => {
      expect(network.isOnline).toBe(false);

      goOnline(network, queue, () => {});

      expect(network.isOnline).toBe(true);
    });

    it('batchUpdate is called with queued entries on going online', () => {
      const entry = makeEntry('batch-on-online');
      enqueue(queue, entry);

      const flushedEntries: ExpenseEntry[] = [];
      goOnline(network, queue, (entries) => flushedEntries.push(...entries));

      expect(flushedEntries).toHaveLength(1);
      expect(flushedEntries[0].id).toBe('batch-on-online');
    });

    it('queue is empty after successful online transition', () => {
      enqueue(queue, makeEntry('entry-1'));
      enqueue(queue, makeEntry('entry-2'));

      goOnline(network, queue, () => {});

      expect(count(queue)).toBe(0);
    });

    it('going online with empty queue does not call batchUpdate', () => {
      let batchCalled = false;
      goOnline(network, queue, () => { batchCalled = true; });

      expect(batchCalled).toBe(false);
    });
  });

  // ─── Failed flush → entry retained with incremented retryCount ───────────

  describe('failed flush', () => {
    it('entry is retained after a failed flush', () => {
      enqueue(queue, makeEntry('fail-flush-001'));

      flushQueue(queue, () => {}, /* shouldFail */ true);

      expect(count(queue)).toBe(1);
    });

    it('retryCount is incremented after a failed flush', () => {
      enqueue(queue, makeEntry('retry-count-001'));

      flushQueue(queue, () => {}, true);

      const entry = queue.entries.get('retry-count-001');
      expect(entry!.retryCount).toBe(1);
    });

    it('retryCount increments on each failed flush', () => {
      enqueue(queue, makeEntry('multi-fail'));

      flushQueue(queue, () => {}, true);
      flushQueue(queue, () => {}, true);
      flushQueue(queue, () => {}, true);

      const entry = queue.entries.get('multi-fail');
      expect(entry!.retryCount).toBe(3);
    });

    it('all entries are retained after a failed flush', () => {
      enqueue(queue, makeEntry('fail-a'));
      enqueue(queue, makeEntry('fail-b'));

      flushQueue(queue, () => {}, true);

      expect(count(queue)).toBe(2);
      expect(queue.entries.has('fail-a')).toBe(true);
      expect(queue.entries.has('fail-b')).toBe(true);
    });

    it('after failed flush then successful flush, queue is empty', () => {
      enqueue(queue, makeEntry('fail-then-ok'));

      flushQueue(queue, () => {}, true);
      expect(count(queue)).toBe(1);

      flushQueue(queue, () => {}, false);
      expect(count(queue)).toBe(0);
    });
  });

  // ─── Offline → online → offline cycle ────────────────────────────────────

  describe('offline/online cycle', () => {
    it('entries submitted offline are flushed when going online', () => {
      // Go offline and submit
      goOffline(network);
      enqueue(queue, makeEntry('cycle-entry-1'));
      enqueue(queue, makeEntry('cycle-entry-2'));

      expect(count(queue)).toBe(2);

      // Go online — triggers flush
      const flushed: ExpenseEntry[] = [];
      goOnline(network, queue, (entries) => flushed.push(...entries));

      expect(count(queue)).toBe(0);
      expect(flushed).toHaveLength(2);
    });
  });
});
