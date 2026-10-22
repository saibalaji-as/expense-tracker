// Notification inbox status handling: the in-memory status must flip in the
// SAME tick as the save, so the auto-match effect can never relabel a
// just-logged detection "Already logged" (auto-handled) — the 2026-10 bug where
// closing the log sheet early left an entry missing but marked handled.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import { NotificationInboxService } from './notification-inbox.service';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { NOTIFICATION_INBOX_STORAGE_KEY } from '../models/notification-inbox.model';
import { ExpenseEntry } from '../models/expense-entry.model';
import { inboxItemLocalDate } from '../utils/notification-inbox.util';

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  userEmail: 'user@example.com',
  detectedAt: '2026-10-08T06:30:00.000Z',
  kind: 'expense',
  amount: 250,
  currency: 'INR',
  comment: 'Rs 250 debited',
  sourceApp: 'com.android.messaging',
  status: 'pending',
  ...overrides,
});

describe('NotificationInboxService status updates', () => {
  let store: Map<string, string>;
  let service: NotificationInboxService;

  beforeEach(async () => {
    store = new Map([[NOTIFICATION_INBOX_STORAGE_KEY, JSON.stringify([raw()])]]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: StorageService,
          useValue: {
            get: async (key: string) => store.get(key) ?? null,
            set: async (key: string, value: string) => { store.set(key, value); },
          },
        },
        { provide: AuthService, useValue: { userEmail: () => 'user@example.com' } },
      ],
    });
    service = TestBed.inject(NotificationInboxService);
    await service.load();
  });

  it('flips the in-memory status synchronously and persists it', async () => {
    const pending = service.markLogged('item-1', 'entry-1');
    expect(service.items()[0].status).toBe('logged'); // before any await
    expect(service.items()[0].linkedEntryId).toBe('entry-1');
    await pending;
    expect(JSON.parse(store.get(NOTIFICATION_INBOX_STORAGE_KEY)!)[0].status).toBe('logged');
  });

  it('auto-match never overrides an explicit log made in the same tick', async () => {
    const item = service.items()[0];
    const entry = {
      id: 'entry-1',
      date: inboxItemLocalDate(item),
      amount: 250,
      type: 'Dining Out',
    } as ExpenseEntry;
    void service.markLogged('item-1', 'entry-1');
    await service.autoMatch([entry]);
    expect(service.items()[0].status).toBe('logged');
  });

  it('restore() puts back the previous status and clears a link it added', async () => {
    const before = service.items()[0];
    void service.markLogged('item-1', 'entry-x');
    await service.restore(before);
    expect(service.items()[0].status).toBe('pending');
    expect(service.items()[0].linkedEntryId).toBeUndefined();
    const persisted = JSON.parse(store.get(NOTIFICATION_INBOX_STORAGE_KEY)!)[0];
    expect(persisted.status).toBe('pending');
    expect(persisted.linkedEntryId).toBeUndefined();
  });
});
