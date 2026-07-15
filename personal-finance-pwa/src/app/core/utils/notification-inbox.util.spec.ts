import { describe, expect, it } from 'vitest';
import {
  findAutoMatches,
  inboxItemLocalDate,
  inboxItemMatchesUser,
  normalizeInboxItem,
  parseInbox,
  pendingTotal,
} from './notification-inbox.util';
import { NotificationInboxItem } from '../models/notification-inbox.model';
import { ExpenseEntry } from '../models/expense-entry.model';
import { toLocalDateString } from './local-date';

function item(overrides: Partial<NotificationInboxItem> = {}): NotificationInboxItem {
  return {
    id: 'item-1',
    userEmail: 'user@example.com',
    detectedAt: '2026-07-05T08:30:00.000Z',
    kind: 'expense',
    amount: 250,
    currency: 'INR',
    comment: 'Rs 250 debited from a/c',
    sourceApp: 'com.android.messaging',
    status: 'pending',
    ...overrides,
  };
}

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: 'entry-1',
    date: '2026-07-05',
    amount: 250,
    type: 'Miscellaneous',
    limit: 0,
    savings: -250,
    timestamp: '2026-07-05T09:00:00.000Z',
    ...overrides,
  } as ExpenseEntry;
}

describe('normalizeInboxItem', () => {
  it('normalizes a raw listener record', () => {
    const normalized = normalizeInboxItem({
      id: 'abc',
      userEmail: 'user@example.com',
      detectedAt: '2026-07-05T08:30:00.000Z',
      kind: 'cc-spend',
      amount: 499.5,
      currency: 'INR',
      comment: 'spent on credit card xx1234',
      sourceApp: 'com.google.android.apps.messaging',
      cardLast4: '1234',
      status: 'pending',
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.kind).toBe('cc-spend');
    expect(normalized!.cardLast4).toBe('1234');
    expect(normalized!.amount).toBe(499.5);
  });

  it('rejects records without id, date, or a positive amount', () => {
    expect(normalizeInboxItem(null)).toBeNull();
    expect(normalizeInboxItem({ id: '', detectedAt: 'x', amount: 5 })).toBeNull();
    expect(normalizeInboxItem({ id: 'a', detectedAt: '', amount: 5 })).toBeNull();
    expect(normalizeInboxItem({ id: 'a', detectedAt: 'x', amount: 0 })).toBeNull();
    expect(normalizeInboxItem({ id: 'a', detectedAt: 'x', amount: 'NaN' })).toBeNull();
  });

  it('falls back to safe defaults for unknown kind/status', () => {
    const normalized = normalizeInboxItem({
      id: 'a',
      detectedAt: '2026-07-05T08:30:00.000Z',
      amount: 10,
      kind: 'mystery',
      status: 'weird',
    });
    expect(normalized!.kind).toBe('expense');
    expect(normalized!.status).toBe('pending');
    expect(normalized!.currency).toBe('INR');
  });
});

describe('parseInbox', () => {
  it('parses an array and drops malformed records', () => {
    const raw = JSON.stringify([
      item(),
      { id: '', detectedAt: '', amount: 0 },
      'garbage',
    ]);
    expect(parseInbox(raw)).toHaveLength(1);
  });

  it('returns empty for null, invalid JSON, and non-arrays', () => {
    expect(parseInbox(null)).toEqual([]);
    expect(parseInbox('{not json')).toEqual([]);
    expect(parseInbox('{"a":1}')).toEqual([]);
  });
});

describe('inboxItemMatchesUser', () => {
  it('matches same email case-insensitively', () => {
    expect(inboxItemMatchesUser(item(), 'User@Example.com')).toBe(true);
  });

  it('rejects a different email', () => {
    expect(inboxItemMatchesUser(item(), 'other@example.com')).toBe(false);
  });

  it('legacy items without email match any signed-in user', () => {
    expect(inboxItemMatchesUser(item({ userEmail: null }), 'user@example.com')).toBe(true);
  });

  it('email-tagged items do not match a signed-out session', () => {
    expect(inboxItemMatchesUser(item(), null)).toBe(false);
  });
});

describe('findAutoMatches', () => {
  const localDay = (iso: string) => toLocalDateString(new Date(iso));

  it('matches a pending expense to a same-day entry within tolerance', () => {
    const detected = item({ detectedAt: '2026-07-05T08:30:00.000Z' });
    const logged = entry({ date: localDay(detected.detectedAt), amount: 250.8 });
    expect(findAutoMatches([detected], [logged])).toEqual([['item-1', 'entry-1']]);
  });

  it('does not match beyond the amount tolerance or on another day', () => {
    const detected = item({ detectedAt: '2026-07-05T08:30:00.000Z' });
    const wrongAmount = entry({ date: localDay(detected.detectedAt), amount: 260 });
    const wrongDay = entry({ id: 'entry-2', date: '2026-07-01' });
    expect(findAutoMatches([detected], [wrongAmount, wrongDay])).toEqual([]);
  });

  it('skips non-pending and income-like items', () => {
    const logged = entry({ date: localDay(item().detectedAt) });
    expect(findAutoMatches([item({ status: 'logged' })], [logged])).toEqual([]);
    expect(findAutoMatches([item({ kind: 'income' })], [logged])).toEqual([]);
    expect(findAutoMatches([item({ kind: 'cc-payment' })], [logged])).toEqual([]);
  });

  it('never reuses an entry already linked to another inbox item', () => {
    const dayIso = '2026-07-05T08:30:00.000Z';
    const linked = item({ id: 'item-0', status: 'logged', linkedEntryId: 'entry-1' });
    const pending = item({ id: 'item-1', detectedAt: dayIso });
    const logged = entry({ date: localDay(dayIso) });
    expect(findAutoMatches([linked, pending], [logged])).toEqual([]);
  });

  it('matches each entry at most once across multiple pending items', () => {
    const dayIso = '2026-07-05T08:30:00.000Z';
    const first = item({ id: 'item-1', detectedAt: dayIso });
    const second = item({ id: 'item-2', detectedAt: dayIso });
    const logged = entry({ date: localDay(dayIso) });
    expect(findAutoMatches([first, second], [logged])).toEqual([['item-1', 'entry-1']]);
  });
});

describe('pendingTotal', () => {
  it('sums pending expense-like amounts in the selected currency only', () => {
    const items = [
      item({ id: 'a', amount: 100 }),
      item({ id: 'b', amount: 50.25, kind: 'cc-spend' }),
      item({ id: 'c', amount: 999, currency: 'USD' }),
      item({ id: 'd', amount: 999, status: 'logged' }),
      item({ id: 'e', amount: 999, kind: 'income' }),
    ];
    expect(pendingTotal(items, 'INR')).toBe(150.25);
  });
});
