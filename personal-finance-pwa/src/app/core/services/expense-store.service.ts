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

    /** 50/30/20 budget rule summary for the selected month */
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
          case 'Growth':
            savingsTotal += entry.amount;
            break;
          // 'Buffer' entries are not counted in the 50/30/20 rule categories
        }
      }

      const needsPercentage = income > 0 ? (needsTotal / income) * 100 : 0;
      const wantsPercentage = income > 0 ? (wantsTotal / income) * 100 : 0;
      const savingsPercentage = income > 0 ? (savingsTotal / income) * 100 : 0;

      return {
        needsTotal,
        wantsTotal,
        savingsTotal,
        needsPercentage,
        wantsPercentage,
        savingsPercentage,
        needsTarget: income * 0.5,   // 50% of income
        wantsTarget: income * 0.3,   // 30% of income
        savingsTarget: income * 0.2, // 20% of income
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
       * into the local entries (deduplicating by id), and updates selectedMonth.
       */
      async loadMonth(month: string): Promise<void> {
        console.log('[ExpenseStore] loadMonth called for:', month);
        if (!hasSheetId()) {
          console.warn('[ExpenseStore] loadMonth - no sheet ID configured');
          return;   // no sheet configured yet
        }
        patchState(store, { syncStatus: 'syncing' });
        try {
          const fetched = await sheetsService.readExpenses(getSheetId(), month);
          console.log('[ExpenseStore] loadMonth - fetched', fetched.length, 'entries');

          // Merge: build a map of existing entries by id, then overlay fetched ones
          const existingById = new Map<string, ExpenseEntry>(
            store.entries().map((e) => [e.id, e])
          );
          for (const entry of fetched) {
            existingById.set(entry.id, entry);
          }

          const mergedEntries = Array.from(existingById.values());
          console.log('[ExpenseStore] loadMonth - merged total:', mergedEntries.length, 'entries');

          patchState(store, {
            entries: mergedEntries,
            selectedMonth: month,
            syncStatus: 'idle',
          });
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
    };
  })
);
