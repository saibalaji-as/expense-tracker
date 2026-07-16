import { describe, expect, it } from 'vitest';
import {
  applyLedgerChanges,
  diffLedgerState,
  opSig,
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
const NO_FLAGS = new Set<string>();

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
    debtAdjustments: [],
    accounts: [],
    debts: [],
    limits: [],
    monthlyIncome: 0,
    currency: 'INR',
    ...overrides,
  };
}

function copyOf(type: LedgerCopyEntry['type'], id: string, payload: unknown, deleted = false): [string, LedgerCopyEntry] {
  return [ledgerDocId(type, id), { sig: opSig(deleted ? null : payload, deleted), deleted, type, id }];
}

function baseCopy(...extra: [string, LedgerCopyEntry][]): Map<string, LedgerCopyEntry> {
  return new Map([
    copyOf('limits', 'limits', { limits: [] }),
    copyOf('meta', 'meta', { monthlyIncome: 0, currency: 'INR' }),
    ...extra,
  ]);
}

function change(type: LedgerRecord['type'], id: string, payload: unknown, opts: { deleted?: boolean; prevSig?: string | null } = {}): LedgerChange {
  return {
    record: {
      type,
      id,
      payload: opts.deleted ? null : payload,
      deleted: opts.deleted ?? false,
      updatedAt: '2026-07-14T10:00:00.000Z',
      updatedBy: writer,
    },
    prevSig: opts.prevSig ?? null,
  };
}

describe('stableStringify / opSig', () => {
  it('is key-order independent and drops undefined', () => {
    expect(stableStringify({ b: 1, a: [{ y: 2, x: 1 }], c: undefined }))
      .toBe(stableStringify({ a: [{ x: 1, y: 2 }], b: 1 }));
  });

  it('produces equal sigs for equal content and different sigs for different content', () => {
    expect(opSig({ a: 1, b: 2 }, false)).toBe(opSig({ b: 2, a: 1 }, false));
    expect(opSig({ a: 1 }, false)).not.toBe(opSig({ a: 2 }, false));
    expect(opSig({ a: 1 }, false)).not.toBe(opSig(null, true));
  });
});

describe('diffLedgerState', () => {
  it('pushes records the ledger does not know', () => {
    const e1 = entry('e1', 100);
    const ops = diffLedgerState(view({ entries: [e1] }), new Map(), { pendingDeletes: NO_FLAGS });
    const expenseOps = ops.filter((op) => op.type === 'expense');
    expect(expenseOps).toEqual([{ type: 'expense', id: 'e1', payload: e1, deleted: false }]);
    expect(ops.some((op) => op.type === 'limits')).toBe(true);
    expect(ops.some((op) => op.type === 'meta')).toBe(true);
  });

  it('is a no-op when the ledger already matches', () => {
    const e1 = entry('e1', 100);
    const ledger = baseCopy(copyOf('expense', 'e1', e1));
    expect(diffLedgerState(view({ entries: [e1] }), ledger, { pendingDeletes: NO_FLAGS })).toEqual([]);
  });

  it('strips receipts before comparing and pushing', () => {
    const local = entry('e1', 100, { receipt: { fileId: 'f', viewUrl: '', fileName: 'r.jpg', mimeType: 'image/jpeg' } as ExpenseEntry['receipt'] });
    const ledger = baseCopy(copyOf('expense', 'e1', entry('e1', 100)));
    expect(diffLedgerState(view({ entries: [local] }), ledger, { pendingDeletes: NO_FLAGS })).toEqual([]);
  });

  it('FLAG RULE: a flagged record is never upserted and produces a tombstone', () => {
    const e1 = entry('e1', 100);
    const ledger = baseCopy(copyOf('expense', 'e1', e1));
    // Stale local state still contains e1 (e.g., old Drive doc) but the user deleted it.
    const ops = diffLedgerState(view({ entries: [e1] }), ledger, {
      pendingDeletes: new Set([ledgerDocId('expense', 'e1')]),
    });
    expect(ops).toEqual([{ type: 'expense', id: 'e1', payload: null, deleted: true }]);
  });

  it('flag for a record that never reached the ledger produces nothing', () => {
    const ops = diffLedgerState(view(), baseCopy(), {
      pendingDeletes: new Set([ledgerDocId('expense', 'never-synced')]),
    });
    expect(ops).toEqual([]);
  });

  it('VERIFY RULE: a widget-synced record is never pushed while its verify flag is set', () => {
    const staleQueuePayload = entry('e1', 100); // capture-time snapshot
    // Ledger unknown to this device (CF wrote it while the app was closed).
    const ops = diffLedgerState(view({ entries: [staleQueuePayload] }), baseCopy(), {
      pendingDeletes: NO_FLAGS,
      pendingVerify: new Set([ledgerDocId('expense', 'e1')]),
    });
    expect(ops.filter((op) => op.type === 'expense')).toEqual([]);
  });

  it('VERIFY RULE: after the flag clears, a genuinely-missing record is pushed normally', () => {
    const e1 = entry('e1', 100);
    const ops = diffLedgerState(view({ entries: [e1] }), baseCopy(), {
      pendingDeletes: NO_FLAGS,
      pendingVerify: new Set(), // verify found the CF never wrote it → flag cleared
    });
    expect(ops.filter((op) => op.type === 'expense')).toEqual([
      { type: 'expense', id: 'e1', payload: e1, deleted: false },
    ]);
  });

  it('VERIFY + partner edit: ingested newer version applies over the stale queue payload', () => {
    const staleV1 = entry('e1', 100);
    const partnerV2 = entry('e1', 250);
    // verifyDocs ingested v2 into the copy and emitted it; copy previously lacked e1.
    const result = applyLedgerChanges(view({ entries: [staleV1] }), [
      change('expense', 'e1', partnerV2, { prevSig: null }),
    ], NO_FLAGS);
    expect(result.changed).toBe(true);
    expect(result.entries[0].amount).toBe(250); // no revert of the partner's edit
  });

  it('TOMBSTONE WINS: never re-upserts over an acked tombstone', () => {
    const e1 = entry('e1', 100);
    const ledger = baseCopy(copyOf('expense', 'e1', null, true));
    // Stale local state (old Drive backup) still holds e1 — must NOT resurrect it.
    const ops = diffLedgerState(view({ entries: [e1] }), ledger, { pendingDeletes: NO_FLAGS });
    expect(ops).toEqual([]);
  });

  it('covers all flagged record types (debt payment, debt, account, adjustment)', () => {
    const p1 = { id: 'p1', debtId: 'd1', amount: 50 };
    const d1 = { id: 'd1', type: 'credit-card' };
    const ledger = baseCopy(copyOf('debt-payment', 'p1', p1), copyOf('debt', 'd1', d1));
    const ops = diffLedgerState(view(), ledger, {
      pendingDeletes: new Set([ledgerDocId('debt-payment', 'p1'), ledgerDocId('debt', 'd1')]),
    });
    expect(ops).toHaveLength(2);
    expect(ops.every((op) => op.deleted)).toBe(true);
  });
});

describe('applyLedgerChanges', () => {
  it('inserts new incoming records and reports acked tombstones', () => {
    const e1 = entry('e1', 100);
    const result = applyLedgerChanges(view({ entries: [entry('e2', 10)] }), [
      change('expense', 'e1', e1),
      change('expense', 'e2', null, { deleted: true, prevSig: opSig(entry('e2', 10), false) }),
      change('adjustment', 'a1', { id: 'a1', accountId: 'acc', amount: 5, kind: 'increase' }),
    ], NO_FLAGS);
    expect(result.changed).toBe(true);
    expect(result.entries.map((e) => e.id)).toEqual(['e1']);
    expect(result.tombstonedDocIds).toEqual([ledgerDocId('expense', 'e2')]);
    expect(result.accountAdjustments).toHaveLength(1);
  });

  it('skips own echoes (incoming identical to local)', () => {
    const e1 = entry('e1', 100);
    const result = applyLedgerChanges(view({ entries: [e1] }), [change('expense', 'e1', e1)], NO_FLAGS);
    expect(result.changed).toBe(false);
  });

  it('FLAG RULE: a snapshot can never resurrect a flagged record', () => {
    const e1 = entry('e1', 100);
    const flags = new Set([ledgerDocId('expense', 'e1')]);
    // Cold start after delete: local no longer has e1, ledger still live, prevSig null.
    const result = applyLedgerChanges(view(), [change('expense', 'e1', e1)], flags);
    expect(result.changed).toBe(false);
    expect(result.entries).toHaveLength(0);
  });

  it('reports acked tombstones even when already gone locally (flag cleanup)', () => {
    const result = applyLedgerChanges(view(), [
      change('expense', 'e1', null, { deleted: true }),
    ], new Set([ledgerDocId('expense', 'e1')]));
    expect(result.changed).toBe(false);
    expect(result.tombstonedDocIds).toEqual([ledgerDocId('expense', 'e1')]);
  });

  it('keeps a diverged local edit (un-pushed local change wins until pushed)', () => {
    const ledgerVersion = entry('e1', 100);
    const localEdit = entry('e1', 175);
    const incoming = entry('e1', 120);
    const result = applyLedgerChanges(view({ entries: [localEdit] }), [
      change('expense', 'e1', incoming, { prevSig: opSig(ledgerVersion, false) }),
    ], NO_FLAGS);
    expect(result.changed).toBe(false);
    expect(result.entries[0].amount).toBe(175);
  });

  it('applies incoming when local matches the previously-acked copy', () => {
    const ledgerVersion = entry('e1', 100);
    const incoming = entry('e1', 120);
    const result = applyLedgerChanges(view({ entries: [ledgerVersion] }), [
      change('expense', 'e1', incoming, { prevSig: opSig(ledgerVersion, false) }),
    ], NO_FLAGS);
    expect(result.changed).toBe(true);
    expect(result.entries[0].amount).toBe(120);
  });

  it('an acked tombstone always deletes, even over a diverged local copy', () => {
    const localEdit = entry('e1', 175);
    const result = applyLedgerChanges(view({ entries: [localEdit] }), [
      change('expense', 'e1', null, { deleted: true, prevSig: opSig(entry('e1', 100), false) }),
    ], NO_FLAGS);
    expect(result.changed).toBe(true);
    expect(result.entries).toHaveLength(0);
  });

  it('preserves the local receipt when the incoming copy lacks one', () => {
    const receipt = { fileId: 'f', viewUrl: '', fileName: 'r.jpg', mimeType: 'image/jpeg' } as ExpenseEntry['receipt'];
    const local = entry('e1', 100, { receipt });
    const incoming = entry('e1', 150); // partner edit, stripped receipt
    const result = applyLedgerChanges(view({ entries: [local] }), [
      change('expense', 'e1', incoming, { prevSig: opSig(entry('e1', 100), false) }),
    ], NO_FLAGS);
    expect(result.entries[0].amount).toBe(150);
    expect(result.entries[0].receipt).toEqual(receipt);
  });

  it('applies limits and meta singletons', () => {
    const result = applyLedgerChanges(view(), [
      change('limits', 'limits', { limits: [{ id: 'l1', type: 'food', amount: 500 }] }),
      change('meta', 'meta', { monthlyIncome: 90000, currency: 'USD' }),
    ], NO_FLAGS);
    expect(result.changed).toBe(true);
    expect(result.limits).toHaveLength(1);
    expect(result.monthlyIncome).toBe(90000);
    expect(result.currency).toBe('USD');
  });

  it('sorts entries by timestamp descending after apply', () => {
    const older = entry('e1', 10, { timestamp: '2026-07-13T10:00:00.000Z' });
    const newer = entry('e2', 20, { timestamp: '2026-07-14T10:00:00.000Z' });
    const result = applyLedgerChanges(view({ entries: [older] }), [change('expense', 'e2', newer)], NO_FLAGS);
    expect(result.entries.map((e) => e.id)).toEqual(['e2', 'e1']);
  });
});

describe('delete → restart → snapshot (the resurrection scenario, end to end)', () => {
  it('flagged delete survives a restart: apply blocks resurrection, diff pushes the tombstone', () => {
    const e1 = entry('e1', 100);
    const flags = new Set([ledgerDocId('expense', 'e1')]); // persisted flag, reloaded after restart
    const ledger = baseCopy(copyOf('expense', 'e1', e1));   // server still holds e1 live

    // 1. Cold-start snapshot tries to bring e1 back → blocked by the flag.
    const applied = applyLedgerChanges(view(), [change('expense', 'e1', e1)], flags);
    expect(applied.entries).toHaveLength(0);

    // 2. Reconcile diff → tombstone op for e1.
    const ops = diffLedgerState(view(), ledger, { pendingDeletes: flags });
    expect(ops).toEqual([{ type: 'expense', id: 'e1', payload: null, deleted: true }]);

    // 3. Ack arrives → tombstone reported so the flag can be cleared.
    const acked = applyLedgerChanges(view(), [
      change('expense', 'e1', null, { deleted: true, prevSig: opSig(e1, false) }),
    ], flags);
    expect(acked.tombstonedDocIds).toEqual([ledgerDocId('expense', 'e1')]);
  });
});

describe('debt-adjustment records (card refunds / cash withdrawals / fees)', () => {
  const da = {
    id: 'da1',
    debtId: 'card1',
    kind: 'refund',
    amount: 250,
    date: '2026-07-16',
    createdAt: '2026-07-16T10:00:00.000Z',
  };

  it('diff upserts a local debt adjustment the ledger is missing', () => {
    const ops = diffLedgerState(view({ debtAdjustments: [da] } as Partial<LedgerStateView>), new Map(), { pendingDeletes: NO_FLAGS });
    const op = ops.find((candidate) => candidate.type === 'debt-adjustment');
    expect(op).toBeDefined();
    expect(op!.id).toBe('da1');
    expect(op!.deleted).toBe(false);
  });

  it('apply inserts an incoming debt adjustment and removes a tombstoned one', () => {
    const inserted = applyLedgerChanges(view(), [change('debt-adjustment', 'da1', da)], NO_FLAGS);
    expect(inserted.changed).toBe(true);
    expect(inserted.debtAdjustments).toHaveLength(1);

    const removed = applyLedgerChanges(
      view({ debtAdjustments: [da] } as Partial<LedgerStateView>),
      [change('debt-adjustment', 'da1', null, { deleted: true, prevSig: opSig(da, false) })],
      NO_FLAGS
    );
    expect(removed.debtAdjustments).toHaveLength(0);
    expect(removed.tombstonedDocIds).toEqual([ledgerDocId('debt-adjustment', 'da1')]);
  });

  it('diff skips an unchanged debt adjustment (sig match)', () => {
    const copy = new Map<string, LedgerCopyEntry>([
      [ledgerDocId('debt-adjustment', 'da1'), { sig: opSig(da, false), deleted: false, type: 'debt-adjustment', id: 'da1' }],
    ]);
    const ops = diffLedgerState(view({ debtAdjustments: [da] } as Partial<LedgerStateView>), copy, { pendingDeletes: NO_FLAGS });
    expect(ops.filter((candidate) => candidate.type === 'debt-adjustment')).toHaveLength(0);
  });
});
