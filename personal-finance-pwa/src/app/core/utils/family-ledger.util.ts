import type {
  AccountBalanceAdjustment,
  AssetAccount,
  DebtAccount,
  DebtAdjustment,
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
 * THE DELETE-FLAG RULES (2026-07-15 — the resurrection fix):
 * When the user deletes a record, its ledger doc id is flagged in a PERSISTED
 * `pendingDeletes` set BEFORE anything else happens. The flag is enforced in
 * both directions until the server acks the tombstone:
 *   - APPLY: an incoming live record whose doc id is flagged is never applied
 *     (a stale snapshot can't resurrect what the user deleted).
 *   - DIFF: a flagged record is never upserted, and produces a tombstone op
 *     while the ledger still holds it live.
 * A server-acked tombstone in the ledger copy wins forever: the diff never
 * re-upserts over it (record ids are UUIDs — deleted ids are never reused).
 *
 * DIFF (outgoing): compare local state against the device's (persisted,
 * server-acked) copy of the ledger and produce the minimal ops the ledger is
 * missing. Re-running is always safe — records are idempotent by doc id.
 *
 * APPLY (incoming): apply ledger changes with a local-divergence guard — if
 * the local record differs from the copy the server last acked, a local
 * un-pushed edit exists and the incoming record is skipped (the next diff push
 * resolves the conflict: last writer wins).
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

/**
 * Content signature of an op — compact enough to persist the whole ledger copy
 * to Preferences. Equality-only semantics (length + double 32-bit FNV/murmur
 * mix makes accidental collisions vanishingly unlikely).
 */
export function opSig(payload: unknown, deleted: boolean): string {
  const json = stableStringify({ payload: deleted ? null : payload, deleted });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ json.length;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${json.length.toString(36)}.${h1.toString(36)}.${h2.toString(36)}`;
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
  debtAdjustments: readonly DebtAdjustment[];
  accounts: readonly AssetAccount[];
  debts: readonly DebtAccount[];
  limits: readonly ExpenseLimit[];
  monthlyIncome: number;
  currency: string;
}

interface DiffOptions {
  /** PERSISTED delete flags — ledger doc ids the user deleted, not yet server-acked. */
  pendingDeletes: ReadonlySet<string>;
  /**
   * PERSISTED verify flags — doc ids of widget-captured records the CF already
   * pushed (`familySynced` tag) whose ledger version this device hasn't fetched
   * yet. The queue payload is a snapshot from capture time: the partner may
   * have edited the record since, so pushing it would revert their edit (the
   * 2026-07-16 update-revert bug). Flagged records are never upserted until
   * `verifyDocs` learns the server truth.
   */
  pendingVerify?: ReadonlySet<string>;
}

/** Minimal set of ledger ops that bring the ledger up to date with local state. */
export function diffLedgerState(
  state: LedgerStateView,
  ledgerCopy: ReadonlyMap<string, LedgerCopyEntry>,
  options: DiffOptions
): LedgerOp[] {
  const ops: LedgerOp[] = [];

  const upsertIfChanged = (type: LedgerRecordType, id: string, payload: unknown): void => {
    const docId = ledgerDocId(type, id);
    if (options.pendingDeletes.has(docId)) return; // flagged deleted — never re-upsert
    if (options.pendingVerify?.has(docId)) return; // ledger owns it — verify before trusting local
    const known = ledgerCopy.get(docId);
    if (known?.deleted) return; // acked tombstone wins forever (ids are never reused)
    if (known?.sig === opSig(payload, false)) return;
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
  for (const adjustment of state.debtAdjustments) {
    upsertIfChanged('debt-adjustment', adjustment.id, adjustment);
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

  // Tombstones for flagged deletions the ledger still holds live.
  for (const docId of options.pendingDeletes) {
    const known = ledgerCopy.get(docId);
    if (!known || known.deleted) continue; // never reached the ledger, or already acked
    ops.push({ type: known.type, id: known.id, payload: null, deleted: true });
  }

  return ops;
}

export interface ApplyLedgerResult {
  entries: ExpenseEntry[];
  accountAdjustments: AccountBalanceAdjustment[];
  debtPayments: DebtPayment[];
  debtAdjustments: DebtAdjustment[];
  accounts: AssetAccount[];
  debts: DebtAccount[];
  limits: ExpenseLimit[];
  monthlyIncome: number;
  currency: string | null;
  changed: boolean;
  /** Doc ids whose ACKED tombstone arrived — caller clears its delete flags. */
  tombstonedDocIds: string[];
}

/**
 * Applies incoming (server-acked) ledger changes to local state.
 * Flag rule: a live incoming record whose doc id carries a pending delete flag
 * is never applied. Divergence guard: local differing from the last-acked copy
 * means a local un-pushed edit — incoming skipped, next diff push wins.
 */
export function applyLedgerChanges(
  state: LedgerStateView,
  changes: readonly LedgerChange[],
  pendingDeletes: ReadonlySet<string>
): ApplyLedgerResult {
  const entries = new Map(state.entries.map((entry) => [entry.id, entry]));
  const adjustments = new Map(state.accountAdjustments.map((item) => [item.id, item]));
  const payments = new Map(state.debtPayments.map((item) => [item.id, item]));
  const debtAdjustments = new Map(state.debtAdjustments.map((item) => [item.id, item]));
  const accounts = new Map(state.accounts.map((item) => [item.id, item]));
  const debts = new Map(state.debts.map((item) => [item.id, item]));
  let limits = state.limits as ExpenseLimit[];
  let monthlyIncome = state.monthlyIncome;
  let currency: string | null = null;
  let changed = false;
  const tombstonedDocIds: string[] = [];

  const localSigFor = (type: LedgerRecordType, id: string): string | null => {
    switch (type) {
      case 'expense': {
        const local = entries.get(id);
        return local ? opSig(stripReceipt(local), false) : null;
      }
      case 'adjustment': return adjustments.has(id) ? opSig(adjustments.get(id), false) : null;
      case 'debt-payment': return payments.has(id) ? opSig(payments.get(id), false) : null;
      case 'debt-adjustment': return debtAdjustments.has(id) ? opSig(debtAdjustments.get(id), false) : null;
      case 'account': return accounts.has(id) ? opSig(accounts.get(id), false) : null;
      case 'debt': return debts.has(id) ? opSig(debts.get(id), false) : null;
      case 'limits': return opSig({ limits }, false);
      case 'meta': return opSig({ monthlyIncome, currency: state.currency }, false);
    }
  };

  for (const { record, prevSig } of changes) {
    const docId = ledgerDocId(record.type, record.id);
    const incomingSig = opSig(record.payload, record.deleted);
    const localSig = localSigFor(record.type, record.id);

    if (record.deleted) {
      // Acked tombstone: always honor it (locally too), and report it so the
      // caller clears the matching delete flag.
      tombstonedDocIds.push(docId);
      if (localSig === null) continue; // already gone locally
    } else {
      if (localSig === incomingSig) continue; // in sync (incl. own echo)
      // THE FLAG RULE: user deleted this record — a snapshot must never bring it back.
      if (pendingDeletes.has(docId)) continue;
      // Local divergence: un-pushed local edit wins until pushed (LWW).
      if (localSig !== null && prevSig !== null && localSig !== prevSig) continue;
    }

    changed = true;
    if (record.deleted) {
      switch (record.type) {
        case 'expense': entries.delete(record.id); break;
        case 'adjustment': adjustments.delete(record.id); break;
        case 'debt-payment': payments.delete(record.id); break;
        case 'debt-adjustment': debtAdjustments.delete(record.id); break;
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
        adjustments.set(record.id, record.payload as AccountBalanceAdjustment);
        break;
      }
      case 'debt-payment': {
        payments.set(record.id, record.payload as DebtPayment);
        break;
      }
      case 'debt-adjustment': {
        debtAdjustments.set(record.id, record.payload as DebtAdjustment);
        break;
      }
      case 'account': {
        accounts.set(record.id, record.payload as AssetAccount);
        break;
      }
      case 'debt': {
        debts.set(record.id, record.payload as DebtAccount);
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
    debtAdjustments: Array.from(debtAdjustments.values()),
    accounts: Array.from(accounts.values()),
    debts: Array.from(debts.values()),
    limits,
    monthlyIncome,
    currency,
    changed,
    tombstonedDocIds,
  };
}
