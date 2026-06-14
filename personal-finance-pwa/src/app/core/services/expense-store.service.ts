import { computed, inject, isDevMode } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Subject } from 'rxjs';
import { budgetThresholdExceeded$ } from './budget-events';
import { FamilySyncService } from './family-sync.service';
import {
  AccountBalanceAdjustment,
  AdjustAccountBalanceInput,
  AssetAccount,
  BudgetRuleSummary,
  CreateAssetAccountInput,
  CreateDebtAccountInput,
  DebtAccount,
  DebtPayment,
  DEBT_PAYMENT_EXPENSE_TYPE,
  ExpenseEntry,
  ExpenseLimit,
  RecordDebtPaymentInput,
  UpdateAssetAccountInput,
  UpdateDebtAccountInput,
  UpdateDebtPaymentInput,
} from '../models';
import { StorageService } from './storage.service';
import { BackupDocument, DriveApiError, DriveParseError, GoogleDriveService } from './google-drive.service';
import { BackupMode, BackupModeService } from './backup-mode.service';
import { AppCurrency, CurrencyService } from './currency.service';
import { AuthService } from './auth.service';
import { toLocalDateString } from '../utils/local-date';

const LOCAL_BACKUP_CACHE_KEY = 'spenza_drive_backup_snapshot_v1';
const WIDGET_EXPENSE_QUEUE_KEY = 'spenza_widget_expense_queue_v1';

interface ExpenseWidgetPlugin {
  refresh(): Promise<void>;
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
}

interface WidgetAdjustmentQueueItem extends WidgetExpenseQueueItemBase {
  kind: 'adjustment';
  adjustment: AccountBalanceAdjustment;
}

type WidgetExpenseQueueItem = WidgetExpenseEntryQueueItem | WidgetAdjustmentQueueItem;

type AccountBalanceDelta = Map<string, number>;

// ─── Drive Error Subject ──────────────────────────────────────────────────────

export const driveError$ = new Subject<DriveApiError | DriveParseError>();

// ─── State Interface ──────────────────────────────────────────────────────────

interface ExpenseState {
  entries: ExpenseEntry[];
  limits: ExpenseLimit[];
  accounts: AssetAccount[];
  accountAdjustments: AccountBalanceAdjustment[];
  debts: DebtAccount[];
  debtPayments: DebtPayment[];
  monthlyIncome: number;
  selectedMonth: string; // YYYY-MM
  syncStatus: 'idle' | 'syncing' | 'error';
  isOffline: boolean;
  driveFileId: string | null;
  receiptFolderId: string | null;
  lastKnownDriveModifiedTime: string | null;
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
    monthlyIncome: 0,
    selectedMonth: toLocalDateString().slice(0, 7), // YYYY-MM
    syncStatus: 'idle',
    isOffline: false,
    driveFileId: null,
    receiptFolderId: null,
    lastKnownDriveModifiedTime: null,
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
    const BG_FLUSH_BASE_MS = 5000;
    const BG_FLUSH_MAX_MS = 5 * 60 * 1000;
    let applyingRemote = false;
    let lastAppliedRemoteAt = '';
    // Tracks entry IDs deleted in this session so tombstones propagate to the partner via Firestore.
    // Cleared on app restart — harmless because Drive is updated after each deletion.
    const localDeletedEntryIds = new Set<string>();

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

      const wrappedEntry = record['entry'];
      if (isExpenseEntry(wrappedEntry)) {
        return {
          kind: 'expense',
          userEmail: typeof record['userEmail'] === 'string' ? record['userEmail'] : null,
          entry: wrappedEntry,
          raw,
        };
      }

      if (isExpenseEntry(raw)) {
        return { kind: 'expense', userEmail: null, entry: raw, raw };
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

    const flushPendingWidgetExpenses = async (): Promise<boolean> => {
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
      const newAdjustments: AccountBalanceAdjustment[] = [];

      for (const item of activeItems) {
        if (item.kind === 'expense') {
          const entry = item.entry;
          if (existingIds.has(entry.id)) continue;

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
      if (newEntries.length === 0 && newAdjustments.length === 0) return false;

      patchState(store, {
        entries: [...newEntries, ...store.entries()],
        accounts: nextAccounts,
        accountAdjustments: [...newAdjustments, ...store.accountAdjustments()],
      });
      localRevision += 1;
      await methods.persistToDrive();
      pushFamilyState();

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
      const shouldRestoreAccounts = doc.accounts === undefined && currentAccounts.length > 0;
      const shouldRestoreAccountAdjustments = doc.accountAdjustments === undefined && currentAccountAdjustments.length > 0;
      const shouldRestoreDebts = doc.debts === undefined && currentDebts.length > 0;
      const shouldRestoreDebtPayments = doc.debtPayments === undefined && currentDebtPayments.length > 0;
      const healed = shouldRestoreAccounts || shouldRestoreAccountAdjustments || shouldRestoreDebts || shouldRestoreDebtPayments;

      if (!healed) return { doc, healed };

      if (isDevMode()) { console.warn('[ExpenseStore] Remote backup is missing finance arrays; preserving cached finance state and upgrading backup schema.'); }
      return {
        doc: {
          ...doc,
          accounts: shouldRestoreAccounts ? currentAccounts : backupAccounts(doc),
          accountAdjustments: shouldRestoreAccountAdjustments ? currentAccountAdjustments : backupAccountAdjustments(doc),
          debts: shouldRestoreDebts ? currentDebts : backupDebts(doc),
          debtPayments: shouldRestoreDebtPayments ? currentDebtPayments : backupDebtPayments(doc),
        },
        healed,
      };
    };

    const applyBackupDocument = (
      fileId: string,
      doc: Awaited<ReturnType<GoogleDriveService['readBackupFile']>>,
      modifiedTime: string | null
    ): void => {
      const { doc: normalizedDoc, healed } = preserveCachedFinanceArrays(doc);
      setCurrencyFromBackup(normalizedDoc.metadata.currency);
      patchState(store, {
        entries: normalizedDoc.expenses,
        limits: normalizedDoc.limits,
        accounts: backupAccounts(normalizedDoc),
        accountAdjustments: backupAccountAdjustments(normalizedDoc),
        debts: backupDebts(normalizedDoc),
        debtPayments: backupDebtPayments(normalizedDoc),
        monthlyIncome: normalizedDoc.metadata.monthlyIncome,
        receiptFolderId: normalizedDoc.metadata.receiptFolderId ?? null,
        driveFileId: fileId,
        lastKnownDriveModifiedTime: modifiedTime,
        syncStatus: 'idle',
      });
      localRevision = 0;
      persistedRevision = 0;
      void writeLocalBackupSnapshot(fileId, normalizedDoc, modifiedTime, false);
      if (healed) {
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

    const pushFamilyState = (): void => {
      if (applyingRemote) return;
      if (backupModeService.getMode() !== 'family') return;
      const familyId = backupModeService.getFamilyId();
      const currentRole = backupModeService.getOwnerRole();
      if (!familyId || !currentRole) return;
      const currentUid = authService.firebaseUid();
      if (!currentUid) return;
      const writer = { uid: currentUid, email: authService.userEmail() ?? '', role: currentRole };
      const doc = buildBackupDocument();
      // Strip receipt metadata before pushing to Firestore: receipt files live in the
      // author's private Drive appDataFolder, so the partner cannot access them —
      // syncing the metadata would only produce dead links on the partner's device.
      const sanitizedDoc = {
        ...doc,
        expenses: doc.expenses.map((entry) => {
          if (!entry.receipt) return entry;
          const { receipt: _receipt, ...rest } = entry;
          return rest;
        }),
      };
      const deletedIds = Array.from(localDeletedEntryIds);
      void (async () => {
        try {
          await familySyncService.pushState(familyId, sanitizedDoc, writer, deletedIds);
        } catch (err) {
          console.error('[ExpenseStore] pushFamilyState failed:', err);
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
      pushFamilyState();
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
        patchState(store, { entries: updatedEntries, accounts: updatedAccounts });
        
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
        patchState(store, { entries: updatedEntries, accounts: updatedAccounts });

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
        patchState(store, {
          entries: snapshot.doc.expenses,
          limits: snapshot.doc.limits,
          accounts: backupAccounts(snapshot.doc),
          accountAdjustments: backupAccountAdjustments(snapshot.doc),
          debts: backupDebts(snapshot.doc),
          debtPayments: backupDebtPayments(snapshot.doc),
          monthlyIncome: snapshot.doc.metadata.monthlyIncome,
          receiptFolderId: snapshot.doc.metadata.receiptFolderId ?? null,
          driveFileId: snapshot.fileId,
          lastKnownDriveModifiedTime: snapshot.modifiedTime,
          syncStatus: snapshot.dirty ? 'syncing' : 'idle',
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

        patchState(store, { entries, limits, monthlyIncome, accounts: [], accountAdjustments: [], debts: [], debtPayments: [] });
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

        patchState(store, {
          accounts: remaining,
          accountAdjustments: store.accountAdjustments().filter((adjustment) => adjustment.accountId !== accountId),
        });
        await markLocalChangeAndPersist();
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
        if (remainingBalance > principalAmount) {
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
          status: remainingBalance === 0 ? 'paid' : 'active',
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

        if (!name) {
          throw new Error('Debt name is required.');
        }
        if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
          throw new Error('Enter a borrowed amount greater than 0.');
        }
        if (!Number.isFinite(remainingBalance) || remainingBalance < 0) {
          throw new Error('Enter a valid remaining balance.');
        }
        if (remainingBalance > principalAmount) {
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
                  status: input.status ?? (remainingBalance === 0 ? 'paid' : debt.status === 'paid' ? 'paid' : 'active'),
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : debt
          ),
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

        patchState(store, {
          debts: store.debts().filter((debt) => debt.id !== debtId),
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
                  status: nextRemainingBalance === 0 ? 'paid' : 'active',
                  updatedAt: now,
                  updatedByEmail: actor.email,
                  updatedByRole: actor.role,
                }
              : candidate
          ),
          debtPayments: [payment, ...store.debtPayments()],
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
                  status: nextRemainingBalance === 0 ? 'paid' : 'active',
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
        const nextRemainingBalance = roundMoney(Math.min(debt.principalAmount, debt.remainingBalance + payment.amount));

        patchState(store, {
          entries: store.entries().filter((entry) => entry.id !== payment.expenseId),
          accounts: updatedAccounts,
          debts: store.debts().map((candidate) =>
            candidate.id === debt.id
              ? {
                  ...candidate,
                  remainingBalance: nextRemainingBalance,
                  status: nextRemainingBalance === 0 ? 'paid' : 'active',
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
        if (existingEntry?.source === 'debt-payment' || existingEntry?.debtId) {
          throw new Error('Debt payment entries must be managed from Finances.');
        }
        localDeletedEntryIds.add(entryId);
        const updatedEntries = store.entries().filter((e) => e.id !== entryId);
        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          accountDeltasForDeletedEntry(existingEntry)
        );
        patchState(store, { entries: updatedEntries, accounts: updatedAccounts });
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
        if (existingEntry.source === 'debt-payment' || existingEntry.debtId) {
          throw new Error('Debt payment entries must be managed from Finances.');
        }
        const updatedEntries = store.entries().map((e) =>
          e.id === updatedEntry.id ? updatedEntry : e
        );
        const updatedAccounts = applyAccountDeltas(
          store.accounts(),
          accountDeltasForEntryUpdate(existingEntry, updatedEntry)
        );
        patchState(store, { entries: updatedEntries, accounts: updatedAccounts });
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
            // Durable-first: write the local snapshot (dirty) BEFORE the network
            // call. If everything below fails, the user's data still survives here.
            await writeLocalBackupSnapshot(fileId, doc, store.lastKnownDriveModifiedTime(), true);
            const modifiedTime = await googleDriveService.writeBackupFile(fileId, doc);
            persistedRevision = Math.max(persistedRevision, revisionBeingPersisted);
            patchState(store, {
              lastKnownDriveModifiedTime: modifiedTime ?? await readModifiedTimeSafely(fileId),
              syncStatus: 'idle',
              isOffline: false,
            });
            // Snapshot is now in sync with Drive — clear the dirty flag.
            await writeLocalBackupSnapshot(fileId, doc, store.lastKnownDriveModifiedTime(), false);
            onSyncSucceeded();
          } catch (err) {
            const status = (err as DriveApiError)?.status;
            const transient = status === 0 || status === 408 || status === 429 ||
              (typeof status === 'number' && status >= 500);
            if (transient) {
              // Offline / Drive hiccup: the dirty snapshot is safe on disk. Keep
              // showing "syncing", do NOT raise a destructive error, and retry in
              // the background until the system is ready.
              patchState(store, { syncStatus: 'syncing', isOffline: status === 0 });
              scheduleBackgroundFlush();
            } else {
              // Auth / permission / not-found: a retry won't help — surface it so
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
        pushFamilyState();
      },

      /**
       * Immediately attempts to flush any unsynced local changes to Drive.
       * Call this when the system becomes ready again (network back online, app
       * regains focus). Resets the background backoff so the retry is prompt.
       * No-op when everything is already in sync.
       */
      flushPendingChanges(): void {
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

    // Merge incoming full-snapshot state from the partner into local state.
    familySyncService.state$.subscribe(({ doc: remoteDoc, deletedEntryIds: remoteDeletedEntryIds }) => {
      applyingRemote = true;
      try {
        const remoteUpdatedAt = remoteDoc.lastUpdated ?? '';

        // entries: union merge so concurrent additions from both sides are preserved.
        // Remote wins on timestamp tie or remote-is-newer for the same entry.
        // Explicit tombstones (deletedEntryIds from remote + local session) handle deletions.
        const mergedEntriesById = new Map<string, ExpenseEntry>();
        for (const localEntry of store.entries()) {
          mergedEntriesById.set(localEntry.id, localEntry);
        }
        for (const remoteEntry of (remoteDoc.expenses ?? [])) {
          const local = mergedEntriesById.get(remoteEntry.id);
          if (!local || (remoteEntry.timestamp ?? '') >= (local.timestamp ?? '')) {
            // Receipts are device-private (appDataFolder) and stripped from pushed
            // state, so an incoming partner edit must not wipe the local attachment.
            const merged = (local?.receipt && !remoteEntry.receipt)
              ? { ...remoteEntry, receipt: local.receipt }
              : remoteEntry;
            mergedEntriesById.set(remoteEntry.id, merged);
          }
        }
        // Apply tombstones: remote deletions are accumulated into our own set so future pushes carry them.
        for (const deletedId of remoteDeletedEntryIds) {
          mergedEntriesById.delete(deletedId);
          localDeletedEntryIds.add(deletedId);
        }
        for (const deletedId of localDeletedEntryIds) {
          mergedEntriesById.delete(deletedId);
        }
        const mergedEntries = Array.from(mergedEntriesById.values())
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // accounts: union merge, remote wins on timestamp tie.
        const mergedAccountsById = new Map(store.accounts().map(a => [a.id, a]));
        for (const remoteAccount of (remoteDoc.accounts ?? [])) {
          const local = mergedAccountsById.get(remoteAccount.id);
          if (!local || (remoteAccount.updatedAt ?? '') >= (local.updatedAt ?? '')) {
            mergedAccountsById.set(remoteAccount.id, remoteAccount);
          }
        }

        // accountAdjustments: add-only, keep all from both sides.
        const localAdjById = new Map(store.accountAdjustments().map(a => [a.id, a]));
        for (const remoteAdj of (remoteDoc.accountAdjustments ?? [])) {
          if (!localAdjById.has(remoteAdj.id)) localAdjById.set(remoteAdj.id, remoteAdj);
        }

        // debts: union merge, remote wins on timestamp tie.
        const mergedDebtsById = new Map(store.debts().map(d => [d.id, d]));
        for (const remoteDebt of (remoteDoc.debts ?? [])) {
          const local = mergedDebtsById.get(remoteDebt.id);
          if (!local || (remoteDebt.updatedAt ?? '') >= (local.updatedAt ?? '')) {
            mergedDebtsById.set(remoteDebt.id, remoteDebt);
          }
        }

        // debtPayments: add-only, keep all from both sides.
        const localPaymentsById = new Map(store.debtPayments().map(p => [p.id, p]));
        for (const remotePayment of (remoteDoc.debtPayments ?? [])) {
          if (!localPaymentsById.has(remotePayment.id)) localPaymentsById.set(remotePayment.id, remotePayment);
        }

        // limits / income / currency: take remote when remoteDoc is newer than last applied remote.
        let mergedLimits = store.limits();
        let mergedIncome = store.monthlyIncome();
        if (remoteUpdatedAt > lastAppliedRemoteAt || lastAppliedRemoteAt === '') {
          if ((remoteDoc.limits?.length ?? 0) > 0) mergedLimits = remoteDoc.limits;
          mergedIncome = remoteDoc.metadata.monthlyIncome;
          setCurrencyFromBackup(remoteDoc.metadata.currency);
          lastAppliedRemoteAt = remoteUpdatedAt;
        }

        patchState(store, {
          entries: mergedEntries,
          accounts: Array.from(mergedAccountsById.values()),
          accountAdjustments: Array.from(localAdjById.values()),
          debts: Array.from(mergedDebtsById.values()),
          debtPayments: Array.from(localPaymentsById.values()),
          limits: mergedLimits,
          monthlyIncome: mergedIncome,
        });

        localRevision += 1;
        if (syncDriveDebounceTimer !== null) clearTimeout(syncDriveDebounceTimer);
        syncDriveDebounceTimer = setTimeout(() => {
          syncDriveDebounceTimer = null;
          void methods.persistToDrive();
        }, 2000);
      } finally {
        applyingRemote = false;
      }
    });

    // When the family is dissolved externally, clean up local state.
    familySyncService.dissolution$.subscribe(() => {
      familySyncService.stopListening();
      void (async () => {
        await backupModeService.clearFamilyState();
        await backupModeService.setMode('single');
      })();
    });

    return methods;
  })
);
