import { toLocalDateString } from './local-date';
import {
  NotificationInboxItem,
  NotificationInboxKind,
  NotificationInboxStatus,
} from '../models/notification-inbox.model';
import { ExpenseEntry } from '../models/expense-entry.model';

/** Amount tolerance when matching a detection against an already-logged expense. */
export const AUTO_MATCH_AMOUNT_TOLERANCE = 1;

const KINDS: readonly NotificationInboxKind[] = [
  'expense',
  'income',
  'salary',
  'cc-spend',
  'cc-payment',
];

const STATUSES: readonly NotificationInboxStatus[] = [
  'pending',
  'logged',
  'dismissed',
  'auto-handled',
];

/**
 * Normalizes one raw stored inbox record (written by the Android listener)
 * into a typed item. Returns null for malformed records.
 */
export function normalizeInboxItem(raw: unknown): NotificationInboxItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const id = typeof record['id'] === 'string' ? record['id'] : '';
  const detectedAt = typeof record['detectedAt'] === 'string' ? record['detectedAt'] : '';
  const amount = Number(record['amount']);
  if (!id || !detectedAt || !Number.isFinite(amount) || amount <= 0) return null;

  const kind = KINDS.includes(record['kind'] as NotificationInboxKind)
    ? (record['kind'] as NotificationInboxKind)
    : 'expense';
  const status = STATUSES.includes(record['status'] as NotificationInboxStatus)
    ? (record['status'] as NotificationInboxStatus)
    : 'pending';

  return {
    id,
    userEmail: typeof record['userEmail'] === 'string' ? record['userEmail'] : null,
    detectedAt,
    kind,
    amount,
    currency: typeof record['currency'] === 'string' ? record['currency'] : 'INR',
    comment: typeof record['comment'] === 'string' ? record['comment'] : '',
    sourceApp: typeof record['sourceApp'] === 'string' ? record['sourceApp'] : '',
    cardLast4: typeof record['cardLast4'] === 'string' && record['cardLast4'].trim() !== ''
      ? record['cardLast4']
      : undefined,
    status,
    linkedEntryId: typeof record['linkedEntryId'] === 'string' && record['linkedEntryId'] !== ''
      ? record['linkedEntryId']
      : undefined,
    statusChangedAt: typeof record['statusChangedAt'] === 'string' ? record['statusChangedAt'] : undefined,
  };
}

/** Parses the raw stored JSON array; malformed records are dropped. */
export function parseInbox(rawJson: string | null): NotificationInboxItem[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeInboxItem)
      .filter((item): item is NotificationInboxItem => item !== null);
  } catch {
    return [];
  }
}

/** True when the item belongs to the signed-in user (legacy items have no email). */
export function inboxItemMatchesUser(item: NotificationInboxItem, email: string | null): boolean {
  if (!item.userEmail) return true;
  if (!email) return false;
  return item.userEmail.toLowerCase() === email.toLowerCase();
}

/** Local YYYY-MM-DD of the detection. */
export function inboxItemLocalDate(item: NotificationInboxItem): string {
  const date = new Date(item.detectedAt);
  if (Number.isNaN(date.getTime())) return '';
  return toLocalDateString(date);
}

/**
 * Duplicate auto-match: a pending expense-like detection whose amount matches
 * an already-logged expense on the same local day was almost certainly logged
 * manually — mark it handled instead of nagging.
 *
 * Returns `[itemId, matchedEntryId]` pairs; entries already linked to another
 * inbox item are not reused, and each entry matches at most one item.
 */
export function findAutoMatches(
  items: readonly NotificationInboxItem[],
  entries: readonly ExpenseEntry[],
): Array<[string, string]> {
  const linkedEntryIds = new Set(
    items.map((item) => item.linkedEntryId).filter((id): id is string => !!id),
  );

  const matches: Array<[string, string]> = [];
  for (const item of items) {
    if (item.status !== 'pending') continue;
    if (item.kind !== 'expense' && item.kind !== 'cc-spend') continue;

    const localDate = inboxItemLocalDate(item);
    if (!localDate) continue;

    const entry = entries.find(
      (candidate) =>
        !linkedEntryIds.has(candidate.id) &&
        candidate.date === localDate &&
        Math.abs(candidate.amount - item.amount) <= AUTO_MATCH_AMOUNT_TOLERANCE,
    );
    if (entry) {
      linkedEntryIds.add(entry.id);
      matches.push([item.id, entry.id]);
    }
  }
  return matches;
}

/** Sum of pending amounts in the given currency (mixed currencies are excluded). */
export function pendingTotal(items: readonly NotificationInboxItem[], currency: string): number {
  return items
    .filter(
      (item) =>
        item.status === 'pending' &&
        item.currency === currency &&
        (item.kind === 'expense' || item.kind === 'cc-spend'),
    )
    .reduce((sum, item) => Math.round((sum + item.amount) * 100) / 100, 0);
}
