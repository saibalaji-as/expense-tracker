import { describe, expect, it } from 'vitest';
import { mergeAddOnly, mergeBackupDocuments, mergeByUpdatedAt, mergeEntries } from './family-state-merge';
import type { BackupDocument } from '../services/google-drive.service';
import type { ExpenseEntry } from '../models';

const entry = (id: string, timestamp: string, overrides: Partial<ExpenseEntry> = {}): ExpenseEntry => ({
  id,
  amount: 100,
  type: 'Food',
  timestamp,
  comment: '',
  ...overrides,
} as ExpenseEntry);

const doc = (overrides: Partial<BackupDocument> = {}): BackupDocument => ({
  version: '1',
  lastUpdated: '2026-07-10T10:00:00.000Z',
  metadata: { monthlyIncome: 50000, currency: 'INR' },
  expenses: [],
  limits: [],
  ...overrides,
});

describe('mergeEntries', () => {
  it('keeps entries present only on one side (union merge)', () => {
    const merged = mergeEntries(
      [entry('a', '2026-07-10T09:00:00.000Z')],
      [entry('b', '2026-07-10T10:00:00.000Z')],
      new Set()
    );
    expect(merged.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('incoming wins when its timestamp is newer or equal', () => {
    const merged = mergeEntries(
      [entry('a', '2026-07-10T09:00:00.000Z', { amount: 100 })],
      [entry('a', '2026-07-10T09:30:00.000Z', { amount: 250 })],
      new Set()
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(250);
  });

  it('base wins when incoming copy is older', () => {
    const merged = mergeEntries(
      [entry('a', '2026-07-10T09:30:00.000Z', { amount: 250 })],
      [entry('a', '2026-07-10T09:00:00.000Z', { amount: 100 })],
      new Set()
    );
    expect(merged[0].amount).toBe(250);
  });

  it('tombstones remove entries from either side', () => {
    const merged = mergeEntries(
      [entry('a', '2026-07-10T09:00:00.000Z')],
      [entry('b', '2026-07-10T10:00:00.000Z')],
      new Set(['a', 'b'])
    );
    expect(merged).toHaveLength(0);
  });

  it('preserves the base receipt when the incoming copy lacks one', () => {
    const receipt = { fileId: 'f1', fileName: 'r.jpg', mimeType: 'image/jpeg', viewUrl: '' };
    const merged = mergeEntries(
      [entry('a', '2026-07-10T09:00:00.000Z', { receipt } as Partial<ExpenseEntry>)],
      [entry('a', '2026-07-10T09:30:00.000Z')],
      new Set()
    );
    expect((merged[0] as { receipt?: unknown }).receipt).toEqual(receipt);
  });
});

describe('mergeByUpdatedAt / mergeAddOnly', () => {
  it('mergeByUpdatedAt: incoming wins on newer-or-equal updatedAt only', () => {
    const merged = mergeByUpdatedAt(
      [
        { id: 'x', updatedAt: '2026-07-10T09:00:00.000Z', v: 1 },
        { id: 'y', updatedAt: '2026-07-10T09:00:00.000Z', v: 1 },
      ],
      [
        { id: 'x', updatedAt: '2026-07-10T10:00:00.000Z', v: 2 },
        { id: 'y', updatedAt: '2026-07-10T08:00:00.000Z', v: 2 },
      ]
    );
    expect(merged.find((m) => m.id === 'x')?.v).toBe(2);
    expect(merged.find((m) => m.id === 'y')?.v).toBe(1);
  });

  it('mergeAddOnly: existing items are never replaced, new items are added', () => {
    const merged = mergeAddOnly(
      [{ id: 'p1', v: 1 }],
      [{ id: 'p1', v: 99 }, { id: 'p2', v: 2 }]
    );
    expect(merged.find((m) => m.id === 'p1')?.v).toBe(1);
    expect(merged).toHaveLength(2);
  });
});

describe('mergeBackupDocuments (merge-on-write regression: partner expense clobbering)', () => {
  it('a boot push from a stale device does NOT wipe a partner entry from the state doc', () => {
    // Firestore state doc contains the partner's expense (pushed while this device was closed).
    const stored = doc({
      lastUpdated: '2026-07-10T22:00:00.000Z',
      expenses: [entry('partner-1', '2026-07-10T21:59:00.000Z', { amount: 500 })],
    });
    // This device boots and pushes its own state built from its Drive doc — no partner entry.
    const pushed = doc({
      lastUpdated: '2026-07-09T10:00:00.000Z',
      expenses: [entry('mine-1', '2026-07-09T09:00:00.000Z')],
    });
    const merged = mergeBackupDocuments(stored, pushed, new Set());
    expect(merged.expenses.map((e) => e.id)).toContain('partner-1');
    expect(merged.expenses.map((e) => e.id)).toContain('mine-1');
  });

  it('a partner edit (newer timestamp) survives the merge', () => {
    const stored = doc({
      expenses: [entry('e1', '2026-07-10T12:00:00.000Z', { amount: 999 })],
    });
    const pushed = doc({
      expenses: [entry('e1', '2026-07-10T11:00:00.000Z', { amount: 100 })],
    });
    const merged = mergeBackupDocuments(stored, pushed, new Set());
    expect(merged.expenses[0].amount).toBe(999);
  });

  it('tombstones delete entries even when one side still carries them', () => {
    const stored = doc({ expenses: [entry('gone', '2026-07-10T12:00:00.000Z')] });
    const pushed = doc({ expenses: [] });
    const merged = mergeBackupDocuments(stored, pushed, new Set(['gone']));
    expect(merged.expenses).toHaveLength(0);
  });

  it('metadata comes from the doc with the newer lastUpdated', () => {
    const stored = doc({ lastUpdated: '2026-07-10T22:00:00.000Z', metadata: { monthlyIncome: 70000, currency: 'INR' } });
    const pushed = doc({ lastUpdated: '2026-07-09T10:00:00.000Z', metadata: { monthlyIncome: 50000, currency: 'INR' } });
    const merged = mergeBackupDocuments(stored, pushed, new Set());
    expect(merged.metadata.monthlyIncome).toBe(70000);
  });

  it('non-empty limits are preferred over an empty newer list', () => {
    const stored = doc({
      lastUpdated: '2026-07-09T10:00:00.000Z',
      limits: [{ type: 'Food', userPercentage: 20 }] as BackupDocument['limits'],
    });
    const pushed = doc({ lastUpdated: '2026-07-10T22:00:00.000Z', limits: [] });
    const merged = mergeBackupDocuments(stored, pushed, new Set());
    expect(merged.limits).toHaveLength(1);
  });
});
