import { computed, effect, inject, isDevMode } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Subject } from 'rxjs';
import { budgetThresholdExceeded$, cardUtilizationCrossed$ } from './budget-events';
import { crossedUtilizationThreshold, utilizationPercent } from '../utils/credit-card-insights';
import { FamilySyncService } from './family-sync.service';
import {
  AccountBalanceAdjustment,
  AdjustAccountBalanceInput,
  AssetAccount,
  BudgetRuleSummary,
  CardStatement,
  CreateAssetAccountInput,
  CreateDebtAccountInput,
  DebtAccount,
  DebtAdjustment,
  DebtPayment,
  DEBT_PAYMENT_EXPENSE_TYPE,
  ExpenseEntry,
  ExpenseLimit,
  PendingCcExpense,
  RecordDebtAdjustmentInput,
  RecordDebtPaymentInput,
  UpdateAssetAccountInput,
  UpdateDebtAccountInput,
  UpdateDebtPaymentInput,
} from '../models';
import { StorageService } from './storage.service';
import { LocalNotificationService } from './local-notification.service';
import { BackupDocument, DriveApiError, DriveParseError, GoogleDriveService } from './google-drive.service';
import { BackupMode, BackupModeService } from './backup-mode.service';
import { AppCurrency, CurrencyService } from './currency.service';
import { AuthService } from './auth.service';
import { toLocalDateString } from '../utils/local-date';
import { applyLedgerChanges, diffLedgerState, stableStringify, type LedgerStateView } from '../utils/family-ledger.util';
import { ledgerDocId } from '../models/family-ledger.model';
import { mergeAddOnly, mergeByUpdatedAt, mergeEntries } from '../utils/family-state-merge';
import { pendingDerivedStatement } from '../utils/credit-card-statement';

const LOCAL_BACKUP_CACHE_KEY = 'spenza_drive_backup_snapshot_v1';
const WIDGET_EXPENSE_QUEUE_KEY = 'spenza_widget_expense_queue_v1';
const PENDING_CC_SELECTION_KEY = 'spenza_pending_cc_expense_queue_v1';
// Persisted delete flags for family-ledger records (docs/family-sync-centralization-plan.md).
const PENDING_DELETES_KEY = 'spenza_family_pending_deletes_v1';
// Persisted verify flags: widget-synced records whose ledger version must be
// fetched before this device may push its (possibly stale) queue payload.
const PENDING_VERIFY_KEY = 'spenza_family_pending_verify_v1';

interface ExpenseWidgetPlugin {
  refresh(): Promise<void>;
  /**
   * Fired by the native widget the moment an expense/adjustment is written to the
   * pending queue, so an already-foregrounded app can drain it immediately instead
   * of waiting for the next cold start. (Capacitor plugin event.)
   */
  addListener(
    eventName: 'widgetExpenseQueued',
    listenerFunc: () => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const ExpenseWidget = registerPlugin<ExpenseWidgetPlugin>('ExpenseWidget');

interface LocalBackupSnapshot {
  version: '1';
  userEmail: string | null;
  fileId: string;
  mode: BackupMode;
  sharedFileId: string | null;
  modifiedTime: string | null;
  dirty: boolean;
  savedAt: string;
  doc: BackupDocument;
}

interface WidgetExpenseQueueItemBase {
  userEmail: string | null;
  raw: unknown;
}

interface WidgetExpenseEntryQueueItem extends WidgetExpenseQueueItemBase {
  kind: 'expense';
  entry: ExpenseEntry;
  isCreditCard: boolean;
  /** Card last-4 the notification mentioned — auto-matches a card during flush. */
  ccLast4: string | null;
}

interface WidgetAdjustmentQueueItem extends WidgetExpenseQueueItemBase {
  kind: 'adjustment';
  adjustment: AccountBalanceAdjustment;
}

/** A credit-card bill payment captured by the widget from a bank/card SMS. */
interface WidgetCcPaymentQueueItem extends WidgetExpenseQueueItemBase {
  kind: 'cc-payment';
  payment: {
    id: string;
    debtId?: string;
    accountId?: string;
    amount: number;
    date: string;
    comment?: string;
    ccLast4?: string;
  };
}

type WidgetExpenseQueueItem = WidgetExpenseEntryQueueItem | WidgetAdjustmentQueueItem | WidgetCcPaymentQueueItem;

type AccountBalanceDelta = Map<string, number>;

// ─── Drive Error Subject ──────────────────────────────────────────────────────

export const driveError$ = new Subject<DriveApiError | DriveParseError>();

/** Emitted when a CC expense is detected from a notification but no credit card account exists in Finances. */
export const noCcAccountForExpense$ = new Subject<{ amount: number; comment?: string }>();

// ─── State Interface ──────────────────────────────────────────────────────────

interface ExpenseState {
  entries: ExpenseEntry[];
  limits: ExpenseLimit[];
  accounts: AssetAccount[];
  accountAdjustments: AccountBalanceAdjustment[];
  debts: DebtAccount[];
  debtPayments: DebtPayment[];
  debtAdjustments: DebtAdjustment[];
  monthlyIncome: number;
  selectedMonth: string; // YYYY-MM
  syncStatus: 'idle' | 'syncing' | 'error';
  isOffline: boolean;
  driveFileId: string | null;
  receiptFolderId: string | null;
  lastKnownDriveModifiedTime: string | null;
  /** IDs of items written locally but not yet confirmed in Drive. Cleared only after writeBackupFile() succeeds. */
  pendingSyncIds: string[];
  /** CC expenses that arrived from the notification widget when multiple CC accounts exist — waiting for the user to pick which card. */
  pendingCcExpenses: PendingCcExpense[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const ExpenseStore = signalStore(
  { providedIn: 'root' },

  // ─── Task 5.1 / 6.1: State ────────────────────────────────────────────────
  withState<ExpenseState>({
    entries: [],
    limits: [],
    accounts: [],
    accountAdjustments: [],
    debts: [],
    debtPayments: [],
    debtAdjustments: [],
    monthlyIncome: 0,
    selectedMonth: toLocalDateString().slice(0, 7), // YYYY-MM
    syncStatus: 'idle',
    isOffline: false,
    driveFileId: null,
    receiptFolderId: null,
    lastKnownDriveModifiedTime: null,
    pendingSyncIds: [],
    pendingCcExpenses: [],
  }),

  // ─── Task 5.2 & 5.3: Computed Signals ─────────────────────────────────────
  withComputed((store) => ({
    /** Entries whose date equals today's ISO date string (YYYY-MM-DD) */
    todayEntries: computed(() => {
      const today = toLocalDateString();
      return store.entries().filter((e) => e.date === today);
    }),

    /** Entries whose date falls within the currently selected month */
    selectedMonthEntries: computed(() => {
      const month = store.selectedMonth();
      return store.entries().filter((e) => e.date.startsWith(month));
    }),

    /** Record<type, ExpenseLimit> for O(1) limit lookups */
    limitMap: computed(() => {
      const map: Record<string, ExpenseLimit> = {};
      for (const limit of store.limits()) {
        map[limit.type] = limit;
      }
      return map;
    }),

    /** Budget rule summary for the selected month (Needs/Wants/Savings/Growth/Buffer) */
    budgetRuleSummary: computed((): BudgetRuleSummary => {
      const month = store.selectedMonth();
      const monthEntries = store.entries().filter((e) => e.date.startsWith(month));
      const limitMap: Record<string, ExpenseLimit> = {};
      for (const limit of store.limits()) {
        limitMap[limit.type] = limit;
      }
      const income = store.monthlyIncome();

      let needsTotal = 0;
      let wantsTotal = 0;
      let savingsTotal = 0;
      let growthTotal = 0;
      let bufferTotal = 0;

      // Calculate target allocations from configured limits
      let needsTarget = 0;
      let wantsTarget = 0;
      let savingsTarget = 0;
      let growthTarget = 0;
      let bufferTarget = 0;

      for (const limit of store.limits()) {
        const amount = (limit.userPercentage * income) / 100;
        switch (limit.category) {
          case 'Needs':
            needsTarget += amount;
            break;
          case 'Wants':
            wantsTarget += amount;
            break;
          case 'Savings':
            savingsTarget += amount;
            break;
          case 'Growth':
            growthTarget += amount;
            break;
          case 'Buffer':
            bufferTarget += amount;
            break;
        }
      }

      // Categorize actual spending
      for (const entry of monthEntries) {
        const limit = limitMap[entry.type];
        const category = limit?.category ?? 'Buffer';

        switch (category) {
          case 'Needs':
            needsTotal += entry.amount;
            break;
          case 'Wants':
            wantsTotal += entry.amount;
            break;
          case 'Savings':
            savingsTotal += entry.amount;
            break;
          case 'Growth':
            growthTotal += entry.amount;
            break;
          case 'Buffer':
            bufferTotal += entry.amount;
            break;
        }
      }

      const needsPercentage = income > 0 ? (needsTotal / income) * 100 : 0;
      const wantsPercentage = income > 0 ? (wantsTotal / income) * 100 : 0;
      const savingsPercentage = income > 0 ? (savingsTotal / income) * 100 : 0;
      const growthPercentage = income > 0 ? (growthTotal / income) * 100 : 0;
      const bufferPercentage = income > 0 ? (bufferTotal / income) * 100 : 0;

      return {
        needsTotal,
        wantsTotal,
        savingsTotal,
        growthTotal,
        bufferTotal,
        needsPercentage,
        wantsPercentage,
        savingsPercentage,
        growthPercentage,
        bufferPercentage,
        needsTarget,
        wantsTarget,
        savingsTarget,
        growthTarget,
        bufferTarget,
      };
    }),

    activeAccounts: computed(() => store.accounts().filter((account) => !account.archived)),

    defaultAccount: computed(() => {
      const activeAccounts = store.accounts().filter((account) => !account.archived);
      return activeAccounts.find((account) => account.isDefault) ?? activeAccounts[0] ?? null;
    }),

    totalAssets: computed(() =>
      store.accounts()
        .filter((account) => !account.archived)
        .reduce((sum, account) => sum + account.balance, 0)
    ),

    activeDebts: computed(() => store.debts().filter((debt) => debt.status === 'active')),

    totalLiabilities: computed(() =>
      store.debts()
        .filter((debt) => debt.status === 'active')
        .reduce((sum, debt) => sum + debt.remainingBalance, 0)
    ),

    netWorth: computed(() => {
      const assets = store.accounts()
        .filter((account) => !account.archived)
        .reduce((sum, account) => sum + account.balance, 0);
      const liabilities = store.debts()
        .filter((debt) => debt.status === 'active')
        .reduce((sum, debt) => sum + debt.remainingBalance, 0);
      return assets - liabilities;
    }),

    activeDebtCount: computed(() =>
      store.debts().filter((debt) => debt.status === 'active').length
    ),

    nextDebtDue: computed(() => {
      const [nextDebt] = store.debts()
        .filter((debt) => debt.status === 'active' && !!debt.nextDueDate)
        .sort((a, b) => (a.nextDueDate ?? '').localeCompare(b.nextDueDate ?? ''));
      return nextDebt ?? null;
    }),
  })),

  // ─── Task 5.4 – 5.7 / 6.2 / 6.5 / 6.7: Methods ──────────────────────────
  withMethods((store,
    storageService = inject(StorageService),
    googleDriveService = inject(GoogleDriveService),
    backupModeService = inject(BackupModeService),
    currencyService = inject(CurrencyService),
    authService = inject(AuthService),
    familySyncService = inject(FamilySyncService),
    localNotificationService = inject(LocalNotificationService),
  ) => {
    let localRevision = 0;
    let persistedRevision = 0;
    let persistQueue = Promise.resolve();
    let syncDriveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    // Background retry for a dirty local snapshot that could not reach Drive yet
    // (offline / token not ready / Drive 5xx). The local copy is already safe;
    // this only keeps trying to sync it up. Backoff grows with consecutive failures.
    let backgroundFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let backgroundFlushAttempts = 0;
    // Guards against double-registering the native widget "expense queued" listener.
    let widgetExpenseListenerRegistered = false;
    const BG_FLUSH_BASE_MS = 5000;
    const BG_FLUSH_MAX_MS = 5 * 60 * 1000;
    let applyingRemote = false;
    // True when a family-ledger push was dropped, failed, or is not yet
    // server-acked; retried from flushPendingChanges() and the reconcile push.
    let familyPushPending = false;
    // Debounce guard for the post-snapshot ledger reconciliation push.
    let ledgerReconcileTimer: ReturnType<typeof setTimeout> | null = null;
    // DELETE FLAGS (persisted): ledger doc ids the user deleted, flagged BEFORE
    // the state mutation and kept until the server acks the tombstone. Enforced
    // on every apply (a snapshot can never resurrect a flagged record) and every
    // diff (a flagged record is never re-uploaded). Survives app restarts —
    // the in-memory session set this replaces was why deletes resurrected.
    const pendingDeletes = new Set<string>();
    let pendingDeletesLoaded = false;

    const loadPendingDeletes = async (): Promise<void> => {
      if (pendingDeletesLoaded) return;
      pendingDeletesLoaded = true;
      try {
        const raw = await storageService.get(PENDING_DELETES_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { ids?: string[] };
        for (const id of parsed.ids ?? []) pendingDeletes.add(id);
      } catch (err) {
        if (isDevMode()) { console.warn('[ExpenseStore] Failed to load pending delete flags:', err); }
      }
    };

    const persistPendingDeletes = (): void => {
      const ids = Array.from(pendingDeletes).slice(-500); // safety cap
      void storageService.set(PENDING_DELETES_KEY, JSON.stringify({ ids })).catch((err) => {
        if (isDevMode()) { console.warn('[ExpenseStore] Failed to persist pending delete flags:', err); }
      });
    };

    /** Flags a record as deleted BEFORE the mutation lands — the durable "delete flag". */
    const flagPendingDelete = (type: 'expense' | 'adjustment' | 'debt-payment' | 'debt-adjustment' | 'account' | 'debt', id: string): void => {
      if (backupModeService.getMode() !== 'family') return;
      pendingDeletes.add(ledgerDocId(type, id));
      persistPendingDeletes();
    };

    /** Clears flags whose tombstone the server has acked. */
    const clearAckedDeleteFlags = (docIds: readonly string[]): void => {
      let changed = false;
      for (const docId of docIds) {
        if (pendingDeletes.delete(docId)) changed = true;
      }
      if (changed) persistPendingDeletes();
    };

    // VERIFY FLAGS (persisted): a widget item tagged `familySynced` was written
    // to the ledger by the Cloud Function while this app was closed — and the
    // partner may have EDITED the record since. The queue payload is therefore
    // capture-time-stale: pushing it would revert the partner's edit (the
    // 2026-07-16 "updated log reverted to previous entry" bug). Flagged doc ids
    // are never pushed until verifyDocs() fetches the server truth: a found doc
    // is ingested+applied (newer version wins locally), a missing doc (CF never
    // actually wrote it) clears the flag so the normal push delivers it.
    const pendingVerify = new Set<string>();
    let pendingVerifyLoaded = false;

    const loadPendingVerify = async (): Promise<void> => {
      if (pendingVerifyLoaded) return;
      pendingVerifyLoaded = true;
      try {
        const raw = await storageService.get(PENDING_VERIFY_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { ids?: string[] };
        for (const id of parsed.ids ?? []) pendingVerify.add(id);
      } catch (err) {
        if (isDevMode()) { console.warn('[ExpenseStore] Failed to load pending verify flags:', err); }
      }
    };

    const persistPendingVerify = (): void => {
      const ids = Array.from(pendingVerify).slice(-500); // safety cap
      void storageService.set(PENDING_VERIFY_KEY, JSON.stringify({ ids })).catch((err) => {
        if (isDevMode()) { console.warn('[ExpenseStore] Failed to persist pending verify flags:', err); }
      });
    };

    const flagPendingVerify = (type: 'expense' | 'adjustment', id: string): void => {
      pendingVerify.add(ledgerDocId(type, id));
      persistPendingVerify();
    };

    /**
     * Resolves outstanding verify flags against the server. Missing docs (the
     * CF never wrote them) are unflagged so the following diff pushes them;
     * found docs are ingested by the service and applied via changes$ (a newer
     * partner version replaces the stale queue payload locally). Throws
     * offline — flags stay, retried from resume/online/reconcile pushes.
     */
    const resolvePendingVerify = async (familyId: string): Promise<void> => {
      if (pendingVerify.size === 0) return;
      const docIds = Array.from(pendingVerify);
      await familySyncService.verifyDocs(familyId, docIds);
      // Both outcomes clear the flag: found → copy now holds server truth
      // (divergence rules take over); missing → local payload is the truth.
      for (const docId of docIds) pendingVerify.delete(docId);
      persistPendingVerify();
    };

    const isAppCurrency = (currency: string | undefined): currency is AppCurrency =>
      currency === 'INR' || currency === 'USD' || currency === 'AED';

    const setCurrencyFromBackup = (currency: string | undefined): void => {
      if (isAppCurrency(currency) && currencyService.currency() !== currency) {
        void currencyService.setCurrency(currency);
      }
    };

    const roundMoney = (amount: number): number => Number(amount.toFixed(2));

    const activityActor = (): {
      email?: string;
      role?: 'owner' | 'partner' | 'single';
    } => ({
      email: authService.userEmail() ?? undefined,
      role: backupModeService.getMode() === 'family'
        ? backupModeService.getOwnerRole() ?? undefined
        : 'single',
    });

    const backupAccounts = (doc: BackupDocument): AssetAccount[] =>
      Array.isArray(doc.accounts) ? doc.accounts : [];

    const backupAccountAdjustments = (doc: BackupDocument): AccountBalanceAdjustment[] =>
      Array.isArray(doc.accountAdjustments) ? doc.accountAdjustments : [];

    const backupDebts = (doc: BackupDocument): DebtAccount[] =>
      Array.isArray(doc.debts) ? doc.debts : [];

    const backupDebtPayments = (doc: BackupDocument): DebtPayment[] =>
      Array.isArray(doc.debtPayments) ? doc.debtPayments : [];

    const backupDebtAdjustments = (doc: BackupDocument): DebtAdjustment[] =>
      Array.isArray(doc.debtAdjustments) ? doc.debtAdjustments : [];

    const addAccountDelta = (deltas: AccountBalanceDelta, accountId: string | undefined, delta: number): void => {
      if (!accountId || delta === 0) return;
      deltas.set(accountId, roundMoney((deltas.get(accountId) ?? 0) + delta));
    };

    const accountDeltasForAddedEntries = (entries: ExpenseEntry[]): AccountBalanceDelta => {
      const deltas: AccountBalanceDelta = new Map();
      for (const entry of entries) {
        addAccountDelta(deltas, entry.accountId, -entry.amount);
      }
      return deltas;
    };

    /** Credit-card purchases (entry.debtId, not debt payments) grouped by card. */
    const debtChargesForAddedEntries = (entries: ExpenseEntry[]): Map<string, number> => {
      const charges = new Map<string, number>();
      for (const entry of entries) {
        if (entry.debtId && entry.source !== 'debt-payment') {
          charges.set(entry.debtId, roundMoney((charges.get(entry.debtId) ?? 0) + entry.amount));
        }
      }
      return charges;
    };

    /** Increase card outstanding for purchases charged to it. Validates before mutating. */
    const applyDebtCharges = (debts: DebtAccount[], charges: Map<string, number>): DebtAccount[] => {
      if (charges.size === 0) return debts;

      const now = new Date().toISOString();
      const actor = activityActor();
      for (const debtId of charges.keys()) {
        const debt = debts.find((d) => d.id === debtId);
        if (!debt || debt.type !== 'credit-card' || debt.status !== 'active') {
          throw new Error('Selected credit card is not active anymore. Choose another payment method.');
        }
      }

      return debts.map((debt) => {
        const charge = charges.get(debt.id);
        if (charge === undefined) return debt;
        return {
          ...debt,
          remainingBalance: roundMoney(debt.remainingBalance + charge),
          updatedAt: now,
          updatedByEmail: actor.email,
          updatedByRole: actor.role,
        };
      });
    };

    /** Accumulate a signed card-outstanding delta for one entry (reversal −, charge +). */
    const addDebtDelta = (deltas: Map<string, number>, entry: ExpenseEntry | undefined, sign: 1 | -1): void => {
      if (!entry?.debtId || entry.source === 'debt-payment' || entry.amount === 0) return;
      const next = roundMoney((deltas.get(entry.debtId) ?? 0) + sign * entry.amount);
      if (next === 0) deltas.delete(entry.debtId);
      else deltas.set(entry.debtId, next);
    };

    /** Reverse the previous card charge and apply the next one (net per card). */
    const debtDeltasForEntryUpdate = (
      previousEntry: ExpenseEntry | undefined,
      nextEntry: ExpenseEntry
    ): Map<string, number> => {
      const deltas = new Map<string, number>();
      addDebtDelta(deltas, previousEntry, -1);
      addDebtDelta(deltas, nextEntry, 1);
      return deltas;
    };

    const debtDeltasForDeletedEntry = (entry: ExpenseEntry | undefined): Map<string, number> => {
      const deltas = new Map<string, number>();
      addDebtDelta(deltas, entry, -1);
      return deltas;
    };

    /**
     * Apply signed outstanding deltas to cards. A positive net delta is a new
     * charge and requires an active credit card (same rule as applyDebtCharges).
     * A negative net delta is a reversal (edit/delete of a mis-logged card
     * spend) and is always honoured — even on an archived card — with the
     * outstanding clamped at 0, matching the widget CC-payment clamp precedent.
     */
    const applyDebtDeltas = (debts: DebtAccount[], deltas: Map<string, number>): DebtAccount[] => {
      if (deltas.size === 0) return debts;

      const now = new Date().toISOString();
      const actor = activityActor();
      for (const [debtId, delta] of deltas) {
        if (delta <= 0) continue;
        const debt = debts.find((d) => d.id === debtId);
        if (!debt || debt.type !== 'credit-card' || debt.status !== 'active') {
          throw new Error('Selected credit card is not active anymore. Choose another payment method.');
        }
      }

      return debts.map((debt) => {
        const delta = deltas.get(debt.id);
        if (delta === undefined) return debt;
        return {
          ...debt,
          remainingBalance: Math.max(0, roundMoney(debt.remainingBalance + delta)),
          updatedAt: now,
          updatedByEmail: actor.email,
          updatedByRole: actor.role,
        };
      });
    };

    const accountDeltasForEntryUpdate = (
      previousEntry: ExpenseEntry | undefined,
      nextEntry: ExpenseEntry
    ): AccountBalanceDelta => {
      const deltas: AccountBalanceDelta = new Map();
      if (previousEntry) {
        addAccountDelta(deltas, previousEntry.accountId, previousEntry.amount);
      }
      addAccountDelta(deltas, nextEntry.accountId, -nextEntry.amount);
      return deltas;
    };

    const accountDeltasForDeletedEntry = (entry: ExpenseEntry | undefined): AccountBalanceDelta => {
      const deltas: AccountBalanceDelta = new Map();
      if (entry) {
        addAccountDelta(deltas, entry.accountId, entry.amount);
      }
      return deltas;
    };

    const applyAccountDeltas = (
      accounts: AssetAccount[],
      deltas: AccountBalanceDelta
    ): AssetAccount[] => {
      if (deltas.size === 0) return accounts;

      const now = new Date().toISOString();
      const actor = activityActor();
      const byId = new Map(accounts.map((account) => [account.id, account]));

      for (const [accountId, delta] of deltas) {
        const account = byId.get(accountId);
        if (!account || account.archived) {
          throw new Error('Selected payment account was not found. Choose another account and try again.');
        }

        const nextBalance = roundMoney(account.balance + delta);
        if (!account.allowOverdraft && nextBalance < 0) {
          throw new Error(`${account.name} does not have enough balance for this expense.`);
        }
      }

      return accounts.map((account) => {
        const delta = deltas.get(account.id);
        if (delta === undefined) return account;

        return {
          ...account,
          balance: roundMoney(account.balance + delta),
          updatedAt: now,
          updatedByEmail: actor.email,
          updatedByRole: actor.role,
        };
      });
    };

    const readModifiedTimeSafely = async (fileId: string): Promise<string | null> => {
      try {
        return await googleDriveService.getFileModifiedTime(fileId);
      } catch (err) {
        if (isDevMode()) { console.warn('[ExpenseStore] Could not read Drive modifiedTime:', err); }
        return null;
      }
    };

    const buildBackupDocument = (): BackupDocument => ({
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      metadata: {
        monthlyIncome: store.monthlyIncome(),
        currency: currencyService.currency(),
        ...(store.receiptFolderId() ? { receiptFolderId: store.receiptFolderId()! } : {}),
      },
      expenses: store.entries(),
      limits: store.limits(),
      accounts: store.accounts(),
      accountAdjustments: store.accountAdjustments(),
      debts: store.debts(),
      debtPayments: store.debtPayments(),
      debtAdjustments: store.debtAdjustments(),
    });

    const isBackupDocument = (value: unknown): value is BackupDocument => {
      if (typeof value !== 'object' || value === null) return false;
      const candidate = value as Partial<BackupDocument>;
      return (
        typeof candidate.version === 'string' &&
        Array.isArray(candidate.expenses) &&
        Array.isArray(candidate.limits) &&
        (candidate.accounts === undefined || Array.isArray(candidate.accounts)) &&
        (candidate.accountAdjustments === undefined || Array.isArray(candidate.accountAdjustments)) &&
        (candidate.debts === undefined || Array.isArray(candidate.debts)) &&
        (candidate.debtPayments === undefined || Array.isArray(candidate.debtPayments)) &&
        (candidate.debtAdjustments === undefined || Array.isArray(candidate.debtAdjustments)) &&
        typeof candidate.metadata === 'object' &&
        candidate.metadata !== null &&
        typeof candidate.metadata.monthlyIncome === 'number'
      );
    };

    const isExpenseEntry = (value: unknown): value is ExpenseEntry => {
      if (typeof value !== 'object' || value === null) return false;
      const candidate = value as Partial<ExpenseEntry>;
      return (
        typeof candidate.id === 'string' &&
        candidate.id.trim() !== '' &&
        typeof candidate.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) &&
        typeof candidate.amount === 'number' &&
        Number.isFinite(candidate.amount) &&
        candidate.amount > 0 &&
        typeof candidate.type === 'string' &&
        candidate.type.trim() !== '' &&
        typeof candidate.limit === 'number' &&
        Number.isFinite(candidate.limit) &&
        typeof candidate.savings === 'number' &&
        Number.isFinite(candidate.savings) &&
        typeof candidate.timestamp === 'string' &&
        candidate.timestamp.trim() !== ''
      );
    };

    const isAccountBalanceAdjustment = (value: unknown): value is AccountBalanceAdjustment => {
      if (typeof value !== 'object' || value === null) return false;
      const candidate = value as Partial<AccountBalanceAdjustment>;
      return (
        typeof candidate.id === 'string' &&
        candidate.id.trim() !== '' &&
        typeof candidate.accountId === 'string' &&
        candidate.accountId.trim() !== '' &&
        typeof candidate.amount === 'number' &&
        Number.isFinite(candidate.amount) &&
        candidate.amount > 0 &&
        (candidate.kind === 'increase' || candidate.kind === 'decrease') &&
        typeof candidate.createdAt === 'string' &&
        candidate.createdAt.trim() !== ''
      );
    };

    const normalizeWidgetQueueItem = (raw: unknown): WidgetExpenseQueueItem | null => {
      if (typeof raw !== 'object' || raw === null) return null;

      const record = raw as Record<string, unknown>;
      const wrappedAdjustment = record['adjustment'];
      if (record['kind'] === 'adjustment' && isAccountBalanceAdjustment(wrappedAdjustment)) {
        return {
          kind: 'adjustment',
          userEmail: typeof record['userEmail'] === 'string' ? record['userEmail'] : null,
          adjustment: wrappedAdjustment,
          raw,
        };
      }

      const readCcLast4 = (...sources: unknown[]): string | null => {
        for (const source of sources) {
          if (typeof source !== 'object' || source === null) continue;
          const value = (source as Record<string, unknown>)['ccLast4'];
          if (typeof value === 'string' && /^\d{4}$/.test(value)) return value;
        }
        return null;
      };

      if (record['kind'] === 'cc-payment') {
        const wrapped = record['payment'];
        if (typeof wrapped === 'object' && wrapped !== null) {
          const candidate = wrapped as Record<string, unknown>;
          if (
            typeof candidate['id'] === 'string' && candidate['id'].trim() !== '' &&
            typeof candidate['amount'] === 'number' && Number.isFinite(candidate['amount']) && candidate['amount'] > 0 &&
            typeof candidate['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate['date'])
          ) {
            return {
              kind: 'cc-payment',
              userEmail: typeof record['userEmail'] === 'string' ? record['userEmail'] : null,
              payment: {
                id: candidate['id'],
                debtId: typeof candidate['debtId'] === 'string' && candidate['debtId'].trim() !== '' ? candidate['debtId'] : undefined,
                accountId: typeof candidate['accountId'] === 'string' && candidate['accountId'].trim() !== '' ? candidate['accountId'] : undefined,
                amount: candidate['amount'],
                date: candidate['date'],
                comment: typeof candidate['comment'] === 'string' && candidate['comment'].trim() !== '' ? candidate['comment'] : undefined,
                ccLast4: typeof candidate['ccLast4'] === 'string' && /^\d{4}$/.test(candidate['ccLast4']) ? candidate['ccLast4'] : undefined,
              },
              raw,
            };
          }
        }
        return null;
      }

      const wrappedEntry = record['entry'];
      if (isExpenseEntry(wrappedEntry)) {
        return {
          kind: 'expense',
          userEmail: typeof record['userEmail'] === 'string' ? record['userEmail'] : null,
          entry: wrappedEntry,
          // The native widget writes the flag INSIDE the entry; older builds may
          // have written it on the wrapper — accept both.
          isCreditCard:
            record['isCreditCard'] === true ||
            (wrappedEntry as unknown as Record<string, unknown>)['isCreditCard'] === true,
          ccLast4: readCcLast4(record, wrappedEntry),
          raw,
        };
      }

      if (isExpenseEntry(raw)) {
        return {
          kind: 'expense',
          userEmail: null,
          entry: raw,
          isCreditCard: record['isCreditCard'] === true,
          ccLast4: readCcLast4(record),
          raw,
        };
      }

      return null;
    };

    const readWidgetExpenseQueue = async (): Promise<unknown[]> => {
      const raw = await storageService.get(WIDGET_EXPENSE_QUEUE_KEY);
      if (!raw) return [];

      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        if (isDevMode()) { console.warn('[ExpenseStore] Failed to parse widget expense queue:', err); }
        return [];
      }
    };

    const widgetQueueItemMatchesCurrentUser = (item: WidgetExpenseQueueItem): boolean => {
      const currentEmail = authService.userEmail();
      return !!currentEmail && item.userEmail === currentEmail;
    };

    // CONCURRENCY GUARD: the flush is fired from several independent places that
    // can overlap at startup (loadFromLocalCache fire-and-forget, the app's
    // focus/resume handler ~200ms later, loadFromDrive, the widget event
    // listener). Two overlapping runs both snapshot store.entries() BEFORE either
    // patches state, so the same queue item passes the existingIds duplicate
    // check twice and is inserted twice ("duplicated entry, both Syncing").
    // Serialize: concurrent callers join the in-flight run; the queue is
    // re-read on the next call, so nothing is ever dropped.
    let widgetFlushInFlight: Promise<boolean> | null = null;
    const flushPendingWidgetExpenses = (): Promise<boolean> => {
      if (widgetFlushInFlight) return widgetFlushInFlight;
      widgetFlushInFlight = flushPendingWidgetExpensesInner().finally(() => {
        widgetFlushInFlight = null;
      });
      return widgetFlushInFlight;
    };

    const flushPendingWidgetExpensesInner = async (): Promise<boolean> => {
      const rawQueue = await readWidgetExpenseQueue();
      if (rawQueue.length === 0) return false;

      const activeItems: WidgetExpenseQueueItem[] = [];
      const remainingRawItems: unknown[] = [];

      for (const rawItem of rawQueue) {
        const item = normalizeWidgetQueueItem(rawItem);
        if (!item) continue;

        if (widgetQueueItemMatchesCurrentUser(item)) {
          activeItems.push(item);
        } else {
          remainingRawItems.push(rawItem);
        }
      }

      if (activeItems.length === 0) return false;

      const existingIds = new Set(store.entries().map((entry) => entry.id));
      const newEntries: ExpenseEntry[] = [];
      const existingAdjustmentIds = new Set(store.accountAdjustments().map((adjustment) => adjustment.id));
      let nextAccounts = [...store.accounts()];
      let nextDebts = [...store.debts()];
      const newAdjustments: AccountBalanceAdjustment[] = [];
      const newPendingCc: PendingCcExpense[] = [];
      const ccPaymentItems: WidgetCcPaymentQueueItem[] = [];
      let noCcAccountDetected = false;
      // The wrapper-level `familySynced` tag (set by WidgetExpenseSyncWorker after
      // a CF push) means THE LEDGER ALREADY OWNS this record — and the partner may
      // have edited it since capture. Tagged items get a persisted VERIFY flag:
      // the diff will not push them until verifyDocs() has fetched the server
      // version (which, if newer, replaces the stale queue payload locally).
      // Untagged items are covered by the unconditional pushFamilyLedger() below.
      const isFamilyMode = backupModeService.getMode() === 'family' && !!backupModeService.getFamilyId();
      const wasFamilySynced = (raw: unknown): boolean =>
        typeof raw === 'object' && raw !== null &&
        (raw as Record<string, unknown>)['familySynced'] === true;
      if (isFamilyMode) {
        await loadPendingVerify();
        for (const item of activeItems) {
          if (!wasFamilySynced(item.raw)) continue;
          if (item.kind === 'expense') flagPendingVerify('expense', item.entry.id);
          else if (item.kind === 'adjustment') flagPendingVerify('adjustment', item.adjustment.id);
        }
      }

      for (const item of activeItems) {
        if (item.kind === 'expense') {
          let entry = item.entry;
          if (existingIds.has(entry.id)) continue;

          // Drop the native widget's transport-only props so they never leak
          // into the persisted backup schema.
          {
            const transportRecord = entry as unknown as Record<string, unknown>;
            if (transportRecord['isCreditCard'] !== undefined || transportRecord['ccLast4'] !== undefined) {
              const { isCreditCard: _flag, ccLast4: _last4, ...cleanEntry } =
                entry as ExpenseEntry & { isCreditCard?: boolean; ccLast4?: string };
              entry = cleanEntry;
            }
          }

          // Explicit card choice made in the widget: charge that card, no guessing.
          if (entry.debtId && entry.source !== 'debt-payment') {
            const cardIndex = nextDebts.findIndex(
              (d) => d.id === entry.debtId && d.type === 'credit-card' && d.status === 'active'
            );
            if (cardIndex >= 0) {
              entry = { ...entry, accountId: undefined };
              nextDebts = nextDebts.map((d, i) =>
                i === cardIndex
                  ? { ...d, remainingBalance: roundMoney(d.remainingBalance + entry.amount), updatedAt: entry.timestamp }
                  : d
              );
            } else {
              // Card archived/deleted since the widget save — keep the expense,
              // drop the link so no balance is silently affected.
              entry = { ...entry, debtId: undefined };
            }
          } else if (item.isCreditCard && !entry.debtId) {
            const activeCreditCards = nextDebts.filter((d) => d.type === 'credit-card' && d.status === 'active');
            // The notification's card last-4 pins the exact card — no picker needed.
            const last4Match = item.ccLast4
              ? activeCreditCards.filter((d) => d.cardLast4 === item.ccLast4)
              : [];
            if (activeCreditCards.length === 1 || last4Match.length === 1) {
              const cc = last4Match.length === 1 ? last4Match[0] : activeCreditCards[0];
              entry = { ...entry, debtId: cc.id, accountId: undefined };
              const idx = nextDebts.findIndex((d) => d.id === cc.id);
              if (idx >= 0) {
                nextDebts = nextDebts.map((d, i) =>
                  i === idx
                    ? { ...d, remainingBalance: roundMoney(d.remainingBalance + entry.amount), updatedAt: entry.timestamp }
                    : d
                );
              }
            } else if (activeCreditCards.length > 1) {
              // Multiple CC accounts: park it for the user to pick via the in-app picker dialog
              const alreadyPending = store.pendingCcExpenses().some((p) => p.id === entry.id);
              if (!alreadyPending) {
                newPendingCc.push({
                  id: entry.id,
                  amount: entry.amount,
                  comment: entry.comment,
                  timestamp: entry.timestamp,
                  type: entry.type,
                  date: entry.date,
                  createdByEmail: entry.createdByEmail,
                  createdByRole: entry.createdByRole,
                });
              }
              existingIds.add(entry.id); // prevent duplicate processing on next flush
              continue;
            } else {
              // No CC account — fall through to normal expense flow (save from default account)
              noCcAccountDetected = true;
            }
          }

          if (entry.accountId) {
            const account = nextAccounts.find(
              (candidate) => candidate.id === entry.accountId && !candidate.archived
            );
            if (!account) {
              remainingRawItems.push(item.raw);
              continue;
            }
            const nextBalance = roundMoney(account.balance - entry.amount);
            if (!account.allowOverdraft && nextBalance < 0) {
              remainingRawItems.push(item.raw);
              continue;
            }
          }

          nextAccounts = applyAccountDeltas(nextAccounts, accountDeltasForAddedEntries([entry]));
          newEntries.push(entry);
          existingIds.add(entry.id);
          continue;
        }

        if (item.kind === 'cc-payment') {
          // Resolved after the main state patch via recordDebtPayment so the
          // account deduction + card reduction + audit record stay atomic.
          ccPaymentItems.push(item);
          continue;
        }

        const adjustment = item.adjustment;
        if (existingAdjustmentIds.has(adjustment.id)) continue;
        const accountIndex = nextAccounts.findIndex(
          (account) => account.id === adjustment.accountId && !account.archived
        );
        if (accountIndex < 0) {
          remainingRawItems.push(item.raw);
          continue;
        }
        const account = nextAccounts[accountIndex];
        const delta = adjustment.kind === 'increase' ? adjustment.amount : -adjustment.amount;
        const nextBalance = roundMoney(account.balance + delta);
        if (!account.allowOverdraft && nextBalance < 0) {
          remainingRawItems.push(item.raw);
          continue;
        }
        nextAccounts[accountIndex] = {
          ...account,
          balance: nextBalance,
          updatedAt: adjustment.createdAt,
          updatedByEmail: adjustment.createdByEmail,
          updatedByRole: adjustment.createdByRole,
        };
        newAdjustments.push(adjustment);
        existingAdjustmentIds.add(adjustment.id);
      }

      await storageService.set(WIDGET_EXPENSE_QUEUE_KEY, JSON.stringify(remainingRawItems));

      // Persist pending CC selection queue and emit no-account signal
      if (newPendingCc.length > 0) {
        const merged = [...store.pendingCcExpenses(), ...newPendingCc];
        await storageService.set(PENDING_CC_SELECTION_KEY, JSON.stringify(merged));
        patchState(store, { pendingCcExpenses: merged });
      }
      if (noCcAccountDetected) {
        const ccEntry = newEntries.find((e) => !e.debtId && !e.accountId) ?? newEntries[0];
        noCcAccountForExpense$.next({ amount: ccEntry?.amount ?? 0, comment: ccEntry?.comment });
      }

      if (newEntries.length === 0 && newAdjustments.length === 0 && ccPaymentItems.length === 0) {
        // All consumed items were local duplicates. Still run the (cheap, no-op
        // when in sync) ledger reconciliation — Phase 2 removed the old
        // per-item bookkeeping in favor of always reconciling.
        pushFamilyLedger();
        return false;
      }

      if (newEntries.length > 0 || newAdjustments.length > 0) {
        patchState(store, {
          entries: [...newEntries, ...store.entries()],
          accounts: nextAccounts,
          debts: nextDebts,
          accountAdjustments: [...newAdjustments, ...store.accountAdjustments()],
          // Sync tag: widget-captured items show as "syncing" in the UI until the
          // Drive write below confirms (persistToDrive clears pendingSyncIds).
          pendingSyncIds: [
            ...newEntries.map((entry) => entry.id),
            ...newAdjustments.map((adjustment) => adjustment.id),
            ...store.pendingSyncIds(),
          ],
        });
        localRevision += 1;
        await methods.persistToDrive();
      }
      // Always reconcile after a flush — the diff no-ops when the ledger
      // already has everything (replaces the old widgetFamilyPushNeeded flag).
      pushFamilyLedger();

      // ── Widget-captured credit-card bill payments ────────────────────────
      // Each one runs through recordDebtPayment (account deduction, card
      // outstanding reduction, Debt Payment expense, audit record — atomic).
      if (ccPaymentItems.length > 0) {
        const retryRawItems: unknown[] = [];
        for (const item of ccPaymentItems) {
          const payment = item.payment;

          // Resolve the card: explicit choice → SMS last-4 → only card.
          const activeCards = store.debts().filter((d) => d.type === 'credit-card' && d.status === 'active');
          let card = payment.debtId ? activeCards.find((d) => d.id === payment.debtId) : undefined;
          if (!card && payment.ccLast4) {
            const matches = activeCards.filter((d) => d.cardLast4 === payment.ccLast4);
            if (matches.length === 1) card = matches[0];
          }
          if (!card && activeCards.length === 1) card = activeCards[0];
          if (!card) {
            if (activeCards.length === 0) {
              noCcAccountForExpense$.next({ amount: payment.amount, comment: payment.comment });
            }
            retryRawItems.push(item.raw); // resolvable once the card exists/is unambiguous
            continue;
          }

          // Duplicate guard: bank-side and card-side SMS describe the same
          // payment — record it once per card+amount+date.
          const alreadyRecorded = store.debtPayments().some(
            (p) => p.debtId === card!.id && p.amount === roundMoney(payment.amount) && p.date === payment.date
          );
          if (alreadyRecorded) continue;

          if (card.remainingBalance <= 0) {
            // Nothing outstanding in-app — recording would corrupt balances.
            if (isDevMode()) { console.warn('[ExpenseStore] Skipping widget CC payment: card has no tracked outstanding.'); }
            continue;
          }

          // Resolve the paying account: explicit choice → default account.
          const account =
            (payment.accountId
              ? store.accounts().find((a) => a.id === payment.accountId && !a.archived)
              : undefined)
            ?? store.accounts().find((a) => a.isDefault && !a.archived)
            ?? store.accounts().find((a) => !a.archived);
          if (!account) {
            retryRawItems.push(item.raw);
            continue;
          }

          try {
            await methods.recordDebtPayment({
              debtId: card.id,
              accountId: account.id,
              // The SMS amount can exceed the tracked outstanding when older
              // spends were never logged; cap so state stays consistent.
              amount: Math.min(roundMoney(payment.amount), card.remainingBalance),
              date: payment.date,
              comment: payment.comment ?? 'Credit card bill payment (auto-detected)',
            });
          } catch (error) {
            // Overdraft or similar guided failure — keep it queued for retry.
            if (isDevMode()) { console.warn('[ExpenseStore] Widget CC payment kept queued:', error); }
            retryRawItems.push(item.raw);
          }
        }

        if (retryRawItems.length > 0) {
          const currentQueue = await readWidgetExpenseQueue();
          await storageService.set(WIDGET_EXPENSE_QUEUE_KEY, JSON.stringify([...currentQueue, ...retryRawItems]));
        }
      }

      if (store.syncStatus() === 'error') {
        if (isDevMode()) { console.warn('[ExpenseStore] Widget expenses were added locally but Drive persistence is pending.'); }
      }

      if (isDevMode()) { console.log('[ExpenseStore] Flushed widget queue:', newEntries.length, newAdjustments.length); }
      return true;
    };

    const readLocalBackupSnapshot = async (): Promise<LocalBackupSnapshot | null> => {
      const raw = await storageService.get(LOCAL_BACKUP_CACHE_KEY);
      if (!raw) return null;

      try {
        const parsed = JSON.parse(raw) as Partial<LocalBackupSnapshot>;
        if (
          parsed.version !== '1' ||
          typeof parsed.fileId !== 'string' ||
          parsed.fileId === '' ||
          (parsed.mode !== 'single' && parsed.mode !== 'family') ||
          !isBackupDocument(parsed.doc)
        ) {
          return null;
        }

        return {
          version: '1',
          userEmail: typeof parsed.userEmail === 'string' ? parsed.userEmail : null,
          fileId: parsed.fileId,
          mode: parsed.mode,
          sharedFileId: typeof parsed.sharedFileId === 'string' ? parsed.sharedFileId : null,
          modifiedTime: typeof parsed.modifiedTime === 'string' ? parsed.modifiedTime : null,
          dirty: parsed.dirty === true,
          savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
          doc: parsed.doc,
        };
      } catch (err) {
        if (isDevMode()) { console.warn('[ExpenseStore] Failed to parse local backup snapshot:', err); }
        return null;
      }
    };

    const snapshotMatchesActiveMode = (snapshot: LocalBackupSnapshot): boolean => {
      const currentEmail = authService.userEmail();
      if ((currentEmail || snapshot.userEmail) && snapshot.userEmail !== currentEmail) {
        return false;
      }

      const mode = backupModeService.getMode();
      // Drive-based family: sharedFileId is set AND no Firestore family ID.
      // A stale sharedFileId left over from a previous Drive-based setup must NOT
      // trigger this path when the user is now a Firestore family member.
      if (mode === 'family' && backupModeService.getSharedFileId() && !backupModeService.getFamilyId()) {
        // Drive-based family: snapshot must reference the same shared file.
        return snapshot.mode === 'family' && snapshot.fileId === backupModeService.getSharedFileId();
      }
      if (mode === 'family') {
        // Firestore family: each member keeps their own personal Drive backup.
        // Reject any snapshot that was written for a Drive-based family (has a sharedFileId),
        // so a user migrating from Drive-family → Firestore-family doesn't restore stale shared data.
        return snapshot.mode === 'single' || (snapshot.mode === 'family' && !snapshot.sharedFileId);
      }

      return mode === 'single' && snapshot.mode === 'single';
    };

    const writeLocalBackupSnapshot = async (
      fileId: string,
      doc: BackupDocument,
      modifiedTime: string | null,
      dirty: boolean
    ): Promise<void> => {
      const mode = backupModeService.getMode();
      if (mode !== 'single' && mode !== 'family') return;

      const snapshot: LocalBackupSnapshot = {
        version: '1',
        userEmail: authService.userEmail(),
        fileId,
        mode,
        sharedFileId: mode === 'family' ? backupModeService.getSharedFileId() : null,
        modifiedTime,
        dirty,
        savedAt: new Date().toISOString(),
        doc,
      };

      await storageService.set(LOCAL_BACKUP_CACHE_KEY, JSON.stringify(snapshot));
      await refreshNativeExpenseWidget();
    };

    const refreshNativeExpenseWidget = async (): Promise<void> => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        await ExpenseWidget.refresh();
      } catch (error) {
        if (isDevMode()) { console.warn('[ExpenseStore] Failed to refresh native expense widget:', error); }
      }
    };

    const preserveCachedFinanceArrays = (doc: BackupDocument): { doc: BackupDocument; healed: boolean } => {
      const currentAccounts = store.accounts();
      const currentAccountAdjustments = store.accountAdjustments();
      const currentDebts = store.debts();
      const currentDebtPayments = store.debtPayments();
      const currentDebtAdjustments = store.debtAdjustments();
      const shouldRestoreAccounts = doc.accounts === undefined && currentAccounts.length > 0;
      const shouldRestoreAccountAdjustments = doc.accountAdjustments === undefined && currentAccountAdjustments.length > 0;
      const shouldRestoreDebts = doc.debts === undefined && currentDebts.length > 0;
      const shouldRestoreDebtPayments = doc.debtPayments === undefined && currentDebtPayments.length > 0;
      const shouldRestoreDebtAdjustments = doc.debtAdjustments === undefined && currentDebtAdjustments.length > 0;
      const healed = shouldRestoreAccounts || shouldRestoreAccountAdjustments || shouldRestoreDebts || shouldRestoreDebtPayments || shouldRestoreDebtAdjustments;

      if (!healed) return { doc, healed };

      if (isDevMode()) { console.warn('[ExpenseStore] Remote backup is missing finance arrays; preserving cached finance state and upgrading backup schema.'); }
      return {
        doc: {
          ...doc,
          accounts: shouldRestoreAccounts ? currentAccounts : backupAccounts(doc),
          accountAdjustments: shouldRestoreAccountAdjustments ? currentAccountAdjustments : backupAccountAdjustments(doc),
          debts: shouldRestoreDebts ? currentDebts : backupDebts(doc),
          debtPayments: shouldRestoreDebtPayments ? currentDebtPayments : backupDebtPayments(doc),
          debtAdjustments: shouldRestoreDebtAdjustments ? currentDebtAdjustments : backupDebtAdjustments(doc),
        },
        healed,
      };
    };

    /** All doc ids the ledger has tombstoned (acked) or the user has flagged deleted. */
    const ledgerTombstonedDocIds = (): Set<string> => {
      const ids = new Set<string>(pendingDeletes);
      for (const [docId, entry] of familySyncService.ledgerCopy()) {
        if (entry.deleted) ids.add(docId);
      }
      return ids;
    };

    /**
     * Family mode: a Drive read must MERGE into current state, never replace it.
     * The in-memory state can hold partner records (applied from the ledger)
     * that this device's Drive backup hasn't stored yet — a wholesale replace
     * silently dropped them until the next restart. Ledger tombstones and
     * pending delete flags filter the result so a stale backup can't resurrect
     * deleted records either (the 2026-07-15 delete-resurrection bug).
     */
    const mergeBackupDocumentForFamily = (doc: BackupDocument): BackupDocument => {
      const tombstoned = ledgerTombstonedDocIds();
      const deletedExpenseIds = new Set<string>();
      for (const docId of tombstoned) {
        if (docId.startsWith('expense:')) deletedExpenseIds.add(docId.slice('expense:'.length));
      }
      const live = <T extends { id: string }>(
        type: 'adjustment' | 'debt-payment' | 'debt-adjustment' | 'account' | 'debt',
        items: T[]
      ): T[] => items.filter((item) => !tombstoned.has(ledgerDocId(type, item.id)));

      return {
        ...doc,
        expenses: mergeEntries(store.entries(), doc.expenses ?? [], deletedExpenseIds),
        accounts: live('account', mergeByUpdatedAt(store.accounts(), backupAccounts(doc))),
        accountAdjustments: live('adjustment', mergeAddOnly(store.accountAdjustments(), backupAccountAdjustments(doc))),
        debts: live('debt', mergeByUpdatedAt(store.debts(), backupDebts(doc))),
        debtPayments: live('debt-payment', mergeAddOnly(store.debtPayments(), backupDebtPayments(doc))),
        debtAdjustments: live('debt-adjustment', mergeAddOnly(store.debtAdjustments(), backupDebtAdjustments(doc))),
      };
    };

    // HEAL: drop duplicate expense ids (first occurrence wins). A past
    // concurrent-widget-flush race could insert the same queue item twice; the
    // duplicates were then persisted. Deletion filters by id (removes both
    // copies) while debt reversal applies once — so duplicates must be healed
    // on load, not left for the user to delete.
    const dedupeExpensesById = (expenses: ExpenseEntry[]): ExpenseEntry[] => {
      const seen = new Set<string>();
      const deduped = expenses.filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
      return deduped.length === expenses.length ? expenses : deduped;
    };

    const applyBackupDocument = (
      fileId: string,
      doc: Awaited<ReturnType<GoogleDriveService['readBackupFile']>>,
      modifiedTime: string | null
    ): void => {
      const { doc: normalizedDoc, healed } = preserveCachedFinanceArrays(doc);
      setCurrencyFromBackup(normalizedDoc.metadata.currency);

      let effectiveDoc = normalizedDoc;
      let familyMergeChanged = false;
      if (backupModeService.getMode() === 'family' && backupModeService.getFamilyId()) {
        effectiveDoc = mergeBackupDocumentForFamily(normalizedDoc);
        familyMergeChanged = stableStringify(effectiveDoc) !== stableStringify(normalizedDoc);
      }
      const dedupedExpenses = dedupeExpensesById(effectiveDoc.expenses);
      if (dedupedExpenses !== effectiveDoc.expenses) {
        effectiveDoc = { ...effectiveDoc, expenses: dedupedExpenses };
        familyMergeChanged = true; // duplicate removal must be written back to Drive
      }

      patchState(store, {
        entries: effectiveDoc.expenses,
        limits: effectiveDoc.limits,
        accounts: backupAccounts(effectiveDoc),
        accountAdjustments: backupAccountAdjustments(effectiveDoc),
        debts: backupDebts(effectiveDoc),
        debtPayments: backupDebtPayments(effectiveDoc),
        debtAdjustments: backupDebtAdjustments(effectiveDoc),
        monthlyIncome: effectiveDoc.metadata.monthlyIncome,
        receiptFolderId: effectiveDoc.metadata.receiptFolderId ?? null,
        driveFileId: fileId,
        lastKnownDriveModifiedTime: modifiedTime,
        syncStatus: 'idle',
        pendingSyncIds: [],
      });
      localRevision = 0;
      persistedRevision = 0;
      void writeLocalBackupSnapshot(fileId, effectiveDoc, modifiedTime, false);
      if (healed || familyMergeChanged) {
        // The merged doc is richer than what Drive holds — write it back.
        localRevision += 1;
        void methods.persistToDrive();
      }
    };

    const flushDirtyLocalSnapshot = async (): Promise<boolean> => {
      const snapshot = await readLocalBackupSnapshot();
      if (!snapshot?.dirty || !snapshotMatchesActiveMode(snapshot)) return false;

      const modifiedTime = await googleDriveService.writeBackupFile(snapshot.fileId, snapshot.doc);
      applyBackupDocument(snapshot.fileId, snapshot.doc, modifiedTime);
      return true;
    };

    /** Local state as the pure ledger diff/apply utils see it. */
    const ledgerStateView = (): LedgerStateView => ({
      entries: store.entries(),
      accountAdjustments: store.accountAdjustments(),
      debtPayments: store.debtPayments(),
      debtAdjustments: store.debtAdjustments(),
      accounts: store.accounts(),
      debts: store.debts(),
      limits: store.limits(),
      monthlyIncome: store.monthlyIncome(),
      currency: currencyService.currency(),
    });

    /**
     * Family Ledger push (docs/family-sync-centralization-plan.md): diffs local
     * state against this device's persisted, server-acked copy of the ledger
     * and commits ONLY what the ledger is missing. Reconciliation-based — ANY
     * call heals ANY gap, so it is always safe (and cheap: no-op when in sync)
     * to call this "too often". Never gated on the listener: the copy is primed
     * on demand. `familyPushPending` stays true until the server ACKS the
     * commit, so resume/online retries re-produce anything still undelivered.
     * Delete flags: flagged records are never re-uploaded and produce
     * tombstones; acked tombstones in the copy win forever.
     */
    const pushFamilyLedger = (): void => {
      if (applyingRemote) return;
      if (backupModeService.getMode() !== 'family') return;
      const familyId = backupModeService.getFamilyId();
      const currentRole = backupModeService.getOwnerRole();
      if (!familyId || !currentRole) return;
      void (async () => {
        try {
          // Resolve the UID asynchronously: on native cold starts the Firebase
          // session may not be restored yet, and silently dropping the push here
          // was one cause of "partner's expense never synced".
          let currentUid = authService.firebaseUid();
          if (!currentUid) currentUid = await authService.ensureUserId();
          if (!currentUid) {
            familyPushPending = true;
            console.warn('[ExpenseStore] Family ledger push deferred: no Firebase UID yet (will retry on resume/online).');
            return;
          }
          await loadPendingDeletes();
          await loadPendingVerify();
          // A push must never depend on the listener being ready.
          await familySyncService.primeNow(familyId);
          // Resolve widget-synced records against the server before trusting
          // local payloads. Offline failure keeps the flags: those records are
          // simply skipped by the diff below and retried on the next push.
          let verifyDeferred = false;
          if (pendingVerify.size > 0) {
            try {
              await resolvePendingVerify(familyId);
            } catch (err) {
              verifyDeferred = true; // keep familyPushPending so resume/online retries
              if (isDevMode()) { console.warn('[ExpenseStore] verifyDocs deferred (offline?):', err); }
            }
          }
          const ops = diffLedgerState(ledgerStateView(), familySyncService.ledgerCopy(), {
            pendingDeletes,
            pendingVerify,
          });
          if (ops.length === 0) {
            familyPushPending = verifyDeferred;
            return;
          }
          const writer = { uid: currentUid, email: authService.userEmail() ?? '', role: currentRole };
          // Pending until SERVER ACK — not until "the SDK accepted the write".
          // Do not await: ack can take arbitrarily long offline; the persistent
          // cache delivers it, and re-pushes before ack are idempotent.
          familyPushPending = true;
          familySyncService.commitRecords(familyId, ops, writer).then(
            () => { familyPushPending = verifyDeferred; },
            (err) => {
              console.error('[ExpenseStore] Family ledger commit not acked (will re-push on resume/online):', err);
            }
          );
        } catch (err) {
          // The diff re-produces everything on the retry (resume/online/next change).
          familyPushPending = true;
          console.error('[ExpenseStore] Family ledger push failed (will retry on resume/online):', err);
        }
      })();
    };

    /**
     * Records a local change and pushes it toward Drive. The in-memory store and
     * the dirty local snapshot are the source of truth and are written FIRST
     * (inside persistToDrive, before the network call), so the user's data is
     * already durable here. A Drive failure is NOT thrown — it is retried in the
     * background. We never tell the user "not saved" for data we have kept.
     */
    const markLocalChangeAndPersist = async (): Promise<void> => {
      localRevision += 1;
      await methods.persistToDrive();
      pushFamilyLedger();
    };

    /**
     * Schedules a background attempt to flush the dirty local snapshot to Drive.
     * Used after a transient/offline failure so locally-saved data eventually
     * syncs without any user action. Exponential backoff, capped.
     */
    const scheduleBackgroundFlush = (): void => {
      if (backgroundFlushTimer !== null) return; // one timer at a time
      const delay = Math.min(BG_FLUSH_BASE_MS * Math.pow(2, backgroundFlushAttempts), BG_FLUSH_MAX_MS);
      backgroundFlushTimer = setTimeout(() => {
        backgroundFlushTimer = null;
        // Only retry if there is still unsynced local work.
        if (localRevision !== persistedRevision || store.syncStatus() !== 'idle') {
          backgroundFlushAttempts += 1;
          void methods.persistToDrive();
        }
      }, delay);
    };

    /** Cancels any pending background flush and resets backoff (a sync succeeded). */
    const onSyncSucceeded = (): void => {
      backgroundFlushAttempts = 0;
      if (backgroundFlushTimer !== null) {
        clearTimeout(backgroundFlushTimer);
        backgroundFlushTimer = null;
      }
    };

    const activeDriveFileId = (): string | null => {
      // Drive-based family uses the shared file; Firestore family uses personal Drive file.
      // A stale sharedFileId must not override a Firestore family member's personal file.
      if (backupModeService.getMode() === 'family' &&
          backupModeService.getSharedFileId() &&
          !backupModeService.getFamilyId()) {
        return backupModeService.getSharedFileId();
      }

      return store.driveFileId();
    };

    const methods = {
      // ─── Task 5.4 / 6.7 / 7.2: addEntry ───────────────────────────────────
      /**
       * Synchronously prepends a new expense entry to the in-memory store,
       * then persists the updated state to Google Drive.
       * 
       * Task 7.2: After adding entry, checks if category spending exceeds 80%
       * of its configured limit and emits a budget threshold event if so.
       */
      async addEntry(entry: ExpenseEntry): Promise<void> {
        const updatedEntries = [entry, ...store.entries()];
        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          accountDeltasForAddedEntries([entry])
        );
        const updatedDebts = applyDebtCharges(store.debts(), debtChargesForAddedEntries([entry]));
        patchState(store, {
          entries: updatedEntries,
          accounts: updatedAccounts,
          debts: updatedDebts,
          // Tag as pending until persistToDrive confirms the Drive write — the
          // Daily list shows the "Syncing" chip for ids in this set.
          pendingSyncIds: [entry.id, ...store.pendingSyncIds()],
        });
        
        // Task 7.2: Check budget threshold after adding entry
        const limit = store.limitMap()[entry.type];
        if (limit) {
          // Calculate category total for current month
          const monthEntries = store.selectedMonthEntries();
          const categoryTotal = monthEntries
            .filter(e => e.type === entry.type)
            .reduce((sum, e) => sum + e.amount, 0);
          
          // Calculate limit amount based on user percentage and monthly income
          const limitAmount = (limit.userPercentage * store.monthlyIncome()) / 100;
          
          // Calculate percentage of limit used
          const percent = limitAmount > 0 ? (categoryTotal / limitAmount) * 100 : 0;
          
          // Emit event if threshold exceeded (>= 80%)
          if (percent >= 80) {
            budgetThresholdExceeded$.next({
              category: entry.type,
              percent: Math.round(percent),
              timestamp: Date.now()
            });
          }
        }
        
        await markLocalChangeAndPersist();
      },

      async addEntries(entries: ExpenseEntry[]): Promise<void> {
        if (entries.length === 0) return;
        const updatedEntries = [...entries, ...store.entries()];
        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          accountDeltasForAddedEntries(entries)
        );
        const updatedDebts = applyDebtCharges(store.debts(), debtChargesForAddedEntries(entries));
        patchState(store, {
          entries: updatedEntries,
          accounts: updatedAccounts,
          debts: updatedDebts,
          pendingSyncIds: [...entries.map((e) => e.id), ...store.pendingSyncIds()],
        });

        for (const entry of entries) {
          const limit = store.limitMap()[entry.type];
          if (!limit) continue;

          const monthEntries = store.selectedMonthEntries();
          const categoryTotal = monthEntries
            .filter(e => e.type === entry.type)
            .reduce((sum, e) => sum + e.amount, 0);
          const limitAmount = (limit.userPercentage * store.monthlyIncome()) / 100;
          const percent = limitAmount > 0 ? (categoryTotal / limitAmount) * 100 : 0;

          if (percent >= 80) {
            budgetThresholdExceeded$.next({
              category: entry.type,
              percent: Math.round(percent),
              timestamp: Date.now()
            });
          }
        }

        await markLocalChangeAndPersist();
      },

      // ─── Task 5.7: clearLocalData ─────────────────────────────────────────
      /**
       * Resets all local state to its initial empty values.
       */
      clearLocalData(): void {
        patchState(store, {
          entries: [],
          limits: [],
          accounts: [],
          accountAdjustments: [],
          debts: [],
          debtPayments: [],
          debtAdjustments: [],
          monthlyIncome: 0,
          syncStatus: 'idle',
          driveFileId: null,
          receiptFolderId: null,
          lastKnownDriveModifiedTime: null,
        });
      },

      async clearLocalBackupCache(): Promise<void> {
        await storageService.remove(LOCAL_BACKUP_CACHE_KEY);
      },

      async loadFromLocalCache(): Promise<boolean> {
        const snapshot = await readLocalBackupSnapshot();
        if (!snapshot || !snapshotMatchesActiveMode(snapshot)) return false;

        setCurrencyFromBackup(snapshot.doc.metadata.currency);

        let pendingCcExpenses: PendingCcExpense[] = [];
        try {
          const rawPendingCc = await storageService.get(PENDING_CC_SELECTION_KEY);
          if (rawPendingCc) pendingCcExpenses = JSON.parse(rawPendingCc) as PendingCcExpense[];
        } catch { /* ignore parse errors */ }

        patchState(store, {
          entries: dedupeExpensesById(snapshot.doc.expenses),
          limits: snapshot.doc.limits,
          accounts: backupAccounts(snapshot.doc),
          accountAdjustments: backupAccountAdjustments(snapshot.doc),
          debts: backupDebts(snapshot.doc),
          debtPayments: backupDebtPayments(snapshot.doc),
          debtAdjustments: backupDebtAdjustments(snapshot.doc),
          monthlyIncome: snapshot.doc.metadata.monthlyIncome,
          receiptFolderId: snapshot.doc.metadata.receiptFolderId ?? null,
          driveFileId: snapshot.fileId,
          lastKnownDriveModifiedTime: snapshot.modifiedTime,
          syncStatus: snapshot.dirty ? 'syncing' : 'idle',
          pendingCcExpenses,
        });
        localRevision = snapshot.dirty ? 1 : 0;
        persistedRevision = 0;
        // Fire-and-forget: the flush includes a Drive write (persistToDrive) which
        // must not block cached startup (< 500 ms budget). The local merge inside
        // the flush still runs immediately after first render.
        void flushPendingWidgetExpenses().catch((err) => {
          if (isDevMode()) { console.warn('[ExpenseStore] Background widget queue flush failed:', err); }
        });
        // If the snapshot has unsynced local changes (saved while offline / token
        // expired on a previous run), push them to Drive now in the background.
        // Uses the silent token path, so it never pops a sign-in dialog at startup.
        if (snapshot.dirty) {
          void methods.persistToDrive();
        }
        return true;
      },

      async flushPendingWidgetExpenses(): Promise<boolean> {
        return flushPendingWidgetExpenses();
      },

      /**
       * Subscribes to the native widget's "expense queued" event so an expense
       * logged from the home-screen widget appears in the running app instantly —
       * no app relaunch required. Safe to call once on startup; the registration
       * is idempotent. No-op on web (the plugin event never fires there).
       */
      async listenForWidgetExpenses(): Promise<void> {
        if (widgetExpenseListenerRegistered) return;
        widgetExpenseListenerRegistered = true;
        try {
          await ExpenseWidget.addListener('widgetExpenseQueued', () => {
            void flushPendingWidgetExpenses().catch((err) => {
              if (isDevMode()) { console.warn('[ExpenseStore] Widget event flush failed:', err); }
            });
          });
        } catch (err) {
          widgetExpenseListenerRegistered = false;
          if (isDevMode()) { console.warn('[ExpenseStore] Failed to register widget listener:', err); }
        }
      },

      /**
       * Updates the selected month filter without making any remote API calls.
       */
      setSelectedMonth(month: string): void {
        patchState(store, { selectedMonth: month });
      },

      /**
       * Bulk-imports data from a Google Sheets migration.
       * Sets all entries, limits, and income in one patchState, then persists
       * to Drive once — avoids N individual write calls.
       */
      async importFromSheets(entries: ExpenseEntry[], limits: ExpenseLimit[], monthlyIncome: number): Promise<void> {
        const expectedFileId = activeDriveFileId();
        if (!store.driveFileId() || (expectedFileId && store.driveFileId() !== expectedFileId)) {
          await methods.loadFromDrive();
        }

        const fileId = store.driveFileId();
        if (!fileId) {
          throw new Error('Drive backup is not ready yet. Please reopen Settings and try again.');
        }

        if (expectedFileId && fileId !== expectedFileId) {
          throw new Error('Spenza is not connected to the active family backup. Please sign in again and retry.');
        }

        patchState(store, { entries, limits, monthlyIncome, accounts: [], accountAdjustments: [], debts: [], debtPayments: [], debtAdjustments: [] });
        localRevision += 1;
        await methods.persistToDrive();

        if (store.syncStatus() === 'error') {
          throw new Error('Imported data could not be saved to Google Drive.');
        }
      },

      async restoreFromBackupDocument(doc: Awaited<ReturnType<GoogleDriveService['readBackupFile']>>): Promise<void> {
        const expectedFileId = activeDriveFileId();
        if (!store.driveFileId() || (expectedFileId && store.driveFileId() !== expectedFileId)) {
          await methods.loadFromDrive();
        }

        const fileId = store.driveFileId();
        if (!fileId) {
          throw new Error('Drive backup is not ready yet. Please complete setup and try again.');
        }

        if (expectedFileId && fileId !== expectedFileId) {
          throw new Error('Spenza is not connected to the active family backup. Please sign in again and retry.');
        }

        setCurrencyFromBackup(doc.metadata.currency);
        patchState(store, {
          entries: doc.expenses,
          limits: doc.limits,
          accounts: backupAccounts(doc),
          accountAdjustments: backupAccountAdjustments(doc),
          debts: backupDebts(doc),
          debtPayments: backupDebtPayments(doc),
          debtAdjustments: backupDebtAdjustments(doc),
          monthlyIncome: doc.metadata.monthlyIncome,
          receiptFolderId: store.receiptFolderId() ?? doc.metadata.receiptFolderId ?? null,
        });
        localRevision += 1;
        await methods.persistToDrive();

        if (store.syncStatus() === 'error') {
          throw new Error('Restored data could not be saved to Google Drive.');
        }
      },

      /**
       * Directly updates limits and monthly income in the store
       * without making any remote API calls, then persists to Drive.
       */
      async setLimitsAndIncome(limits: ExpenseLimit[], monthlyIncome: number): Promise<void> {
        patchState(store, { limits, monthlyIncome });
        await markLocalChangeAndPersist();
      },

      async addAccount(input: CreateAssetAccountInput): Promise<void> {
        const name = input.name.trim();
        const balance = roundMoney(Number(input.balance));
        if (!name) {
          throw new Error('Account name is required.');
        }
        if (!Number.isFinite(balance)) {
          throw new Error('Enter a valid account balance.');
        }

        const now = new Date().toISOString();
        const actor = activityActor();
        const shouldDefault = input.isDefault || store.accounts().filter((account) => !account.archived).length === 0;
        const account: AssetAccount = {
          id: crypto.randomUUID(),
          name,
          type: input.type,
          balance,
          initialBalance: balance,
          allowOverdraft: input.allowOverdraft,
          isDefault: shouldDefault,
          archived: false,
          createdAt: now,
          updatedAt: now,
          createdByEmail: actor.email,
          createdByRole: actor.role,
        };

        const accounts = store.accounts().map((existing) =>
          shouldDefault ? { ...existing, isDefault: false, updatedAt: now } : existing
        );
        patchState(store, { accounts: [account, ...accounts] });
        await markLocalChangeAndPersist();
      },

      async updateAccount(accountId: string, input: UpdateAssetAccountInput): Promise<void> {
        const existing = store.accounts().find((account) => account.id === accountId);
        if (!existing) {
          throw new Error('Account was not found.');
        }

        const now = new Date().toISOString();
        const actor = activityActor();
        const requestedDefault = input.isDefault === true;
        const name = input.name === undefined ? existing.name : input.name.trim();
        if (!name) {
          throw new Error('Account name is required.');
        }

        const accounts = store.accounts().map((account) => {
          if (account.id === accountId) {
            return {
              ...account,
              ...input,
              name,
              isDefault: requestedDefault ? true : input.isDefault ?? account.isDefault,
              updatedAt: now,
              updatedByEmail: actor.email,
              updatedByRole: actor.role,
            };
          }

          return requestedDefault ? { ...account, isDefault: false, updatedAt: now } : account;
        });

        patchState(store, { accounts });
        await markLocalChangeAndPersist();
      },

      async setDefaultAccount(accountId: string): Promise<void> {
        const existing = store.accounts().find((account) => account.id === accountId && !account.archived);
        if (!existing) {
          throw new Error('Account was not found.');
        }

        const prevDefaultId = store.accounts().find(a => a.isDefault && a.id !== accountId)?.id;
        const now = new Date().toISOString();
        patchState(store, {
          accounts: store.accounts().map((account) => ({
            ...account,
            isDefault: account.id === accountId,
            updatedAt: account.id === accountId || account.isDefault ? now : account.updatedAt,
          })),
        });
        await markLocalChangeAndPersist();
      },

      async adjustAccountBalance(input: AdjustAccountBalanceInput): Promise<void> {
        const amount = roundMoney(Number(input.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Enter an adjustment amount greater than 0.');
        }

        const account = store.accounts().find((candidate) => candidate.id === input.accountId && !candidate.archived);
        if (!account) {
          throw new Error('Account was not found.');
        }

        const delta = input.kind === 'increase' ? amount : -amount;
        const nextBalance = roundMoney(account.balance + delta);
        if (!account.allowOverdraft && nextBalance < 0) {
          throw new Error('This adjustment would make the account balance negative.');
        }

        const now = new Date().toISOString();
        const actor = activityActor();
        const adjustment: AccountBalanceAdjustment = {
          id: crypto.randomUUID(),
          accountId: input.accountId,
          amount,
          kind: input.kind,
          reason: input.reason?.trim() || undefined,
          createdAt: now,
          createdByEmail: actor.email,
          createdByRole: actor.role,
        };

        patchState(store, {
          accounts: store.accounts().map((candidate) =>
            candidate.id === input.accountId
              ? {
                  ...candidate,
                  balance: nextBalance,
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : candidate
          ),
          accountAdjustments: [adjustment, ...store.accountAdjustments()],
          pendingSyncIds: [adjustment.id, ...store.pendingSyncIds()],
        });
        await markLocalChangeAndPersist();
      },

      async deleteAccount(accountId: string): Promise<void> {
        const account = store.accounts().find((candidate) => candidate.id === accountId);
        if (!account) {
          throw new Error('Account was not found.');
        }
        if (store.entries().some((entry) => entry.accountId === accountId)) {
          throw new Error('This account has linked expenses. Reassign or delete those expenses before removing it.');
        }

        const remaining = store.accounts().filter((candidate) => candidate.id !== accountId);
        if (account.isDefault && remaining.length > 0 && !remaining.some((candidate) => candidate.isDefault && !candidate.archived)) {
          remaining[0] = { ...remaining[0], isDefault: true, updatedAt: new Date().toISOString() };
        }

        // Flag FIRST (persisted): the account and its adjustment audit records.
        flagPendingDelete('account', accountId);
        for (const adjustment of store.accountAdjustments()) {
          if (adjustment.accountId === accountId) flagPendingDelete('adjustment', adjustment.id);
        }
        patchState(store, {
          accounts: remaining,
          accountAdjustments: store.accountAdjustments().filter((adjustment) => adjustment.accountId !== accountId),
        });
        await markLocalChangeAndPersist();
      },

      /**
       * Resolve a pending CC expense (shown in the multi-card picker dialog).
       * @param expenseId - id of the PendingCcExpense to resolve
       * @param debtId - ID of the chosen DebtAccount (credit card), or null to save from default account
       */
      async resolvePendingCcExpense(expenseId: string, debtId: string | null): Promise<void> {
        const pending = store.pendingCcExpenses().find((p) => p.id === expenseId);
        if (!pending) return;

        const now = new Date().toISOString();
        const defaultAccount = store.accounts().find((a) => a.isDefault && !a.archived)
          ?? store.accounts().find((a) => !a.archived);

        let nextDebts = store.debts();
        let nextAccounts = store.accounts();
        let newEntry: ExpenseEntry;

        if (debtId) {
          const cc = nextDebts.find((d) => d.id === debtId);
          if (!cc) throw new Error('Credit card account not found');
          newEntry = {
            id: pending.id,
            date: pending.date,
            amount: pending.amount,
            type: pending.type,
            limit: 0,
            savings: 0,
            timestamp: pending.timestamp,
            comment: pending.comment,
            debtId,
            source: 'notification-prompt',
            createdByEmail: pending.createdByEmail,
            createdByRole: pending.createdByRole,
          };
          nextDebts = nextDebts.map((d) =>
            d.id === debtId
              ? { ...d, remainingBalance: roundMoney(d.remainingBalance + pending.amount), updatedAt: now }
              : d
          );
        } else {
          // Save from default account
          newEntry = {
            id: pending.id,
            date: pending.date,
            amount: pending.amount,
            type: pending.type,
            limit: 0,
            savings: 0,
            timestamp: pending.timestamp,
            comment: pending.comment,
            accountId: defaultAccount?.id,
            source: 'notification-prompt',
            createdByEmail: pending.createdByEmail,
            createdByRole: pending.createdByRole,
          };
          if (defaultAccount) {
            nextAccounts = nextAccounts.map((a) =>
              a.id === defaultAccount.id
                ? { ...a, balance: roundMoney(a.balance - pending.amount), updatedAt: now }
                : a
            );
          }
        }

        const remaining = store.pendingCcExpenses().filter((p) => p.id !== expenseId);
        await storageService.set(PENDING_CC_SELECTION_KEY, JSON.stringify(remaining));

        patchState(store, {
          entries: [newEntry, ...store.entries()],
          debts: nextDebts,
          accounts: nextAccounts,
          pendingCcExpenses: remaining,
        });
        localRevision += 1;
        await methods.persistToDrive();
        pushFamilyLedger();
      },

      async addDebt(input: CreateDebtAccountInput): Promise<void> {
        const name = input.name.trim();
        const principalAmount = roundMoney(Number(input.principalAmount));
        const remainingBalance = roundMoney(Number(input.remainingBalance ?? input.principalAmount));
        const interestRate = input.interestRate === undefined || input.interestRate === null
          ? undefined
          : Number(input.interestRate);
        const monthlyEmi = input.monthlyEmi === undefined || input.monthlyEmi === null
          ? undefined
          : roundMoney(Number(input.monthlyEmi));

        if (!name) {
          throw new Error('Debt name is required.');
        }
        if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
          throw new Error('Enter a borrowed amount greater than 0.');
        }
        if (!Number.isFinite(remainingBalance) || remainingBalance < 0) {
          throw new Error('Enter a valid remaining balance.');
        }
        // Loans: remaining can never exceed what was borrowed. Credit cards
        // follow the opposite model (limit + revolving outstanding) — spending
        // can even exceed the limit, so this rule does not apply.
        if (remainingBalance > principalAmount && input.type !== 'credit-card') {
          throw new Error('Remaining balance cannot be higher than the borrowed amount.');
        }
        if (interestRate !== undefined && (!Number.isFinite(interestRate) || interestRate < 0)) {
          throw new Error('Enter a valid interest rate.');
        }
        if (monthlyEmi !== undefined && (!Number.isFinite(monthlyEmi) || monthlyEmi < 0)) {
          throw new Error('Enter a valid EMI amount.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
          throw new Error('Enter a valid start date.');
        }
        if (input.nextDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueDate)) {
          throw new Error('Enter a valid next due date.');
        }

        const now = new Date().toISOString();
        const actor = activityActor();
        const debt: DebtAccount = {
          id: crypto.randomUUID(),
          name,
          type: input.type,
          principalAmount,
          remainingBalance,
          ...(interestRate !== undefined ? { interestRate } : {}),
          ...(monthlyEmi !== undefined ? { monthlyEmi } : {}),
          startDate: input.startDate,
          ...(input.nextDueDate ? { nextDueDate: input.nextDueDate } : {}),
          ...(input.billGenerationDay !== undefined ? { billGenerationDay: input.billGenerationDay } : {}),
          ...(input.paymentDueDay !== undefined ? { paymentDueDay: input.paymentDueDay } : {}),
          ...(input.minimumPaymentAmount !== undefined ? { minimumPaymentAmount: input.minimumPaymentAmount } : {}),
          ...(input.cardNetworkOrBank ? { cardNetworkOrBank: input.cardNetworkOrBank } : {}),
          ...(input.cardLast4 && /^\d{4}$/.test(input.cardLast4) ? { cardLast4: input.cardLast4 } : {}),
          ...(input.creditLimit !== undefined && input.creditLimit > 0 ? { creditLimit: roundMoney(Number(input.creditLimit)) } : {}),
          // A credit card with zero outstanding is simply healthy, not "paid off"
          // — it must stay active so it remains selectable as a payment method.
          status: remainingBalance === 0 && input.type !== 'credit-card' ? 'paid' : 'active',
          createdAt: now,
          updatedAt: now,
          createdByEmail: actor.email,
          createdByRole: actor.role,
        };

        patchState(store, { debts: [debt, ...store.debts()] });
        await markLocalChangeAndPersist();
      },

      async updateDebt(debtId: string, input: UpdateDebtAccountInput): Promise<void> {
        const existing = store.debts().find((debt) => debt.id === debtId);
        if (!existing) {
          throw new Error('Debt was not found.');
        }

        const name = input.name === undefined ? existing.name : input.name.trim();
        const nextType = input.type ?? existing.type;
        const principalAmount = input.principalAmount === undefined
          ? existing.principalAmount
          : roundMoney(Number(input.principalAmount));
        const remainingBalance = input.remainingBalance === undefined
          ? existing.remainingBalance
          : roundMoney(Number(input.remainingBalance));
        const interestRate = input.interestRate === undefined ? existing.interestRate : Number(input.interestRate);
        const monthlyEmi = input.monthlyEmi === undefined ? existing.monthlyEmi : roundMoney(Number(input.monthlyEmi));
        const startDate = input.startDate ?? existing.startDate;
        const nextDueDate = input.nextDueDate ?? existing.nextDueDate;
        const billGenerationDay = input.billGenerationDay ?? existing.billGenerationDay;
        const paymentDueDay = input.paymentDueDay ?? existing.paymentDueDay;
        const minimumPaymentAmount = input.minimumPaymentAmount ?? existing.minimumPaymentAmount;
        const cardNetworkOrBank = input.cardNetworkOrBank ?? existing.cardNetworkOrBank;
        const cardLast4 = input.cardLast4 !== undefined ? input.cardLast4 : existing.cardLast4;
        const creditLimit = input.creditLimit !== undefined ? input.creditLimit : existing.creditLimit;

        if (cardLast4 !== undefined && cardLast4 !== '' && !/^\d{4}$/.test(cardLast4)) {
          throw new Error('Card last 4 digits must be exactly 4 numbers.');
        }
        if (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
          throw new Error('Enter a valid credit limit.');
        }

        if (!name) {
          throw new Error('Debt name is required.');
        }
        if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
          throw new Error('Enter a borrowed amount greater than 0.');
        }
        if (!Number.isFinite(remainingBalance) || remainingBalance < 0) {
          throw new Error('Enter a valid remaining balance.');
        }
        // Loan-only rule — credit cards use the limit + revolving outstanding model.
        if (remainingBalance > principalAmount && nextType !== 'credit-card') {
          throw new Error('Remaining balance cannot be higher than the borrowed amount.');
        }
        if (interestRate !== undefined && (!Number.isFinite(interestRate) || interestRate < 0)) {
          throw new Error('Enter a valid interest rate.');
        }
        if (monthlyEmi !== undefined && (!Number.isFinite(monthlyEmi) || monthlyEmi < 0)) {
          throw new Error('Enter a valid EMI amount.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          throw new Error('Enter a valid start date.');
        }
        if (nextDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
          throw new Error('Enter a valid next due date.');
        }

        const now = new Date().toISOString();
        const actor = activityActor();
        patchState(store, {
          debts: store.debts().map((debt) =>
            debt.id === debtId
              ? {
                  ...debt,
                  name,
                  type: input.type ?? debt.type,
                  principalAmount,
                  remainingBalance,
                  ...(interestRate !== undefined ? { interestRate } : { interestRate: undefined }),
                  ...(monthlyEmi !== undefined ? { monthlyEmi } : { monthlyEmi: undefined }),
                  startDate,
                  ...(nextDueDate ? { nextDueDate } : { nextDueDate: undefined }),
                  ...(billGenerationDay !== undefined ? { billGenerationDay } : { billGenerationDay: undefined }),
                  ...(paymentDueDay !== undefined ? { paymentDueDay } : { paymentDueDay: undefined }),
                  ...(minimumPaymentAmount !== undefined ? { minimumPaymentAmount } : { minimumPaymentAmount: undefined }),
                  ...(cardNetworkOrBank ? { cardNetworkOrBank } : { cardNetworkOrBank: undefined }),
                  ...(cardLast4 && /^\d{4}$/.test(cardLast4) ? { cardLast4 } : { cardLast4: undefined }),
                  ...(creditLimit !== undefined && creditLimit > 0 ? { creditLimit: roundMoney(Number(creditLimit)) } : { creditLimit: undefined }),
                  status: input.status ?? (nextType === 'credit-card'
                    ? (debt.status === 'archived' ? 'archived' : 'active')
                    : (remainingBalance === 0 ? 'paid' : debt.status === 'paid' ? 'paid' : 'active')),
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : debt
          ),
        });
        await markLocalChangeAndPersist();
      },

      /**
       * User confirms or corrects the latest statement amount for a credit
       * card (Finances → statement banner). Stores a `source: 'user'`
       * snapshot for the card's latest bill date so reminders show the exact
       * bank amount instead of the derived estimate.
       */
      async confirmCardStatement(
        debtId: string,
        input: { amount: number; minDue?: number }
      ): Promise<void> {
        const existing = store.debts().find((debt) => debt.id === debtId);
        if (!existing || existing.type !== 'credit-card') {
          throw new Error('Credit card was not found.');
        }
        if (!existing.billGenerationDay) {
          throw new Error('Set a bill generation day on this card first.');
        }
        const amount = roundMoney(Number(input.amount));
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error('Enter a valid statement amount.');
        }
        const minDue = input.minDue === undefined ? undefined : roundMoney(Number(input.minDue));
        if (minDue !== undefined && (!Number.isFinite(minDue) || minDue < 0 || minDue > amount)) {
          throw new Error('Minimum due must be between 0 and the statement amount.');
        }

        // Keep the derived snapshot's bill date when it already covers the
        // latest bill; otherwise resolve it fresh (card had no snapshot yet).
        const derived = pendingDerivedStatement(
          existing,
          store.entries(),
          store.debtAdjustments(),
          store.debtPayments(),
          new Date()
        );
        const billDateStr = derived?.billDateStr ?? existing.statement?.billDateStr;
        if (!billDateStr) {
          throw new Error('No generated statement to confirm yet.');
        }

        const now = new Date().toISOString();
        const actor = activityActor();
        const statement: CardStatement = {
          billDateStr,
          amount,
          ...(minDue !== undefined && minDue > 0 ? { minDue } : {}),
          source: 'user',
          updatedAt: now,
        };
        patchState(store, {
          debts: store.debts().map((debt) =>
            debt.id === debtId
              ? { ...debt, statement, updatedAt: now, updatedByEmail: actor.email, updatedByRole: actor.role }
              : debt
          ),
        });
        await markLocalChangeAndPersist();
      },

      /**
       * Auto-snapshots the statement for every active credit card whose
       * bill-generation day has passed without a snapshot for that bill
       * (`source: 'derived'`, confirmable in Finances). Idempotent — cards
       * whose snapshot already covers the latest bill are untouched, so the
       * watching effect settles after one pass per cycle.
       */
      async ensureCardStatements(): Promise<void> {
        const now = new Date();
        const entries = store.entries();
        const adjustments = store.debtAdjustments();
        const payments = store.debtPayments();
        const updates = new Map<string, CardStatement>();
        for (const debt of store.debts()) {
          const snapshot = pendingDerivedStatement(debt, entries, adjustments, payments, now);
          if (snapshot) updates.set(debt.id, snapshot);
        }
        if (updates.size === 0) return;

        const nowIso = new Date().toISOString();
        const actor = activityActor();
        patchState(store, {
          debts: store.debts().map((debt) => {
            const statement = updates.get(debt.id);
            return statement
              ? { ...debt, statement, updatedAt: nowIso, updatedByEmail: actor.email, updatedByRole: actor.role }
              : debt;
          }),
        });
        await markLocalChangeAndPersist();
      },

      async deleteDebt(debtId: string): Promise<void> {
        const existing = store.debts().find((debt) => debt.id === debtId);
        if (!existing) {
          throw new Error('Debt was not found.');
        }
        if (store.debtPayments().some((payment) => payment.debtId === debtId)) {
          throw new Error('Delete this debt’s payment logs before deleting the debt.');
        }
        if (store.entries().some((entry) => entry.debtId === debtId)) {
          throw new Error('Delete this debt’s linked expense entries before deleting the debt.');
        }

        // Flag FIRST (persisted) — see delete-flag rules in family-ledger.util.ts.
        // The debt's adjustment audit records cascade, mirroring how
        // deleteAccount cascades account adjustments.
        flagPendingDelete('debt', debtId);
        for (const adjustment of store.debtAdjustments()) {
          if (adjustment.debtId === debtId) flagPendingDelete('debt-adjustment', adjustment.id);
        }
        patchState(store, {
          debts: store.debts().filter((debt) => debt.id !== debtId),
          debtAdjustments: store.debtAdjustments().filter((adjustment) => adjustment.debtId !== debtId),
        });
        if (existing.type === 'credit-card') {
          // The reschedule effect only covers cards still in the list; a
          // deleted card's pending notifications must be cancelled explicitly.
          void localNotificationService.cancelCreditCardDueReminder(debtId);
        }
        await markLocalChangeAndPersist();
      },

      /**
       * Records a non-purchase card movement (refund / cash withdrawal / fee).
       * None of these create an ExpenseEntry:
       * - refund: outstanding ↓ (clamped at 0 — the adjustment record keeps the
       *   full audit amount even when the bill was already paid);
       * - cash-withdrawal: outstanding ↑ AND the receiving asset account ↑
       *   atomically (money moved, not spent — spending the cash later is
       *   logged normally, so nothing is double-counted);
       * - charge: outstanding ↑ (fees/interest).
       */
      async recordDebtAdjustment(input: RecordDebtAdjustmentInput): Promise<void> {
        const amount = roundMoney(Number(input.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Enter an adjustment amount greater than 0.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
          throw new Error('Enter a valid adjustment date.');
        }

        const card = store.debts().find((candidate) => candidate.id === input.debtId && candidate.status === 'active');
        if (!card || card.type !== 'credit-card') {
          throw new Error('Active credit card was not found.');
        }

        let updatedAccounts = store.accounts();
        let linkedAccountId: string | undefined;
        if (input.kind === 'cash-withdrawal') {
          const account = store.accounts().find(
            (candidate) => candidate.id === input.linkedAccountId && !candidate.archived
          );
          if (!account) {
            throw new Error('Choose the account that received the cash.');
          }
          linkedAccountId = account.id;
          updatedAccounts = applyAccountDeltas(store.accounts(), new Map([[account.id, amount]]));
        }

        const outstandingDelta = input.kind === 'refund' || input.kind === 'cashback' ? -amount : amount;
        const nextRemainingBalance = Math.max(0, roundMoney(card.remainingBalance + outstandingDelta));

        const now = new Date().toISOString();
        const actor = activityActor();
        const adjustment: DebtAdjustment = {
          id: crypto.randomUUID(),
          debtId: card.id,
          kind: input.kind,
          amount,
          date: input.date,
          ...(linkedAccountId ? { linkedAccountId } : {}),
          ...(input.kind === 'refund' && input.linkedExpenseId ? { linkedExpenseId: input.linkedExpenseId } : {}),
          reason: input.reason?.trim() || undefined,
          createdAt: now,
          createdByEmail: actor.email,
          createdByRole: actor.role,
        };

        patchState(store, {
          accounts: updatedAccounts,
          debts: store.debts().map((candidate) =>
            candidate.id === card.id
              ? {
                  ...candidate,
                  remainingBalance: nextRemainingBalance,
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : candidate
          ),
          debtAdjustments: [adjustment, ...store.debtAdjustments()],
          pendingSyncIds: [adjustment.id, ...store.pendingSyncIds()],
        });
        await markLocalChangeAndPersist();
      },

      async recordDebtPayment(input: RecordDebtPaymentInput): Promise<void> {
        const amount = roundMoney(Number(input.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Enter a payment amount greater than 0.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
          throw new Error('Enter a valid payment date.');
        }

        const debt = store.debts().find((candidate) => candidate.id === input.debtId && candidate.status === 'active');
        if (!debt) {
          throw new Error('Active debt was not found.');
        }
        if (amount > debt.remainingBalance) {
          throw new Error('Payment amount cannot be higher than the remaining debt balance.');
        }

        const account = store.accounts().find((candidate) => candidate.id === input.accountId && !candidate.archived);
        if (!account) {
          throw new Error('Payment account was not found.');
        }

        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          new Map([[input.accountId, -amount]])
        );
        const now = new Date().toISOString();
        const actor = activityActor();
        const nextRemainingBalance = roundMoney(debt.remainingBalance - amount);
        const limitAmount = ((store.limitMap()[DEBT_PAYMENT_EXPENSE_TYPE]?.userPercentage ?? 0) * store.monthlyIncome()) / 100;
        const expenseId = crypto.randomUUID();
        const entry: ExpenseEntry = {
          id: expenseId,
          date: input.date,
          amount,
          type: DEBT_PAYMENT_EXPENSE_TYPE,
          limit: limitAmount,
          savings: roundMoney(limitAmount - amount),
          timestamp: now,
          comment: input.comment?.trim() || `Debt payment: ${debt.name}`,
          accountId: input.accountId,
          debtId: debt.id,
          source: 'debt-payment',
          createdByEmail: actor.email,
          createdByRole: actor.role,
        };
        const payment: DebtPayment = {
          id: crypto.randomUUID(),
          debtId: debt.id,
          expenseId,
          accountId: input.accountId,
          amount,
          date: input.date,
          createdAt: now,
          createdByEmail: actor.email,
          createdByRole: actor.role,
        };

        patchState(store, {
          entries: [entry, ...store.entries()],
          accounts: updatedAccounts,
          debts: store.debts().map((candidate) =>
            candidate.id === debt.id
              ? {
                  ...candidate,
                  remainingBalance: nextRemainingBalance,
                  // Cards revolve: a cleared bill keeps the card active/selectable.
                  status: nextRemainingBalance === 0 && candidate.type !== 'credit-card' ? 'paid' : 'active',
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : candidate
          ),
          debtPayments: [payment, ...store.debtPayments()],
          // The generated Debt Payment expense shows in the Daily list — tag it
          // pending like any other entry until Drive confirms.
          pendingSyncIds: [entry.id, ...store.pendingSyncIds()],
        });
        await markLocalChangeAndPersist();
      },

      async updateDebtPayment(paymentId: string, input: UpdateDebtPaymentInput): Promise<void> {
        const amount = roundMoney(Number(input.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Enter a payment amount greater than 0.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
          throw new Error('Enter a valid payment date.');
        }

        const payment = store.debtPayments().find((candidate) => candidate.id === paymentId);
        if (!payment) {
          throw new Error('Debt payment was not found.');
        }
        const debt = store.debts().find((candidate) => candidate.id === payment.debtId);
        if (!debt) {
          throw new Error('Debt was not found.');
        }
        const existingEntry = store.entries().find((entry) => entry.id === payment.expenseId);
        if (!existingEntry) {
          throw new Error('Linked debt payment expense was not found.');
        }
        const account = store.accounts().find((candidate) => candidate.id === input.accountId && !candidate.archived);
        if (!account) {
          throw new Error('Payment account was not found.');
        }

        const restoredDebtBalance = roundMoney(debt.remainingBalance + payment.amount);
        if (amount > restoredDebtBalance) {
          throw new Error('Payment amount cannot be higher than the remaining debt balance.');
        }

        const accountDeltas: AccountBalanceDelta = new Map();
        addAccountDelta(accountDeltas, payment.accountId, payment.amount);
        addAccountDelta(accountDeltas, input.accountId, -amount);
        const updatedAccounts = applyAccountDeltas(store.accounts(), accountDeltas);
        const now = new Date().toISOString();
        const actor = activityActor();
        const nextRemainingBalance = roundMoney(restoredDebtBalance - amount);
        const limitAmount = ((store.limitMap()[DEBT_PAYMENT_EXPENSE_TYPE]?.userPercentage ?? 0) * store.monthlyIncome()) / 100;
        const updatedEntry: ExpenseEntry = {
          ...existingEntry,
          date: input.date,
          amount,
          type: DEBT_PAYMENT_EXPENSE_TYPE,
          limit: limitAmount,
          savings: roundMoney(limitAmount - amount),
          timestamp: now,
          comment: input.comment?.trim() || `Debt payment: ${debt.name}`,
          accountId: input.accountId,
          debtId: debt.id,
          source: 'debt-payment',
          updatedByEmail: actor.email,
          updatedByRole: actor.role,
        };

        patchState(store, {
          entries: store.entries().map((entry) => entry.id === existingEntry.id ? updatedEntry : entry),
          accounts: updatedAccounts,
          debts: store.debts().map((candidate) =>
            candidate.id === debt.id
              ? {
                  ...candidate,
                  remainingBalance: nextRemainingBalance,
                  status: nextRemainingBalance === 0 && candidate.type !== 'credit-card' ? 'paid' : 'active',
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : candidate
          ),
          debtPayments: store.debtPayments().map((candidate) =>
            candidate.id === payment.id
              ? {
                  ...candidate,
                  accountId: input.accountId,
                  amount,
                  date: input.date,
                }
              : candidate
          ),
        });
        await markLocalChangeAndPersist();
      },

      async deleteDebtPayment(paymentId: string): Promise<void> {
        const payment = store.debtPayments().find((candidate) => candidate.id === paymentId);
        if (!payment) {
          throw new Error('Debt payment was not found.');
        }
        const existingEntry = store.entries().find((entry) => entry.id === payment.expenseId);
        if (!existingEntry) {
          throw new Error('Linked debt payment expense was not found.');
        }
        const debt = store.debts().find((candidate) => candidate.id === payment.debtId);
        if (!debt) {
          throw new Error('Debt was not found.');
        }

        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          new Map([[payment.accountId, payment.amount]])
        );
        const now = new Date().toISOString();
        const actor = activityActor();
        // Loans cap restored balance at the borrowed amount; card outstanding
        // is revolving and has no such cap.
        const nextRemainingBalance = debt.type === 'credit-card'
          ? roundMoney(debt.remainingBalance + payment.amount)
          : roundMoney(Math.min(debt.principalAmount, debt.remainingBalance + payment.amount));

        // Flag FIRST (persisted): the payment and its linked expense must never
        // be resurrected by a snapshot or re-uploaded by a push.
        flagPendingDelete('debt-payment', payment.id);
        flagPendingDelete('expense', payment.expenseId);
        patchState(store, {
          entries: store.entries().filter((entry) => entry.id !== payment.expenseId),
          accounts: updatedAccounts,
          debts: store.debts().map((candidate) =>
            candidate.id === debt.id
              ? {
                  ...candidate,
                  remainingBalance: nextRemainingBalance,
                  status: nextRemainingBalance === 0 && candidate.type !== 'credit-card' ? 'paid' : 'active',
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : candidate
          ),
          debtPayments: store.debtPayments().filter((candidate) => candidate.id !== payment.id),
        });
        await markLocalChangeAndPersist();
      },

      // ─── Task 6.7: deleteEntry ────────────────────────────────────────────
      /**
       * Removes an expense entry from the in-memory store by its ID,
       * then persists the updated state to Google Drive.
       */
      async deleteEntry(entryId: string): Promise<void> {
        const existingEntry = store.entries().find((e) => e.id === entryId);
        if (existingEntry?.source === 'debt-payment') {
          throw new Error('Debt payment entries must be managed from Finances.');
        }
        // Flag FIRST (persisted): from this instant no snapshot can resurrect
        // the entry and no push can re-upload it, even across app restarts.
        flagPendingDelete('expense', entryId);
        const updatedEntries = store.entries().filter((e) => e.id !== entryId);
        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          accountDeltasForDeletedEntry(existingEntry)
        );
        const updatedDebts = applyDebtDeltas(
          store.debts(),
          debtDeltasForDeletedEntry(existingEntry)
        );
        patchState(store, { entries: updatedEntries, accounts: updatedAccounts, debts: updatedDebts });
        await markLocalChangeAndPersist();
      },

      // ─── Task 6.7: updateEntry ────────────────────────────────────────────
      /**
       * Updates an existing expense entry in the in-memory store,
       * then persists the updated state to Google Drive.
       */
      async updateEntry(updatedEntry: ExpenseEntry): Promise<void> {
        const existingEntry = store.entries().find((e) => e.id === updatedEntry.id);
        if (!existingEntry) {
          throw new Error('Expense entry was not found.');
        }
        if (existingEntry.source === 'debt-payment') {
          throw new Error('Debt payment entries must be managed from Finances.');
        }
        const updatedEntries = store.entries().map((e) =>
          e.id === updatedEntry.id ? updatedEntry : e
        );
        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          accountDeltasForEntryUpdate(existingEntry, updatedEntry)
        );
        const updatedDebts = applyDebtDeltas(
          store.debts(),
          debtDeltasForEntryUpdate(existingEntry, updatedEntry)
        );
        patchState(store, {
          entries: updatedEntries,
          accounts: updatedAccounts,
          debts: updatedDebts,
          // An edited entry is unsynced again until the next Drive write confirms.
          pendingSyncIds: store.pendingSyncIds().includes(updatedEntry.id)
            ? store.pendingSyncIds()
            : [updatedEntry.id, ...store.pendingSyncIds()],
        });
        await markLocalChangeAndPersist();
      },

      // ─── Task 6.2: loadFromDrive ──────────────────────────────────────────
      /**
       * Bootstraps the store from Google Drive. In family mode, reads directly
       * from the shared file ID. In single/null mode, uses the find-or-create
       * flow against appDataFolder.
       */
      async loadFromDrive(): Promise<void> {
        if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — start'); }
        patchState(store, { syncStatus: 'syncing' });

        const mode = backupModeService.getMode();
        if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — mode:', mode); }

        try {
          if (await flushDirtyLocalSnapshot()) {
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — flushed local backup snapshot'); }
            return;
          }

          if (mode === 'family' && backupModeService.getSharedFileId() && !backupModeService.getFamilyId()) {
            // Drive-based family mode: read directly from the shared file ID — no find/create
            // (Firestore family members always use their personal Drive file even if a stale
            // sharedFileId exists in storage from a previous Drive-based family setup.)
            const fileId = backupModeService.getSharedFileId()!;
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — family mode, reading shared file:', fileId); }
            const doc = await googleDriveService.readBackupFile(fileId);
            const modifiedTime = await readModifiedTimeSafely(fileId);
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — read complete. expenses:', doc.expenses.length, '| limits:', doc.limits.length, '| monthlyIncome:', doc.metadata.monthlyIncome); }
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — document structure:', {
              version: doc.version,
              lastUpdated: doc.lastUpdated,
              hasExpenses: doc.expenses.length > 0,
              hasLimits: doc.limits.length > 0,
              currency: doc.metadata.currency
            }); }
            applyBackupDocument(fileId, doc, modifiedTime);
            await flushPendingWidgetExpenses();
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — state updated. Store now has:', {
              entriesCount: store.entries().length,
              limitsCount: store.limits().length,
              monthlyIncome: store.monthlyIncome(),
              driveFileId: store.driveFileId()
            }); }
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — done (family backup loaded)'); }
          } else {
            // Single mode OR Firestore-based family (no sharedFileId): each user keeps their own
            // personal Drive backup via appDataFolder. Firestore activity stream handles cross-device sync.
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — single/firestore-family mode, calling findBackupFile...'); }
            let fileId = await googleDriveService.findBackupFile();
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — findBackupFile result:', fileId); }

            if (fileId === null) {
              // Before treating this as a new user, check the local cache.
              // If it has data, the appDataFolder is likely inaccessible due to an OAuth
              // client ID change — restore the cached data into the new Drive file
              // rather than wiping everything with an empty backup.
              const cachedSnapshot = await readLocalBackupSnapshot();
              const snapshotHasData = !!(
                cachedSnapshot?.doc &&
                (cachedSnapshot.doc.expenses.length > 0 ||
                  (cachedSnapshot.doc.accounts?.length ?? 0) > 0 ||
                  cachedSnapshot.doc.limits.length > 0 ||
                  cachedSnapshot.doc.metadata.monthlyIncome > 0)
              );

              if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — no backup found, creating new file...'); }
              fileId = await googleDriveService.createBackupFile();
              if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — created backup file, id:', fileId); }

              if (snapshotHasData) {
                if (isDevMode()) { console.warn('[ExpenseStore] loadFromDrive — appDataFolder was empty but local cache has data; restoring cache into new Drive file.'); }
                const docToRestore = cachedSnapshot!.doc;
                const modifiedTime = await googleDriveService.writeBackupFile(fileId, docToRestore);
                applyBackupDocument(fileId, docToRestore, modifiedTime);
                await flushPendingWidgetExpenses();
                if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — done (cache restored to new Drive file)'); }
                return;
              }

              patchState(store, {
                entries: [],
                limits: [],
                accounts: [],
                accountAdjustments: [],
                debts: [],
                debtPayments: [],
                debtAdjustments: [],
                monthlyIncome: 0,
                receiptFolderId: null,
                driveFileId: fileId,
                lastKnownDriveModifiedTime: await readModifiedTimeSafely(fileId),
                syncStatus: 'idle',
              });
              await writeLocalBackupSnapshot(fileId, buildBackupDocument(), store.lastKnownDriveModifiedTime(), false);
              await flushPendingWidgetExpenses();
              if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — done (new empty backup)'); }
              return;
            }

            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — reading backup file...'); }
            const doc = await googleDriveService.readBackupFile(fileId);
            const modifiedTime = await readModifiedTimeSafely(fileId);
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — read complete. expenses:', doc.expenses.length, '| limits:', doc.limits.length); }
            applyBackupDocument(fileId, doc, modifiedTime);
            await flushPendingWidgetExpenses();
            if (isDevMode()) { console.log('[ExpenseStore] loadFromDrive — done (existing backup loaded)'); }
          }
        } catch (err) {
          console.error('[ExpenseStore] loadFromDrive — ERROR:', err);
          patchState(store, { syncStatus: 'error' });
          driveError$.next(err as DriveApiError | DriveParseError);
        }
      },

      // ─── Task 5.1: patchDriveFileId ──────────────────────────────────────
      /**
       * Updates the driveFileId in store state after a file rotation.
       * Called by SettingsComponent after creating a new shared file.
       */
      patchDriveFileId(newFileId: string): void {
        patchState(store, { driveFileId: newFileId, lastKnownDriveModifiedTime: null });
      },

      async patchReceiptFolderId(receiptFolderId: string): Promise<void> {
        patchState(store, { receiptFolderId });
        await markLocalChangeAndPersist();
      },

      // ─── Task 6.5: persistToDrive ─────────────────────────────────────────
      /**
       * Serializes the current store state and writes it to the Drive backup
       * file. No-op if driveFileId has not yet been set (i.e., loadFromDrive
       * has not completed).
       */
      async persistToDrive(): Promise<void> {
        const revisionRequested = localRevision;

        persistQueue = persistQueue.then(async () => {
          if (persistedRevision >= revisionRequested) return;

          const fileId = store.driveFileId();
          if (!fileId) {
            if (isDevMode()) { console.warn('[ExpenseStore] persistToDrive called before driveFileId is set — skipping'); }
            return;
          }

          try {
            const revisionBeingPersisted = localRevision;
            const doc = buildBackupDocument();
            // Snapshot the pending set at the same moment as the doc: anything
            // tagged AFTER this line (entry added during the awaits below) is NOT
            // in the uploaded doc and must keep its "Syncing" chip for the
            // follow-up persist. Clearing pendingSyncIds wholesale here silently
            // untagged not-yet-uploaded entries.
            const idsBeingPersisted = new Set(store.pendingSyncIds());
            // Durable-first: write the local snapshot (dirty) BEFORE the network
            // call. If everything below fails, the user's data still survives here.
            await writeLocalBackupSnapshot(fileId, doc, store.lastKnownDriveModifiedTime(), true);
            const modifiedTime = await googleDriveService.writeBackupFile(fileId, doc);
            persistedRevision = Math.max(persistedRevision, revisionBeingPersisted);
            // Drive write confirmed — everything included in THIS doc is in Drive.
            patchState(store, {
              lastKnownDriveModifiedTime: modifiedTime ?? await readModifiedTimeSafely(fileId),
              syncStatus: 'idle',
              isOffline: false,
              pendingSyncIds: store.pendingSyncIds().filter((id) => !idsBeingPersisted.has(id)),
            });
            // Snapshot is now in sync with Drive — clear the dirty flag.
            await writeLocalBackupSnapshot(fileId, doc, store.lastKnownDriveModifiedTime(), false);
            onSyncSucceeded();
          } catch (err) {
            const status = (err as DriveApiError)?.status;
            const isAuthError = status === 401;
            const transient = status === 0 || status === 408 || status === 429 ||
              (typeof status === 'number' && status >= 500);
            if (isAuthError) {
              // Token expired mid-write: the dirty snapshot is safe on disk.
              // Clear the stale token and attempt a silent refresh. If the refresh
              // succeeds, schedule a background retry — the user never sees a prompt.
              // If it fails (native with no cached credential, or web with no session),
              // surface the error so the user knows to re-authenticate.
              authService.clearToken();
              const freshToken = await authService.getTokenSilent();
              if (freshToken) {
                patchState(store, { syncStatus: 'syncing' });
                scheduleBackgroundFlush();
              } else {
                patchState(store, { syncStatus: 'error' });
                driveError$.next(err as DriveApiError | DriveParseError);
              }
            } else if (transient) {
              // Offline / Drive hiccup: the dirty snapshot is safe on disk. Keep
              // showing "syncing", do NOT raise a destructive error, and retry in
              // the background until the system is ready.
              patchState(store, { syncStatus: 'syncing', isOffline: status === 0 });
              scheduleBackgroundFlush();
            } else {
              // Permission / not-found: a retry won't help — surface it so
              // the user can re-authenticate or fix sharing. Data stays dirty locally.
              patchState(store, { syncStatus: 'error' });
              driveError$.next(err as DriveApiError | DriveParseError);
            }
          }
        });

        await persistQueue;
      },

      async refreshFromDriveIfChanged(): Promise<boolean> {
        const fileId = store.driveFileId();
        if (!fileId || store.syncStatus() === 'syncing' || localRevision !== persistedRevision) {
          return false;
        }

        try {
          const remoteModifiedTime = await googleDriveService.getFileModifiedTime(fileId);
          if (store.lastKnownDriveModifiedTime() === remoteModifiedTime) {
            return false;
          }

          if (isDevMode()) { console.log('[ExpenseStore] Remote backup changed, loading latest Drive data.'); }
          const doc = await googleDriveService.readBackupFile(fileId);
          applyBackupDocument(fileId, doc, remoteModifiedTime);
          await flushPendingWidgetExpenses();
          return true;
        } catch (err) {
          if (isDevMode()) { console.warn('[ExpenseStore] refreshFromDriveIfChanged failed:', err); }
          const driveErr = err as DriveApiError;
          if (driveErr.status === 403 || driveErr.status === 404) {
            driveError$.next(err as DriveApiError | DriveParseError);
          }
          return false;
        }
      },

      pushFamilyStateNow(): void {
        pushFamilyLedger();
      },

      /**
       * Immediately attempts to flush any unsynced local changes to Drive.
       * Call this when the system becomes ready again (network back online, app
       * regains focus). Resets the background backoff so the retry is prompt.
       * No-op when everything is already in sync.
       */
      flushPendingChanges(): void {
        // Retry a family-state push that was dropped (no Firebase UID) or failed
        // (offline / auth); push is full-state so one retry carries everything.
        if (familyPushPending) pushFamilyLedger();
        if (localRevision === persistedRevision && store.syncStatus() === 'idle') return;
        backgroundFlushAttempts = 0;
        if (backgroundFlushTimer !== null) {
          clearTimeout(backgroundFlushTimer);
          backgroundFlushTimer = null;
        }
        void methods.persistToDrive();
      },

      /** True when there are local changes not yet confirmed saved to Drive. */
      hasUnsyncedChanges(): boolean {
        return localRevision !== persistedRevision;
      },

    };

    // Restore persisted delete flags early so they guard the very first
    // snapshot after a cold start (the resurrection window).
    void loadPendingDeletes();

    // Apply incoming (server-acked) ledger record changes from the partner.
    // Delete flags and the local-divergence guard live in the pure util: a
    // flagged record is never resurrected, a local un-pushed edit is never
    // overwritten — the next diff push resolves conflicts as last-writer-wins.
    familySyncService.changes$.subscribe(({ changes }) => {
      if (changes.length > 0) {
        applyingRemote = true;
        try {
          const result = applyLedgerChanges(ledgerStateView(), changes, pendingDeletes);
          // Server acked these tombstones — the delete flags have done their job.
          clearAckedDeleteFlags(result.tombstonedDocIds);
          if (result.changed) {
            if (result.currency) setCurrencyFromBackup(result.currency);
            patchState(store, {
              entries: result.entries,
              accounts: result.accounts,
              accountAdjustments: result.accountAdjustments,
              debts: result.debts,
              debtPayments: result.debtPayments,
              debtAdjustments: result.debtAdjustments,
              limits: result.limits,
              monthlyIncome: result.monthlyIncome,
            });
            localRevision += 1;
            if (syncDriveDebounceTimer !== null) clearTimeout(syncDriveDebounceTimer);
            syncDriveDebounceTimer = setTimeout(() => {
              syncDriveDebounceTimer = null;
              void methods.persistToDrive();
            }, 2000);
          }
        } finally {
          applyingRemote = false;
        }
      }

      // Structural reconciliation: after every snapshot settles, push whatever
      // the ledger is still missing from this device (debounced; no-op when in
      // sync). This makes sync correctness independent of any specific code
      // path having remembered to push at the right moment.
      if (ledgerReconcileTimer !== null) clearTimeout(ledgerReconcileTimer);
      ledgerReconcileTimer = setTimeout(() => {
        ledgerReconcileTimer = null;
        pushFamilyLedger();
      }, 3000);
    });

    // When the family is dissolved externally, clean up local state.
    familySyncService.dissolution$.subscribe(() => {
      familySyncService.stopListening();
      void (async () => {
        await backupModeService.clearFamilyState();
        await backupModeService.setMode('single');
      })();
    });

    // Card utilization alerts (30% / 80% of creditLimit): compare each card's
    // outstanding against the previous emission and fire on upward threshold
    // crossings. Watching debts() covers EVERY mutation path — manual entries,
    // widget flushes, adjustments, and partner records applied from the family
    // ledger. The first run only snapshots (no compare), so cold-start data
    // loads never alert; a card seen for the first time is likewise only
    // snapshotted.
    let utilizationSnapshot: Map<string, number> | null = null;
    effect(() => {
      const debts = store.debts();
      const previous = utilizationSnapshot;
      const next = new Map<string, number>();
      for (const debt of debts) {
        if (debt.type !== 'credit-card') continue;
        next.set(debt.id, debt.remainingBalance);
        if (previous === null || !previous.has(debt.id)) continue;
        const threshold = crossedUtilizationThreshold(debt, previous.get(debt.id)!, debt.remainingBalance);
        if (threshold !== null) {
          cardUtilizationCrossed$.next({
            cardId: debt.id,
            cardName: debt.name,
            percent: utilizationPercent(debt, debt.remainingBalance) ?? threshold,
            threshold,
            timestamp: Date.now(),
          });
        }
      }
      utilizationSnapshot = next;
    });

    // Keep the native credit-card bill ladder and the salary fallback reminder
    // in sync with app state. Runs on every relevant state change (app data
    // load, widget CC spends, payments, card edits, account credits) —
    // debounced because loads and widget flushes patch state several times in
    // quick succession. Native-only inside the schedule methods; no-op on web.
    if (Capacitor.isNativePlatform()) {
      let notificationRefreshTimer: ReturnType<typeof setTimeout> | null = null;
      effect(() => {
        const debts = store.debts();
        const entries = store.entries();
        const payments = store.debtPayments();
        const adjustments = store.accountAdjustments();
        const debtAdjustments = store.debtAdjustments();
        if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer);
        notificationRefreshTimer = setTimeout(() => {
          notificationRefreshTimer = null;
          void localNotificationService.scheduleCreditCardDueReminders(debts, entries, payments, debtAdjustments);
          void localNotificationService.scheduleSalaryReminder(adjustments);
        }, 1500);
      });
    }

    // Statement snapshots (web + native): when a card's bill-generation day
    // passes, freeze the derived statement amount so reminders/Finances show
    // the payable bill, not the live outstanding. Debounced — data loads
    // patch debts/entries several times in quick succession; idempotent once
    // every card carries a snapshot for its latest bill.
    {
      let statementSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
      effect(() => {
        store.debts();
        store.entries();
        store.debtPayments();
        store.debtAdjustments();
        if (statementSnapshotTimer) clearTimeout(statementSnapshotTimer);
        statementSnapshotTimer = setTimeout(() => {
          statementSnapshotTimer = null;
          void methods.ensureCardStatements();
        }, 2000);
      });
    }

    return methods;
  })
);
