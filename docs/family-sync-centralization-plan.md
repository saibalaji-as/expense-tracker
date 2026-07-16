# Family Sync Centralization Plan ("Family Ledger")

**Date:** 2026-07-14 · **Hardened:** 2026-07-15 (see §6)
**Status:** Phase 1 implemented + delivery hardening
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

**Phase 2 — cleanup (DONE 2026-07-15, scope adjusted):**
- Java Drive-merge leg removed for Firestore-family mode only (worker = CF push + tag, early return; queue consumed by app flush). Single/legacy modes KEEP the Drive leg — it is their only background backup, and deleting it would reintroduce the "entry exists only in widget prefs until app open" uninstall-loss risk. Bonus: removes the widget-insight double count (untagged item in both snapshot and queue).
- Legacy CF `syncWidgetExpenseToFamily` source deleted + unexported. **Undeploy manually: `firebase functions:delete syncWidgetExpenseToFamily`.**
- `families/{id}/state/{docId}` rules → read-only (migration is the only remaining reader).
- Flush bookkeeping (`widgetFamilyPushNeeded`/`owesFamilyPush`) deleted — flush ends with an unconditional (no-op-when-in-sync) `pushFamilyLedger()` reconciliation.
- `family-state-merge.ts` is KEPT (plan change): its merge utils now power the family-mode Drive-load merge (§6).
- Derived balances deliberately deferred to their own pass — not mixed into the post-incident observation window.

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

---

## 6. 2026-07-15 incident + delivery hardening (the "delete flag" rules)

Two field failures after Phase 1 deploy: (1) a partner's app-logged expense never arrived until re-logged; (2) a deleted expense resurrected after app reopen, then disappeared on both devices minutes later.

**Root causes (all in Phase 1's delivery discipline, not the ledger model):**
1. Pushes were gated on the listener's first snapshot (`isPrimed`) — a device that logged and closed early pushed NOTHING, not even into the offline queue.
2. Commits were fire-and-forget — "saved" toast ≠ delivered; a stranded tombstone sat in the queue across a restart.
3. The ledger-copy map and deleted-ids set were in-memory — after every restart the divergence guard collapsed to "ledger wins," so the still-live server record resurrected the deleted expense.
4. Drive loads wholesale-replaced state, dropping ledger-applied partner records mid-session; the (racy) absence-tombstone heuristic then non-deterministically deleted or re-persisted records.
5. `settings.component` called `getFirestore()` directly — could silently downgrade the session to a memory-only cache.

**Hardening (implemented 2026-07-15):**
- **Persisted delete flags** (`spenza_family_pending_deletes_v1`): on any delete (entry, debt payment + linked expense, debt, account + adjustments) the ledger doc id is flagged to disk BEFORE the mutation. Enforced both ways until server ack: apply never resurrects a flagged record; diff never re-uploads one and emits its tombstone. Acked tombstones clear the flag. Acked tombstones in the copy win forever (ids are UUIDs, never reused).
- **Persisted, ack-only ledger copy** (`spenza_family_ledger_copy_v1`, content signatures only): snapshot docs with `hasPendingWrites` are skipped — the copy tracks SERVER truth, so diff pushes keep re-producing an op until it is acked. Restored on start; the divergence guard now survives restarts (offline edits can no longer be overwritten at boot).
- **No listener gate:** `primeNow()` loads the copy on demand (persisted → one `getDocs`); a push can always proceed.
- **Ack-tracked pushes:** `familyPushPending` stays true until Firestore confirms the server ack; resume/online re-pushes anything undelivered. `pendingAckCount` signal exposed for diagnostics.
- **Drive loads merge, never clobber** in family mode (`mergeBackupDocumentForFamily`): union with current state, filtered by ledger tombstones + delete flags; the enriched doc is written back to Drive.
- **Absence-tombstone heuristic DELETED** — durable explicit flags made it unnecessary; it was the racy component in failure (2).
- `settings.component` routed through `getSharedFirestore()`.

Verified: app tsc clean, family-ledger.util spec 20/20 (incl. end-to-end delete→restart→snapshot resurrection scenario), expense-store 37/37. Same pending deploy/build/matrix-test checklist as Phase 1, plus two new manual cases: log → force-stop within 3 s → reopen (entry must reach partner); delete offline → kill app → reopen online (must NOT resurrect, partner must see deletion).

---

## 7. 2026-07-16 update-revert fix (verify flags)

**Field failure:** owner logs from widget → partner receives it → the record is edited (v2, synced) → when the owner's app later opens, both devices revert to the original v1.

**Root cause:** the widget queue payload is a *capture-time snapshot*. The `familySynced` tag says the CF already wrote it to the ledger, but the owner's app flush still inserted it as fresh local truth. Since the owner's persisted ledger copy had never seen the record (the CF wrote it server-side while the app was closed), the diff concluded "the ledger is missing this" and pushed v1 — overwriting v2; the partner's LWW apply then reverted too.

**Fix — verify flags (same durable-flag method as deletes):**
- Flush flags every `familySynced`-tagged item's doc id in persisted `spenza_family_pending_verify_v1` (expenses + adjustments). The diff NEVER pushes a flagged record.
- `pushFamilyLedger` first calls `FamilySyncService.verifyDocs()` — a SERVER-only fetch (`getDocsFromServer`; a cache miss must not masquerade as "CF never wrote it") of the flagged docs. Found docs are ingested into the copy and emitted through `changes$`, so a newer partner version replaces the stale queue payload locally instead of being reverted. Docs missing server-side (CF skipped/never wrote) simply clear the flag and the normal push delivers them.
- Offline: verify throws, flags persist, records stay un-pushed (still visible locally from the flush insert), `familyPushPending` stays set so resume/online retries.

Verified: tsc clean, ledger util spec 23/23 (verify-skip, cleared-flag push, stale-payload-corrected cases), expense-store 37/37. Manual case to add to the matrix: widget log (app closed) → partner edits it → owner opens app → owner must show the EDITED version and partner must keep it.

---

## 8. 2026-07-16 widget two-way sync (partner expenses on the widget, app closed)

**Feature:** a partner's logged expense appears on the other member's home-screen widget within seconds, without opening the app.

**Design — display-only overlay, NOT a new sync path:**
- CF `notifyPartnerLedgerWrite` (Firestore trigger on `families/{id}/ledger/{recordId}`): forwards EXPENSE records (live ones only when expense date ≤ 7 days old — caps FCM bursts from bulk reconciles; tombstones always) as high-priority FCM DATA messages to the other member's native device tokens (`users` registry, `ownerUid` + `platform == 'native'`).
- `MyFirebaseMessagingService` (already existed, data payloads were ignored): validates family mode + not-own-record, stores it in `spenza_widget_partner_pending_v1` via new `PartnerPendingStore`, repaints widgets. Runs with the app process dead (not force-stopped).
- Widget render: `snapshot expenses ⊕ overlay ⊕ own queue`. Overlay records override/remove snapshot copies by id (partner edits/deletes reflected); records received at/before the snapshot's `savedAt` are superseded and pruned — once the app's ledger listener rewrites the snapshot, the overlay copy is redundant. Cap 100 records / 14 days.
- INVARIANT: the overlay never touches the queue, the snapshot doc, or any authoritative state. The app's ledger listener remains the single real sync path (AI_RULES). Losing an FCM message loses nothing — only widget freshness until the next app open.
- Requires the partner's device to have notifications enabled (FCM token registered); otherwise the feature silently degrades to today's behavior.

Deploy: `firebase deploy --only functions` (first Firestore-trigger deploy may ask to enable Eventarc/Cloud Run APIs — accept), Gradle build both devices. Test: partner logs/edits/deletes an expense while your app is closed → your widget total and "PARTNER LOGGED LAST" header update within seconds; open the app → totals identical (no double count).
