# Implementation Plan: Personal Finance PWA

## Task 1: Project Scaffolding and Configuration

**References:** Requirements 10.1, 10.2, 10.3, 11.1, 11.2

- [x] 1.1 Scaffold Angular 20 project with `ng new personal-finance-pwa --standalone --routing --style=scss --strict` and opt into zoneless change detection by replacing `provideZoneChangeDetection` with `provideExperimentalZonelessChangeDetection()` in `app.config.ts`
- [x] 1.2 Add Angular PWA support with `ng add @angular/pwa` and update `manifest.webmanifest` with: `name: "Personal Finance"`, `short_name: "FinanceApp"`, `display: "standalone"`, `start_url: "/daily"`, `theme_color` and `background_color`, and icon entries for 192×192 and 512×512 PNG
- [x] 1.3 Install and configure Tailwind CSS: `npm install -D tailwindcss postcss autoprefixer`, run `npx tailwindcss init`, configure `tailwind.config.js` content paths to `./src/**/*.{html,ts}`, and add Tailwind directives to `styles.scss`
- [x] 1.4 Install runtime dependencies: `npm install @ngrx/signals chart.js ng2-charts idb` and dev dependency `npm install -D fast-check`
- [x] 1.5 Configure app routing in `app.routes.ts` with lazy-loaded routes: `/daily → DailyExpenseComponent`, `/monthly → MonthlyExpenseComponent`, `/limits → ExpenseLimitComponent`, `/dashboard → DashboardComponent`, `/settings → SettingsComponent`, `/auth/callback → AuthCallbackComponent` (public), `'' → redirect to /daily`, `'**' → redirect to /daily`; protect all routes except `/auth/callback` with `AuthGuard`
- [x] 1.6 Create the directory structure: `src/app/core/services/`, `src/app/core/guards/`, `src/app/core/interceptors/`, `src/app/core/models/`, `src/app/features/daily-expense/`, `src/app/features/monthly-expense/`, `src/app/features/expense-limit/`, `src/app/features/dashboard/`, `src/app/features/settings/`, `src/app/features/auth/`, `src/app/shared/components/`, `src/app/shared/pipes/`
- [x] 1.7 Configure `app.config.ts` with `provideHttpClient(withInterceptors([authInterceptor]))`, `provideRouter(routes, withComponentInputBinding())`, `provideExperimentalZonelessChangeDetection()`, and `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })`
- [x] 1.8 Create placeholder `AppComponent` (standalone, `OnPush`) that imports and renders `RouterOutlet`, `OfflineBannerComponent`, and `ToastComponent`; create stub files for `OfflineBannerComponent` and `ToastComponent` in `src/app/shared/components/`


## Task 2: Data Models and Core Type Definitions

**References:** Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.3, 5.2, 8.2

- [x] 2.1 Create `src/app/core/models/expense-entry.model.ts` defining the `ExpenseEntry` interface with fields: `id` (UUID string), `date` (ISO 8601 `YYYY-MM-DD`), `amount` (positive number), `type` (string), `limit` (number), `savings` (number), `timestamp` (ISO 8601 datetime)
  - _Requirements: 2.2, 2.3, 3.3_

- [x] 2.2 Create `src/app/core/models/expense-limit.model.ts` defining the `ExpenseLimit` interface with fields: `type`, `recommendedPercentage`, `userPercentage`, `category`; and the `BudgetCategory` union type `'Needs' | 'Wants' | 'Savings' | 'Growth' | 'Buffer'`
  - _Requirements: 2.5, 5.2_

- [x] 2.3 Create `src/app/core/models/expense-type.constants.ts` exporting `PREDEFINED_EXPENSE_TYPES` as a `readonly string[]` of the 14 predefined categories and the `DEFAULT_BUDGET_PERCENTAGES` map of type → `{ category: BudgetCategory, recommendedPercentage: number }` matching the design table
  - _Requirements: 3.1, 5.2_

- [x] 2.4 Create `src/app/core/models/offline-queue-entry.model.ts` defining the `OfflineQueueEntry` interface with fields: `id`, `entry: ExpenseEntry`, `enqueuedAt` (ISO 8601 datetime), `retryCount` (number)
  - _Requirements: 8.2_

- [x] 2.5 Create `src/app/core/models/budget-rule-summary.model.ts` defining the `BudgetRuleSummary` interface with fields: `needsTotal`, `wantsTotal`, `savingsTotal`, `needsPercentage`, `wantsPercentage`, `savingsPercentage`, `needsTarget`, `wantsTarget`, `savingsTarget`
  - _Requirements: 5.2_

- [x] 2.6 Create `src/app/core/models/app-metadata.model.ts` defining the `AppMetadata` type as `Record<string, string>` and exporting the known metadata key constants: `METADATA_MONTHLY_INCOME`, `METADATA_SHEET_VERSION`, `METADATA_LAST_SYNC_AT`
  - _Requirements: 2.6_

- [x] 2.7 Create `src/app/core/models/index.ts` barrel file re-exporting all models and constants from the models directory
  - _Requirements: 2.2, 2.5, 2.6_

- [x] 2.8 Create `src/app/core/models/sheets-api-error.model.ts` defining the `SheetsApiError` interface with fields: `status` (HTTP status number), `message` (string), `operation` (string describing which API call failed)
  - _Requirements: 2.7_


## Task 3: AuthService — Google OAuth 2.0 with GIS + gapi

**References:** Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

- [x] 3.1 Create `src/app/core/services/auth.service.ts` as an `@Injectable({ providedIn: 'root' })` class; declare `isAuthenticated` and `userEmail` as writable signals; load the GIS script (`accounts.google.com/gsi/client`) and `gapi` client script dynamically on service init
  - _Requirements: 1.1_

- [x] 3.2 Implement `signIn(): Promise<void>` using `google.accounts.oauth2.initTokenClient` with the `https://www.googleapis.com/auth/spreadsheets` scope; on success store the access token in a private in-memory field, set `isAuthenticated` to `true`, and write `gapi_auth_state = '1'` to `localStorage`
  - _Requirements: 1.1, 1.2_

- [x] 3.3 Implement `refreshToken(): Promise<string>` that calls `google.accounts.oauth2.initTokenClient` with `prompt: ''` for a silent refresh; on failure clear auth state and throw so the interceptor can redirect to sign-in
  - _Requirements: 1.3_

- [x] 3.4 Implement `signOut(): Promise<void>` that calls `google.accounts.oauth2.revoke` with the current access token, clears the in-memory token, sets `isAuthenticated` to `false`, removes `gapi_auth_state` from `localStorage`, and clears `userEmail`
  - _Requirements: 1.5_

- [x] 3.5 Implement `getAccessToken(): string | null` returning the in-memory token; on app startup check `localStorage` for `gapi_auth_state` and if present call `refreshToken()` to restore the session silently
  - _Requirements: 1.2, 1.3_

- [x] 3.6 Create `src/app/core/guards/auth.guard.ts` as a functional `CanActivateFn` that injects `AuthService`; if `isAuthenticated()` is `false` redirect to `/auth/callback` and return `false`, otherwise return `true`
  - _Requirements: 1.6_

- [x] 3.7 Create `src/app/core/interceptors/auth.interceptor.ts` as a functional `HttpInterceptorFn`; attach `Authorization: Bearer <token>` to all requests whose URL contains `googleapis.com`; on 401 response call `AuthService.refreshToken()`, update the header, and retry the request once; on second 401 redirect to sign-in
  - _Requirements: 1.3, 1.4_

- [x] 3.8 Create `src/app/features/auth/auth-callback.component.ts` as a standalone `OnPush` component at route `/auth/callback`; display a sign-in button that calls `AuthService.signIn()`; on success navigate to `/daily`; on failure display the error message with a retry button
  - _Requirements: 1.4_


## Task 4: GoogleSheetsService

**References:** Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8

- [x] 4.1 Create `src/app/core/services/google-sheets.service.ts`; implement `authenticate(): Promise<void>` that calls `gapi.client.init` with the Sheets API discovery doc and the stored OAuth token; expose `readonly apiError$: Subject<SheetsApiError>` and emit on every caught API error
  - _Requirements: 2.1, 2.7_

- [x] 4.2 Implement `ensureSheets(sheetId: string): Promise<void>` that calls the Sheets API to list existing tabs; for each of `expenses`, `limits`, `metadata` that is missing, create the tab and write the correct header row (`date|amount|type|limit|savings|timestamp|id` for expenses; `type|recommendedPercentage|userPercentage|category` for limits; `key|value` for metadata)
  - _Requirements: 2.8_

- [x] 4.3 Implement private row serialization helpers: `serializeExpenseEntry(entry: ExpenseEntry): string[]` and `deserializeExpenseEntry(row: string[]): ExpenseEntry`; handle all seven columns including the `id` column; parse numeric fields with `parseFloat`
  - _Requirements: 2.2, 2.3_

- [x] 4.4 Implement `readExpenses(sheetId: string, month: string): Promise<ExpenseEntry[]>` using `gapi.client.sheets.spreadsheets.values.get` on the `expenses` range; filter rows client-side to those whose `date` starts with the given `YYYY-MM` month string; deserialize each row using the helper from 4.3
  - _Requirements: 2.2_

- [x] 4.5 Implement `writeExpense(sheetId: string, entry: ExpenseEntry): Promise<void>` using `spreadsheets.values.append` with `valueInputOption: 'RAW'`; serialize the entry using the helper from 4.3; emit on `apiError$` for any non-2xx response
  - _Requirements: 2.3, 2.7_

- [x] 4.6 Implement `batchUpdate(sheetId: string, rows: ExpenseEntry[]): Promise<void>` using `spreadsheets.values.batchUpdate`; serialize all rows using the helper from 4.3 and send in a single API call; emit on `apiError$` for any non-2xx response
  - _Requirements: 2.4, 2.7_

- [x] 4.7 Implement `readLimits(sheetId: string): Promise<ExpenseLimit[]>` and `writeLimits(sheetId: string, limits: ExpenseLimit[]): Promise<void>` using the `limits` sheet range; implement corresponding serialize/deserialize helpers for `ExpenseLimit` rows
  - _Requirements: 2.5_

- [x] 4.8 Implement `readMetadata(sheetId: string): Promise<Record<string, string>>` and `writeMetadata(sheetId: string, key: string, value: string): Promise<void>` using the `metadata` sheet range; `readMetadata` returns all key-value pairs as a plain object; `writeMetadata` finds the existing row for the key and updates it, or appends a new row if not found
  - _Requirements: 2.6_


## Task 5: ExpenseStore (NgRx Signal Store)

**References:** Requirements 3.2, 3.4, 3.7, 4.3, 4.4, 4.5, 7.8

- [x] 5.1 Create `src/app/core/services/expense-store.service.ts` using `signalStore`; define the `ExpenseState` interface with fields: `entries: ExpenseEntry[]`, `limits: ExpenseLimit[]`, `monthlyIncome: number`, `selectedMonth: string` (default to current `YYYY-MM`), `syncStatus: 'idle' | 'syncing' | 'error'`, `isOffline: boolean`; initialise state with `withState`
  - _Requirements: 3.4, 4.3_

- [x] 5.2 Add `withComputed` to the store: `todayEntries` filters `entries()` to those whose `date` equals today's ISO date string; `selectedMonthEntries` filters to those whose `date` starts with `selectedMonth()`; `limitMap` builds a `Record<string, ExpenseLimit>` keyed by `type`
  - _Requirements: 3.2, 3.7, 4.3_

- [x] 5.3 Add `budgetRuleSummary` computed signal that groups `selectedMonthEntries()` by `BudgetCategory` using `limitMap()`, sums amounts per category, calculates percentages against `monthlyIncome()`, and returns a `BudgetRuleSummary` object; handle zero-income edge case by returning zero percentages
  - _Requirements: 4.5_

- [x] 5.4 Implement `addEntry(entry: ExpenseEntry): void` method using `patchState` to prepend the entry to `entries`; the method must be synchronous and must not call any external service
  - _Requirements: 3.4_

- [x] 5.5 Implement `loadMonth(month: string): Promise<void>` method that sets `syncStatus` to `'syncing'`, calls `GoogleSheetsService.readExpenses`, merges returned entries into `entries` (deduplicating by `id`), updates `selectedMonth`, and sets `syncStatus` back to `'idle'`; on error set `syncStatus` to `'error'`
  - _Requirements: 4.3_

- [x] 5.6 Implement `loadLimits(): Promise<void>` method that calls `GoogleSheetsService.readLimits` and `readMetadata`, updates `limits` and `monthlyIncome` in state via `patchState`
  - _Requirements: 3.2, 5.2_

- [x] 5.7 Implement `clearLocalData(): void` method that resets `entries` to `[]`, `limits` to `[]`, `monthlyIncome` to `0`, and `syncStatus` to `'idle'` via `patchState`
  - _Requirements: 7.8_


## Task 6: SyncService — IndexedDB Offline Queue

**References:** Requirements 8.2, 8.3, 8.4, 8.5, 8.6

- [x] 6.1 Create `src/app/core/services/sync.service.ts`; open (or create) the IndexedDB database `pf-pwa-db` with object store `offline-queue` keyed by `id` using the `idb` library; expose `isOnline: Signal<boolean>` initialised from `navigator.onLine`; listen to `window` `online` and `offline` events to keep the signal current
  - _Requirements: 8.6_

- [x] 6.2 Implement `enqueue(entry: ExpenseEntry): Promise<void>` that creates an `OfflineQueueEntry` with `retryCount: 0` and `enqueuedAt` set to the current ISO datetime, then writes it to the `offline-queue` object store; update the `queueLength` signal after the write
  - _Requirements: 8.2_

- [x] 6.3 Implement `flushQueue(): Promise<void>` that reads all entries from the `offline-queue` store, calls `GoogleSheetsService.batchUpdate` with the entries' `ExpenseEntry` objects, and on success deletes those entries from the store; if the batch call throws, increment `retryCount` for each failed entry and re-save them; after 5 retries emit a toast via `GoogleSheetsService.apiError$`
  - _Requirements: 8.3, 8.4, 8.5_

- [x] 6.4 Implement `clearQueue(): Promise<void>` that deletes all records from the `offline-queue` object store and resets `queueLength` to `0`
  - _Requirements: 7.8_

- [x] 6.5 Wire the online transition: in the service constructor, subscribe to the `online` window event and call `flushQueue()` automatically whenever the device comes back online; expose `queueLength: Signal<number>` that reflects the current count of entries in the store
  - _Requirements: 8.3_


## Task 7: Shared UI Components and Pipes

**References:** Requirements 2.7, 8.6, 11.1, 11.4, 11.5, 11.7

- [x] 7.1 Create `src/app/shared/components/card/card.component.ts` as a standalone `OnPush` component that projects content via `<ng-content>`; apply a consistent card container style using Tailwind classes; export from `src/app/shared/components/index.ts`
  - _Requirements: 11.1_

- [x] 7.2 Create `src/app/shared/components/button/button.component.ts` as a standalone `OnPush` component with `@Input() variant: 'primary' | 'danger' | 'ghost'` and `@Input() disabled: boolean`; apply Tailwind variant classes; ensure minimum 44×44 CSS pixel touch target; include `aria-disabled` binding
  - _Requirements: 11.1, 11.4_

- [x] 7.3 Create `src/app/shared/components/input/input.component.ts` as a standalone `OnPush` component with `@Input() label`, `@Input() inputId`, `@Input() errorMessage`; render a `<label [for]="inputId">` and an `<input [id]="inputId">`; display `errorMessage` below the input when non-empty
  - _Requirements: 11.5_

- [x] 7.4 Create `src/app/shared/components/modal/modal.component.ts` as a standalone `OnPush` component with `@Input() title`, `@Input() isOpen: boolean`, `@Output() confirmed` and `@Output() cancelled` event emitters; trap focus within the modal when open; include `role="dialog"` and `aria-modal="true"` attributes
  - _Requirements: 11.1_

- [x] 7.5 Create `src/app/shared/components/toast/toast.component.ts` as a standalone `OnPush` component; inject `GoogleSheetsService` and subscribe to `apiError$` in `ngOnInit`; display the error message as a dismissible toast banner for 5 seconds; use `@if` for conditional rendering
  - _Requirements: 2.7_

- [x] 7.6 Create `src/app/shared/components/offline-banner/offline-banner.component.ts` as a standalone `OnPush` component; inject `SyncService` and bind to `isOnline` signal; render a persistent banner with text "You are offline — entries will sync when reconnected" when `isOnline()` is `false`; use `@if` for conditional rendering
  - _Requirements: 8.6_

- [x] 7.7 Create `src/app/shared/components/chart-base/chart-base.component.ts` as a standalone `OnPush` component; accept `@Input() type: ChartType`, `@Input() data: ChartData`, `@Input() options: ChartOptions`; manage the Chart.js `Chart` instance lifecycle (create in `ngAfterViewInit`, update on input changes via `ngOnChanges`, destroy in `ngOnDestroy`); render a `<canvas>` element with `aria-label` and `role="img"`
  - _Requirements: 6.5, 11.7_

- [x] 7.8 Create shared pipes in `src/app/shared/pipes/`: `CurrencyFormatPipe` (formats number to locale currency string), `DateFormatPipe` (formats ISO date string to display format), `PercentageFormatPipe` (formats decimal to percentage string with one decimal place); register all pipes in `src/app/shared/pipes/index.ts`
  - _Requirements: 11.1_


## Task 8: Daily Expense Page

**References:** Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 8.2, 8.7

- [x] 8.1 Create `src/app/features/daily-expense/daily-expense.component.ts` as a standalone `OnPush` component; build the reactive form using `FormBuilder` with controls: `expenseType` (required), `amount` (required, `min: 0.01`), `limit` (disabled/readonly); inject `ExpenseStore` and `SyncService`
  - _Requirements: 3.1, 3.9_

- [x] 8.2 Implement type-selection logic: subscribe to `expenseType.valueChanges`; on each change look up the limit from `ExpenseStore.limitMap()` for the selected type and call `limit.setValue(...)` to auto-populate the readonly field
  - _Requirements: 3.2_

- [x] 8.3 Add a `savings` computed signal derived from `limit.value - amount.value`; bind it to a read-only display field in the template; update in real time using `valueChanges` observable merged into a signal via `toSignal`
  - _Requirements: 3.3_

- [x] 8.4 Add a `borderClass` computed signal: return `'border-red-500'` when `amount.value > limit.value && amount.value > 0`, `'border-green-500'` when `amount.value <= limit.value && amount.value > 0`, and `''` otherwise; bind to the form container's `[class]`
  - _Requirements: 3.5, 3.6_

- [x] 8.5 Implement `onSubmit()`: validate the form; if invalid mark all controls as touched and return; generate a UUID `id` and build an `ExpenseEntry`; call `ExpenseStore.addEntry(entry)` then `SyncService.enqueue(entry)` (which handles offline queuing automatically)
  - _Requirements: 3.4, 8.2_

- [x] 8.6 Add inline validation error messages below `expenseType` and `amount` inputs using `@if` blocks; show "Expense type is required" when `expenseType` has `required` error and is touched; show "Amount must be greater than 0" when `amount` has `min` error and is touched
  - _Requirements: 3.8_

- [x] 8.7 Render the today's entries list using `@for (entry of expenseStore.todayEntries(); track entry.id)`; display `type`, `amount`, `limit`, `savings`, and formatted `timestamp` for each entry; the list is already ordered descending because `addEntry` prepends
  - _Requirements: 3.7_

- [x] 8.8 Ensure the page remains functional while offline: `SyncService.enqueue` stores to IndexedDB regardless of connectivity; display the `OfflineBannerComponent` (already in `AppComponent`) and confirm the entry is saved locally via a brief toast message when `isOnline()` is `false`
  - _Requirements: 8.7_


## Task 9: Monthly Expense Page

**References:** Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7

- [x] 9.1 Create `src/app/features/monthly-expense/monthly-expense.component.ts` as a standalone `OnPush` component; inject `ExpenseStore`; initialise `selectedMonth` to the current `YYYY-MM` string and call `ExpenseStore.loadMonth(selectedMonth)` in `ngOnInit`
  - _Requirements: 4.1_

- [x] 9.2 Add a native `<input type="month">` bound to `selectedMonth`; on `(change)` call `ExpenseStore.loadMonth(event.target.value)` to fetch and cache the selected month's entries; ensure the input has an associated `<label>` element
  - _Requirements: 4.2, 4.3_

- [x] 9.3 Compute and display three summary `CardComponent` instances: total spent (`sum(entry.amount)` for `selectedMonthEntries`), total limit (`sum(limit.calculatedAmount)` for all limit types), and net savings (`totalLimit - totalSpent`); use `CurrencyFormatPipe` for display
  - _Requirements: 4.4_

- [x] 9.4 Render a donut chart using `ChartBaseComponent` with `type="doughnut"`; compute chart data from `ExpenseStore.budgetRuleSummary()` mapping `needsTotal`, `wantsTotal`, `savingsTotal` to three dataset values labelled "Needs", "Wants", "Savings"
  - _Requirements: 4.5_

- [x] 9.5 Render a plain `<table>` (no CDK) listing each expense type with columns: Type, Total Spent, Configured Limit, Variance (limit − spent); compute rows by grouping `selectedMonthEntries` by `type` and joining with `limitMap`; apply `CurrencyFormatPipe` to monetary columns
  - _Requirements: 4.6_

- [x] 9.6 Add an empty-state `@if` block: when `selectedMonthEntries().length === 0` display a message "No expense data for this month" instead of the table and chart
  - _Requirements: 4.7_


## Task 10: Expense Limit Page

**References:** Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8

- [x] 10.1 Create `src/app/features/expense-limit/expense-limit.component.ts` as a standalone `OnPush` component; build a reactive form with a `monthlyIncome` control (required, `min: 0.01`) and a `FormArray` named `limits` pre-populated with one `FormGroup` per entry in `PREDEFINED_EXPENSE_TYPES`; each group has controls: `type` (readonly), `category` (readonly), `recommendedPercentage` (readonly), `userPercentage` (number, `min: 0`, `max: 100`), `calculatedAmount` (readonly/computed)
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 10.2 Subscribe to `monthlyIncome.valueChanges` and each `userPercentage.valueChanges` within the `FormArray`; on any change recalculate `calculatedAmount` for every row as `income × (userPercentage / 100)` and call `patchValue` on the readonly control; use `combineLatest` or a single `valueChanges` on the parent form
  - _Requirements: 5.4_

- [x] 10.3 Compute a `runningTotal` signal as the sum of all `userPercentage` values; display it below the form array; apply a Tailwind warning class (e.g. `text-red-600`) when the sum of Needs + Wants percentages exceeds 80
  - _Requirements: 5.5_

- [x] 10.4 Implement the "Add Custom Type" button: push a new `FormGroup` to the `limits` `FormArray` with editable `type` (text, required), `category` (select from `BudgetCategory` values), `userPercentage`, and computed `calculatedAmount`
  - _Requirements: 5.6_

- [x] 10.5 Implement `onSave()`: if savings percentage (sum of rows where `category === 'Savings'`) is below 20, open `ModalComponent` with a warning message and wait for confirmation before proceeding; on confirmation call `GoogleSheetsService.writeLimits` and `writeMetadata` for `monthlyIncome`; show a success toast on completion
  - _Requirements: 5.7, 5.8_


## Task 11: Dashboard Page

**References:** Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7

- [x] 11.1 Create `src/app/features/dashboard/dashboard.component.ts` as a standalone `OnPush` component; inject `ExpenseStore`; declare four `ChartData` signals for the four charts; use `effect()` to recompute all chart data signals whenever `ExpenseStore.entries()` or `ExpenseStore.selectedMonth()` changes
  - _Requirements: 6.6_

- [x] 11.2 Implement `computeYtdDailyData(entries: ExpenseEntry[]): ChartData` that groups entries by `date` for the current calendar year, sums amounts per day, and returns a Chart.js line chart dataset with one data point per day; days with no entries get a value of `0`
  - _Requirements: 6.1_

- [x] 11.3 Implement `computeMonthlyTypeBreakdown(entries: ExpenseEntry[]): ChartData` that groups the current month's entries by `type`, sums amounts per type, and returns a Chart.js pie chart dataset with one slice per type
  - _Requirements: 6.2_

- [x] 11.4 Implement `computeSixMonthComparison(entries: ExpenseEntry[]): ChartData` that groups entries by calendar month for the last 6 months, sums total spending per month, and returns a Chart.js bar chart dataset with one bar per month labelled `MMM YYYY`
  - _Requirements: 6.3_

- [x] 11.5 Implement `computeBudgetRuleChartData(summary: BudgetRuleSummary): ChartData` that returns a Chart.js doughnut dataset with three segments (Needs, Wants, Savings) using `needsPercentage`, `wantsPercentage`, `savingsPercentage`; include target reference lines or annotations if Chart.js supports them
  - _Requirements: 6.4_

- [x] 11.6 Render four `ChartBaseComponent` instances in the template, each wrapped in a `CardComponent`; bind the corresponding `ChartData` signal to each `[data]` input; add `@if` empty-state placeholders: when a chart's dataset has no data points display a `<p>` message instead of the chart
  - _Requirements: 6.5, 6.7_


## Task 12: Settings Page

**References:** Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 10.4

- [x] 12.1 Create `src/app/features/settings/settings.component.ts` as a standalone `OnPush` component; inject `AuthService`, `NotificationService`, `SyncService`, `ExpenseStore`, and `GoogleSheetsService`; display the Google Sheets connection status (connected/disconnected) and the linked spreadsheet ID read from `AppMetadata`
  - _Requirements: 7.1_

- [x] 12.2 Add a notification toggle `<input type="checkbox">` bound to `NotificationService.isEnabled()`; on toggle-on call `NotificationService.requestPermission()` then `enable(intervalMinutes)`; on toggle-off call `disable()`; if `permissionState()` is `'denied'` keep the toggle disabled and show an explanatory message
  - _Requirements: 7.2, 9.6_

- [x] 12.3 Add a range slider `<input type="range" min="15" max="480">` and a numeric `<input type="number" min="15" max="480">` both bound to the same `intervalMinutes` form control; on either control's `(input)` event call `NotificationService.updateInterval(value)`; show both controls only when notifications are enabled
  - _Requirements: 7.3, 7.4_

- [x] 12.4 Capture the `beforeinstallprompt` event in the component (or a shared service) and store the deferred prompt; show the `ButtonComponent` install button only when the deferred prompt is available; on click call `deferredPrompt.prompt()` and hide the button after the user responds
  - _Requirements: 7.5, 7.6, 10.4_

- [x] 12.5 Implement the "Export to CSV" button: on click fetch all expenses via `GoogleSheetsService.readExpenses` for all available months (or use cached `ExpenseStore.entries()`), convert to CSV string with header row `id,date,amount,type,limit,savings,timestamp`, create a `Blob`, and trigger a download via a temporary `<a>` element
  - _Requirements: 7.7_

- [x] 12.6 Implement the "Clear Local Data" button: on click open `ModalComponent` with a confirmation message; on confirmation call `SyncService.clearQueue()` then `ExpenseStore.clearLocalData()`; show a success toast after completion
  - _Requirements: 7.8, 7.9_


## Task 13: NotificationService

**References:** Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 7.3, 7.4

- [x] 13.1 Create `src/app/core/services/notification.service.ts`; inject Angular `SwPush`; declare `permissionState: Signal<NotificationPermission>` initialised from `Notification.permission`; declare `isEnabled: Signal<boolean>` and `intervalMinutes: Signal<number>` (default `60`)
  - _Requirements: 9.1_

- [x] 13.2 Implement `requestPermission(): Promise<void>` that calls `SwPush.requestSubscription` with the VAPID public key; on success set `permissionState` to `'granted'` and persist the subscription; on denial set `permissionState` to `'denied'` and set `isEnabled` to `false`
  - _Requirements: 9.1, 9.6_

- [x] 13.3 Implement `enable(intervalMinutes: number): Promise<void>` that calls `requestPermission()` if not already granted, then writes the interval and enabled state to `localStorage` (`pf_notif_enabled`, `pf_notif_interval`), and schedules the notification check via `setInterval`
  - _Requirements: 9.2_

- [x] 13.4 Implement `disable(): Promise<void>` that clears the scheduled interval, sets `isEnabled` to `false`, and writes the disabled state to `localStorage`; does not revoke the push subscription
  - _Requirements: 9.7_

- [x] 13.5 Implement `updateInterval(minutes: number): void` that clamps the input to `[15, 480]`, updates `intervalMinutes` signal, persists to `localStorage`, and restarts the scheduled interval with the new value immediately without requiring an app restart
  - _Requirements: 7.3, 7.4, 9.2_

- [x] 13.6 Implement the notification check logic (called by the scheduled interval): query `ExpenseStore.entries()` for any entry with a `timestamp` within the last `intervalMinutes` minutes; if none found call `SwPush` to dispatch a notification with message "Don't forget to log your expenses!"; if at least one entry exists skip the notification
  - _Requirements: 9.3, 9.4_

- [x] 13.7 Subscribe to `SwPush.notificationClicks` in the service constructor; on click navigate to `/daily` using `Router`
  - _Requirements: 9.5_


## Task 14: Bottom Navigation Bar

**References:** Requirements 11.2, 11.3, 11.4, 11.7

- [x] 14.1 Create `src/app/shared/components/bottom-nav/bottom-nav.component.ts` as a standalone `OnPush` component; render five navigation links using `RouterLink` directives pointing to `/daily`, `/monthly`, `/limits`, `/dashboard`, and `/settings`; include a label and an SVG icon for each link; all SVG icons must have `aria-hidden="true"` and the link must have an `aria-label`
  - _Requirements: 11.3, 11.7_

- [x] 14.2 Apply `routerLinkActive="active"` to each link and define an `active` CSS class that visually highlights the current route (e.g. different icon colour and label weight); ensure the active state is visually distinct
  - _Requirements: 11.3_

- [x] 14.3 Style the nav bar as a fixed bottom bar using Tailwind classes; show it only on mobile viewports using `md:hidden`; ensure each link's touch target is at least 44×44 CSS pixels using `min-h-[44px] min-w-[44px]` or equivalent padding
  - _Requirements: 11.2, 11.3, 11.4_

- [x] 14.4 Import `BottomNavComponent` into `AppComponent` and add it to the template alongside `RouterOutlet`, `OfflineBannerComponent`, and `ToastComponent`
  - _Requirements: 11.3_


## Task 15: Property-Based Tests (fast-check)

**References:** Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.3, 4.4, 4.5, 5.2, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.6, 7.3, 7.4, 7.7, 8.2, 8.3, 8.4, 8.5, 9.3, 9.4, 11.5, 11.7

- [x] 15.1 Create `src/app/core/models/expense-entry.spec.ts`; implement Property 1 (data model serialization round-trip) using `fc.record` for `ExpenseEntry`, `ExpenseLimit`, and metadata key-value pairs; assert `deserialize(serialize(x))` deep-equals `x` for all fields; tag: `// Feature: personal-finance-pwa, Property 1: Data model serialization round-trip`; minimum 100 iterations
  - **Property 1: Data Model Serialization Round-Trip**
  - **Validates: Requirements 2.2, 2.3, 2.5, 2.6**

- [x] 15.2 Create `src/app/core/services/google-sheets.service.spec.ts` (PBT section); implement Property 2 (batch serialization consistency) using `fc.array(fc.record(...))` for `ExpenseEntry[]`; assert `batchSerialize(arr)` equals `arr.map(serializeExpenseEntry)`; tag: `// Feature: personal-finance-pwa, Property 2: Batch serialization consistency`
  - **Property 2: Batch Serialization Consistency**
  - **Validates: Requirements 2.4**

- [x] 15.3 In `google-sheets.service.spec.ts`; implement Property 3 (API error propagation) using `fc.integer({ min: 400, max: 599 })` for HTTP status codes; mock `gapi` to return each status; assert `apiError$` emits and the returned promise rejects; tag: `// Feature: personal-finance-pwa, Property 3: API error propagation`
  - **Property 3: API Error Propagation**
  - **Validates: Requirements 2.7**

- [x] 15.4 Create `src/app/features/daily-expense/daily-expense.component.spec.ts` (PBT section); implement Property 4 (savings calculation invariant) using `fc.float` for `amount` and `limit`; assert `savings === limit - amount` for all pairs; tag: `// Feature: personal-finance-pwa, Property 4: Savings calculation invariant`
  - **Property 4: Savings Calculation Invariant**
  - **Validates: Requirements 3.3**

- [x] 15.5 In `daily-expense.component.spec.ts`; implement Property 5 (limit auto-populate correctness) using `fc.array` of `ExpenseLimit` and `fc.constantFrom(...PREDEFINED_EXPENSE_TYPES)`; assert the limit field value equals the stored limit for the selected type; tag: `// Feature: personal-finance-pwa, Property 5: Limit auto-populate correctness`
  - **Property 5: Limit Auto-Populate Correctness**
  - **Validates: Requirements 3.2**

- [x] 15.6 In `daily-expense.component.spec.ts`; implement Property 6 (form submission adds entry to store and queue) using `fc.record` for valid form data; submit the form; assert the entry appears in `ExpenseStore.entries()` and in the IndexedDB queue; tag: `// Feature: personal-finance-pwa, Property 6: Form submission adds entry to store and queue`
  - **Property 6: Form Submission Adds Entry to Store and Queue**
  - **Validates: Requirements 3.4**

- [x] 15.7 In `daily-expense.component.spec.ts`; implement Property 7 (border indicator correctness) using `fc.float({ min: 0.01 })` for both `amount` and `limit`; assert border class is `'border-red-500'` iff `amount > limit`; tag: `// Feature: personal-finance-pwa, Property 7: Border indicator correctness`
  - **Property 7: Border Indicator Correctness**
  - **Validates: Requirements 3.5, 3.6**

- [x] 15.8 In `daily-expense.component.spec.ts`; implement Property 8 (today's entries ordering) using `fc.array` of today-dated `ExpenseEntry` records with random timestamps; assert the displayed list is sorted by `timestamp` descending; tag: `// Feature: personal-finance-pwa, Property 8: Today's entries ordering`
  - **Property 8: Today's Entries Ordering**
  - **Validates: Requirements 3.7**

- [x] 15.9 In `daily-expense.component.spec.ts`; implement Property 9 (form validation rejects invalid input) using `fc.oneof(fc.constant(''), fc.float({ max: 0 }))` for invalid inputs; assert `ExpenseStore.entries()` length is unchanged and at least one error message is visible; tag: `// Feature: personal-finance-pwa, Property 9: Form validation rejects invalid input`
  - **Property 9: Form Validation Rejects Invalid Input**
  - **Validates: Requirements 3.8**

- [x] 15.10 Create `src/app/core/services/expense-store.service.spec.ts` (PBT section); implement Property 10 (monthly filter completeness) using `fc.array` of `ExpenseEntry` with random dates and `fc.string` for month; assert `selectedMonthEntries` contains exactly those entries matching the month; tag: `// Feature: personal-finance-pwa, Property 10: Monthly filter completeness`
  - **Property 10: Monthly Filter Completeness**
  - **Validates: Requirements 4.3**

- [x] 15.11 In `expense-store.service.spec.ts`; implement Property 11 (monthly summary aggregation correctness) using `fc.array` of `ExpenseEntry` and `ExpenseLimit`; assert `totalSpent`, `totalLimit`, `netSavings` equal the correct arithmetic aggregations; tag: `// Feature: personal-finance-pwa, Property 11: Monthly summary aggregation correctness`
  - **Property 11: Monthly Summary Aggregation Correctness**
  - **Validates: Requirements 4.4**

- [x] 15.12 In `expense-store.service.spec.ts`; implement Property 12 (budget rule category proportions) using `fc.array` of `ExpenseEntry` with assigned categories; assert category totals sum to total spent with no double-counting; tag: `// Feature: personal-finance-pwa, Property 12: Budget rule category proportions`
  - **Property 12: Budget Rule Category Proportions**
  - **Validates: Requirements 4.5, 6.4**

- [x] 15.13 Create `src/app/features/expense-limit/expense-limit.component.spec.ts` (PBT section); implement Property 13 (income-based limit calculation) using `fc.float({ min: 0.01 })` for income and `fc.float({ min: 0, max: 100 })` for percentage; assert `calculatedAmount === income * (percentage / 100)`; tag: `// Feature: personal-finance-pwa, Property 13: Income-based limit calculation`
  - **Property 13: Income-Based Limit Calculation**
  - **Validates: Requirements 5.2, 5.4**

- [x] 15.14 In `expense-limit.component.spec.ts`; implement Property 14 (running total and 80% warning) using `fc.array(fc.float({ min: 0, max: 100 }))` for percentage arrays; assert running total equals sum and warning is shown iff Needs+Wants > 80; tag: `// Feature: personal-finance-pwa, Property 14: Running total and overspend warning`
  - **Property 14: Running Total and Overspend Warning**
  - **Validates: Requirements 5.5**

- [x] 15.15 Create `src/app/features/dashboard/dashboard.component.spec.ts` (PBT section); implement Property 15 (chart data aggregation correctness) using `fc.array` of `ExpenseEntry`; assert daily, monthly, and type aggregation sums equal total of all input entries; tag: `// Feature: personal-finance-pwa, Property 15: Chart data aggregation correctness`
  - **Property 15: Chart Data Aggregation Correctness**
  - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 15.16 In `dashboard.component.spec.ts`; implement Property 16 (chart reactivity to state changes) using `fc.record` for a new `ExpenseEntry`; add entry to store; assert all four chart data signals reflect the new entry; tag: `// Feature: personal-finance-pwa, Property 16: Chart reactivity to state changes`
  - **Property 16: Chart Reactivity to State Changes**
  - **Validates: Requirements 6.6**

- [x] 15.17 Create `src/app/features/settings/settings.component.spec.ts` (PBT section); implement Property 17 (notification interval slider-input binding) using `fc.integer({ min: 15, max: 480 })`; set value via slider; assert numeric input shows same value and vice versa; tag: `// Feature: personal-finance-pwa, Property 17: Notification interval slider-input binding`
  - **Property 17: Notification Interval Slider-Input Binding**
  - **Validates: Requirements 7.3**

- [x] 15.18 Create `src/app/core/services/notification.service.spec.ts` (PBT section); implement Property 18 (notification interval bounds and propagation) using `fc.integer()` for arbitrary integers; assert stored value is clamped to `[15, 480]`; tag: `// Feature: personal-finance-pwa, Property 18: Notification interval bounds and propagation`
  - **Property 18: Notification Interval Bounds and Propagation**
  - **Validates: Requirements 7.3, 7.4**

- [x] 15.19 In `settings.component.spec.ts`; implement Property 19 (CSV export completeness) using `fc.array` of `ExpenseEntry`; export CSV; parse back; assert round-trip equality for all fields; tag: `// Feature: personal-finance-pwa, Property 19: CSV export completeness`
  - **Property 19: CSV Export Completeness**
  - **Validates: Requirements 7.7**

- [x] 15.20 Create `src/app/core/services/sync.service.spec.ts` (PBT section); implement Property 20 (offline queue lifecycle) using `fc.array` of `ExpenseEntry`; enqueue all while offline; flush online; assert queue is empty and entries were passed to `GoogleSheetsService.batchUpdate`; simulate flush failure and assert `retryCount` incremented; tag: `// Feature: personal-finance-pwa, Property 20: Offline queue lifecycle`
  - **Property 20: Offline Queue Lifecycle**
  - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

- [x] 15.21 In `notification.service.spec.ts`; implement Property 21 (notification dispatch logic) using `fc.array` of `ExpenseEntry` and `fc.integer({ min: 15, max: 480 })` for interval; assert notification is dispatched iff no entry has a timestamp within the last interval minutes; tag: `// Feature: personal-finance-pwa, Property 21: Notification dispatch logic`
  - **Property 21: Notification Dispatch Logic**
  - **Validates: Requirements 9.3, 9.4**

- [x] 15.22 Create `src/app/shared/components/accessibility.spec.ts`; implement Property 22 (form accessibility — labels and alt attributes) by rendering each form component in Angular TestBed and querying the DOM; assert every `<input>` has a `<label>` with matching `for`/`id`, every `<img>` has a non-empty `alt`, and every icon button has a non-empty `aria-label`; tag: `// Feature: personal-finance-pwa, Property 22: Form accessibility`
  - **Property 22: Form Accessibility — Labels and Alt Attributes**
  - **Validates: Requirements 11.5, 11.7**

- [x] 15.23 Checkpoint — run `ng test --run` and ensure all 22 property-based tests pass with no failures; fix any failing properties before proceeding
  - Ensure all property tests pass, ask the user if questions arise.


## Task 16: Unit Tests (Jasmine + Angular TestBed)

**References:** Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 2.2, 2.7, 2.8, 3.4, 3.8, 3.9, 4.3, 7.3, 8.2, 8.3, 9.1, 9.6

- [x] 16.1 In `src/app/core/services/auth.service.spec.ts`, write unit tests for `AuthService`: token is stored in memory after `signIn`; `localStorage` key `gapi_auth_state` is set after sign-in and removed after `signOut`; `signOut` calls `google.accounts.oauth2.revoke`; `refreshToken` rejects and clears auth state when GIS returns an error; `getAccessToken` returns `null` before sign-in
  - _Requirements: 1.2, 1.3, 1.5_

- [x] 16.2 In `src/app/core/services/google-sheets.service.spec.ts`, write unit tests for `GoogleSheetsService`: `serializeExpenseEntry` produces a 7-element string array in the correct column order; `deserializeExpenseEntry` correctly parses numeric fields; `ensureSheets` creates missing tabs with correct headers; `apiError$` emits when a mocked `gapi` call returns a 403 status
  - _Requirements: 2.2, 2.7, 2.8_

- [x] 16.3 In `src/app/core/services/expense-store.service.spec.ts`, write unit tests for `ExpenseStore`: `addEntry` prepends the entry to `entries`; `todayEntries` returns only today's entries; `limitMap` keys match the `type` field of each limit; `budgetRuleSummary` returns zero percentages when `monthlyIncome` is `0`; `clearLocalData` resets all state fields to their initial values
  - _Requirements: 3.4, 4.3_

- [x] 16.4 In `src/app/core/services/sync.service.spec.ts`, write unit tests for `SyncService`: `enqueue` writes an `OfflineQueueEntry` to IndexedDB and increments `queueLength`; `flushQueue` calls `GoogleSheetsService.batchUpdate` with all queued entries and clears the store on success; `flushQueue` increments `retryCount` and retains the entry when `batchUpdate` throws; `clearQueue` empties the store and resets `queueLength` to `0`
  - _Requirements: 8.2, 8.3_

- [x] 16.5 In `src/app/core/services/notification.service.spec.ts`, write unit tests for `NotificationService`: `updateInterval(10)` stores `15` (clamped); `updateInterval(500)` stores `480` (clamped); `updateInterval(60)` stores `60`; `disable` sets `isEnabled` to `false`; `permissionState` is `'denied'` when `Notification.permission` is `'denied'`
  - _Requirements: 7.3, 9.6_

- [x] 16.6 In `src/app/features/daily-expense/daily-expense.component.spec.ts`, write unit tests for form validation: submitting with empty `expenseType` shows the required error message; submitting with `amount = 0` shows the min-value error message; submitting with `amount = -1` shows the min-value error message; a valid submission calls `ExpenseStore.addEntry` exactly once
  - _Requirements: 3.8, 3.9_

- [x] 16.7 In `src/app/core/guards/auth.guard.spec.ts`, write unit tests for `AuthGuard`: when `AuthService.isAuthenticated()` returns `false` the guard returns a `UrlTree` redirecting to `/auth/callback`; when `isAuthenticated()` returns `true` the guard returns `true`
  - _Requirements: 1.6_


## Task 17: Integration and E2E Tests

**References:** Requirements 1.1, 1.6, 2.1, 2.8, 8.2, 8.3, 10.3, 10.4

- [x] 17.1 Create `src/app/core/services/google-sheets.integration.spec.ts`; mock the `gapi.client.sheets` object with a `jasmine.createSpyObj`; write integration tests verifying: `authenticate()` calls `gapi.client.init` with the correct discovery doc URL; `readExpenses` constructs the correct A1 range notation (`expenses!A2:G`); `writeExpense` calls `spreadsheets.values.append` with `valueInputOption: 'RAW'`; `ensureSheets` calls `spreadsheets.batchUpdate` to add missing sheets
  - _Requirements: 2.1, 2.8_

- [x] 17.2 Create `src/app/core/services/sync.indexeddb.spec.ts`; install `fake-indexeddb` as a dev dependency (`npm install -D fake-indexeddb`) and configure it as the global `indexedDB` in the test setup; write integration tests verifying: `enqueue` persists an entry that survives a service re-instantiation; `flushQueue` reads all persisted entries and deletes them after a successful flush; `flushQueue` retains entries with incremented `retryCount` after a failed flush
  - _Requirements: 8.2, 8.3_

- [x] 17.3 Create `e2e/auth-flow.spec.ts` using Playwright; mock the GIS `initTokenClient` to resolve immediately with a fake token; test the full auth flow: navigate to `/daily` → redirected to `/auth/callback` → click sign-in → navigated to `/daily` → click sign-out → redirected to `/auth/callback`
  - _Requirements: 1.1, 1.6_

- [x] 17.4 Create `e2e/expense-entry.spec.ts` using Playwright; mock `gapi.client.sheets.spreadsheets.values.append` to resolve successfully; test: fill the expense form with a valid type and amount → submit → entry appears in the today's list → `SyncService.queueLength` is `0` (entry was flushed immediately because online)
  - _Requirements: 8.2_

- [x] 17.5 Create `e2e/offline-mode.spec.ts` using Playwright; use `page.context().setOffline(true)` to simulate offline; test: submit an expense entry → `queueLength` becomes `1` → `page.context().setOffline(false)` → wait for flush → `queueLength` becomes `0` and `batchUpdate` spy was called with the entry
  - _Requirements: 8.2, 8.3_

- [x] 17.6 Create `e2e/pwa-install.spec.ts` using Playwright; inject a mock `beforeinstallprompt` event via `page.evaluate`; navigate to `/settings` → install button is visible → click install button → `deferredPrompt.prompt()` was called
  - _Requirements: 10.3, 10.4_

- [x] 17.7 Checkpoint — run `ng test --run` for all unit and integration tests and `npx playwright test` for E2E tests; ensure all tests pass; fix any failures before marking this task complete
  - Ensure all tests pass, ask the user if questions arise.
