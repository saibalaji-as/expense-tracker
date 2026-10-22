/**
 * The user's Spenza data in one shape, whichever store it came from:
 *  - single mode: `spenza-backup.json` in the user's Drive appDataFolder
 *  - family mode: the Firestore Family Ledger (`families/{id}/ledger/{type:id}`)
 * Pure: no I/O here, so it is unit-tested directly.
 */
import type {
  AccountBalanceAdjustment,
  AssetAccount,
  DebtAccount,
  DebtAdjustment,
  DebtPayment,
  ExpenseEntry,
  ExpenseLimit,
  LedgerRecord,
} from '../spenza-core/models';
import { computeDerivedBalances, computeDerivedOutstandings } from '../spenza-core/utils/derived-balance.util';

export type DataSource = 'drive' | 'family-ledger';

export interface SpenzaData {
  source: DataSource;
  /** ISO timestamp of the newest data the server could see. */
  dataAsOf: string | null;
  monthlyIncome: number;
  currency: string;
  expenses: ExpenseEntry[];
  limits: ExpenseLimit[];
  accounts: AssetAccount[];
  accountAdjustments: AccountBalanceAdjustment[];
  debts: DebtAccount[];
  debtPayments: DebtPayment[];
  debtAdjustments: DebtAdjustment[];
  family: { familyId: string; role: 'owner' | 'partner' } | null;
}

export const DEFAULT_CURRENCY = 'INR';

const arr = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Parses the Drive backup JSON (BackupDocument in google-drive.service.ts). */
export function fromBackupDocument(raw: unknown, modifiedTime: string | null): SpenzaData {
  if (!raw || typeof raw !== 'object') throw new Error('Backup is not a JSON object');
  const doc = raw as Record<string, unknown>;
  const metadata = (doc['metadata'] ?? {}) as Record<string, unknown>;
  return normalize({
    source: 'drive',
    dataAsOf: modifiedTime ?? (typeof doc['lastUpdated'] === 'string' ? doc['lastUpdated'] : null),
    monthlyIncome: num(metadata['monthlyIncome']),
    currency: typeof metadata['currency'] === 'string' && metadata['currency'] ? metadata['currency'] : DEFAULT_CURRENCY,
    expenses: arr<ExpenseEntry>(doc['expenses']),
    limits: arr<ExpenseLimit>(doc['limits']),
    accounts: arr<AssetAccount>(doc['accounts']),
    accountAdjustments: arr<AccountBalanceAdjustment>(doc['accountAdjustments']),
    debts: arr<DebtAccount>(doc['debts']),
    debtPayments: arr<DebtPayment>(doc['debtPayments']),
    debtAdjustments: arr<DebtAdjustment>(doc['debtAdjustments']),
    family: null,
  });
}

/**
 * Rebuilds the family's state from its ledger documents, the way the app's
 * `applyLedgerChanges` does for a fresh device: tombstones are skipped, the
 * `limits` and `meta` singletons carry limits, income and currency.
 */
export function fromLedgerRecords(
  records: readonly LedgerRecord[],
  family: { familyId: string; role: 'owner' | 'partner' },
): SpenzaData {
  const data: SpenzaData = {
    source: 'family-ledger',
    dataAsOf: null,
    monthlyIncome: 0,
    currency: DEFAULT_CURRENCY,
    expenses: [],
    limits: [],
    accounts: [],
    accountAdjustments: [],
    debts: [],
    debtPayments: [],
    debtAdjustments: [],
    family,
  };
  for (const record of records) {
    if (record.updatedAt && (!data.dataAsOf || record.updatedAt > data.dataAsOf)) data.dataAsOf = record.updatedAt;
    if (record.deleted || record.payload == null) continue;
    switch (record.type) {
      case 'expense': data.expenses.push(record.payload as ExpenseEntry); break;
      case 'adjustment': data.accountAdjustments.push(record.payload as AccountBalanceAdjustment); break;
      case 'debt-payment': data.debtPayments.push(record.payload as DebtPayment); break;
      case 'debt-adjustment': data.debtAdjustments.push(record.payload as DebtAdjustment); break;
      case 'account': data.accounts.push(record.payload as AssetAccount); break;
      case 'debt': data.debts.push(record.payload as DebtAccount); break;
      case 'limits': {
        const limits = (record.payload as { limits?: unknown }).limits;
        if (Array.isArray(limits)) data.limits = limits as ExpenseLimit[];
        break;
      }
      case 'meta': {
        const meta = record.payload as { monthlyIncome?: unknown; currency?: unknown };
        data.monthlyIncome = num(meta.monthlyIncome, data.monthlyIncome);
        if (typeof meta.currency === 'string' && meta.currency) data.currency = meta.currency;
        break;
      }
      default: break;
    }
  }
  return normalize(data);
}

/**
 * Same healing the app's ExpenseStore applies at every load boundary: account
 * balances and anchored card outstandings are derived from the records, never
 * trusted as stored numbers (see derived-balance.util.ts).
 */
export function normalize(data: SpenzaData): SpenzaData {
  const expenses = data.expenses
    .filter((e) => e && typeof e.date === 'string' && typeof e.amount === 'number')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));

  const balances = computeDerivedBalances(data.accounts, {
    accountAdjustments: data.accountAdjustments,
    entries: expenses,
    debtAdjustments: data.debtAdjustments,
  });
  const accounts = data.accounts.map((a) => (balances.has(a.id) ? { ...a, balance: balances.get(a.id)! } : a));

  const outstandings = computeDerivedOutstandings(data.debts, {
    entries: expenses,
    debtPayments: data.debtPayments,
    debtAdjustments: data.debtAdjustments,
  });
  const debts = data.debts.map((d) =>
    outstandings.has(d.id) ? { ...d, remainingBalance: outstandings.get(d.id)! } : d
  );

  return { ...data, expenses, accounts, debts };
}
