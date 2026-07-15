/**
 * Family Ledger — record-level Firestore sync (docs/family-sync-centralization-plan.md).
 *
 * One shared record = one Firestore document at `families/{familyId}/ledger/{type:id}`.
 * All writes are idempotent upserts; deletions are tombstones (`deleted: true`).
 * This replaces the single full-state document at `families/{id}/state/current`
 * (kept read-only for one-time migration).
 */

export type LedgerRecordType =
  | 'expense'
  | 'adjustment'
  | 'debt-payment'
  | 'account'
  | 'debt'
  | 'limits' // singleton: payload = { limits: ExpenseLimit[] }
  | 'meta';  // singleton: payload = { monthlyIncome: number; currency: string }

export interface LedgerWriter {
  uid: string;
  email: string;
  role: 'owner' | 'partner';
}

/** The un-enveloped unit produced by the local diff and consumed by apply. */
export interface LedgerOp {
  type: LedgerRecordType;
  id: string;
  /** Record payload; irrelevant (kept null) when `deleted` is true. */
  payload: unknown;
  deleted: boolean;
}

/** Firestore document shape (LedgerOp + write envelope). */
export interface LedgerRecord extends LedgerOp {
  updatedAt: string;
  updatedBy: LedgerWriter;
}

/** Singleton record ids. */
export const LEDGER_LIMITS_ID = 'limits';
export const LEDGER_META_ID = 'meta';

/** Firestore document id for a record ('/' is the only forbidden character). */
export function ledgerDocId(type: LedgerRecordType, id: string): string {
  return `${type}:${id.replace(/\//g, '_')}`;
}

/** What the local device believes the ledger currently contains, per doc id. */
export interface LedgerCopyEntry {
  /** Stable-stringified `{ payload, deleted }` — divergence comparison key. */
  json: string;
  deleted: boolean;
  type: LedgerRecordType;
  id: string;
}

/** A ledger doc change delivered to the store, with the previous known copy. */
export interface LedgerChange {
  record: LedgerRecord;
  /** Stable json of the copy this device previously knew, or null if new to us. */
  prevJson: string | null;
}
