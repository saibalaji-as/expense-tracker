# Family Sync Centralization Plan ("Family Ledger")

**Date:** 2026-07-14
**Status:** Proposed
**Problem:** Entries logged from the widget/notification are not reaching the partner. Opening the app doesn't sync them; only editing some expense (which triggers `pushFamilyState`) does. This is the third family-sync loss bug in one month (clobbering fix 2026-07-11, widget sync-tag fix 2026-07-11, this one). The architecture makes this bug class recurring.

---

## 1. Why this keeps happening — flow analysis

There are **four capture paths** and each has its **own bespoke sync implementation**:

| # | Path | Family-sync code | Merge logic |
|---|------|------------------|-------------|
| 1 | App UI mutations (`addEntry`, `updateEntry`, …) | `markLocalChangeAndPersist` → `pushFamilyState()` (client Firestore transaction) | `family-state-merge.ts` (TS, app) |
| 2 | Widget/notification save, app closed | `WidgetExpenseSyncWorker` → CF `syncWidgetExpenseToFamily` | duplicated merge in `widget-sync.ts` (TS, functions) |
| 3 | Widget/notification save, app opened later | `flushPendingWidgetExpenses` (~250 lines) → `pushFamilyState()` | its own account/debt/CC application logic (TS, app) |
| 4 | Partner receive | `FamilySyncService` onSnapshot → incoming merge | `family-state-merge.ts` again |

**Four merge/apply implementations across three codebases (Angular TS, Functions TS, Android Java).** Every new record kind (adjustment, cc-payment, debtId entries…) must be wired into all of them. Missing one call site = silent partner loss. That is exactly the recurring bug.

Structural weaknesses of the current `families/{id}/state/current` full-state doc:

1. **Correctness is event-triggered, not reconciliation-based.** Sync happens only if the right code path remembered to call `pushFamilyState` at the right moment. `familyPushPending` retries only fire on resume/online events.
2. **The whole backup doc lives in ONE Firestore document.** Hard 1 MiB limit — with growing expense history + accounts + debts + adjustments + payments + 1000 tombstones, this WILL hit the ceiling, and then every push fails permanently. Every push also rewrites the entire history (bandwidth + contention).
3. **Own-write suppression via `lastWriter` + revision counters** is fragile (the boot-ordering clobbering bug of 07-11 came from exactly this).
4. **Hand-rolled offline queue** (widget queue tags, `familyPushPending`, retry-on-resume) reimplements — badly — what Firestore's SDK offline persistence does natively.

### Immediate root-cause note (do this before anything else)

The 2026-07-11 fixes (flush → `pushFamilyState` when consumed widget items lack `familySynced`; CF bootstrap instead of 409; id-based queue consumption) are recorded as **never built/deployed**: local Gradle build, `firebase deploy --only functions:syncWidgetExpenseToFamily`, and the two-device test are all still pending. A device running the pre-fix APK shows *precisely* today's symptom (widget logs stuck until an unrelated edit triggers a full-state push). Verify with:

```
firebase functions:list   # check syncWidgetExpenseToFamily update time
adb logcat | grep -E "WidgetExpenseSync|ExpenseStore|FamilySyncService"
```

Deploying that fix likely resolves the *current* incident. The plan below removes the bug class.

---

## 2. Target architecture — Family Ledger

**Principle: one record, one document, one write path, one listener. Firestore is the family sync channel and source of truth for shared records. Drive is a per-user backup only — never part of family correctness.**

### 2.1 Data model

```
families/{familyId}/ledger/{recordId}
{
  type: 'expense' | 'adjustment' | 'debt-payment' | 'account' | 'debt',
  payload: { ...record },        // same shapes as backup doc today, receipt stripped
  updatedAt: ISO string,          // LWW conflict key
  updatedBy: { uid, email, role },
  deleted: boolean                // tombstone — docs are never removed
}
```

- `recordId` = the record's existing id → **all writes are idempotent upserts**. No revision counter, no merge transaction, no tombstone array cap.
- One record = one small doc → no 1 MiB ceiling, pushes send only what changed, listeners receive only what changed.
- Conflict rule: last-write-wins per record by `updatedAt` (same rule the merge util uses today, but enforced per-doc instead of per-full-doc).

### 2.2 One client write path

New `FamilyLedgerService.commit(records: LedgerRecord[])` — the ONLY way anything reaches the partner:

1. Apply to in-memory store + local snapshot (existing offline-first behavior, unchanged).
2. `setDoc` each record into the ledger (batched).
3. **Enable Firestore offline persistence** (`persistentLocalCache`) — currently NOT enabled. The SDK then durably queues writes across app restarts and auto-retries when online. This deletes `familyPushPending`, resume/online retry hooks, revision bookkeeping, and own-write suppression (`snapshot.metadata.hasPendingWrites` distinguishes own optimistic writes).
4. Drive backup stays as-is: debounced `persistToDrive` from local state — secondary, async, never gates family sync.

Every `ExpenseStore` mutation (addEntry, updateEntry, deleteEntry → `deleted: true`, adjustments, debt payments, account/debt edits) calls `commit()`. `pushFamilyState`/`pushState`/`family-state-merge.ts` are deleted.

### 2.3 One server write path (native widget/notification, app closed)

Generalize CF `syncWidgetExpenseToFamily` → `commitFamilyLedger`: accepts `{ familyId, records[] }`, authorizes membership, upserts the same ledger docs with Admin SDK. No merge logic, no bootstrap special-case (upserts need no existing state).

`WidgetExpenseSyncWorker` shrinks to: read queue → POST records to `commitFamilyLedger` → on 2xx tag `familySynced` (keep the 07-11 tag semantics: untagged items are never consumed, force retry). **Delete the entire Java Drive-merge leg (~350 lines)** — Drive is secondary; the app writes the backup on next open, and the entry is already durable in the queue + partner-visible via the ledger. (Single-mode users: items simply wait for app flush, as data is already safe locally.)

### 2.4 App flush becomes trivial

`flushPendingWidgetExpenses` keeps only its local application logic (account/CC resolution), then calls the same `commit()`. All family-push bookkeeping in it is deleted — the SDK owns delivery.

### 2.5 One receive path

`FamilySyncService` listens to `query(ledger, where updatedAt > lastSeenCheckpoint)` (or plain collection snapshot — the local cache makes re-reads free). Per changed doc: upsert/tombstone into the store by `type`, recompute derived UI. First attach after long offline naturally back-fills everything missed — **reconciliation is structural, not event-dependent**.

### 2.6 Balances (phase 2, recommended)

Today account/debt balances are mutated by every writer and merged LWW — concurrent writes can drop a deduction. With a ledger, make balances **derived**: `balance = openingBalance + Σ(adjustments) − Σ(linked expenses) − Σ(payments…)` computed identically on both devices. Deterministic, idempotent, no LWW loss. Until then, keep syncing `account`/`debt` records LWW exactly as today (no behavior change).

### 2.7 Security rules

```
match /families/{id}/ledger/{recordId} {
  allow read, write: if isFamilyMember(id);   // reuse existing helper
}
```

### 2.8 Cost

Two members, a few hundred records/month → hundreds of doc writes + reads/month. Deep inside the free tier; cheaper than rewriting the full-state doc on every push.

---

## 3. Migration plan

**Phase 0 — stop the bleeding (today):** build + install the pending 07-11 APK, deploy `syncWidgetExpenseToFamily`, run the two-device closed-app test. This is the standing fix for the current incident.

**Phase 1 — ledger write+read (one PR):**
1. `firestore.rules` ledger rules + `FamilyLedgerService` (commit + listener + persistent cache).
2. One-time migration: on owner boot, if `state/current` exists and `ledger` is empty → fan out `doc` records into ledger docs. Keep `state/current` frozen read-only as fallback.
3. Switch `ExpenseStore` mutations and incoming-merge to the ledger. Delete `pushFamilyState`, revision logic.
4. CF `commitFamilyLedger` + worker points at it. Tag semantics preserved.
5. Two-device test matrix: app↔app, widget→closed partner, notification→closed partner, offline logging → reconnect, simultaneous edits of same entry.

**Phase 2 — cleanup + hardening:** delete Java Drive leg, `family-state-merge.ts`, CF merge code, state-doc listener; derived balances; convert flush to pure local-apply + commit.

**Phase 3 — nice-to-haves:** see §4.

---

## 4. Attractive ideas (business-analyst hat)

- **Instant partner wake via FCM:** Firestore trigger on ledger writes → data push to the partner's device (fcm.ts infra exists) → local notification "Priya logged ₹450 · Groceries" + widget refresh. Family mode feels alive even with the app closed — a visible Pro-tier differentiator.
- **Sync health chip:** the amber "Syncing" chip already exists; add a Settings "Family sync" panel showing pending-commit count (`SDK pending writes`), last partner activity, and a "force reconcile" button. Kills "is it synced?" support questions.
- **Attribution feed:** the ledger IS an activity feed (who, what, when). A "Family activity" screen = free feature from this architecture, strong retention hook.
- **Conflict toast:** when LWW overwrites a record the local user edited in the last minute, show "Partner also edited Groceries — kept newest". Trust through transparency.
- **Monthly ledger compaction (later, only if needed):** archive records older than N months into a summary doc to cap listener catch-up size.

---

## 5. What gets deleted (the payoff)

- `family-state-merge.ts` + its 12 tests' merge complexity (replaced by per-doc LWW)
- `pushFamilyState`, `familyPushPending`, revision counters, `lastWriter` own-write suppression, first-snapshot special case
- CF merge/bootstrap logic in `widget-sync.ts`
- Java Drive merge leg in `WidgetExpenseSyncWorker` (~350 lines)
- Family-push bookkeeping inside `flushPendingWidgetExpenses`

One write path, one read path, zero hand-rolled offline queues on the Angular side. New entry points (future: Wear OS, shortcuts, import) just call `commit()` and are family-safe by construction.
