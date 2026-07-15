import type { BackupDocument } from '../services/google-drive.service';
import type { ExpenseEntry } from '../models';

/**
 * Pure merge helpers for family-mode Firestore state sync.
 *
 * Used in TWO places that must stay in agreement:
 * 1. `FamilySyncService.pushState()` — merge-on-write inside the Firestore
 *    transaction, so a device pushing its full local state can never wipe
 *    entries the other device pushed while this device was offline/closed
 *    (last-writer-wins clobbering was the root cause of "partner logged an
 *    expense but it never appeared on my device", 2026-07-11).
 * 2. The `ExpenseStore` incoming-state subscriber — merging a received
 *    snapshot into local signals.
 *
 * Rules:
 * - Entries: union by id; the incoming copy wins when its timestamp is >= the
 *   base copy's. Local receipt metadata is preserved when the incoming copy
 *   lacks it (receipts are device-private and stripped before push).
 * - Tombstones (`deletedEntryIds`) always win over presence.
 * - Accounts/debts: union by id, incoming wins on `updatedAt` tie-or-newer.
 * - Adjustments/payments: append-only audit logs — union, existing kept.
 */

export function mergeEntries(
  base: readonly ExpenseEntry[],
  incoming: readonly ExpenseEntry[],
  deletedEntryIds: ReadonlySet<string>
): ExpenseEntry[] {
  const byId = new Map<string, ExpenseEntry>();
  for (const entry of base) byId.set(entry.id, entry);
  for (const inc of incoming) {
    const existing = byId.get(inc.id);
    if (!existing || (inc.timestamp ?? '') >= (existing.timestamp ?? '')) {
      // Receipts are device-private (appDataFolder) and stripped from pushed
      // state, so an incoming edit must not wipe the local attachment.
      const merged = existing?.receipt && !inc.receipt
        ? { ...inc, receipt: existing.receipt }
        : inc;
      byId.set(inc.id, merged);
    }
  }
  for (const deletedId of deletedEntryIds) byId.delete(deletedId);
  return Array.from(byId.values())
    .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
}

export function mergeByUpdatedAt<T extends { id: string; updatedAt?: string }>(
  base: readonly T[],
  incoming: readonly T[]
): T[] {
  const byId = new Map<string, T>(base.map((item) => [item.id, item]));
  for (const inc of incoming) {
    const existing = byId.get(inc.id);
    if (!existing || (inc.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
      byId.set(inc.id, inc);
    }
  }
  return Array.from(byId.values());
}

export function mergeAddOnly<T extends { id: string }>(
  base: readonly T[],
  incoming: readonly T[]
): T[] {
  const byId = new Map<string, T>(base.map((item) => [item.id, item]));
  for (const inc of incoming) {
    if (!byId.has(inc.id)) byId.set(inc.id, inc);
  }
  return Array.from(byId.values());
}

/**
 * Merges a device's outgoing full-state document (`incoming`) with the state
 * document currently stored in Firestore (`current`). `deletedEntryIds` must
 * already be the UNION of the stored tombstones and the pusher's local ones.
 */
export function mergeBackupDocuments(
  current: BackupDocument,
  incoming: BackupDocument,
  deletedEntryIds: ReadonlySet<string>
): BackupDocument {
  const incomingNewer = (incoming.lastUpdated ?? '') >= (current.lastUpdated ?? '');
  const newer = incomingNewer ? incoming : current;
  const newerLimits = incomingNewer ? incoming.limits : current.limits;
  const olderLimits = incomingNewer ? current.limits : incoming.limits;
  return {
    ...newer,
    expenses: mergeEntries(current.expenses ?? [], incoming.expenses ?? [], deletedEntryIds),
    limits: (newerLimits?.length ?? 0) > 0 ? newerLimits : (olderLimits ?? []),
    accounts: mergeByUpdatedAt(current.accounts ?? [], incoming.accounts ?? []),
    accountAdjustments: mergeAddOnly(current.accountAdjustments ?? [], incoming.accountAdjustments ?? []),
    debts: mergeByUpdatedAt(current.debts ?? [], incoming.debts ?? []),
    debtPayments: mergeAddOnly(current.debtPayments ?? [], incoming.debtPayments ?? []),
  };
}
