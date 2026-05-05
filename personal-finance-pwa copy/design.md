# Design Document — Personal Finance PWA

## Overview

The Personal Finance PWA is a mobile-first Angular 20 application that lets users track daily expenses against self-configured budgets. There is no custom backend: all persistent data lives in the user's own Google Sheet, accessed directly from the browser via the Google Sheets API v4 with OAuth 2.0. The app is fully installable as a PWA, works offline, and sends push notification reminders.

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Angular 20 (standalone, signals, `@if`/`@for`) | Specified; zoneless-ready, modern DX |
| Styling | Tailwind CSS | Specified; no Angular Material/CDK |
| State management | NgRx Signal Store (`@ngrx/signals`) | Signals-native, minimal boilerplate, tree-shakeable |
| Charts | Chart.js via `ng2-charts` wrapper | Lightweight, well-maintained, no Material dependency |
| Offline queue | IndexedDB via `idb` library | Shared between main thread and service worker |
| Push notifications | Angular `SwPush` + `ngsw` | First-party Angular PWA integration |
| Auth | `gapi` + Google Identity Services (GIS) | Required for Sheets API v4 |

### High-Level Flow

```
User → Angular App (browser)
         │
         ├─ Auth_Service ──────────────────► Google OAuth 2.0 (GIS)
         │                                        │
         ├─ Google_Sheets_Service ◄───────────────┘
         │       │  (Sheets API v4)
         │       ▼
         │   User's Google Sheet
         │   (expenses / limits / metadata tabs)
         │
         ├─ Expense_Store (NgRx Signal Store)
         │       │  (in-memory signals)
         │       ▼
         ├─ Sync_Service ──► IndexedDB Offline_Queue
         │
         └─ Notification_Service ──► Angular Service Worker (ngsw)
                                           │
                                           └─► Web Push API
```

---

## Architecture

### Application Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Feature Modules                       │
│  daily-expense │ monthly-expense │ expense-limit        │
│  dashboard     │ settings                               │
├─────────────────────────────────────────────────────────┤
│                    Shared Layer                          │
│  card │ button │ input │ modal │ toast │ chart-base     │
│  currency pipe │ date pipe │ percentage pipe            │
├─────────────────────────────────────────────────────────┤
│                    Core Services                         │
│  Auth_Service │ Google_Sheets_Service │ Expense_Store   │
│  Sync_Service │ Notification_Service                    │
│  Auth_Guard   │ Auth_Interceptor                        │
├─────────────────────────────────────────────────────────┤
│                    Infrastructure                        │
│  Angular Service Worker (ngsw) │ IndexedDB (idb)        │
│  Google Identity Services (GIS) │ gapi client           │
└─────────────────────────────────────────────────────────┘
```

### Routing

All routes are lazy-loaded standalone components protected by `AuthGuard`.

```
/                → redirect → /daily
/daily           → DailyExpenseComponent
/monthly         → MonthlyExpenseComponent
/limits          → ExpenseLimitComponent
/dashboard       → DashboardComponent
/settings        → SettingsComponent
/auth/callback   → AuthCallbackComponent (public)
**               → redirect → /daily
```

### Change Detection Strategy

All feature components use `ChangeDetectionStrategy.OnPush`. State is consumed via Angular signals from the NgRx Signal Store, which triggers fine-grained re-renders without Zone.js involvement. Angular 20's zoneless mode is opted into via `provideExperimentalZonelessChangeDetection()`.

### Authentication Architecture

The app uses the **Google Identity Services (GIS)** library (`accounts.google.com/gsi/client`) for the OAuth 2.0 token flow, combined with the `gapi` client for Sheets API calls. GIS handles the popup/redirect consent flow and token refresh. The access token is stored in memory only; a `gapi_auth_state` flag in `localStorage` signals that the user was previously authenticated so the app can attempt a silent token refresh on load.

```
App Start
   │
   ├─ localStorage has 'gapi_auth_state'?
   │       YES → attempt silent GIS token refresh
   │       NO  → show sign-in screen
   │
   └─ Token obtained → initialise gapi client → proceed to /daily
```

---

## Components and Interfaces

### Core Services

#### `AuthService` (`core/services/auth.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly isAuthenticated: Signal<boolean>;
  readonly userEmail: Signal<string | null>;

  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): string | null;
  // Silently refreshes token; called by AuthInterceptor on 401
  refreshToken(): Promise<string>;
}
```

#### `GoogleSheetsService` (`core/services/google-sheets.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  authenticate(): Promise<void>;
  ensureSheets(sheetId: string): Promise<void>;

  readExpenses(sheetId: string, month: string): Promise<ExpenseEntry[]>;
  writeExpense(sheetId: string, entry: ExpenseEntry): Promise<void>;
  batchUpdate(sheetId: string, rows: ExpenseEntry[]): Promise<void>;

  readLimits(sheetId: string): Promise<ExpenseLimit[]>;
  writeLimits(sheetId: string, limits: ExpenseLimit[]): Promise<void>;

  readMetadata(sheetId: string): Promise<Record<string, string>>;
  writeMetadata(sheetId: string, key: string, value: string): Promise<void>;

  // Observable error channel for API errors
  readonly apiError$: Observable<SheetsApiError>;
}
```

#### `ExpenseStore` (`core/services/expense-store.service.ts`)

Built with NgRx Signal Store (`signalStore`):

```typescript
export const ExpenseStore = signalStore(
  { providedIn: 'root' },
  withState<ExpenseState>({
    entries: [],
    limits: [],
    monthlyIncome: 0,
    selectedMonth: currentMonth(),
    syncStatus: 'idle',   // 'idle' | 'syncing' | 'error'
    isOffline: false,
  }),
  withComputed((store) => ({
    todayEntries: computed(() =>
      store.entries().filter(e => isToday(e.date))
    ),
    selectedMonthEntries: computed(() =>
      store.entries().filter(e => sameMonth(e.date, store.selectedMonth()))
    ),
    limitMap: computed(() =>
      Object.fromEntries(store.limits().map(l => [l.type, l]))
    ),
    budgetRuleSummary: computed(() => computeBudgetRule(store)),
  })),
  withMethods((store, sheetsService = inject(GoogleSheetsService)) => ({
    addEntry(entry: ExpenseEntry): void { ... },
    loadMonth(month: string): Promise<void> { ... },
    loadLimits(): Promise<void> { ... },
    clearLocalData(): void { ... },
  }))
);
```

#### `SyncService` (`core/services/sync.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class SyncService {
  readonly isOnline: Signal<boolean>;
  readonly queueLength: Signal<number>;

  enqueue(entry: ExpenseEntry): Promise<void>;
  flushQueue(): Promise<void>;
  clearQueue(): Promise<void>;
}
```

#### `NotificationService` (`core/services/notification.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly permissionState: Signal<NotificationPermission>;
  readonly isEnabled: Signal<boolean>;
  readonly intervalMinutes: Signal<number>;

  requestPermission(): Promise<void>;
  enable(intervalMinutes: number): Promise<void>;
  disable(): Promise<void>;
  updateInterval(minutes: number): void;
}
```

### Feature Components

#### `DailyExpenseComponent` (`features/daily-expense/`)

- Standalone component, `OnPush`
- Reactive form: `expenseType` (select), `amount` (number), `limit` (readonly), `savings` (computed display)
- Signals: `selectedType`, `currentLimit`, `savings`, `borderClass`
- Injects `ExpenseStore`, `SyncService`
- Template uses `@if`, `@for` control flow

#### `MonthlyExpenseComponent` (`features/monthly-expense/`)

- Month picker (`<input type="month">`) bound to `ExpenseStore.selectedMonth`
- Summary cards: total spent, total limit, net savings
- Donut chart (Chart.js) for Needs/Wants/Savings breakdown
- `<table>` for per-type breakdown (no CDK)

#### `ExpenseLimitComponent` (`features/expense-limit/`)

- Reactive form with `FormArray` for dynamic custom types
- Real-time percentage recalculation via `valueChanges` + signals
- Running total indicator with 80% warning
- Saves to `GoogleSheetsService` on submit

#### `DashboardComponent` (`features/dashboard/`)

- Four chart panels: line (YTD daily), pie (monthly type breakdown), bar (6-month comparison), donut (budget rule)
- `ChartBaseComponent` shared wrapper handles Chart.js lifecycle
- Reacts to `ExpenseStore` signal changes via `effect()`

#### `SettingsComponent` (`features/settings/`)

- Google Sheets connection status display
- Notification toggle + interval slider/input (dual-bound)
- PWA install button (shown only when `beforeinstallprompt` deferred)
- Export CSV button
- Clear Local Data button with confirmation modal

### Shared Components

| Component | Purpose |
|---|---|
| `CardComponent` | Styled container card |
| `ButtonComponent` | Accessible button with variants (primary, danger, ghost) |
| `InputComponent` | Labelled input with error display |
| `ModalComponent` | Confirmation/alert dialog |
| `ToastComponent` | Transient notification banner |
| `ChartBaseComponent` | Chart.js canvas wrapper with lifecycle management |
| `OfflineBannerComponent` | Persistent offline indicator |

### Guards and Interceptors

**`AuthGuard`** (`core/guards/auth.guard.ts`): Functional guard using `inject(AuthService)`. Redirects to `/auth/callback` if `isAuthenticated()` is false.

**`AuthInterceptor`** (`core/interceptors/auth.interceptor.ts`): Functional HTTP interceptor. Attaches `Authorization: Bearer <token>` header to all `googleapis.com` requests. On 401, calls `AuthService.refreshToken()` and retries once.

---

## Data Models

### `ExpenseEntry`

```typescript
interface ExpenseEntry {
  id: string;           // UUID v4, generated client-side
  date: string;         // ISO 8601 date: 'YYYY-MM-DD'
  amount: number;       // Positive decimal, max 2 decimal places
  type: string;         // ExpenseType name or custom type name
  limit: number;        // Snapshot of limit at time of entry
  savings: number;      // limit - amount (can be negative)
  timestamp: string;    // ISO 8601 datetime: 'YYYY-MM-DDTHH:mm:ssZ'
}
```

**Sheet_expenses column mapping**: `date | amount | type | limit | savings | timestamp`
(The `id` field is stored as a 7th column for idempotent sync.)

### `ExpenseLimit`

```typescript
interface ExpenseLimit {
  type: string;                  // Expense type name
  recommendedPercentage: number; // Default from Budget_Rule table
  userPercentage: number;        // User-configured override
  category: BudgetCategory;      // 'Needs' | 'Wants' | 'Savings' | 'Growth' | 'Buffer'
}
```

**Sheet_limits column mapping**: `type | recommendedPercentage | userPercentage | category`

### `BudgetCategory`

```typescript
type BudgetCategory = 'Needs' | 'Wants' | 'Savings' | 'Growth' | 'Buffer';
```

### `ExpenseType` (predefined)

```typescript
const PREDEFINED_EXPENSE_TYPES: readonly string[] = [
  'Housing', 'Food & Groceries', 'Transportation', 'Utilities',
  'Healthcare', 'Entertainment', 'Dining Out', 'Shopping/Clothing',
  'Savings/Emergency Fund', 'Investments', 'Education',
  'Personal Care', 'Subscriptions', 'Miscellaneous',
] as const;
```

### `BudgetRuleSummary`

```typescript
interface BudgetRuleSummary {
  needsTotal: number;
  wantsTotal: number;
  savingsTotal: number;
  needsPercentage: number;
  wantsPercentage: number;
  savingsPercentage: number;
  needsTarget: number;   // 50% of income
  wantsTarget: number;   // 30% of income
  savingsTarget: number; // 20% of income
}
```

### `OfflineQueueEntry`

```typescript
interface OfflineQueueEntry {
  id: string;           // Same as ExpenseEntry.id
  entry: ExpenseEntry;
  enqueuedAt: string;   // ISO 8601 datetime
  retryCount: number;
}
```

Stored in IndexedDB database `pf-pwa-db`, object store `offline-queue`, keyed by `id`.

### `AppMetadata` (Sheet_metadata key-value pairs)

| Key | Value |
|---|---|
| `monthlyIncome` | Numeric string |
| `sheetVersion` | Schema version string |
| `lastSyncAt` | ISO 8601 datetime |

### Default Budget Rule Percentages

| Expense Type | Category | Recommended % |
|---|---|---|
| Housing | Needs | 25% |
| Food & Groceries | Needs | 10% |
| Transportation | Needs | 8% |
| Utilities | Needs | 5% |
| Healthcare | Needs | 5% |
| Entertainment | Wants | 5% |
| Dining Out | Wants | 5% |
| Shopping/Clothing | Wants | 8% |
| Savings/Emergency Fund | Savings | 10% |
| Investments | Savings | 10% |
| Education | Growth | 5% |
| Personal Care | Wants | 3% |
| Subscriptions | Wants | 4% |
| Miscellaneous | Buffer | 2% |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Data Model Serialization Round-Trip

*For any* valid `ExpenseEntry`, `ExpenseLimit`, or metadata key-value pair, serializing it to the Google Sheets row format (array of strings) and then deserializing it back must produce a value with equivalent field values — no data is lost or corrupted in the conversion.

**Validates: Requirements 2.2, 2.3, 2.5, 2.6**

### Property 2: Batch Serialization Consistency

*For any* array of `ExpenseEntry` objects, the result of batch-serializing the entire array must equal the result of individually serializing each entry and collecting the results — batch and single-entry serialization must be equivalent.

**Validates: Requirements 2.4**

### Property 3: API Error Propagation

*For any* HTTP error status code (4xx or 5xx) returned by the Google Sheets API, the `GoogleSheetsService` must emit the error on its `apiError$` observable and must not silently swallow it or resolve the returned promise successfully.

**Validates: Requirements 2.7**

### Property 4: Savings Calculation Invariant

*For any* expense entry with a given `amount` and `limit`, the `savings` field must always equal `limit - amount`, regardless of the expense type, category, or sign of the result.

**Validates: Requirements 3.3**

### Property 5: Limit Auto-Populate Correctness

*For any* set of `ExpenseLimit` records loaded into the `Expense_Store`, selecting any expense type in the daily expense form must auto-populate the limit field with exactly the `userPercentage`-derived limit for that type — no other type's limit may appear.

**Validates: Requirements 3.2**

### Property 6: Form Submission Adds Entry to Store and Queue

*For any* valid expense form submission (non-empty type, positive amount), the resulting `ExpenseEntry` must appear in the `Expense_Store`'s in-memory entries and in the `Offline_Queue` after submission, with all field values matching the submitted form data.

**Validates: Requirements 3.4**

### Property 7: Border Indicator Correctness

*For any* expense form state where `amount > 0` and `limit > 0`, the border indicator class must be `'red'` if and only if `amount > limit`, and `'green'` if and only if `amount <= limit` — no other combination is valid.

**Validates: Requirements 3.5, 3.6**

### Property 8: Today's Entries Ordering

*For any* collection of `ExpenseEntry` records logged on the current day, the list displayed on the Daily Expense Page must contain exactly those entries and must be ordered by `timestamp` in descending order (most recent first).

**Validates: Requirements 3.7**

### Property 9: Form Validation Rejects Invalid Input

*For any* expense form submission where the type is empty or the amount is zero or negative, the `Expense_Store` must remain unchanged and at least one inline validation error message must be visible in the form.

**Validates: Requirements 3.8**

### Property 10: Monthly Filter Completeness

*For any* collection of `ExpenseEntry` records and any target month string in `YYYY-MM` format, filtering entries by that month must return exactly those entries whose `date` field falls within that calendar month — no entries from other months may appear, and no matching entries may be omitted.

**Validates: Requirements 4.3**

### Property 11: Monthly Summary Aggregation Correctness

*For any* collection of `ExpenseEntry` records for a given month and the corresponding `ExpenseLimit` records, the displayed summary values (total spent, total limit, net savings) must equal the correct arithmetic aggregations: `totalSpent = sum(entry.amount)`, `totalLimit = sum(limit.calculatedAmount)`, `netSavings = totalLimit - totalSpent`.

**Validates: Requirements 4.4**

### Property 12: Budget Rule Category Proportions

*For any* collection of `ExpenseEntry` records and `ExpenseLimit` records, the budget rule chart data must correctly assign each entry's amount to its category (Needs / Wants / Savings), and the three category totals must sum to the total amount spent with no entries double-counted or omitted.

**Validates: Requirements 4.5, 6.4**

### Property 13: Income-Based Limit Calculation

*For any* positive monthly income value and any percentage value in [0, 100], the calculated limit amount for an expense type must equal `income × (percentage / 100)`, and changing the percentage must immediately update the calculated amount to reflect the new formula result.

**Validates: Requirements 5.2, 5.4**

### Property 14: Running Total and Overspend Warning

*For any* set of configured expense type percentages, the displayed running total must equal the arithmetic sum of all percentages, and the visual overspend warning must be shown if and only if the sum of Needs + Wants percentages exceeds 80.

**Validates: Requirements 5.5**

### Property 15: Chart Data Aggregation Correctness

*For any* collection of `ExpenseEntry` records, the chart data computation functions must produce correct aggregations: the daily line chart must have one data point per day with the correct sum of that day's entries; the monthly bar chart must have one bar per month with the correct monthly total; the type breakdown pie chart must have one slice per type with the correct type total — and in all cases the sum of all data points must equal the total of all input entries.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 16: Chart Reactivity to State Changes

*For any* initial `Expense_Store` state, adding a new `ExpenseEntry` to the store must cause all dashboard chart data signals to update to reflect the new entry — no chart may display stale data after a state change.

**Validates: Requirements 6.6**

### Property 17: Notification Interval Slider-Input Binding

*For any* interval value set via the range slider, the numeric input must display the same value, and for any value set via the numeric input, the range slider must reflect the same value — the two controls must always be in sync.

**Validates: Requirements 7.3**

### Property 18: Notification Interval Bounds and Propagation

*For any* integer value provided as the reminder interval, the `NotificationService` must store a value clamped to [15, 480] minutes, and the `updateInterval` call must be made with the clamped value immediately upon change without requiring an app restart.

**Validates: Requirements 7.3, 7.4**

### Property 19: CSV Export Completeness

*For any* collection of `ExpenseEntry` records, the exported CSV file must contain exactly one data row per entry with all field values correctly formatted, and parsing the CSV back must yield entries with equivalent field values to the originals.

**Validates: Requirements 7.7**

### Property 20: Offline Queue Lifecycle

*For any* `ExpenseEntry` submitted while the device is offline, the entry must appear in the `Offline_Queue`; after a successful online transition and flush, the entry must be absent from the queue and present in the data written to `GoogleSheetsService`; if the flush fails for a specific entry, that entry must remain in the queue with an incremented retry count.

**Validates: Requirements 8.2, 8.3, 8.4, 8.5**

### Property 21: Notification Dispatch Logic

*For any* configured reminder interval and any collection of `ExpenseEntry` records, the notification check function must dispatch a push notification if and only if no entry has a `timestamp` within the last `interval` minutes — entries logged within the interval must suppress the notification, and the absence of any such entry must trigger it.

**Validates: Requirements 9.3, 9.4**

### Property 22: Form Accessibility — Labels and Alt Attributes

*For any* rendered form component in the application, every `<input>` element must have a corresponding `<label>` element whose `for` attribute matches the input's `id`; and every `<img>` element must have a non-empty `alt` attribute, and every icon button must have a non-empty `aria-label` attribute.

**Validates: Requirements 11.5, 11.7**

---

## Error Handling

### Authentication Errors

| Scenario | Handling |
|---|---|
| OAuth popup blocked | Display toast with instructions to allow popups |
| Token refresh fails | Clear auth state, redirect to sign-in with error message |
| Scope not granted | Display specific message; offer re-auth with correct scope |
| Sign-out failure | Force local state clear regardless of API response |

### Google Sheets API Errors

| HTTP Status | Handling |
|---|---|
| 401 Unauthorized | `AuthInterceptor` refreshes token and retries once |
| 403 Forbidden | Toast: "Insufficient permissions — check Sheet sharing settings" |
| 404 Not Found | `ensureSheets()` creates missing tabs; retry original request |
| 429 Rate Limited | Exponential backoff with jitter (max 3 retries) |
| 5xx Server Error | Toast with retry button; entry retained in offline queue |
| Network timeout | Treat as offline; enqueue to `Offline_Queue` |

All errors are emitted through `GoogleSheetsService.apiError$` so any component can subscribe for global error handling. The `ToastComponent` subscribes to this stream in `AppComponent`.

### Form Validation Errors

- Invalid/missing amount: inline error below input field
- Negative amount: inline error "Amount must be greater than 0"
- Savings below 20%: warning dialog requiring explicit confirmation before save
- Combined Needs+Wants > 80%: visual indicator on running total (does not block save)

### Offline Queue Errors

- Individual entry flush failure: entry retained, `retryCount` incremented
- After 5 failed retries: entry flagged with `failed` status; user notified via toast with manual retry option
- IndexedDB unavailable (private browsing): fall back to `localStorage` with a capacity warning

### Service Worker Errors

- Registration failure: app continues without offline support; user notified once
- Push subscription failure: notification toggle disabled with explanatory message

---

## Testing Strategy

### Unit Tests (Jasmine + Angular TestBed)

Focus on specific examples, edge cases, and error conditions:

- `AuthService`: token storage, sign-out state clearing, error message formatting
- `GoogleSheetsService`: row serialization/deserialization, `ensureSheets` logic, error channel emission
- `ExpenseStore`: computed signals (`todayEntries`, `limitMap`, `budgetRuleSummary`), `addEntry` state mutation
- `SyncService`: queue enqueue/dequeue, online/offline transition handling
- `NotificationService`: interval clamping, permission state transitions
- Form validation: required fields, minimum amount, savings warning threshold
- `AuthGuard`: redirect behaviour for unauthenticated users

### Property-Based Tests (fast-check)

Property-based testing is appropriate here because the core logic — serialization, financial calculations, filtering, and state invariants — involves pure functions with large input spaces where edge cases (boundary amounts, special characters in type names, leap-year dates, zero-income edge cases) are best discovered through randomized generation rather than hand-crafted examples.

Use **[fast-check](https://github.com/dubzzz/fast-check)** (TypeScript-native PBT library). Each property test runs a minimum of **100 iterations**.

Tag format for each test: `// Feature: personal-finance-pwa, Property N: <property_text>`

| Property | Test Description | Arbitraries |
|---|---|---|
| P1: Data model serialization round-trip | `fc.record` for `ExpenseEntry`/`ExpenseLimit`/metadata; serialize → deserialize → deep-equal | `fc.string`, `fc.float({ min: 0.01 })`, `fc.constantFrom(...TYPES)` |
| P2: Batch serialization consistency | Any `ExpenseEntry[]`; assert `batchSerialize(arr) === arr.map(serialize)` | `fc.array(fc.record(...))` |
| P3: API error propagation | Any HTTP error code in 400–599; mock API; assert `apiError$` emits | `fc.integer({ min: 400, max: 599 })` |
| P4: Savings invariant | Any `(amount, limit)` pair; assert `savings === limit - amount` | `fc.float`, `fc.float` |
| P5: Limit auto-populate correctness | Any limits array + type selection; assert limit field equals stored limit | `fc.array` of `ExpenseLimit`, `fc.constantFrom` |
| P6: Form submission adds to store and queue | Any valid form data; submit; assert entry in store and queue | `fc.record` for form fields |
| P7: Border indicator correctness | Any `(amount, limit)` pair; assert class is red iff `amount > limit` | `fc.float({ min: 0.01 })` × 2 |
| P8: Today's entries ordering | Any entries array for today; assert displayed list is timestamp-descending | `fc.array`, `fc.date` |
| P9: Form validation rejects invalid input | Any invalid input (empty type, non-positive amount); assert store unchanged, error shown | `fc.oneof(fc.constant(''), fc.float({ max: 0 }))` |
| P10: Monthly filter completeness | Any entries array + month string; assert filter returns exactly matching entries | `fc.array`, `fc.date` |
| P11: Monthly summary aggregation | Any entries + limits; assert totals equal correct arithmetic aggregations | `fc.array`, `fc.float` |
| P12: Budget rule category proportions | Any entries + limits; assert category totals sum to total spent, no double-counting | `fc.array` of `ExpenseEntry` with categories |
| P13: Income-based limit calculation | Any `(income, percentage)` pair; assert `limit === income * (pct / 100)` | `fc.float({ min: 0.01 })`, `fc.float({ min: 0, max: 100 })` |
| P14: Running total and 80% warning | Any percentage array; assert total equals sum, warning shown iff Needs+Wants > 80 | `fc.array(fc.float({ min: 0, max: 100 }))` |
| P15: Chart data aggregation correctness | Any entries array; assert daily/monthly/type aggregations sum to total | `fc.array` of `ExpenseEntry` |
| P16: Chart reactivity to state changes | Any initial state + new entry; assert chart signals update | `fc.record` for `ExpenseEntry` |
| P17: Notification interval slider-input binding | Any interval value; set via slider; assert input shows same value | `fc.integer({ min: 15, max: 480 })` |
| P18: Notification interval bounds and propagation | Any integer; assert stored value clamped to [15, 480] | `fc.integer` |
| P19: CSV export completeness | Any entries array; export CSV; parse back; assert round-trip equality | `fc.array` of `ExpenseEntry` |
| P20: Offline queue lifecycle | Any entries array; enqueue offline; flush online; assert queue empty, entries written | `fc.array` of `ExpenseEntry` |
| P21: Notification dispatch logic | Any `(entries, interval)` pair; assert notification fired iff no entry in last interval | `fc.array`, `fc.integer({ min: 15, max: 480 })` |
| P22: Form accessibility | Any rendered form component; assert all inputs have labels, all images have alt | Component fixture inspection |

### Integration Tests

- Google Sheets API calls: mock `gapi` client; verify correct range notation, value arrays, and error propagation
- Service worker registration: verify `ngsw-worker.js` is registered in production build
- IndexedDB operations: use real IndexedDB in jsdom environment via `fake-indexeddb`

### End-to-End Tests (Playwright)

- Full auth flow: sign in → land on `/daily` → sign out → redirected to sign-in
- Expense entry: fill form → submit → entry appears in today's list → offline queue empty
- Offline mode: disable network → submit entry → queue shows 1 → re-enable network → queue empty, entry in sheet
- PWA install: `beforeinstallprompt` mock → settings page shows install button → click → prompt invoked

### Lighthouse / PWA Audit

- Run `ng build --configuration production` then `lighthouse` CLI against local server
- Assert PWA score ≥ 90, Performance ≥ 80, Accessibility ≥ 90
- Verify manifest, service worker registration, HTTPS redirect (staging environment)
