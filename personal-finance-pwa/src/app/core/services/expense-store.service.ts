import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Subject } from 'rxjs';
import {
  BudgetRuleSummary,
  ExpenseEntry,
  ExpenseLimit,
  METADATA_MONTHLY_INCOME,
} from '../models';
import { BudgetThresholdEvent } from '../models/local-notification.model';
import { GoogleSheetsService } from './google-sheets.service';
import { StorageService } from './storage.service';
import { DriveApiError, DriveParseError, GoogleDriveService } from './google-drive.service';
import { BackupModeService } from './backup-mode.service';
import { AppCurrency, CurrencyService } from './currency.service';
import { toLocalDateString } from '../utils/local-date';

// ─── Drive Error Subject ──────────────────────────────────────────────────────

export const driveError$ = new Subject<DriveApiError | DriveParseError>();

// ─── Budget Threshold Event Subject ──────────────────────────────────────────

export const budgetThresholdExceeded$ = new Subject<BudgetThresholdEvent>();

// ─── State Interface ──────────────────────────────────────────────────────────

interface ExpenseState {
  entries: ExpenseEntry[];
  limits: ExpenseLimit[];
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
  })),

  // ─── Task 5.4 – 5.7 / 6.2 / 6.5 / 6.7: Methods ──────────────────────────
  withMethods((store,
    sheetsService = inject(GoogleSheetsService),
    storageService = inject(StorageService),
    googleDriveService = inject(GoogleDriveService),
    backupModeService = inject(BackupModeService),
    currencyService = inject(CurrencyService),
  ) => {
    let localRevision = 0;
    let persistedRevision = 0;
    let persistQueue = Promise.resolve();

    const isAppCurrency = (currency: string | undefined): currency is AppCurrency =>
      currency === 'INR' || currency === 'USD' || currency === 'AED';

    const setCurrencyFromBackup = (currency: string | undefined): void => {
      if (isAppCurrency(currency) && currencyService.currency() !== currency) {
        void currencyService.setCurrency(currency);
      }
    };

    const readModifiedTimeSafely = async (fileId: string): Promise<string | null> => {
      try {
        return await googleDriveService.getFileModifiedTime(fileId);
      } catch (err) {
        console.warn('[ExpenseStore] Could not read Drive modifiedTime:', err);
        return null;
      }
    };

    const applyBackupDocument = (
      fileId: string,
      doc: Awaited<ReturnType<GoogleDriveService['readBackupFile']>>,
      modifiedTime: string | null
    ): void => {
      setCurrencyFromBackup(doc.metadata.currency);
      patchState(store, {
        entries: doc.expenses,
        limits: doc.limits,
        monthlyIncome: doc.metadata.monthlyIncome,
        receiptFolderId: doc.metadata.receiptFolderId ?? null,
        driveFileId: fileId,
        lastKnownDriveModifiedTime: modifiedTime,
        syncStatus: 'idle',
      });
      localRevision = 0;
      persistedRevision = 0;
    };

    const markLocalChangeAndPersist = (): void => {
      localRevision += 1;
      void methods.persistToDrive();
    };

    const activeDriveFileId = (): string | null => {
      if (backupModeService.getMode() === 'family') {
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
      addEntry(entry: ExpenseEntry): void {
        patchState(store, { entries: [entry, ...store.entries()] });
        
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
        
        markLocalChangeAndPersist();
      },

      addEntries(entries: ExpenseEntry[]): void {
        if (entries.length === 0) return;
        patchState(store, { entries: [...entries, ...store.entries()] });

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

        markLocalChangeAndPersist();
      },

      // ─── Task 5.5: loadMonth ──────────────────────────────────────────────
      /**
       * Fetches expenses for the given month from Google Sheets, merges them
       * into the local entries (deduplicating by id), and optionally updates selectedMonth.
       */
      async loadMonth(month: string, updateSelectedMonth: boolean = true): Promise<void> {
        console.log('[ExpenseStore] loadMonth called for:', month, '| updateSelectedMonth:', updateSelectedMonth);
        const sheetId = await storageService.get('pf_sheet_id') ?? '';
        if (!sheetId) {
          console.warn('[ExpenseStore] loadMonth - no sheet ID configured');
          return;   // no sheet configured yet
        }

        // Only update selectedMonth if explicitly requested (not for background trend loading)
        if (updateSelectedMonth) {
          patchState(store, { syncStatus: 'syncing', selectedMonth: month });
          console.log('[ExpenseStore] loadMonth - selectedMonth updated to:', month);
        } else {
          patchState(store, { syncStatus: 'syncing' });
          console.log('[ExpenseStore] loadMonth - loading data without updating selectedMonth');
        }
        console.log('[ExpenseStore] loadMonth - current entries count:', store.entries().length);

        try {
          const fetched = await sheetsService.readExpenses(sheetId, month);
          console.log('[ExpenseStore] loadMonth - fetched', fetched.length, 'entries');

          // Merge: build a map of existing entries by id, then overlay fetched ones
          const existingById = new Map<string, ExpenseEntry>(
            store.entries().map((e) => [e.id, e])
          );
          console.log('[ExpenseStore] loadMonth - existing entries in map:', existingById.size);

          for (const entry of fetched) {
            existingById.set(entry.id, entry);
          }
          console.log('[ExpenseStore] loadMonth - after merge, map size:', existingById.size);

          const mergedEntries = Array.from(existingById.values());
          console.log('[ExpenseStore] loadMonth - merged total:', mergedEntries.length, 'entries');
          console.log('[ExpenseStore] loadMonth - entries for month', month, ':',
            mergedEntries.filter(e => e.date.startsWith(month)).length);

          patchState(store, {
            entries: mergedEntries,
            syncStatus: 'idle',
          });

          console.log('[ExpenseStore] loadMonth - state updated, entries count:', store.entries().length);
        } catch (err) {
          console.error('[ExpenseStore] loadMonth - error:', err);
          patchState(store, { syncStatus: 'error' });
        }
      },

      // ─── Task 5.6: loadLimits ─────────────────────────────────────────────
      /**
       * Fetches expense limits and metadata (monthly income) from Google Sheets
       * and updates the store state.
       */
      async loadLimits(): Promise<void> {
        console.log('[ExpenseStore] loadLimits called');
        const sheetId = await storageService.get('pf_sheet_id') ?? '';
        if (!sheetId) {
          console.warn('[ExpenseStore] loadLimits - no sheet ID configured');
          return;   // no sheet configured yet
        }
        console.log('[ExpenseStore] loadLimits - fetching from sheet:', sheetId);
        try {
          const [limits, metadata] = await Promise.all([
            sheetsService.readLimits(sheetId),
            sheetsService.readMetadata(sheetId),
          ]);

          const monthlyIncome = parseFloat(metadata[METADATA_MONTHLY_INCOME] ?? '0') || 0;
          console.log('[ExpenseStore] loadLimits - fetched limits:', limits.length, '| income:', monthlyIncome);

          patchState(store, { limits, monthlyIncome });
        } catch (err) {
          console.error('[ExpenseStore] loadLimits - error:', err);
          // Error is already emitted on GoogleSheetsService.apiError$
        }
      },

      // ─── Task 5.7: clearLocalData ─────────────────────────────────────────
      /**
       * Resets all local state to its initial empty values.
       */
      clearLocalData(): void {
        patchState(store, {
          entries: [],
          limits: [],
          monthlyIncome: 0,
          syncStatus: 'idle',
          receiptFolderId: null,
          lastKnownDriveModifiedTime: null,
        });
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

        patchState(store, { entries, limits, monthlyIncome });
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
      setLimitsAndIncome(limits: ExpenseLimit[], monthlyIncome: number): void {
        patchState(store, { limits, monthlyIncome });
        markLocalChangeAndPersist();
      },

      // ─── Task 6.7: deleteEntry ────────────────────────────────────────────
      /**
       * Removes an expense entry from the in-memory store by its ID,
       * then persists the updated state to Google Drive.
       */
      deleteEntry(entryId: string): void {
        const updatedEntries = store.entries().filter((e) => e.id !== entryId);
        patchState(store, { entries: updatedEntries });
        markLocalChangeAndPersist();
      },

      // ─── Task 6.7: updateEntry ────────────────────────────────────────────
      /**
       * Updates an existing expense entry in the in-memory store,
       * then persists the updated state to Google Drive.
       */
      updateEntry(updatedEntry: ExpenseEntry): void {
        const updatedEntries = store.entries().map((e) =>
          e.id === updatedEntry.id ? updatedEntry : e
        );
        patchState(store, { entries: updatedEntries });
        markLocalChangeAndPersist();
      },

      // ─── Task 6.2: loadFromDrive ──────────────────────────────────────────
      /**
       * Bootstraps the store from Google Drive. In family mode, reads directly
       * from the shared file ID. In single/null mode, uses the find-or-create
       * flow against appDataFolder.
       */
      async loadFromDrive(): Promise<void> {
        console.log('[ExpenseStore] loadFromDrive — start');
        patchState(store, { syncStatus: 'syncing' });

        const mode = backupModeService.getMode();
        console.log('[ExpenseStore] loadFromDrive — mode:', mode);

        try {
          if (mode === 'family') {
            // Family mode: read directly from the shared file ID — no find/create
            const fileId = backupModeService.getSharedFileId();
            if (!fileId) {
              console.warn('[ExpenseStore] loadFromDrive — family mode but no sharedFileId, emitting FAMILY_SETUP_INCOMPLETE');
              patchState(store, { syncStatus: 'error' });
              driveError$.next({ status: 0, message: 'FAMILY_SETUP_INCOMPLETE', operation: 'loadFromDrive' } as DriveApiError);
              return;
            }
            console.log('[ExpenseStore] loadFromDrive — family mode, reading shared file:', fileId);
            const doc = await googleDriveService.readBackupFile(fileId);
            const modifiedTime = await readModifiedTimeSafely(fileId);
            console.log('[ExpenseStore] loadFromDrive — read complete. expenses:', doc.expenses.length, '| limits:', doc.limits.length, '| monthlyIncome:', doc.metadata.monthlyIncome);
            console.log('[ExpenseStore] loadFromDrive — document structure:', {
              version: doc.version,
              lastUpdated: doc.lastUpdated,
              hasExpenses: doc.expenses.length > 0,
              hasLimits: doc.limits.length > 0,
              currency: doc.metadata.currency
            });
            applyBackupDocument(fileId, doc, modifiedTime);
            console.log('[ExpenseStore] loadFromDrive — state updated. Store now has:', {
              entriesCount: store.entries().length,
              limitsCount: store.limits().length,
              monthlyIncome: store.monthlyIncome(),
              driveFileId: store.driveFileId()
            });
            console.log('[ExpenseStore] loadFromDrive — done (family backup loaded)');
          } else {
            // Single user mode (or null): existing find-or-create flow using appDataFolder
            console.log('[ExpenseStore] loadFromDrive — single mode, calling findBackupFile...');
            let fileId = await googleDriveService.findBackupFile();
            console.log('[ExpenseStore] loadFromDrive — findBackupFile result:', fileId);

            if (fileId === null) {
              console.log('[ExpenseStore] loadFromDrive — no backup found, creating new file...');
              fileId = await googleDriveService.createBackupFile();
              console.log('[ExpenseStore] loadFromDrive — created backup file, id:', fileId);
              patchState(store, {
                entries: [],
                limits: [],
                monthlyIncome: 0,
                receiptFolderId: null,
                driveFileId: fileId,
                lastKnownDriveModifiedTime: await readModifiedTimeSafely(fileId),
                syncStatus: 'idle',
              });
              console.log('[ExpenseStore] loadFromDrive — done (new empty backup)');
              return;
            }

            console.log('[ExpenseStore] loadFromDrive — reading backup file...');
            const doc = await googleDriveService.readBackupFile(fileId);
            const modifiedTime = await readModifiedTimeSafely(fileId);
            console.log('[ExpenseStore] loadFromDrive — read complete. expenses:', doc.expenses.length, '| limits:', doc.limits.length);
            applyBackupDocument(fileId, doc, modifiedTime);
            console.log('[ExpenseStore] loadFromDrive — done (existing backup loaded)');
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

      patchReceiptFolderId(receiptFolderId: string): void {
        patchState(store, { receiptFolderId });
        markLocalChangeAndPersist();
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
            console.warn('[ExpenseStore] persistToDrive called before driveFileId is set — skipping');
            return;
          }

          try {
            const revisionBeingPersisted = localRevision;
            const doc = {
              version: '1.0',
              lastUpdated: new Date().toISOString(),
              metadata: {
                monthlyIncome: store.monthlyIncome(),
                currency: currencyService.currency(),
                ...(store.receiptFolderId() ? { receiptFolderId: store.receiptFolderId()! } : {}),
              },
              expenses: store.entries(),
              limits: store.limits(),
            };
            const modifiedTime = await googleDriveService.writeBackupFile(fileId, doc);
            persistedRevision = Math.max(persistedRevision, revisionBeingPersisted);
            patchState(store, {
              lastKnownDriveModifiedTime: modifiedTime ?? await readModifiedTimeSafely(fileId),
              syncStatus: 'idle',
            });
          } catch (err) {
            patchState(store, { syncStatus: 'error' });
            driveError$.next(err as DriveApiError | DriveParseError);
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

          console.log('[ExpenseStore] Remote backup changed, loading latest Drive data.');
          const doc = await googleDriveService.readBackupFile(fileId);
          applyBackupDocument(fileId, doc, remoteModifiedTime);
          return true;
        } catch (err) {
          console.warn('[ExpenseStore] refreshFromDriveIfChanged failed:', err);
          const driveErr = err as DriveApiError;
          if (driveErr.status === 403 || driveErr.status === 404) {
            driveError$.next(err as DriveApiError | DriveParseError);
          }
          return false;
        }
      },
    };

    return methods;
  })
);
