import { describe, expect, it } from 'vitest';
import {
  applyLedgerChanges,
  diffLedgerState,
  opJson,
  stableStringify,
  type LedgerStateView,
} from './family-ledger.util';
import {
  ledgerDocId,
  type LedgerChange,
  type LedgerCopyEntry,
  type LedgerRecord,
} from '../models/family-ledger.model';
import type { ExpenseEntry } from '../models';

const writer = { uid: 'u1', email: 'a@b.c', role: 'owner' as const };

function entry(id: string, amount: number, extra: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id,
    amount,
    type: 'food',
    date: '2026-07-14',
    timestamp: `2026-07-14T10:00:00.000Z`,
    ...extra,
  } as ExpenseEntry;
}

function view(overrides: Partial<LedgerStateView> = {}): LedgerStateView {
  return {
    entries: [],
    accountAdjustments: [],
    debtPayments: [],
    accounts: [],
    debts: [],
    limits: [],
    monthlyIncome: 0,
    currency: 'INR',
    ...overrides,
  };
}

function copyOf(type: LedgerCopyEntry['type'], id: string, payload: unknown, deleted = false): [string, LedgerCopyEntry] {
  return [ledgerDocId(type, id), { json: opJson(deleted ? null : payload, deleted), deleted, type, id }];
}

function change(type: LedgerRecord['type'], id: string, payload: unknown, opts: { deleted?: boolean; prevJson?: string | null } = {}): LedgerChange {
  return {
    record: {
      type,
      id,
      payload: opts.deleted ? null : payload,
      deleted: opts.deleted ?? false,
      updatedAt: '2026-07-14T10:00:00.000Z',
      updatedBy: writer,
    },
    prevJson: opts.prevJson ?? null,
  };
}

describe('stableStringify', () => {
  it('is key-order independent and drops undefined', () => {
    expect(stableStringify({ b: 1, a: [{ y: 2, x: 1 }], c: undefined }))
      .toBe(stableStringify({ a: [{ x: 1, y: 2 }], b: 1 }));
  });
});

describe('diffLedgerState', () => {
  const baseOpts = { includeAbsenceTombstones: false, localDeletedEntryIds: new Set<string>() };

  it('pushes records the ledger does not know', () => {
    const e1 = entry('e1', 100);
    const ops = diffLedgerState(view({ entries: [e1] }), new Map(), baseOpts);
    const expenseOps = ops.filter((op) => op.type === 'expense');
    expect(expenseOps).toEqual([{ type: 'expense', id: 'e1', payload: e1, deleted: false }]);
    // singletons always exist in a first push
    expect(ops.some((op) => op.type === 'limits')).toBe(true);
    expect(ops.some((op) => op.type === 'meta')).toBe(true);
  });

  it('is a no-op when the ledger already matches', () => {
    const e1 = entry('e1', 100);
    const ledger = new Map([
      copyOf('expense', 'e1', e1),
      copyOf('limits', 'limits', { limits: [] }),
      copyOf('meta', 'meta', { monthlyIncome: 0, currency: 'INR' }),
    ]);
    expect(diffLedgerState(view({ entries: [e1] }), ledger, baseOpts)).toEqual([]);
  });

  it('strips receipts before comparing and pushing', () => {
    const local = entry('e1', 100, { receipt: { fileId: 'f', viewUrl: '', fileName: 'r.jpg', mimeType: 'image/jpeg' } as ExpenseEntry['receipt'] });
    const stripped = entry('e1', 100);
    const ledger = new Map([
      copyOf('expense', 'e1', stripped),
      copyOf('limits', 'limits', { limits: [] }),
      copyOf('meta', 'meta', { monthlyIncome: 0, currency: 'INR' }),
    ]);
    expect(diffLedgerState(view({ entries: [local] }), ledger, baseOpts)).toEqual([]);
  });

  it('emits explicit tombstones for session-deleted entries known to the ledger', () => {
    const e1 = entry('e1', 100);
    const ledger = new Map([
      copyOf('expense', 'e1', e1),
      copyOf('limits', 'limits', { limits: [] }),
      copyOf('meta', 'meta', { monthlyIncome: 0, currency: 'INR' }),
    ]);
    const ops = diffLedgerState(view(), ledger, {
      includeAbsenceTombstones: false,
      localDeletedEntryIds: new Set(['e1', 'never-synced']),
    });
    expect(ops).toEqual([{ type: 'expense', id: 'e1', payload: null, deleted: true }]);
  });

  it('emits absence tombstones only when hydrated, without duplicating explicit ones', () => {
    const e1 = entry('e1', 100);
    const p1 = { id: 'p1', debtId: 'd1', amount: 50 };
    const ledger = new Map([
      copyOf('expense', 'e1', e1),
      copyOf('debt-payment', 'p1', p1),
      copyOf('limits', 'limits', { limits: [] }),
      copyOf('meta', 'meta', { monthlyIncome: 0, currency: 'INR' }),
    ]);
    const notHydrated = diffLedgerState(view(), ledger, {
      includeAbsenceTombstones: false, localDeletedEntryIds: new Set(['e1']),
    });
    expect(notHydrated.filter((op) => op.deleted)).toHaveLength(1); // only explicit e1

    const hydrated = diffLedgerState(view(), ledger, {
      includeAbsenceTombstones: true, localDeletedEntryIds: new Set(['e1']),
    });
    const tombstones = hydrated.filter((op) => op.deleted);
    expect(tombstones).toHaveLength(2);
    expect(tombstones.filter((op) => op.id === 'e1')).toHaveLength(1); // no duplicate
    expect(tombstones.some((op) => op.type === 'debt-payment' && op.id === 'p1')).toBe(true);
  });

  it('drops ALL absence tombstones when they exceed the safety cap (stale hydration guard)', () => {
    const ledger = new Map<string, LedgerCopyEntry>();
    for (let i = 0; i < 30; i++) {
      const e = entry(`e${i}`, i + 1);
      const [k, v] = copyOf('expense', e.id, e);
      ledger.set(k, v);
    }
    const ops = diffLedgerState(view(), ledger, {
      includeAbsenceTombstones: true, localDeletedEntryIds: new Set(), maxAbsenceTombstones: 25,
    });
    expect(ops.filter((op) => op.deleted)).toHaveLength(0);
  });
});

describe('applyLedgerChanges', () => {
  it('inserts new incoming records and reports tombstoned ids', () => {
    const e1 = entry('e1', 100);
    const result = applyLedgerChanges(view({ entries: [entry('e2', 10)] }), [
      change('expense', 'e1', e1),
      change('expense', 'e2', null, { deleted: true, prevJson: opJson(entry('e2', 10), false) }),
      change('adjustment', 'a1', { id: 'a1', accountId: 'acc', amount: 5, kind: 'increase' }),
    ], new Set());
    expect(result.changed).toBe(true);
    expect(result.entries.map((e) => e.id)).toEqual(['e1']);
    expect(result.deletedEntryIds).toEqual(['e2']);
    expect(result.accountAdjustments).toHaveLength(1);
  });

  it('skips own echoes (incoming identical to local)', () => {
    const e1 = entry('e1', 100);
    const result = applyLedgerChanges(view({ entries: [e1] }), [change('expense', 'e1', e1)], new Set());
    expect(result.changed).toBe(false);
  });

  it('keeps a diverged local edit (un-pushed local change wins until pushed)', () => {
    const ledgerVersion = entry('e1', 100);
    const localEdit = entry('e1', 175);
    const incoming = entry('e1', 120);
    const result = applyLedgerChanges(view({ entries: [localEdit] }), [
      change('expense', 'e1', incoming, { prevJson: opJson(ledgerVersion, false) }),
    ], new Set());
    expect(result.changed).toBe(false);
    expect(result.entries[0].amount).toBe(175);
  });

  it('applies incoming when local matches the previously-known ledger copy', () => {
    const ledgerVersion = entry('e1', 100);
    const incoming = entry('e1', 120);
    const result = applyLedgerChanges(view({ entries: [ledgerVersion] }), [
      change('expense', 'e1', incoming, { prevJson: opJson(ledgerVersion, false) }),
    ], new Set());
    expect(result.changed).toBe(true);
    expect(result.entries[0].amount).toBe(120);
  });

  it('never resurrects an entry deleted locally this session', () => {
    const e1 = entry('e1', 100);
    const result = applyLedgerChanges(view(), [change('expense', 'e1', e1)], new Set(['e1']));
    expect(result.changed).toBe(false);
    expect(result.entries).toHaveLength(0);
  });

  it('preserves the local receipt when the incoming copy lacks one', () => {
    const receipt = { fileId: 'f', viewUrl: '', fileName: 'r.jpg', mimeType: 'image/jpeg' } as ExpenseEntry['receipt'];
    const local = entry('e1', 100, { receipt });
    const incoming = entry('e1', 150); // partner edit, stripped receipt
    const result = applyLedgerChanges(view({ entries: [local] }), [
      change('expense', 'e1', incoming, { prevJson: opJson(entry('e1', 100), false) }),
    ], new Set());
    expect(result.entries[0].amount).toBe(150);
    expect(result.entries[0].receipt).toEqual(receipt);
  });

  it('applies limits and meta singletons', () => {
    const result = applyLedgerChanges(view(), [
      change('limits', 'limits', { limits: [{ id: 'l1', type: 'food', amount: 500 }] }),
      change('meta', 'meta', { monthlyIncome: 90000, currency: 'USD' }),
    ], new Set());
    expect(result.changed).toBe(true);
    expect(result.limits).toHaveLength(1);
    expect(result.monthlyIncome).toBe(90000);
    expect(result.currency).toBe('USD');
  });

  it('sorts entries by timestamp descending after apply', () => {
    const older = entry('e1', 10, { timestamp: '2026-07-13T10:00:00.000Z' });
    const newer = entry('e2', 20, { timestamp: '2026-07-14T10:00:00.000Z' });
    const result = applyLedgerChanges(view({ entries: [older] }), [change('expense', 'e2', newer)], new Set());
    expect(result.entries.map((e) => e.id)).toEqual(['e2', 'e1']);
  });
});
