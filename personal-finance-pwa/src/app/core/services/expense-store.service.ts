import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  BudgetRuleSummary,
  ExpenseEntry,
  ExpenseLimit,
  METADATA_MONTHLY_INCOME,
} from '../models';
import { GoogleSheetsService } from './google-sheets.service';

// ─── State Interface ──────────────────────────────────────────────────────────

interface ExpenseState {
  entries: ExpenseEntry[];
  limits: ExpenseLimit[];
  monthlyIncome: number;
  selectedMonth: string; // YYYY-MM
  syncStatus: 'idle' | 'syncing' | 'error';
  isOffline: boolean;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const ExpenseStore = signalStore(
  { providedIn: 'root' },

  // ─── Task 5.1: State ───────────────────────────────────────────────────────
  withState<ExpenseState>({
    entries: [],
    limits: [],
    monthlyIncome: 0,
    selectedMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
    syncStatus: 'idle',
    isOffline: false,
  }),

  // ─── Task 5.2 & 5.3: Computed Signals ─────────────────────────────────────
  withComputed((store) => ({
    /** Entries whose date equals today's ISO date string (YYYY-MM-DD) */
    todayEntries: computed(() => {
      const today = new Date().toISOString().slice(0, 10);
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

  // ─── Task 5.4 – 5.7: Methods ──────────────────────────────────────────────
  withMethods((store, sheetsService = inject(GoogleSheetsService)) => {
    // Read the spreadsheet ID from localStorage at store initialisation time.
    // Updated whenever the user saves a new ID in Settings.
    const getSheetId = (): string =>
      (typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null) ?? '';

    /** Returns true when a sheet ID has been configured. */
    const hasSheetId = (): boolean => getSheetId().length > 0;

    return {
      // ─── Task 5.4: addEntry ──────────────────────────────────────────────
      /**
       * Synchronously prepends a new expense entry to the in-memory store.
       * Does not call any external service.
       */
      addEntry(entry: ExpenseEntry): void {
        patchState(store, { entries: [entry, ...store.entries()] });
      },

      // ─── Task 5.5: loadMonth ─────────────────────────────────────────────
      /**
       * Fetches expenses for the given month from Google Sheets, merges them
       * into the local entries (deduplicating by id), and optionally updates selectedMonth.
       */
      async loadMonth(month: string, updateSelectedMonth: boolean = true): Promise<void> {
        console.log('[ExpenseStore] loadMonth called for:', month, '| updateSelectedMonth:', updateSelectedMonth);
        if (!hasSheetId()) {
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
          const fetched = await sheetsService.readExpenses(getSheetId(), month);
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

      // ─── Task 5.6: loadLimits ────────────────────────────────────────────
      /**
       * Fetches expense limits and metadata (monthly income) from Google Sheets
       * and updates the store state.
       */
      async loadLimits(): Promise<void> {
        console.log('[ExpenseStore] loadLimits called');
        if (!hasSheetId()) {
          console.warn('[ExpenseStore] loadLimits - no sheet ID configured');
          return;   // no sheet configured yet
        }
        console.log('[ExpenseStore] loadLimits - fetching from sheet:', getSheetId());
        try {
          const [limits, metadata] = await Promise.all([
            sheetsService.readLimits(getSheetId()),
            sheetsService.readMetadata(getSheetId()),
          ]);

          const monthlyIncome = parseFloat(metadata[METADATA_MONTHLY_INCOME] ?? '0') || 0;
          console.log('[ExpenseStore] loadLimits - fetched limits:', limits.length, '| income:', monthlyIncome);

          patchState(store, { limits, monthlyIncome });
        } catch (err) {
          console.error('[ExpenseStore] loadLimits - error:', err);
          // Error is already emitted on GoogleSheetsService.apiError$
        }
      },

      // ─── Task 5.7: clearLocalData ────────────────────────────────────────
      /**
       * Resets all local state to its initial empty values.
       */
      clearLocalData(): void {
        patchState(store, {
          entries: [],
          limits: [],
          monthlyIncome: 0,
          syncStatus: 'idle',
        });
      },

      /**
       * Directly updates limits and monthly income in the store
       * without making any remote API calls.
       */
      setLimitsAndIncome(limits: ExpenseLimit[], monthlyIncome: number): void {
        patchState(store, { limits, monthlyIncome });
      },

      // ─── Delete Entry ────────────────────────────────────────────────────
      /**
       * Removes an expense entry from the in-memory store by its ID.
       * Does not call any external service.
       */
      deleteEntry(entryId: string): void {
        const updatedEntries = store.entries().filter((e) => e.id !== entryId);
        patchState(store, { entries: updatedEntries });
      },

      // ─── Update Entry ────────────────────────────────────────────────────
      /**
       * Updates an existing expense entry in the in-memory store.
       * Does not call any external service.
       */
      updateEntry(updatedEntry: ExpenseEntry): void {
        const updatedEntries = store.entries().map((e) =>
          e.id === updatedEntry.id ? updatedEntry : e
        );
        patchState(store, { entries: updatedEntries });
      },
    };
  })
);
