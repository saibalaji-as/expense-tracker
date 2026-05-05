import { Injectable, signal, Signal } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';
import { ExpenseEntry, OfflineQueueEntry } from '../models';
import { GoogleSheetsService } from './google-sheets.service';

const DB_NAME = 'pf-pwa-db';
const STORE_NAME = 'offline-queue';
const DB_VERSION = 1;
const MAX_RETRY_COUNT = 5;

/** Reads the spreadsheet ID saved by the user in Settings. */
function getSheetId(): string {
  return (typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null) ?? '';
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  // ─── Task 6.1: online signal ──────────────────────────────────────────────────
  readonly isOnline: Signal<boolean>;

  // ─── Task 6.5: queue length signal ───────────────────────────────────────────
  readonly queueLength: Signal<number>;

  private readonly _isOnline = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  private readonly _queueLength = signal<number>(0);

  /** Lazily-opened IndexedDB promise — shared across all calls. */
  private dbPromise: Promise<IDBPDatabase> | null = null;

  constructor(private readonly sheetsService: GoogleSheetsService) {
    this.isOnline = this._isOnline.asReadonly();
    this.queueLength = this._queueLength.asReadonly();

    // ─── Task 6.1: listen to online/offline events ────────────────────────────
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._isOnline.set(true));
      window.addEventListener('offline', () => this._isOnline.set(false));

      // ─── Task 6.5: flush queue on reconnect ───────────────────────────────
      window.addEventListener('online', () => {
        this.flushQueue().catch(() => {
          // Errors are handled inside flushQueue; swallow here to avoid
          // unhandled-rejection warnings on the event listener.
        });
      });
    }

    // ─── Task 6.5: initialise queueLength from IndexedDB on startup ──────────
    this.getDb()
      .then((db) => db.count(STORE_NAME))
      .then((count) => this._queueLength.set(count))
      .catch(() => {
        // IndexedDB may be unavailable (e.g. private browsing); ignore.
      });
  }

  // ─── Private: lazy DB initialisation ─────────────────────────────────────────

  private getDb(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        },
      });
    }
    return this.dbPromise;
  }

  // ─── Task 6.2: enqueue ────────────────────────────────────────────────────────

  async enqueue(entry: ExpenseEntry): Promise<void> {
    console.log('[SyncService] Enqueuing entry:', entry.id);
    const queueEntry: OfflineQueueEntry = {
      id: entry.id,
      entry,
      retryCount: 0,
      enqueuedAt: new Date().toISOString(),
    };

    const db = await this.getDb();
    await db.put(STORE_NAME, queueEntry);

    // Update the queueLength signal after the write
    const count = await db.count(STORE_NAME);
    this._queueLength.set(count);
    console.log('[SyncService] Queue length:', count);
  }

  // ─── Task 6.3: flushQueue ─────────────────────────────────────────────────────

  async flushQueue(): Promise<void> {
    console.log('[SyncService] flushQueue called');
    if (!getSheetId()) {
      console.warn('[SyncService] No sheet ID configured, skipping flush');
      return;   // no sheet configured yet
    }

    const db = await this.getDb();
    const entries: OfflineQueueEntry[] = await db.getAll(STORE_NAME);

    console.log('[SyncService] Flushing', entries.length, 'entries');
    if (entries.length === 0) {
      return;
    }

    try {
      await this.sheetsService.batchUpdate(
        getSheetId(),
        entries.map((e) => e.entry)
      );

      console.log('[SyncService] Batch update successful, clearing queue');
      // Success: delete all flushed entries from the store
      for (const queueEntry of entries) {
        await db.delete(STORE_NAME, queueEntry.id);
      }
    } catch (err) {
      console.error('[SyncService] Batch update failed:', err);
      // Failure: increment retryCount for each entry and re-save
      for (const queueEntry of entries) {
        const updated: OfflineQueueEntry = {
          ...queueEntry,
          retryCount: queueEntry.retryCount + 1,
        };

        if (updated.retryCount >= MAX_RETRY_COUNT) {
          // Emit an error via the GoogleSheetsService error channel
          this.sheetsService.apiError$.next({
            status: 0,
            message: `Offline queue entry ${updated.id} has failed ${updated.retryCount} times and could not be synced. Please check your connection and try again.`,
            operation: 'flushQueue',
          });
        }

        await db.put(STORE_NAME, updated);
      }
    }

    // Update the queueLength signal after the operation
    const count = await db.count(STORE_NAME);
    this._queueLength.set(count);
    console.log('[SyncService] Queue length after flush:', count);
  }

  // ─── Task 6.4: clearQueue ─────────────────────────────────────────────────────

  async clearQueue(): Promise<void> {
    const db = await this.getDb();
    await db.clear(STORE_NAME);
    this._queueLength.set(0);
  }
}
