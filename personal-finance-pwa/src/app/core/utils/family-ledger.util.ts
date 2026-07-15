import type {
  AccountBalanceAdjustment,
  AssetAccount,
  DebtAccount,
  DebtPayment,
  ExpenseEntry,
  ExpenseLimit,
} from '../models';
import {
  LEDGER_LIMITS_ID,
  LEDGER_META_ID,
  ledgerDocId,
  type LedgerChange,
  type LedgerCopyEntry,
  type LedgerOp,
  type LedgerRecordType,
} from '../models/family-ledger.model';

/**
 * Pure helpers for the Family Ledger (docs/family-sync-centralization-plan.md).
 *
 * DIFF (outgoing): compare the local state against the device's copy of the
 * ledger and produce the minimal set of upserts/tombstones the ledger is
 * missing. Re-running is always safe — records are idempotent by doc id.
 * Correctness is reconciliation-based: ANY call to the diff heals ANY gap,
 * regardless of which code path forgot what.
 *
 * APPLY (incoming): apply ledger doc changes to local state with a
 * local-divergence guard — if the local record differs from the copy of the
 * ledger we previously knew, a local un-pushed edit exists and the incoming
 * record is skipped (the next diff push overwrites it: last writer wins).
 */

/** JSON.stringify with recursively sorted object keys — stable comparison key. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue; // Firestore drops undefined; compare alike
      out[key] = sortKeys(entry);
    }
    return out;
  }
  return value;
}

/** Comparison/storage key of an op's content. */
export function opJson(payload: unknown, deleted: boolean): string {
  return stableStringify({ payload: deleted ? null : payload, deleted });
}

/** Receipts are device-private (Drive appDataFolder) — never sync their metadata. */
export function stripReceipt(entry: ExpenseEntry): ExpenseEntry {
  if (!entry.receipt) return entry;
  const { receipt: _receipt, ...rest } = entry;
  return rest;
}

export interface LedgerStateView {
  entries: readonly ExpenseEntry[];
  accountAdjustments: readonly AccountBalanceAdjustment[];
  debtPayments: readonly DebtPayment[];
  accounts: readonly AssetAccount[];
  debts: readonly DebtAccount[];
  limits: readonly ExpenseLimit[];
  monthlyIncome: number;
  currency: string;
}

interface DiffOptions {
  /**
   * When true (local data fully hydrated from Drive/cache), a record present in
   * the ledger but absent locally is treated as locally deleted → tombstone.
   * MUST be false before hydration completes, or an empty boot state would
   * tombstone the whole family history.
   */
  includeAbsenceTombstones: boolean;
  /** Entry ids deleted in this session (explicit tombstones, independent of hydration). */
  localDeletedEntryIds: ReadonlySet<string>;
  /**
   * Safety valve: if more than this many absence tombstones would be produced,
   * ALL of them are dropped (explicit tombstones are unaffected). Protects the
   * family history from a device that hydrated from a stale/partial backup —
   * genuine deletions happen one or two at a time, never in bulk.
   */
  maxAbsenceTombstones?: number;
}

const DEFAULT_MAX_ABSENCE_TOMBSTONES = 25;

/** Minimal set of ledger ops that bring the ledger up to date with local state. */
export function diffLedgerState(
  state: LedgerStateView,
  ledgerCopy: ReadonlyMap<string, LedgerCopyEntry>,
  options: DiffOptions
): LedgerOp[] {
  const ops: LedgerOp[] = [];
  const localDocIds = new Set<string>();

  const upsertIfChanged = (type: LedgerRecordType, id: string, payload: unknown): void => {
    const docId = ledgerDocId(type, id);
    localDocIds.add(docId);
    const known = ledgerCopy.get(docId);
    const json = opJson(payload, false);
    if (known?.json === json) return;
    ops.push({ type, id, payload, deleted: false });
  };

  for (const raw of state.entries) {
    const entry = stripReceipt(raw);
    upsertIfChanged('expense', entry.id, entry);
  }
  for (const adjustment of state.accountAdjustments) {
    upsertIfChanged('adjustment', adjustment.id, adjustment);
  }
  for (const payment of state.debtPayments) {
    upsertIfChanged('debt-payment', payment.id, payment);
  }
  for (const account of state.accounts) {
    upsertIfChanged('account', account.id, account);
  }
  for (const debt of state.debts) {
    upsertIfChanged('debt', debt.id, debt);
  }
  upsertIfChanged('limits', LEDGER_LIMITS_ID, { limits: state.limits });
  upsertIfChanged('meta', LEDGER_META_ID, {
    monthlyIncome: state.monthlyIncome,
    currency: state.currency,
  });

  // Explicit tombstones for entries deleted this session.
  for (const deletedId of options.localDeletedEntryIds) {
    const docId = ledgerDocId('expense', deletedId);
    const known = ledgerCopy.get(docId);
    localDocIds.add(docId); // handled here — keep the absence pass off this doc
    if (known && known.deleted) continue; // ledger already has the tombstone
    if (!known) continue;                 // never reached the ledger — nothing to kill
    ops.push({ type: 'expense', id: deletedId, payload: null, deleted: true });
  }

  // Absence tombstones: the ledger has a live record this hydrated device no
  // longer holds (deleted debt payment, removed debt, …) → propagate deletion.
  if (options.includeAbsenceTombstones) {
    const absenceOps: LedgerOp[] = [];
    for (const [docId, known] of ledgerCopy) {
      if (known.deleted || localDocIds.has(docId)) continue;
      if (known.type === 'limits' || known.type === 'meta') continue; // singletons always exist
      absenceOps.push({ type: known.type, id: known.id, payload: null, deleted: true });
    }
    if (absenceOps.length <= (options.maxAbsenceTombstones ?? DEFAULT_MAX_ABSENCE_TOMBSTONES)) {
      ops.push(...absenceOps);
    }
    // else: dropped — a stale hydration must never bulk-delete family history.
  }

  return ops;
}

export interface ApplyLedgerResult {
  entries: ExpenseEntry[];
  accountAdjustments: AccountBalanceAdjustment[];
  debtPayments: DebtPayment[];
  accounts: AssetAccount[];
  debts: DebtAccount[];
  limits: ExpenseLimit[];
  monthlyIncome: number;
  currency: string | null;
  changed: boolean;
  /** Entry ids tombstoned by the incoming changes (caller adds to its session set). */
  deletedEntryIds: string[];
}

/**
 * Applies incoming ledger changes to local state.
 * Guard per record: if the local copy diverges from `prevJson` (the ledger copy
 * this device previously knew), a local un-pushed edit exists — skip the
 * incoming record; the next diff push resolves the conflict (last writer wins).
 */
export function applyLedgerChanges(
  state: LedgerStateView,
  changes: readonly LedgerChange[],
  localDeletedEntryIds: ReadonlySet<string>
): ApplyLedgerResult {
  const entries = new Map(state.entries.map((entry) => [entry.id, entry]));
  const adjustments = new Map(state.accountAdjustments.map((item) => [item.id, item]));
  const payments = new Map(state.debtPayments.map((item) => [item.id, item]));
  const accounts = new Map(state.accounts.map((item) => [item.id, item]));
  const debts = new Map(state.debts.map((item) => [item.id, item]));
  let limits = state.limits as ExpenseLimit[];
  let monthlyIncome = state.monthlyIncome;
  let currency: string | null = null;
  let changed = false;
  const deletedEntryIds: string[] = [];

  const localJsonFor = (type: LedgerRecordType, id: string): string | null => {
    switch (type) {
      case 'expense': {
        const local = entries.get(id);
        return local ? opJson(stripReceipt(local), false) : null;
      }
      case 'adjustment': return adjustments.has(id) ? opJson(adjustments.get(id), false) : null;
      case 'debt-payment': return payments.has(id) ? opJson(payments.get(id), false) : null;
      case 'account': return accounts.has(id) ? opJson(accounts.get(id), false) : null;
      case 'debt': return debts.has(id) ? opJson(debts.get(id), false) : null;
      case 'limits': return opJson({ limits }, false);
      case 'meta': return opJson({ monthlyIncome, currency: state.currency }, false);
    }
  };

  for (const { record, prevJson } of changes) {
    const incomingJson = opJson(record.payload, record.deleted);
    const localJson = localJsonFor(record.type, record.id);

    if (localJson === incomingJson) continue; // already in sync (incl. own echo)
    if (record.deleted && localJson === null) continue; // already gone locally

    // Local divergence guard: local exists AND differs from what the ledger
    // previously held → local un-pushed edit wins; our push overwrites remote.
    if (localJson !== null && prevJson !== null && localJson !== prevJson) continue;
    // Locally deleted this session but tombstone not pushed yet → keep deletion.
    if (record.type === 'expense' && localDeletedEntryIds.has(record.id) && !record.deleted) continue;

    changed = true;
    if (record.deleted) {
      switch (record.type) {
        case 'expense':
          entries.delete(record.id);
          deletedEntryIds.push(record.id);
          break;
        case 'adjustment': adjustments.delete(record.id); break;
        case 'debt-payment': payments.delete(record.id); break;
        case 'account': accounts.delete(record.id); break;
        case 'debt': debts.delete(record.id); break;
        default: break; // singletons are never tombstoned
      }
      continue;
    }

    switch (record.type) {
      case 'expense': {
        const incoming = record.payload as ExpenseEntry;
        const local = entries.get(incoming.id);
        // Receipts are stripped before push — never wipe the local attachment.
        entries.set(incoming.id, local?.receipt && !incoming.receipt
          ? { ...incoming, receipt: local.receipt }
          : incoming);
        break;
      }
      case 'adjustment': {
        const incoming = record.payload as AccountBalanceAdjustment;
        adjustments.set(incoming.id, incoming);
        break;
      }
      case 'debt-payment': {
        const incoming = record.payload as DebtPayment;
        payments.set(incoming.id, incoming);
        break;
      }
      case 'account': {
        const incoming = record.payload as AssetAccount;
        accounts.set(incoming.id, incoming);
        break;
      }
      case 'debt': {
        const incoming = record.payload as DebtAccount;
        debts.set(incoming.id, incoming);
        break;
      }
      case 'limits': {
        const incoming = record.payload as { limits?: ExpenseLimit[] };
        if (Array.isArray(incoming.limits)) limits = incoming.limits;
        break;
      }
      case 'meta': {
        const incoming = record.payload as { monthlyIncome?: number; currency?: string };
        if (typeof incoming.monthlyIncome === 'number') monthlyIncome = incoming.monthlyIncome;
        if (typeof incoming.currency === 'string') currency = incoming.currency;
        break;
      }
    }
  }

  return {
    entries: Array.from(entries.values())
      .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')),
    accountAdjustments: Array.from(adjustments.values()),
    debtPayments: Array.from(payments.values()),
    accounts: Array.from(accounts.values()),
    debts: Array.from(debts.values()),
    limits,
    monthlyIncome,
    currency,
    changed,
    deletedEntryIds,
  };
}
