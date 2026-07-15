import { Injectable, computed, inject, isDevMode, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import {
  NOTIFICATION_INBOX_STORAGE_KEY,
  NotificationInboxItem,
  NotificationInboxStatus,
} from '../models/notification-inbox.model';
import { ExpenseEntry } from '../models/expense-entry.model';
import {
  findAutoMatches,
  inboxItemMatchesUser,
  parseInbox,
  pendingTotal,
} from '../utils/notification-inbox.util';

/**
 * Reads and mutates the device-local notification inbox written by the
 * Android spend-notification listener.
 *
 * PRIVACY: inbox items contain SMS-derived text and stay in Capacitor
 * Preferences only — never persisted to Drive or family Firestore sync.
 * On web the inbox is simply empty (the listener is Android-only).
 */
@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);

  /** All inbox items belonging to the signed-in user, newest first. */
  readonly items = signal<NotificationInboxItem[]>([]);
  readonly loaded = signal(false);

  readonly pendingItems = computed(() =>
    this.items().filter((item) => item.status === 'pending'),
  );
  readonly pendingCount = computed(() => this.pendingItems().length);
  readonly handledItems = computed(() =>
    this.items().filter((item) => item.status !== 'pending'),
  );

  /** Serializes read-modify-write cycles so concurrent mutations can't clobber. */
  #writeQueue: Promise<void> = Promise.resolve();

  pendingExpenseTotal(currency: string): number {
    return pendingTotal(this.items(), currency);
  }

  /** Reloads the inbox from Preferences (call on screen open / app resume). */
  async load(): Promise<void> {
    try {
      const raw = await this.storage.get(NOTIFICATION_INBOX_STORAGE_KEY);
      const email = this.auth.userEmail();
      const all = parseInbox(raw);
      const mine = all
        .filter((item) => inboxItemMatchesUser(item, email))
        .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      this.items.set(mine);
    } catch (error) {
      if (isDevMode()) { console.warn('[NotificationInbox] Failed to load inbox:', error); }
      this.items.set([]);
    } finally {
      this.loaded.set(true);
    }
  }

  async markLogged(itemId: string, linkedEntryId?: string): Promise<void> {
    await this.#setStatus(itemId, 'logged', linkedEntryId);
  }

  async dismiss(itemId: string): Promise<void> {
    await this.#setStatus(itemId, 'dismissed');
  }

  /**
   * Marks pending expense-like detections whose amount matches an expense
   * already logged on the same local day as auto-handled. Returns the number
   * of items matched.
   */
  async autoMatch(entries: readonly ExpenseEntry[]): Promise<number> {
    const matches = findAutoMatches(this.items(), entries);
    for (const [itemId, entryId] of matches) {
      await this.#setStatus(itemId, 'auto-handled', entryId);
    }
    return matches.length;
  }

  async #setStatus(
    itemId: string,
    status: NotificationInboxStatus,
    linkedEntryId?: string,
  ): Promise<void> {
    const task = this.#writeQueue.then(async () => {
      // Re-read raw storage so items of other accounts (or ones added by the
      // native listener since our last load) are preserved on write.
      const raw = await this.storage.get(NOTIFICATION_INBOX_STORAGE_KEY);
      let all: unknown[];
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        all = Array.isArray(parsed) ? parsed : [];
      } catch {
        all = [];
      }

      const statusChangedAt = new Date().toISOString();
      let changed = false;
      const next = all.map((rawItem) => {
        if (!rawItem || typeof rawItem !== 'object') return rawItem;
        const record = rawItem as Record<string, unknown>;
        if (record['id'] !== itemId) return rawItem;
        changed = true;
        return {
          ...record,
          status,
          statusChangedAt,
          ...(linkedEntryId ? { linkedEntryId } : {}),
        };
      });

      if (changed) {
        await this.storage.set(NOTIFICATION_INBOX_STORAGE_KEY, JSON.stringify(next));
      }

      // Reflect in the in-memory signal regardless, so the UI updates even if
      // the raw record was missing (e.g. evicted between load and action).
      this.items.update((items) =>
        items.map((item) =>
          item.id === itemId
            ? { ...item, status, statusChangedAt, ...(linkedEntryId ? { linkedEntryId } : {}) }
            : item,
        ),
      );
    });

    // Keep the queue alive even when a task fails.
    this.#writeQueue = task.catch((error) => {
      if (isDevMode()) { console.warn('[NotificationInbox] Failed to update item:', error); }
    });
    return task;
  }
}
