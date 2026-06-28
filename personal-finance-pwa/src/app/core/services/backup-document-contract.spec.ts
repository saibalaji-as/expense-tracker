// TC-DRIVE-01 / TC-DRIVE-02 — The Drive backup JSON is the source of truth.
// 1) A full backup (with the newer accounts/debts collections) must survive a
//    serialize → parse round-trip with zero loss.
// 2) An OLDER backup that predates accounts/debts must still pass the structural
//    validation used by GoogleDriveService.readBackupFile and must not produce
//    NaN totals when the new fields are absent.
//
// `import type` keeps this free of google-drive.service's runtime deps.
import { describe, it, expect } from 'vitest';
import type { BackupDocument } from './google-drive.service';
import type { AssetAccount } from '../models/asset-account.model';
import type { DebtAccount } from '../models/debt-account.model';

// Mirror of the structural check inside GoogleDriveService.readBackupFile().
function isValidBackup(parsed: unknown): boolean {
  const p = parsed as Record<string, unknown> | null;
  return (
    typeof p === 'object' && p !== null &&
    typeof p['version'] === 'string' && p['version'] !== '' &&
    Array.isArray(p['expenses']) && Array.isArray(p['limits'])
  );
}

const account: AssetAccount = {
  id: 'a1', name: 'HDFC', type: 'bank', balance: 1500.5, initialBalance: 1000,
  allowOverdraft: false, isDefault: true, archived: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
};
const debt: DebtAccount = {
  id: 'd1', name: 'Amex', type: 'credit-card', principalAmount: 2000, remainingBalance: 750.25,
  startDate: '2026-01-01', status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
};

const fullBackup: BackupDocument = {
  version: '8',
  lastUpdated: '2026-06-27T00:00:00.000Z',
  metadata: { monthlyIncome: 50000, currency: 'INR', ownerUid: 'uid-owner' },
  expenses: [],
  limits: [],
  accounts: [account],
  accountAdjustments: [
    { id: 'adj1', accountId: 'a1', amount: 200, kind: 'increase', createdAt: '2026-02-02T00:00:00.000Z' },
  ],
  debts: [debt],
  debtPayments: [
    { id: 'p1', debtId: 'd1', expenseId: 'e1', accountId: 'a1', amount: 250, date: '2026-02-03', createdAt: '2026-02-03T00:00:00.000Z' },
  ],
};

describe('Backup document contract', () => {
  it('TC-DRIVE-01: full backup round-trips through JSON with no loss', () => {
    const restored = JSON.parse(JSON.stringify(fullBackup)) as BackupDocument;
    expect(restored).toEqual(fullBackup);
    // New collections specifically must survive (regression guard for schema growth).
    expect(restored.accounts).toHaveLength(1);
    expect(restored.debts?.[0].remainingBalance).toBe(750.25);
    expect(restored.debtPayments?.[0].amount).toBe(250);
  });

  it('TC-DRIVE-01: round-trip passes structural validation', () => {
    const restored = JSON.parse(JSON.stringify(fullBackup));
    expect(isValidBackup(restored)).toBe(true);
  });

  it('TC-DRIVE-02: an old backup with no accounts/debts still validates', () => {
    const oldBackup = {
      version: '6',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      metadata: { monthlyIncome: 40000, currency: 'INR' },
      expenses: [],
      limits: [],
      // no accounts / debts / adjustments / payments
    };
    const restored = JSON.parse(JSON.stringify(oldBackup)) as BackupDocument;
    expect(isValidBackup(restored)).toBe(true);
    expect(restored.accounts).toBeUndefined();
    expect(restored.debts).toBeUndefined();
  });

  it('TC-DRIVE-02: absent collections default to empty totals, never NaN', () => {
    const restored = { version: '6', expenses: [], limits: [] } as unknown as BackupDocument;
    const totalAssets = (restored.accounts ?? []).reduce((s, a) => s + a.balance, 0);
    const totalDebt = (restored.debts ?? []).reduce((s, d) => s + d.remainingBalance, 0);
    expect(totalAssets).toBe(0);
    expect(totalDebt).toBe(0);
    expect(Number.isNaN(totalAssets)).toBe(false);
  });

  it.each([
    ['missing version', { expenses: [], limits: [] }],
    ['empty version', { version: '', expenses: [], limits: [] }],
    ['expenses not an array', { version: '7', expenses: {}, limits: [] }],
    ['missing limits', { version: '7', expenses: [] }],
    ['null', null],
  ])('rejects an invalid backup: %s', (_label, bad) => {
    expect(isValidBackup(bad)).toBe(false);
  });
});
