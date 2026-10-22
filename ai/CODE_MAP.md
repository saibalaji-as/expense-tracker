# Spenza — Code Map (AI navigation memory)

> **Purpose.** This file exists so an AI assistant (or a new engineer) can locate the exact
> file and line to change *before* reading any source. It is a lookup index, not a tutorial.
> Read `ai/PROJECT_CONTEXT.md` for stable architecture/product decisions, `ai/CURRENT_STATE.md`
> for open work, `APPLICATION_GUIDE.md` for the human-readable product guide.
>
> **Rule of use:** find the anchor here → open only that file/region → verify → change.
> Line numbers drift; treat them as *seek hints*, then confirm with `grep -n`.
>
> Last full sweep: 2026-09-02.

---

## 0. Orientation in 30 seconds

| Question | Answer |
|---|---|
| Where is the app? | `personal-finance-pwa/` (repo root also holds `ai/`, `docs/`, `tech-stack-docs/`, `netlify.toml`) |
| Framework | Angular 21, **standalone components, zoneless, signals**, hash routing |
| State | ONE store: `src/app/core/services/expense-store.service.ts` (`@ngrx/signals` signalStore, ~3.4k lines) |
| Source of truth | **Google Drive JSON** (`spenza-backup.json`) + **Firestore** (family ledger, circles, subscription, reminders, FCM) |
| Backend | Firebase Functions in `personal-finance-pwa/functions/` (Node 22, 32 exports) |
| Native | Capacitor Android in `personal-finance-pwa/android/` (25 Java files, 3 custom plugins, 2 home-screen widgets) |
| Auth | `auth.service.ts` — the ONLY owner of Google token + Firebase Auth state |
| Money rules | Category table in `core/models/category-definitions.ts`; settlement maths in `core/utils/circle-settlement.ts`; card maths in `core/utils/credit-card-*.ts` |

**Three golden rules**
1. Never call `getFirestore()` directly — always `getSharedFirestore()` from `core/services/firestore-db.ts`. A stray call downgrades the whole app to a memory-only cache and breaks offline family writes.
2. Never mutate `ExpenseStore` state outside the store. All writes go through store methods so `markLocalChangeAndPersist()` runs.
3. Never rename a storage key in the DO-NOT-RENAME set (§7) — native Java reads them.

---

## 1. Route → component → guard map

`src/app/app.routes.ts` — all routes are lazy `loadComponent`.

| Route | Component file | Guards | Notes |
|---|---|---|---|
| `/` | `features/welcome/welcome.component.ts` | none (public) | Landing page; signed-in users self-redirect to `/daily` |
| `/daily` | `features/daily-expense/daily-expense.component.ts` | auth, setup | + income gate |
| `/monthly` | `features/monthly-expense/monthly-expense.component.ts` | auth, setup | + income gate |
| `/limits` | `features/expense-limit/expense-limit.component.ts` | auth, setup | income-setup target |
| `/finances` | `features/finances/finances.component.ts` | auth, setup, **subscription** (`data.requiresPro: true`) | Pro route |
| `/dashboard` | `features/dashboard/dashboard.component.ts` | auth, setup | + income gate |
| `/settings` | `features/settings/settings.component.ts` | auth, setup | |
| `/splits` | `features/splits/splits-list.component.ts` | auth, setup | |
| `/splits/:id` | `features/splits/circle-detail.component.ts` | auth, setup | |
| `/join/:code` | `features/splits/join-circle.component.ts` | **public** | parks code, bounces to auth |
| `/reminders` | `features/reminders/reminder-list.component.ts` | auth, setup | |
| `/reminders/:id` | `features/reminders/reminder-form.component.ts` | auth, setup | |
| `/notifications` | `features/notifications/notifications.component.ts` | auth, setup | |
| `/mode-select` | `features/mode-selection/mode-selection.component.ts` | auth, setup | |
| `/family-setup` | `features/family-setup/family-setup.component.ts` | auth, setup | |
| `/subscribe` | `features/subscribe/subscribe.component.ts` | `webOnlyGuard` (native → `/settings`) | public on web |
| `/auth/callback` | `features/auth/auth-callback.component.ts` | **public** | |
| `/privacy`, `/terms` | `features/privacy|terms/*.component.ts` | **public** | |
| `**` | → `/daily` | | |

**Add a route:** `app.routes.ts` + `shared/components/bottom-nav/bottom-nav.component.ts` (if it needs a tab).
**Change the income gate:** `core/guards/setup-income-gate.ts:1` (`INCOME_GATED_ROUTES = {/daily,/monthly,/dashboard}`).
**Change Pro gating on a route:** add `canActivate: [subscriptionGuard], data: { requiresPro: true }`.

---

### 1b. Screen anchors (the lines you actually reach for)

| Screen | File | Key anchors |
|---|---|---|
| **Daily** 3416 ln | `features/daily-expense/daily-expense.component.ts` | form :1421 · categories :1434 · visible chips :1626 · daily budget :1715 · per-cat limit :2074 · receipt select/validate :2245 · apply extraction :2279 · editor (rotate/crop/enhance) :2349–2662 · upload :2532 · split bill :2702–2785 · `onSubmit` :2835 · create :2885 · split create :2958 · update :3033 · delete :3377 · voice :3241 · `canManageEntry` :3109 · actor :1528 |
| **Settings** 2958 ln | `features/settings/settings.component.ts` | theme/palette/style :1596–1616 · AI keys :1803/:1818 · push :2008 · daily reminder :2119 · salary :2225/:2260 · budget warnings :2280 · spend prompts :2057 · export :2335 · restore parse :2409 · clear local :2458 · delete account :2474/:2508 · mode switch + merge :2672/:2697 · family invite :2848 · leave :2890 · legal :2941 |
| **Finances** 2223 ln | `features/finances/finances.component.ts` | **layout:** filter chips :349 (`sectionTabs` :1298 · `showSection` :1385) · collapsible rows `data-testid="finance-{account,card,debt}-item"` :391/:571/:1013 (`toggleExpanded` :1410; keys `account:<id>` / `debt:<id>`) · history preview `historyPreview` :1429 · forms :1316–1380 · saveAccount :1652 · saveDebt :1604 · saveCreditCard :1537 · utilisation :1599 · payments :1740/:1889 · account adjust :1787 · card adjust :2042 · refund match :1981 · cycle :1998 · open statement :2011 · reconcile :2122/:2140 |
| **Dashboard** 1681 ln | `features/dashboard/dashboard.component.ts` | quick stats :635–651 · net worth :663 · weekly summary :690 · forecast :704 · local insights :718 · AI payload builders :963–1245 · AI flow :1247–1438 · limit warnings :1446 · charts :1503/:1554/:1607/:1637 · Pro modal :1418 |
| **Monthly** 859 ln | `features/monthly-expense/monthly-expense.component.ts` | totals :440–478 · trends :483/:494 · donut :514/:570 · month nav guards :641 · per-cat maths :723–750 · sparklines :757/:795/:827 |
| **Limits** 759 ln | `features/expense-limit/expense-limit.component.ts` | form :443 · balanced check :505 · amounts :691 · running total :700 · savings % :708 · save :590 · hydrate :627 · execute :720 |
| **Circle detail** 1265 ln | `features/splits/circle-detail.component.ts` | tabs :719 · balances/transfers :746–767 · form validity :897 · saveExpense :909 · bill upload :951 · members :1050–1180 · settle :1250 · share :1227 |
| **Splits list** 290 ln | `features/splits/splits-list.component.ts` | pending-join resume :221 · join code :242 · member chips cap 19 :255 · create :270 |
| **Join circle** 203 ln | `features/splits/join-circle.component.ts` | auth-park :150 · error mapping :173 · claim-vs-new payload :190 |
| **Welcome** (public) 1021 ln | `features/welcome/welcome.component.ts` | landing tokens `:host` :56 · features :828 · pricing :882–897 · FAQ :899 · **Google data-use disclosure** tmpl :733–775 · reveal/count-up :936 · `scrollTo` :992 |
| **Auth callback** 979 ln | `features/auth/auth-callback.component.ts` | **`onSignIn()` :914** (post-login routing :928–937, error mapping :939) · account-switch wipe :953 · decorative mock :755–793 |
| **Notifications inbox** 1175 ln | `features/notifications/notifications.component.ts` | comment chips computed :589 · openLog (create) :745 · openEdit (entry / debt payment) :770 · historyAction (edit / log-again / log) :817 · voice smart-fill + dictation :867 · saveLog :959 · `commitLocally` (waits for local durability, claims inbox item same tick, restores on failure) :1005 · saveExpense :1022 · updateExpense :1048 · saveIncome :1069 · saveCcPayment (**caps at outstanding**) :1092 · updateCcPayment :1117 |
| **Reminder form** 631 ln | `features/reminders/reminder-form.component.ts` | Pro gate `setType` :380 + AI downgrade :440 · form :321 · `canSave` :337 · voice :394–467 · geocode (Nominatim) :470 · map :501–583 · save :587 |
| **Reminder list** 212 ln | `features/reminders/reminder-list.component.ts` | tabs :152 · complete :182 · delete :193 |
| **Family setup** 349 ln | `features/family-setup/family-setup.component.ts` | **owner Pro gate :219** · go-Pro :241 · copy code :260 · partner join + error map :276–308 · owner flow :310 · invite :332 |
| **Mode selection** 122 ln | `features/mode-selection/mode-selection.component.ts` | re-entry guard :88 · single :94 · **family Pro gate :107** (does *not* set mode — family-setup does) |
| **Subscribe** 232 ln | `features/subscribe/subscribe.component.ts` | plans from `PRICING_PLANS` (payment.service.ts) :142 · handoff redeem :168 · upgrade mode :176 · restore :197 · pay :214 |

---

## 2. Startup sequence — `src/app/app.ts` (662 lines)

Constants: `LOADING_TIMEOUT_MS = 30000` :18 · `DRIVE_POLL_INTERVAL_MS = 30000` :19 · `BOOTSTRAP_RETRY_DELAYS_MS = [750, 2000]` :20

| Step | Line | What |
|---|---|---|
| `ngOnInit` | :545 | watchdog, diagnostics, `driveError$` subscription, visibility/focus/online/resume listeners, native taps, `bootstrapData()` |
| `bootstrapData` | :126 | the real boot |
| ↳ await session + backup-mode cache | :128 | `Promise.all([authService.sessionRestored, backupModeService.initialized])` |
| ↳ start subscription listener | :137 | must run before any guard fires |
| ↳ silent token renewal (native, **not awaited**) | :170 | biggest startup-latency fix; handed to background bootstrap |
| ↳ **fast path**: cached startup | :176 | `tryLoadCachedStartupData()` :287 → render from `spenza_drive_backup_snapshot_v1`, then `bootstrapDriveInBackground()` |
| ↳ interactive token needed | :202 | → `/auth/callback` unless on a public page |
| ↳ load Drive config (retried) | :223 | 403 ⇒ `clearToken()` + `/auth/callback` (re-auth, **not** new-user flow) |
| ↳ mode routing | :242 | `null` → `/mode-select`; family w/o ids → `/family-setup` |
| ↳ owner Pro gate | :258 | family **owners** only; partners are free by design |
| ↳ load Drive backup | :273 | `expenseStore.loadFromDrive()` |
| ↳ family sync + poll + redirect | :281 | |
| `bootstrapDriveInBackground` | :332 | cached fast-path continuation; family sync started in `finally` regardless |
| `withBootstrapRetries` | :387 | 3 attempts, 750/2000 ms; **bails on 403** |
| `redirectAfterDataAvailable` | :298 | income gate + native cold-start `/` → `/daily` |
| `tryStartFamilySync` | :407 | restarts if "connected but stale >2 min" |
| `startDrivePollLoop` | :430 | 30 s, only with a `driveFileId` |
| `resumeHandler` | :473 | **200 ms debounce** across visibility+focus+resume (3 concurrent `ensureToken()` = 3 Google pickers) |
| `mapDriveErrorToMessage` | :522 | 401/403/404/network copy |

**Change startup timeout** → :18. **Change poll interval** → :19. **Change what a 403 does at boot** → :223–238.

---

## 3. The store — `core/services/expense-store.service.ts` (3388 lines)

The single largest and most important file. Everything money-related flows through it.

### Module-level exports
| Symbol | Line |
|---|---|
| storage key constants | :52–64 |
| `LocalBackupSnapshot` (interface) | :81 |
| widget queue item types | :98–143 |
| `driveError$` (Subject) | :149 |
| `noCcAccountForExpense$` (Subject) | :152 |
| `widgetCircleExpensePending$` (ReplaySubject 100) | :168 |
| `ExpenseState` (interface) | :172–197 |
| `ExpenseStore = signalStore(...)` | :199 |
| `withState` defaults | :203–224 |
| `withComputed` | :225–382 |
| `withMethods` (deps :385–391) | :384 |

### State (`ExpenseState`, :172)
`entries` · `limits` · `accounts` · `accountAdjustments` · `debts` · `debtPayments` · `debtAdjustments` · `monthlyIncome` · `selectedMonth` (`YYYY-MM`) · `syncStatus` (`idle|syncing|error`) · `isOffline` · `driveFileId` · `receiptFolderId` · `lastKnownDriveModifiedTime` · `pendingSyncIds` :188 (drives the "Syncing" chip) · `pendingCcExpenses` :190 · `balanceDiscrepancies` :192 · `cardOutstandingDiscrepancies` :194

### Computed signals
`todayEntries` :227 · `selectedMonthEntries` :233 · `limitMap` :239 · `budgetRuleSummary` :248 (uncategorised falls back to `Buffer` :279) · `activeAccounts` :330 · `defaultAccount` :332 · `totalAssets` :337 · `activeDebts` :343 · `totalLiabilities` :345 · `netWorth` :351 · `activeDebtCount` :360 · `nextDebtDue` :364

### Closure state (the concurrency machinery)
`localRevision` :393 · `persistedRevision` :394 · `persistQueue` :395 · `syncDriveDebounceTimer` :396 · `backgroundFlushTimer` :400 · `backgroundFlushAttempts` :401 · `BG_FLUSH_BASE_MS = 5000` :404 · `BG_FLUSH_MAX_MS = 5 min` :405 · `applyingRemote` :406 · `familyPushPending` :409 · `ledgerReconcileTimer` :411 · `pendingDeletes` Set :417 · `pendingVerify` Set :464 · `widgetFlushInFlight` :1071

### Methods by concern
**Entries** — `addEntry` :1783 · `addEntries` :1827 · `updateEntry` :2949 · `deleteEntry` :2923 · `setSelectedMonth` :1968 · `setLimitsAndIncome` :2040 · `importFromSheets` :1977 · `restoreFromBackupDocument` :2001
**Accounts** — `addAccount` :2045 · `updateAccount` :2080 · `setDefaultAccount` :2114 · `adjustAccountBalance` :2132 · `deleteAccount` :2232 · `reconcileAccountBalance` :2187
**Debts / cards** — `addDebt` :2336 · `updateDebt` :2408 · `deleteDebt` :2596 · `recordDebtPayment` :2702 · `updateDebtPayment` :2784 · `deleteDebtPayment` :2868 · `recordDebtAdjustment` :2637 · `reconcileCardOutstanding` :2211
**Statements** — `confirmCardStatement` · `saveStatementPdfCheck` · `resolveCardStatementDetection` · `processCardStatementDetections` (helpers `cardRecords` / `processStatementDetections` above `buildBackupDocument`) · computed `expenseEntries` (entries minus card bill payments — use it for every spending view). *Store line anchors below ~:700 shifted by roughly +250 on 2026-10-02 — confirm with `grep -n`.*
**Persistence** — `loadFromDrive` :2986 · `persistToDrive` :3114 · `refreshFromDriveIfChanged` :3188 · `loadFromLocalCache` :1890 · `flushPendingChanges` :3225 · `hasUnsyncedChanges` :3239 · `clearLocalData` :1869 · `clearLocalBackupCache` :1886 · `patchDriveFileId` :3099 · `patchReceiptFolderId` :3103
**Family sync** — `pushFamilyStateNow` :3215 · (private) `pushFamilyLedger` :1661 · `markLocalChangeAndPersist` :1729 · `mergeBackupDocumentForFamily` :1531 · `ledgerStateView` :1638 · `ledgerTombstonedDocIds` :1515 · delete flags :420/:433/:441/:448 · verify flags :467/:480/:487/:499
**Local durability** — `writeSnapshotForRevision` :1925 (serialized by revision; clean write skipped if newer local change) · `writeDirtySnapshotNow` :1947 (called by `markLocalChangeAndPersist`, NOT queued behind Drive) · `whenLocallySaved()` :3539

**Widget bridge** — `flushPendingWidgetExpenses` :1940 (inner :1080) · `listenForWidgetExpenses` :1950 · `normalizeWidgetQueueItem` :937 · `resolvePendingCcExpense` :2263
**Reconciliation** — `derivedRecordsFromDoc` :725 · `normalizeAccountBalances` :731 · `captureBalanceDiscrepancies` :763 · `clearBalanceDiscrepancy` :778 · `normalizeCardOutstandings` :795 · `captureCardDiscrepancies` :832 · `clearCardDiscrepancy` :847
**Delta helpers** — `roundMoney` :518 · `activityActor` :520 · `addAccountDelta` :545 · `accountDeltasForAddedEntries` :550 · `accountDeltasForEntryUpdate` :653 · `accountDeltasForDeletedEntry` :665 · `applyAccountDeltas` :673 · `debtChargesForAddedEntries` :559 · `applyDebtCharges` :570 · `addDebtDelta` :596 · `debtDeltasForEntryUpdate` :604 · `debtDeltasForDeletedEntry` :614 · `applyDebtDeltas` :627
**Doc helpers** — `buildBackupDocument` :854 (self-heals balances :865 and card outstandings :871) · `isBackupDocument` :880 · `readLocalBackupSnapshot` :1393 · `snapshotMatchesActiveMode` :1426 · `writeLocalBackupSnapshot` :1450 · `refreshNativeExpenseWidget` :1475 · `preserveCachedFinanceArrays` :1485 · `dedupeExpensesById` :1558 · `applyBackupDocument` :1568 · `flushDirtyLocalSnapshot` :1628 · `scheduleBackgroundFlush` :1740 · `onSyncSucceeded` :1754

### Write path (memorise this)
```
UI method → store method
  → validate ALL deltas first (applyAccountDeltas :673 throws BEFORE any mutation)
  → patchState
  → markLocalChangeAndPersist() :1729
       localRevision += 1
       ├─ persistToDrive() :3114
       │    persistQueue chain (serialised)  :3117
       │    coalesce: persistedRevision >= revisionRequested → return  :3118
       │    buildBackupDocument()  :3129
       │    snapshot idsBeingPersisted  :3135
       │    writeLocalBackupSnapshot(dirty=true)  :3138   ← durable BEFORE network
       │    googleDriveService.writeBackupFile()  :3139
       │    persistedRevision = max(...)  :3140 ; clear only those ids  :3142
       │    writeLocalBackupSnapshot(dirty=false)  :3149 ; onSyncSucceeded()  :3150
       └─ pushFamilyLedger() :1661 (fire-and-forget)
            primeNow → resolvePendingVerify → diffLedgerState → commitRecords
            familyPushPending cleared only on SERVER ACK  :1704
```
A Drive failure is **never** thrown to the caller (local data is already durable). Errors branch at :3152–3184 — 401 ⇒ clearToken + silent refresh; transient (0/408/429/5xx) ⇒ `syncing` + background flush; 403/404 ⇒ `error` + `driveError$`.

### Read path
`loadFromLocalCache` :1890 (cold start <500 ms; dirty snapshot ⇒ `localRevision=1` and immediate `persistToDrive` :1935) → `loadFromDrive` :2986 (dirty-local wins first :2995; family-Drive branch :3002; null-file guard against the OAuth-client-change wipe :3030) → `applyBackupDocument` :1568 (heal → merge → dedupe → normalize → `localRevision=persistedRevision=0` :1621) → `refreshFromDriveIfChanged` :3188 (**race guard :3190** — never runs while `syncStatus==='syncing'` or `localRevision !== persistedRevision`).

Incoming family ledger: `changes$` subscription :3253 → `applyingRemote = true` :3256 → `applyLedgerChanges` :3258 → debounced 2000 ms persist :3284 → debounced 3000 ms structural reconcile :3294.

### Race/conflict defences (all of them, in one place)
persistQueue serialisation :3117 · revision coalescing :3118 · `idsBeingPersisted` snapshot :3135 · durable-local-before-network :3138 · unsynced guard on refresh :3190 · `applyingRemote` echo guard :1662/:3256 · persisted delete flags (set **before** mutation at :2246/:2608/:2904/:2927) · persisted verify flags for widget-synced records · `widgetFlushInFlight` single-flight :1071 · `dedupeExpensesById` heal :1558 · family Drive reads **merge**, never replace :1531.

### Subjects & effects registered at construction
`loadPendingDeletes()` :3247 · `familySyncService.changes$` :3253 · `dissolution$` :3306 (→ stopListening, clearFamilyState, setMode('single')) · card-utilisation effect :3322 · native reminder/salary effect (1500 ms debounce) :3349 · statement effect (2000 ms debounce) :3371 · widget listener :1953.
Emits: `driveError$` :3092/:3168/:3182/:3209 · `noCcAccountForExpense$` :1281/:1343 · `widgetCircleExpensePending$` :1270 · `budgetThresholdExceeded$` :1817/:1858 · `cardUtilizationCrossed$` :3333.

### Store invariants (do not break these)
- **Overdraft** — `applyAccountDeltas` :673 validates every delta before mutating; missing/archived account throws :692; `!allowOverdraft && next < 0` throws :697. Re-enforced at :2154 and per-item in the widget flush :1243/:1259 (item is **re-queued, never dropped**).
- **Money** — `roundMoney` 2 dp :518 on every balance/outstanding write.
- **Card charges** — only `debtId && source !== 'debt-payment'` counts (:560/:597). Positive nets require an active credit card (:575/:631); negative nets (reversals) always honoured, clamped at 0 (:645).
- **Derived balances** — `AssetAccount.balance` is a **cache**. Regenerated at every boundary: :1911 (cache load), :1593 (Drive apply), :3265 (ledger apply), :865 (persist). `updatedAt` deliberately not bumped.
- **Card anchor** — cards without `openingOutstanding` get it back-solved once :800; `updateDebt` shifts it by the same delta as a manual balance edit :2464.
- **Debt validation** — principal > 0; remaining ≥ 0; `remaining > principal` only for credit cards (:2358/:2485); date `^\d{4}-\d{2}-\d{2}$`; `cardLast4` exactly 4 digits :2438.
- **Zero-outstanding credit cards stay `active`** (never `paid`) so they remain selectable — :2394/:2469/:2772/:2846/:2900.
- **Debt payments** — `amount ≤ remainingBalance` :2718; creates a `Debt Payment` entry with `source:'debt-payment'` :2735; those entries are **immutable from Daily** (`deleteEntry` :2925 / `updateEntry` :2954 throw).
- **Delete cascades** — account blocked if any entry references it :2237; debt blocked if any payment :2601 or linked entry :2604 exists.
- **Budget alert** at ≥ 80 % of `(userPercentage × monthlyIncome)/100` :1813/:1854.
- **Reconciliation** — `keep-stored` posts an audited adjustment only when `|drift| ≥ 0.01` (:2192/:2217); normalization tolerance 0.005 (:739/:808).
- **Widget CC routing** — explicit `debtId` → sole active card → unique `cardLast4` → >1 card parks a `PendingCcExpense` :1232 → 0 cards falls back to the account + `noCcAccountForExpense$` :1249. Widget CC payments capped at `remainingBalance` :1372, duplicate-guarded :1350.
- **Circles** — widget circle expenses never become local entries :1231; the settle auto-log is written by `circle-sync.service.ts:362` calling `addEntry`.

---

## 4. Services — one line each + where they live

`src/app/core/services/`

| File | Purpose | Key constants |
|---|---|---|
| `auth.service.ts` | Google OAuth (web GIS / native social-login) + Firebase Auth + Drive scope + subscription handoff | `SCOPE_VERSION='9'`, `TOKEN_EXPIRY_BUFFER_MS=5min`, `ALL_SCOPES` incl. `drive.appdata` |
| `google-drive.service.ts` | All Drive REST v3 I/O with retry/token-refresh wrapper | `maxAttempts=4`, `baseRetryDelayMs=600`, retry on 408/429/5xx/0, one silent refresh on 401 |
| `backup-mode.service.ts` | single/family mode config (`spenza-config.json`) + Preferences mirror | `DRIVE_CONFIG_CACHE_MS = 60_000` |
| `family-sync.service.ts` | Firestore family **ledger** sync (batched, server-acked) | batch ≤ **400**, persist debounce **1500 ms** |
| `circle-sync.service.ts` | Circles (group splitting) listeners + expense/bill CRUD | `CIRCLE_SETTLE_EXPENSE_SOURCE='circle-settle'` |
| `circle-api.service.ts` / `family-api.service.ts` | Authed POST clients for the circle/family Cloud Functions | base `us-central1-spenza-notifications.cloudfunctions.net` |
| `subscription.service.ts` | Live Firestore Pro status + Preferences mirror for widgets | free tier is `isActive: true`; flaky snapshot never downgrades |
| `payment.service.ts` | Razorpay checkout / restore / cancel | 4 hardcoded Cloud Run URLs |
| `notification.service.ts` | Push enable/disable facade + silent native token healing | `FCM_REFRESH_MAX_AGE_MS = 7 days` |
| `fcm.service.ts` | FCM registration (native + web) → `registerToken`/`unregisterToken` | |
| `local-notification.service.ts` | Daily/monthly/budget/card/salary local notifications | ids 1, 2, 999, 30001; budget dedupe **1 h**, card dedupe **6 h** |
| `notification-inbox.service.ts` | Device-local SMS-derived spend inbox (Android) | never synced to Drive/Firestore |
| `reminder.service.ts` | Firestore reminders (datetime + geofence) | `EXPIRY_GRACE_MS = 3 min`, geo timeout 8 s |
| `ai-settings.service.ts` | provider `disabled` / `hosted` / `byok` + key storage | Drive value wins over local |
| `ai-insight.service.ts` | Weekly insights via `generateInsights` | **2/locale/day, 5/day total**, 12 cache entries, stale TTL 7 d |
| `ai-receipt-extraction.service.ts` | Gemini receipt extraction via `extractReceipt` | inline max **5 MB** |
| `ai-voice-expense.service.ts` / `ai-voice-reminder.service.ts` | transcript → structured expense / reminder | |
| `receipt-extraction.service.ts` | **Local** OCR (Tesseract `eng+tam+hin`) + PDF raster | 3 pages scanned, 4 stored, target **120 KB** |
| `receipt-extraction-session.service.ts` | root-scoped extraction session (survives route teardown) | monotonic `runId` guard |
| `daily-expense-draft.service.ts` | in-memory Daily form draft (not persisted by design) | |
| `theme.service.ts` | theme/palette/style + native widget restyle | default theme **light**, palette `violet`, style `glass` |
| `i18n.service.ts` | en / ta / hi dictionaries | key `spenza_language` |
| `currency.service.ts` | INR / USD / AED + Intl cache | key `spenza_currency`, default locale `en-IN` |
| `storage.service.ts` | the single Capacitor Preferences gateway | owns `notification_preferences` |
| `sync.service.ts` | online/offline signal (legacy queue removed) | |
| `sync-diagnostics.service.ts` | ring buffer of Drive/auth failures shown in Settings | `MAX_EVENTS = 50` |
| `spend-notification-access.service.ts` | Android notification-listener permission bridge | |
| `user-feedback.service.ts` | global toast channel | errors persistent by default |
| `firestore-db.ts` | **`getSharedFirestore()`** — the only allowed Firestore factory | persistent IndexedDB cache |
| `budget-events.ts` | `budgetThresholdExceeded$`, `cardUtilizationCrossed$` | thresholds literal `30 | 80` |
| `google-maps-loader.service.ts` | lazy Maps JS for location reminders | |

---

## 5. Utils — the algorithms

`src/app/core/utils/`

| File | The algorithm | Change here for |
|---|---|---|
| `circle-settlement.ts` | **Integer paise** everywhere. Equal split: participants deduped + **sorted by memberId**, `base = floor(total/n)`, first `remainder` participants get +1 paisa (:39). Balances :93. Family roll-up :155 (families never change per-person shares). Greedy transfer minimisation, ties by memberId, ≤ n−1 transfers :227. Share summary text :284. | split rounding, who-pays-whom, family aggregation |
| `credit-card-statement.ts` | Stored statements: `isConfirmedStatement`, `confirmedStatements`, `confirmedStatementFor`, `upsertStatementHistory`, `STATEMENT_HISTORY_LIMIT=36`. Legacy `source:'derived'` is never the truth. | statement storage |
| `credit-card-cycle.ts` | THE card engine: `cardCycleState` (status none/estimated/pending/confirmed; total = billDue + unbilledSpend), `planStatementConfirmation` + `isCleanConfirmation`, `outstandingAsOf`, `cardCycleWindows`/`cardCycleActivity`, `expenseOnlyEntries`, `resolveDetectionCard`, date-only helpers. | card maths |
| `card-statement-message.ts` | `parseStatementMessage` — bank statement SMS/email text → total due, min due, due date, last-4. Mirrors Java `SpendNotificationClassifier.parseStatement`. | paste-message + capture |
| `pdf-js.ts` | `loadPdfJs()` — the only pdf.js loader (legacy build + worker asset `pdfjs/pdf.worker.mjs` copied by angular.json). | receipts + statement PDFs |
| `pdf-text-lines.ts` | `buildPdfTextLines` — pdf.js items → lines with column segments; repairs web-printed (Chromium) statements: private-use glyph decoding (`privateUseGlyphMap`), U+0000 spaces, kerning spaces. | PDF text repair |
| `card-statement-pdf.ts` | `parseBankStatementLines` (plain or positioned lines; summary read per column; sign meaning settled by printed totals), `compareStatementWithLedger` (amount + date ±3 d, one-to-one). | bank PDF check |
| `card-statement-export.ts` · `account-export.ts` · `file-download.ts` | `cardStatementCsv` (per bill cycle; exports `csvRow`/`csvCell`); `assetAccountCsv` / `debtCsv` / `allAccountsCsv` (full ledgers, running balance closes on the on-screen balance); `deliverTextFile` / `deliverDataUrlFile` → `FileDelivery` (native app: `FileExport` plugin → Downloads/Spenza, else share sheet; browser: share/download) + `deliveryDetail`. **Never use `<a download>` directly — Android WebView ignores it.** | statement / account / backup / bill export |
| `credit-card-insights.ts` | `UTILIZATION_THRESHOLDS=[30,80]` · `crossedUtilizationThreshold` (**upward only**) · `matchRefundCandidates` (**90-day** window, exact amount, max 3, unclaimed only) · `cashbackEarned` | utilisation alerts, refund matching |
| `credit-card-reminders.ts` | `buildCreditCardReminderPlan`: statement ask bill+1/+2/+3 (slots 0–2) + next bill+1 (3); due −3/−2/−1 at 09:00 (4–6); due day 06/09/12/18 (7–10); overdue (11); next-cycle safety net (12). `SLOTS_PER_CARD=16`, id base `20000 + (hash%600)*16`; old 8-slot ids still cancelled. Due reminders only while bill due > 0. | card reminder timing/copy |
| `family-ledger.util.ts` | `opSig` :69 content signature; `diffLedgerState` :115 outgoing minimal ops with `pendingDeletes` / `pendingVerify` / tombstone guards; `applyLedgerChanges` :188 incoming with the **divergence guard** (`localSig !== prevSig` ⇒ skip, local edit wins next push) | family merge correctness |
| `derived-balance.util.ts` | Balances derived from records, never from a synced mutable number. `computeDerivedBalances` :34 = `initialBalance + adjustments ± − linked expenses + cash-withdrawals`. `computeDerivedOutstandings` :97 (needs `openingOutstanding` anchor). Discrepancy threshold **0.01** :122/:160 | balance drift, reconciliation banners |
| `family-state-merge.ts` | Legacy whole-document merge: `mergeEntries` :25 (timestamp LWW, tombstones always win, local receipt preserved), `mergeByUpdatedAt` :48, `mergeAddOnly` :62, `mergeBackupDocuments` :78 | family→single merge, legacy push |
| `bill-image.ts` | `BILL_MAX_EDGE_PX=1000`, `BILL_TARGET_BYTES=200_000`, `BILL_HARD_CAP_BYTES=700_000`, quality ladder `[0.8,0.65,0.5,0.4]`, WebP→JPEG fallback, `BillImageTooLargeError` | receipt/bill compression |
| `salary-reminder.ts` | `SALARY_REMINDER_NOTIFICATION_ID=30001`; next `salaryDay` at 20:00 local, skips a month if a salary credit landed within the **5-day** grace window; `isSalaryCredit` = `increase` + `/salary|payroll|wages/i` | salary nudge |
| `notification-inbox.util.ts` | `AUTO_MATCH_AMOUNT_TOLERANCE = 1`; auto-marks a detection handled when a same-day logged expense matches ±1 | SMS auto-match |
| `comment-suggestions.ts` | `commentSuggestionsFor(type, {hour, history})` — personal repeats → Dining Out meal-of-day → curated per-category list (Asian household context). **Mirror:** `WidgetCommentSuggestions.java` | inbox log sheet + widget chips |
| `drive-scope.ts` | `DRIVE_APPDATA_SCOPE`, `grantedScopesIncludeDrive()` — catches a user who unticked the Drive consent box | granular-consent handling |
| `local-date.ts` | `toLocalDateString` / `parseLocalDate` / `formatLocalTime` — **always use these for `YYYY-MM-DD`** | any date handling |
| `reminder-message.ts` | daily reminder copy rotation | |

---

## 6. Data model (canonical) — `src/app/core/models/`

| File | Key exports |
|---|---|
| `expense-entry.model.ts` | `ExpenseEntry` (id, date, amount, type, limit, savings, timestamp, comment?, receipt?, accountId?, debtId?, source?, createdBy*/updatedBy*), `ExpenseReceipt` |
| `expense-limit.model.ts` | `BudgetCategory` (`Needs|Wants|Savings|Growth|Buffer`), `ExpenseLimit` |
| `asset-account.model.ts` | `AssetAccount`, `AccountBalanceAdjustment`, Create/Update/Adjust inputs |
| `debt-account.model.ts` | `DebtAccount` (+ card fields: billGenerationDay, paymentDueDay, minimumPaymentAmount, creditLimit, statement, openingOutstanding), `CardStatement`, `DebtPayment`, `DebtAdjustment` (`refund|cash-withdrawal|charge|cashback`), `DEBT_PAYMENT_EXPENSE_TYPE='Debt Payment'` |
| `category-definitions.ts` | **`CATEGORY_DEFS`** (15 rows) :24 — the single source of truth for names, icons, colour vars, groups, recommended %. `PREDEFINED_EXPENSE_TYPES` :160, `DEFAULT_BUDGET_PERCENTAGES` :177, lookups :194–206 |
| `circle.model.ts` | `CircleMember` (+`familyHeadMemberId`), `familyKeyOf` :30, `CircleDocument`, `CircleExpense`, `CircleExpenseBill`, `CircleInvite`, `PENDING_CIRCLE_JOIN_KEY`, `CIRCLE_SETTLE_LOGGED_KEY`, `ACTIVE_CIRCLES_CACHE_KEY`, `buildCircleLink` :139 |
| `family-ledger.model.ts` | `LedgerRecordType` (8), `LedgerOp`, `LedgerRecord`, `ledgerDocId(type,id)` :46, `LedgerCopyEntry`, `LedgerChange` |
| `family-sync.model.ts` | `FamilyDocument`, `FamilyActivityDelta`, `FamilyInvite` |
| `notification-preferences.model.ts` | `NotificationPreferences` + `DEFAULT_NOTIFICATION_PREFERENCES` (reminder 21:00, budgetWarnings **on**, salary off/day 1) |
| `notification-inbox.model.ts` | `NotificationInboxItem`, kinds, statuses, storage key |
| `budget-rule-summary.model.ts` | `BudgetRuleSummary` (15 numbers) |
| `local-notification.model.ts` | `LocalNotificationSchema`, `BudgetThresholdEvent` |
| `pending-cc-expense.model.ts` | `PendingCcExpense` |
| `app-metadata.model.ts` | `AppMetadata`, metadata key constants |

**Category table (change budget defaults here):** `category-definitions.ts:24`
Housing 30 needs · Food & Groceries 10 needs · Transportation 5 needs · Utilities 3 needs · Healthcare 2 needs · Entertainment 6 wants · Dining Out 7 wants · Shopping/Clothing 7 wants · Savings/Emergency Fund 12 savings · Investments 6 growth · Education 2 growth · Personal Care 5 wants · Subscriptions 5 wants · Miscellaneous 0 buffer · Debt Payment 0 buffer → **needs 50 / wants 30 / savings 12 / growth 8 / buffer 0**

---

## 7. Storage keys (Capacitor Preferences unless noted)

**Auth** `gapi_access_token` · `gapi_access_token_expires_at` · `gapi_auth_state` · `gapi_scope_version` · `gapi_user_email` · `firebase_refresh_token` · `firebase_uid`
**Backup mode** `spenza_backup_mode` · `spenza_shared_file_id` · `spenza_family_folder_id` · `spenza_owner_role` · `spenza_config_file_id` · `spenza_firestore_family_id`
**Family** `spenza_family_ledger_copy_v1` · `spenza_family_pending_deletes_v1` · `spenza_family_pending_verify_v1`
**Circles** `spenza_active_circles_v1` · `spenza_circle_settle_logged_v1` · `spenza_pending_circle_join_v1`
**Queues / snapshot** `spenza_widget_expense_queue_v1` · `spenza_pending_cc_expense_queue_v1` · `spenza_drive_backup_snapshot_v1` · `spenza_widget_promo_dismissed`
**Reconciliation** `spenza_balance_reconciliation_v1` · `spenza_card_reconciliation_v1`
**Card statements** `spenza_card_statement_detections_v1` (shared with Java — contract spec) · `spenza_card_statement_prompt_v1` (local snoozes)
**Notifications** `notification_preferences` · `pf_notif_enabled` · `pf_user_id` · `pf_fcm_last_registration_v1` · `spenza_fcm_pending_token_v1` · `spenza_notification_inbox_v1`
**Prefs / UI** `pf-theme` · `pf-palette` · `pf-style` · `spenza_language` · `spenza_currency` · `spenza_pro_tier` · `spenza_ai_settings_private` · `spenza_sync_diagnostics_v1`
**AI cache** `ai_weekly_insight_cache_v1` · `ai_weekly_insight_usage_v2`
**E2E only (localStorage)** `CapacitorStorage.e2e_subscription_status`

> **DO-NOT-RENAME (read by native Java):** `gapi_access_token`, `gapi_access_token_expires_at`, `firebase_refresh_token`, `pf-style`, `pf-palette`, `spenza_active_circles_v1`, `spenza_widget_expense_queue_v1`, `spenza_fcm_pending_token_v1`, `spenza_notification_inbox_v1`, `spenza_pro_tier`, `spenza_drive_backup_snapshot_v1`, `spenza_backup_mode`, `spenza_shared_file_id`, `spenza_owner_role`, `spenza_firestore_family_id`.
> Contract tests: `core/services/storage-key-contract.spec.ts`, `backup-document-contract.spec.ts`.

---

## 8. Backend — `personal-finance-pwa/functions/src/`

All HTTPS endpoints are `onRequest` (**not** callable), `invoker: 'public'`, with a manual `Authorization: Bearer <Firebase ID token>` check via `auth.ts:4 requireFirebaseUid`. Pro gate: `auth.ts:22 requireProTier` (reads `users/{uid}/subscription/status`).

| Area | File | Exports |
|---|---|---|
| Payments | `razorpay.ts` | `createRazorpaySubscription` :33 (plan id resolved **server-side**), `verifyRazorpayPayment` :128 (HMAC + re-fetch authoritative plan), `cancelRazorpaySubscription` :232 (cycle-end), `restoreRazorpaySubscription` :312 |
| Webhook | `razorpay-webhook.ts` | `razorpayWebhook` :30 (rawBody signature; skips downgrade when `razorpaySubscriptionId` differs), `webhookHealthCheck` :174 |
| Handoff | `subscription-handoff.ts` | `createSubscriptionHandoff` :29 (5-min code), `redeemSubscriptionHandoff` :58 (60 s re-redeem window → custom token) |
| FCM | `fcm.ts` | `registerToken` :6, `unregisterToken` :81 (`ownerUid` ownership check) |
| Schedulers | `send-reminders.ts` :8, `send-due-reminders.ts` :21 | both `every 1 minutes`; transactional slot claim prevents double-send; dead tokens pruned |
| Family | `family.ts` | `createFamily` :32 (**Pro-gated**, idempotent), `createFamilyInvite` :88 (24 h, 8-char code), `dissolveFamily` :137, `leaveFamily` :175, `redeemFamilyInvite` :214 |
| Family ledger | `family-ledger.ts` | `commitFamilyLedger` :64 — the native widget write path; one transaction, reads-before-writes, idempotent by ledger doc id |
| Ledger push | `ledger-push.ts` | `notifyPartnerLedgerWrite` :32 — Firestore trigger → data FCM to the partner's native devices; `FRESH_DAYS=7`, `MAX_DATA_BYTES=3500` |
| Circles | `circles.ts` | `createCircle` :49, `createCircleInvite` :110 (reuses unexpired), `redeemCircleInvite` :174, `previewCircleInvite` :264, `updateCircle` :314 (removal guards, family rules, retro-share rule), `settleCircle` :515, `deleteCircle` :562. `MAX_MEMBERS=20`, `MAX_NAME_LENGTH=40`, `INVITE_TTL=7 d` |
| Google tokens | `google-tokens.ts` | `exchangeGoogleAuthCode` :95 (no Firebase auth — the code is the authz), `getGoogleAccessToken` :193 (410 ⇒ re-consent) |
| AI | `ai-receipt.ts` :77, `ai-insights.ts` :71, `ai-voice.ts` :56, `ai-reminder.ts` :51 | `extractReceipt` (base64 ≤ 7,000,000), `generateInsights` (Groq → Gemini fallback), `parseVoiceExpense` (transcript ≤ 1000), `parseVoiceReminder` (**sign-in only, no Pro gate**) |
| Not deployed | `stripe.ts`, `test-notification.ts` | legacy/unsafe — do not re-export |

Secrets/env: `RAZORPAY_KEY_ID|KEY_SECRET|PLAN_MONTHLY_ID|PLAN_YEARLY_ID|WEBHOOK_SECRET`, `GROQ_API_KEY`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`, `GOOGLE_OAUTH_CLIENT_SECRET`.

---

## 9. Firestore security — `firestore.rules` (167 lines)

Default **deny** at :163. Helpers: `isFamilyMember` :130, `isCircleMember` :137, `isActiveCircleMember` :142, `isCircleOwner` :149, `isProUser` :154.

| Path | Read | Write |
|---|---|---|
| `users/{uid}/subscription/**` :6 | own | **denied** (Functions only) |
| `users/{uid}/reminders/{id}` :15 | own | own, **and location reminders require `isProUser`** |
| `families/{id}` :22 | owner/partner | denied |
| `families/{id}/activity/{id}` :30 | member | create only, `authorUid == auth.uid` |
| `families/{id}/state/{id}` :45 | member | **write-locked legacy** |
| `families/{id}/ledger/{id}` :54 | member | create+update; **delete denied** (tombstones only) |
| `familyInvites/{code}` :60 | owner or unredeemed | denied |
| `circles/{id}` :70 | `uid in memberUids` | denied |
| `circles/{id}/expenses/{id}` :79 | member | active member, `authorUid` immutable, author-or-owner; **delete denied** |
| `.../bill/{id}` :101 | member | create/update by author; **delete allowed** for uploader or owner |
| `circleInvites/{code}` :116 | owner or `revoked == false` | denied |
| `googleTokens/{uid}` :125 | **denied** | **denied** (holds refresh tokens) |

Indexes (`firestore.indexes.json`): collection-group `reminders(type,status,notifiedAt,remindAt)` for `sendDueReminders`; `users(ownerUid,platform)` for token lookups.

---

## 10. Native Android — `android/app/src/main/java/com/spenza/app/`

Plugins registered in `MainActivity.onCreate` :17–19 (before `super.onCreate`): `SpendNotificationAccessPlugin`, `ExpenseWidgetPlugin`, `StreakWidgetPlugin`.

| File | Purpose |
|---|---|
| `MainActivity.java` | BridgeActivity, plugin registration, channels, WebView tuning |
| `ExpenseWidgetProvider.java` | Expense widget rendering; 3 height tiers (<115dp / 115–149 / ≥150) |
| `ExpenseWidgetActivity.java` | Native bottom-sheet quick-entry form + `SpeechRecognizer` voice |
| `WidgetExpenseQueue.java` | JSON queue `spenza_widget_expense_queue_v1`, email-stamped |
| `WidgetExpenseSyncWorker.java` | WorkManager drain: local effects → `commitFamilyLedger` (Firestore family) **or** full Drive round-trip |
| `WidgetExpenseConstants.java` | **All shared-preference key names live here** — mirror any rename |
| `WidgetCategoryPredictor.java` | On-device category prediction (recency decay + time-of-day + weekday); `snapshotExpenses` shared with comment chips |
| `WidgetCommentSuggestions.java` | Type-aware comment chips for `ExpenseWidgetActivity` (`refreshQuickChips` on category change). Mirror of `comment-suggestions.ts` |
| `WidgetSurface.java` / `WidgetTheme.java` | Canvas-rendered widget body for the 4 app styles/5 palettes; bitmap capped at 720 px |
| `StreakWidgetProvider/Plugin/Calculator` + `StreakReminder*` | Daily streak widget + 20:00 reminder (notification id 3001) |
| `SpendNotificationListenerService.java` | Reads bank/UPI notifications, 10-min dedupe, writes inbox, posts prompt |
| `SpendNotificationClassifier.java` | Pure classifier (9 types) |
| `NotificationInbox.java` / `PartnerPendingStore.java` | Device-local, never synced |
| `MyFirebaseMessagingService.java` | Token rotation stash + `family-ledger-record` data messages |
| `NotificationChannelManager.java` | Channels `expense-reminders`, `budget-alerts`, `spend-prompts`, `streak-reminders` |
| `NotificationScheduler.java` / `BootReceiver.java` | AlarmManager rescheduling (codes 1001/1002), boot restore |

---

## 10b. UI shell, shared components and theming

**`shared/components/app-shell/app-shell.component.ts` (520)** — the authenticated chrome around every in-app route.
- desktop sticky top nav :222 (all 9 `navItems` :419 — daily, monthly, limits, finances, dashboard, splits, notifications, reminders, settings)
- mobile top bar :255 with the inbox badge from `notificationInbox.pendingCount()` :283
- portrait floating glass pill nav :327 / landscape left rail :364, both from `mobileNavItems` :434 (first five only)
- global `<app-credit-card-picker>` mounted whenever `pendingCcExpenses().length > 0` :395
- **`showNavigation()` :510** — nav hidden unless authenticated AND (single mode OR family with ids + role). *This is the anchor for "why is the nav missing".*
- constructor :445 — preloads inbox badge, resumes a parked Circle-Link join from `PENDING_CIRCLE_JOIN_KEY`, starts `circleSync.startListening()`, tracks `NavigationEnd`, toasts `noCcAccountForExpense$`
- `onNavTap()` :491 writes `--nav-tap-x/y` for the View-Transition ripple

`shared/components/bottom-nav/*` (73) — legacy `md:hidden` bar (daily/monthly/limits/dashboard/settings); superseded by the app-shell pill.

Other shared components (all `shared/components/<dir>/<dir>.component.ts`): `section-card` (titled panel) · `chart-base` (Chart.js host, re-themes on `class`/`data-palette` mutation) · `sparkline` · `progress-ring` · `themed-select` (ControlValueAccessor) · `modal` · `toast` (renders `UserFeedbackService`) · `category-icon` · `credit-card-picker` (pending-CC overlay) · `offline-banner` · `widget-promo-dialog` · `notification-disclosure` · `spenza-logo` · `theme-toggle` · `button` · `card` · `input`.
Pipes: `currencyFormat` (**impure** — reacts to runtime currency), `dateFormat`, `percentageFormat`, `translate` (**impure** — runtime language switch).
Directive: `input[appClearable]` — native-looking clear affordance, re-dispatches a bubbling `input` event.

**`src/styles.css` (1557)** — the design-token system.
Cascade: `:root` base :9 → `.dark` :92 → `:root[data-palette="rose|azure|emerald|amber"]` + `.dark` twins :166–369 → `:root[data-style="neumorphism|claymorphism|neobrutalism"]` + `.dark` twins :377–584 → `@layer base` :586 → `@layer utilities` :657 → reduced-motion kill-switch :777 → per-style overrides :856 → bump navbar :1096 → View Transitions :1129.
Two orthogonal root attributes are set by `theme.service.ts:136-147`: `data-palette` (recolors `--primary`/`--ring`/gradients/logo) and `data-style` (reshapes shadows/borders/radii). Light vs dark is the independent `.dark` class.
Token families: semantic surface/text (`--background --foreground --card --popover --muted --accent --border --input --ring --backdrop`), intent (`--primary --primary-glow --secondary --destructive --success --warning` + `-foreground`s), **14 category colours** (`--cat-food --cat-dining --cat-transport --cat-housing --cat-utilities --cat-health --cat-education --cat-entertainment --cat-shopping --cat-personal --cat-subscriptions --cat-savings --cat-investments --cat-misc`), radii (`--radius*`), elevation (`--shadow-sm|md|lg|glow`), gradients (`--gradient-primary|success|warm|mesh`), logo (`--logo-*`), style-specific (`--neu-shadow-ink`, `--clay-lip`, `--clay-shadow-ink`, `--nb-ink`), runtime (`--nav-tap-x/y`).
Utilities: `.glass-card` (the standard surface), `.gradient-primary`, `.gradient-text`, `.shadow-glow`, `.scrollbar-none`, `.bump-nav-*`, `.sp-*` (settings style previews).

> Components must consume **only** semantic variables — never a palette value directly — or they break under the other four palettes and four styles.

---

## 11. "Where do I change …" — fast index

| I want to change… | Go to |
|---|---|
| Category list / icons / default budget % | `core/models/category-definitions.ts:24` |
| Budget group totals (50/30/20) | same file, `recommendedPct` column |
| Allocation-balance tolerance (±0.05 of 100) | `features/expense-limit/expense-limit.component.ts:505` |
| Low-savings warning threshold (20 %) | `expense-limit.component.ts:605` |
| Daily budget formula (`income / 30`) | `features/daily-expense/daily-expense.component.ts:1717` |
| Per-category daily limit formula | `daily-expense.component.ts:2074` |
| Receipt max upload size (10 MB) | `daily-expense.component.ts:2259` |
| Accepted receipt MIME types | `daily-expense.component.ts:2255` + template `accept=` :479/:487 |
| Receipt compression targets | `core/utils/bill-image.ts:20-22` |
| OCR confidence auto-apply threshold (0.7) | `daily-expense.component.ts:2288` |
| OCR languages / PDF page caps | `core/services/receipt-extraction.service.ts` (top constants) |
| Split-bill min rows (2) / tolerance (0.01) | `daily-expense.component.ts:1796`, `:1799`, `:2769` |
| Category chips shown before "Show more" (4) | `daily-expense.component.ts:1641` |
| Budget-warning threshold (80 %) | `features/dashboard/dashboard.component.ts:1465` (+ Settings copy :2298) |
| Month forecast formula | `dashboard.component.ts:704` |
| "What if" cut percentages (25 % needs / 50 %) | `dashboard.component.ts:1225` |
| AI daily call limits (2/locale, 5 total) | `core/services/ai-insight.service.ts` (top constants) |
| AI cache TTL / stale TTL | same file |
| Monthly trend sensitivity (±5 %) | `features/monthly-expense/monthly-expense.component.ts:489` |
| Card utilisation thresholds (30/80) | `core/utils/credit-card-insights.ts:98` |
| Refund match window (90 d) / max 3 | `credit-card-insights.ts:128`, `:166` |
| Credit-card reminder ladder & timing | `core/utils/credit-card-reminders.ts` (`DUE_DAY_REMINDER_HOURS`, `DUE_LEAD_DAYS`, `STATEMENT_ASK_DAYS`) |
| Card cycle maths (bill due / unbilled / pending) | `core/utils/credit-card-cycle.ts` |
| Bank statement message patterns | `core/utils/card-statement-message.ts` **and** `SpendNotificationClassifier.java` (`parseStatement`) |
| Bank PDF reading / matching tolerance | `core/utils/card-statement-pdf.ts` · `core/services/card-statement-pdf.service.ts` |
| Statement dialog / auto-prompt window (7 d) | `shared/components/card-statement-prompt/` · `core/services/card-statement-prompt.service.ts` |
| Statements panel (history, PDF check, CSV export) | `shared/components/card-statements/` |
| Circle split rounding | `core/utils/circle-settlement.ts:39` |
| Who-pays-whom minimisation | `circle-settlement.ts:227` |
| Circle member cap (20) | `functions/src/circles.ts` `MAX_MEMBERS` + client `splits-list.component.ts:258` |
| Circle invite TTL (7 d) / family invite TTL (24 h) | `functions/src/circles.ts` / `functions/src/family.ts:88` |
| Family ledger batch size (400) | `core/services/family-sync.service.ts:203` |
| Drive retry policy | `core/services/google-drive.service.ts` (top constants) |
| Drive config cache (60 s) | `core/services/backup-mode.service.ts` |
| Drive poll interval (30 s) / boot timeout (30 s) | `src/app/app.ts:18-19` |
| Notification defaults (21:00, warnings on) | `core/models/notification-preferences.model.ts:12` |
| Salary reminder grace (5 d) / hour (20:00) | `core/utils/salary-reminder.ts` |
| Budget alert dedupe (1 h) / card dedupe (6 h) | `core/services/local-notification.service.ts` |
| Push reminder slots (08:00–22:00) | `functions/src/scheduler-utils.ts:50` |
| Pricing copy (₹499 / ₹3,999) | `features/settings/settings.component.ts` template :162/:168 + `features/subscribe/subscribe.component.ts` |
| What Pro unlocks | see §12 |
| Theme palettes / styles | `core/services/theme.service.ts` + `features/settings/settings.component.ts:1602/1609` + `src/styles.css` |
| Languages | `core/services/i18n.service.ts` + `src/assets/i18n/*.json` |
| Currencies | `core/services/currency.service.ts:19` |
| Legal URLs | `settings.component.ts:2942/2951` |
| Delete-account countdown (10 s) & Drive items removed | `settings.component.ts:1668`, `:2542` |
| Backup export/restore shape | `settings.component.ts:2336` / `:2409` |
| Firestore permissions | `firestore.rules` |
| Server-side plan ids / payment verification | `functions/src/razorpay.ts` |

---

## 12. Pro-tier surface (what is gated, and where)

| Feature | Client gate | Server gate |
|---|---|---|
| `/finances` route | `subscriptionGuard` + `data.requiresPro` in `app.routes.ts` | — |
| Dashboard "Ask AI" insights | `dashboard.component.ts:1248` | `generateInsights` → `requireProTier` |
| Receipt scan (AI) | `daily-expense.component.ts` template :534 | `extractReceipt` → `requireProTier` |
| Voice expense smart-fill | `daily-expense.component.ts` template :216 | `parseVoiceExpense` → `requireProTier` |
| Family mode (create family) | Settings/family-setup | `createFamily` → `requireProTier` (**partner join is free by design**) |
| Spend-notification prompts | `settings.component.ts` template :956 | — (device-local) |
| Budget warnings | `settings.component.ts` template :1057 | — |
| Location reminders | reminder form | **firestore.rules :15** (`isProUser`) |
| Circles / Splits | **free by design** — no `requireProTier` anywhere in `circles.ts` | |

Client `isPro()` is UX only; the security boundary is `requireProTier` + rules.

---

## 13. Tests

| Kind | Where | Run |
|---|---|---|
| Unit (Vitest) | `src/**/*.spec.ts` (~40 files) | `npm test` / `vitest.config.ts` |
| Firestore rules | `firestore-tests/` | `npm run test:rules` (emulator) |
| E2E (Playwright) | `e2e/` | `npm run e2e` → `e2e-report/`, `e2e-results.json` |
| Contract tests worth knowing | `storage-key-contract.spec.ts`, `backup-document-contract.spec.ts`, `account-totals.spec.ts`, `category-definitions.spec.ts`, `circle-settlement.spec.ts`, `credit-card-*.spec.ts`, `family-ledger.util.spec.ts`, `derived-balance.util.spec.ts`, `family-state-merge.spec.ts` | |

**E2E suites** (`e2e/tests/`, ~100 cases): `01-auth` TC-AUTH · `02-onboarding` TC-ONBD · `03-daily-expense` TC-DAILY · `04-monthly` TC-MNTH · `05-limits` TC-LMT · `06-finances-accounts` TC-FIN · `07-finances-debt` TC-DEBT · `08-dashboard` TC-DASH · `09-ai-features` TC-AI · `10-settings` TC-SET · `11-subscription` TC-SUB · `12-offline-pwa` TC-PWA · `13-route-guards` TC-GUARD · `14-reminders` TC-REM · `15-theming` TC-THEME · `16-landing` TC-LAND.
Support: `e2e/fixtures/auth.fixture.ts` (`injectAuthState`, `mockGoogleApis({isPro})`, `seedAuthNoMode`, `mockEmptyDrive`), `fixtures/test-data.ts`, `helpers/page-helpers.ts` (`navigateTo`, `waitForAppReady`, `expectToast`, `confirmDialog`), `global-setup.ts` / `global-teardown.ts`.

**CI** (repo root `.github/workflows/`, *not* inside `personal-finance-pwa`):
- `deploy-firebase.yml` — push to `main`; Node 22, generates `src/environments/environment.prod.ts` from secrets, builds, deploys Hosting + Functions; validates the Razorpay live key placeholder was replaced.
- `e2e.yml` — PR + push to `main` filtered to `personal-finance-pwa/**`; concurrency-cancelled, 30-min timeout, Playwright `webServer` + Firebase emulators. **Gates merges.**

**Rule:** any change to money maths, storage keys, or the backup document shape must update the matching contract spec.

---

## 14. Change-safety checklist

Before editing anything shared, run through this:

1. **Does it touch money?** → update the matching `*.spec.ts` in `core/utils/` and re-run vitest.
2. **Does it touch the backup document shape?** → update `backup-document-contract.spec.ts`, the Settings export (`settings.component.ts:2336`) **and** the restore parser (`:2409`), plus `WidgetExpenseSyncWorker.java` if native writes it.
3. **Does it touch a storage key?** → update `WidgetExpenseConstants.java` and `storage-key-contract.spec.ts`.
4. **Does it touch state that syncs?** → check `family-ledger.util.ts` (`diffLedgerState` / `applyLedgerChanges`) and add the record type to `LedgerRecordType` if new.
5. **Does it add a Firestore read/write?** → add a rule in `firestore.rules` (default-deny) and, if queried, an index.
6. **Does it call Firestore?** → `getSharedFirestore()`, never `getFirestore()`.
7. **Does it add a Pro feature?** → gate on the client *and* in the Function/rules.
8. **Does it change a date?** → use `core/utils/local-date.ts`, never raw `toISOString().slice(0,10)`.
9. **Did you run** `graphify update .` after the change (per `CLAUDE.md`)?
10. **Update** `ai/CURRENT_STATE.md` and append to `ai/TASK_HISTORY.md`.

---

## 15. Known hazards

- `daily-expense.component.ts` (3.4k), `settings.component.ts` (3.0k), `expense-store.service.ts` (3.4k) mix UI, orchestration and business logic — expect wide blast radius.
- Legacy Google Sheets code + IndexedDB queue still exist; do not reactivate Sheets as primary persistence.
- `stripe.ts` and `test-notification.ts` are deliberately **not** exported from `functions/src/index.ts`.
- `families/{id}/state/**` is a write-locked legacy path kept only for migration.
- `PaymentService.detectProvider()` is dead legacy — do not reconnect it to checkout.
- Several Settings/limits toasts are hardcoded English despite i18n being available.
- Some `console.log` debugging remains in production paths.
