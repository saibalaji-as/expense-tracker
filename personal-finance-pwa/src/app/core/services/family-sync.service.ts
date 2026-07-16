import { Injectable, inject, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { getSharedFirestore } from './firestore-db';
import { opSig } from '../utils/family-ledger.util';
import {
  ledgerDocId,
  type LedgerChange,
  type LedgerCopyEntry,
  type LedgerOp,
  type LedgerRecord,
  type LedgerWriter,
} from '../models/family-ledger.model';
import type { BackupDocument } from './google-drive.service';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

export type FamilyStateWriter = LedgerWriter;

const LEDGER_COPY_KEY = 'spenza_family_ledger_copy_v1';

/**
 * Family Ledger sync (docs/family-sync-centralization-plan.md).
 *
 * Durability rules (2026-07-15 hardening — the "flag" fixes):
 * - The ledger copy holds SERVER-ACKED state only: snapshot docs with
 *   `hasPendingWrites` are our own unconfirmed writes and are skipped — they
 *   neither update the copy nor get emitted. Diff pushes therefore keep
 *   re-producing an op until the server confirms it.
 * - The copy is PERSISTED (signatures only) and restored on start, so the
 *   store's divergence guard and delete flags survive app restarts.
 * - Pushing never depends on the listener: `primeNow()` loads the copy on
 *   demand (persisted → one getDocs) so a push can always proceed.
 */
@Injectable({ providedIn: 'root' })
export class FamilySyncService {
  readonly #authService = inject(AuthService);
  readonly #storageService = inject(StorageService);

  readonly familyId = signal<string | null>(null);
  readonly partnerEmail = signal<string | null>(null);
  readonly syncStatus = signal<'idle' | 'connected' | 'error'>('idle');
  readonly lastSyncAt = signal<string | null>(null);
  /** Ops committed but not yet server-acked (UI/diagnostics). */
  readonly pendingAckCount = signal(0);

  #unsubscribe: (() => void) | null = null;
  #familyDocUnsubscribe: (() => void) | null = null;
  /** Server-acked ledger contents, per doc id. Persisted via LEDGER_COPY_KEY. */
  #ledgerCopy = new Map<string, LedgerCopyEntry>();
  #primed = false;
  #primingPromise: Promise<void> | null = null;
  #persistTimer: ReturnType<typeof setTimeout> | null = null;

  readonly #changesSubject = new Subject<{ changes: LedgerChange[] }>();
  readonly #dissolvedSubject = new Subject<void>();

  /** Server-acked ledger doc changes (own unconfirmed writes never appear). */
  readonly changes$: Observable<{ changes: LedgerChange[] }> = this.#changesSubject.asObservable();
  readonly dissolution$: Observable<void> = this.#dissolvedSubject.asObservable();

  isPrimed(): boolean {
    return this.#primed;
  }

  /** Read-only view of the acked ledger copy for the outgoing diff. */
  ledgerCopy(): ReadonlyMap<string, LedgerCopyEntry> {
    return this.#ledgerCopy;
  }

  startListening(familyId: string, currentUid: string): void {
    this.stopListening();
    this.familyId.set(familyId);

    void (async () => {
      try {
        await this.#loadPersistedCopy(familyId);
        await this.#authService.ensureFirebaseSignedInSilently();
        if (this.familyId() !== familyId) return;

        const { collection, doc, onSnapshot } = await import('firebase/firestore');
        const db = await getSharedFirestore();
        const ledgerRef = collection(db, 'families', familyId, 'ledger');
        const familyRef = doc(db, 'families', familyId);

        let retried = false;
        let sawServerSnapshot = false;

        const attachLedgerListener = () => {
          this.#unsubscribe = onSnapshot(ledgerRef, { includeMetadataChanges: true }, (snapshot) => {
            this.syncStatus.set('connected');
            this.lastSyncAt.set(new Date().toISOString());

            const changes: LedgerChange[] = [];
            for (const change of snapshot.docChanges({ includeMetadataChanges: true })) {
              if (change.type === 'removed') continue; // deletions are tombstones, never removals
              // ACK RULE: skip our own unconfirmed writes — the copy tracks
              // server truth only. The acked echo arrives as a later change.
              if (change.doc.metadata.hasPendingWrites) continue;
              const emitted = this.#ingestAckedDoc(change.doc);
              if (emitted) changes.push(emitted);
            }

            const firstSince = !this.#primed;
            this.#primed = true;
            this.#schedulePersistCopy(familyId);
            if (changes.length > 0 || firstSince) {
              this.#changesSubject.next({ changes });
            }

            // One-time migration: empty ledger + legacy full-state doc present.
            if (!sawServerSnapshot && !snapshot.metadata.fromCache) {
              sawServerSnapshot = true;
              if (snapshot.size === 0) void this.#migrateLegacyStateDoc(familyId, currentUid);
            }
          }, (err) => {
            console.warn('[FamilySyncService] Ledger snapshot error:', err);
            this.syncStatus.set('error');
            if (err.code === 'permission-denied') return;
            if (!retried) {
              retried = true;
              setTimeout(() => {
                if (this.familyId() === familyId) attachLedgerListener();
              }, 3000);
            }
          });
        };

        // Family document watcher — detects dissolution so partners can self-exit.
        this.#familyDocUnsubscribe = onSnapshot(familyRef, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (data['status'] === 'dissolved') {
            this.#dissolvedSubject.next();
          }
        }, (err) => {
          console.warn('[FamilySyncService] Family doc listener error:', err);
        });

        console.log('[FamilySyncService] Ledger listener attached for family:', familyId,
          '(persisted copy:', this.#ledgerCopy.size, 'records, primed:', this.#primed, ')');
        attachLedgerListener();
      } catch (err) {
        console.warn('[FamilySyncService] startListening failed:', err);
        this.syncStatus.set('error');
      }
    })();
  }

  stopListening(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#familyDocUnsubscribe?.();
    this.#familyDocUnsubscribe = null;
    if (this.#persistTimer !== null) {
      clearTimeout(this.#persistTimer);
      this.#persistTimer = null;
    }
    this.familyId.set(null);
    this.partnerEmail.set(null);
    this.syncStatus.set('idle');
    this.#ledgerCopy = new Map();
    this.#primed = false;
    this.#primingPromise = null;
  }

  /**
   * Ensures the ledger copy is available WITHOUT depending on the listener:
   * persisted copy first, one getDocs otherwise. A push must never be blocked
   * by listener state (that gate silently stranded partner expenses, 2026-07-15).
   */
  async primeNow(familyId: string): Promise<void> {
    if (this.#primed) return;
    this.#primingPromise ??= (async () => {
      try {
        await this.#loadPersistedCopy(familyId);
        if (this.#primed) return;
        await this.#authService.ensureFirebaseSignedInSilently();
        const { collection, getDocs } = await import('firebase/firestore');
        const db = await getSharedFirestore();
        const snapshot = await getDocs(collection(db, 'families', familyId, 'ledger'));
        for (const docSnap of snapshot.docs) {
          if (docSnap.metadata.hasPendingWrites) continue;
          this.#ingestAckedDoc(docSnap);
        }
        this.#primed = true;
        this.#schedulePersistCopy(familyId);
      } finally {
        this.#primingPromise = null;
      }
    })();
    await this.#primingPromise;
  }

  /**
   * Upserts ledger records (batched, ≤400 per batch). The returned promise
   * resolves on SERVER ACK of every batch — callers should observe it
   * (`.then`/`.catch`) rather than await it on the UI path, since ack can take
   * arbitrarily long offline. Until ack, the copy is unchanged, so diff pushes
   * keep re-producing the same ops — delivery is guaranteed by reconciliation,
   * not by hoping one fire-and-forget call survived.
   */
  async commitRecords(familyId: string, ops: LedgerOp[], writer: LedgerWriter): Promise<void> {
    if (ops.length === 0) return;
    await this.#authService.ensureFirebaseSignedInSilently();
    const { collection, doc, writeBatch } = await import('firebase/firestore');
    const db = await getSharedFirestore();
    const ledgerRef = collection(db, 'families', familyId, 'ledger');
    const updatedAt = new Date().toISOString();

    const commits: Promise<void>[] = [];
    for (let start = 0; start < ops.length; start += 400) {
      const batch = writeBatch(db);
      for (const op of ops.slice(start, start + 400)) {
        const record: LedgerRecord = {
          type: op.type,
          id: op.id,
          payload: op.deleted ? null : op.payload,
          deleted: op.deleted,
          updatedAt,
          updatedBy: writer,
        };
        // JSON round-trip strips undefined values Firestore rejects.
        batch.set(doc(ledgerRef, ledgerDocId(op.type, op.id)), JSON.parse(JSON.stringify(record)));
      }
      commits.push(batch.commit());
    }
    this.pendingAckCount.update((count) => count + ops.length);
    const settle = () => this.pendingAckCount.update((count) => Math.max(0, count - ops.length));
    await Promise.all(commits).then(settle, (err) => { settle(); throw err; });
  }

  /**
   * Fetches specific ledger docs FROM THE SERVER (never the cache — a stale
   * cache miss must not be mistaken for "the CF never wrote it"). Found docs
   * are ingested into the copy and emitted through `changes$` so the store
   * applies any newer version (this is what corrects a stale widget-queue
   * payload instead of letting it revert a partner's edit). Returns the doc
   * ids that do NOT exist server-side — the caller may then trust its local
   * copy and push them. Throws offline; callers keep their verify flags and
   * retry on resume/online.
   */
  async verifyDocs(familyId: string, docIds: readonly string[]): Promise<Set<string>> {
    const missing = new Set<string>(docIds);
    if (docIds.length === 0) return missing;
    await this.#authService.ensureFirebaseSignedInSilently();
    const { collection, documentId, getDocsFromServer, query, where } = await import('firebase/firestore');
    const db = await getSharedFirestore();
    const ledgerRef = collection(db, 'families', familyId, 'ledger');

    const changes: LedgerChange[] = [];
    for (let start = 0; start < docIds.length; start += 10) {
      const chunk = docIds.slice(start, start + 10);
      const snapshot = await getDocsFromServer(query(ledgerRef, where(documentId(), 'in', chunk)));
      for (const docSnap of snapshot.docs) {
        missing.delete(docSnap.id);
        const emitted = this.#ingestAckedDoc(docSnap);
        if (emitted) changes.push(emitted);
      }
    }
    const familyIdNow = this.familyId();
    if (familyIdNow === familyId || familyIdNow === null) {
      this.#schedulePersistCopy(familyId);
      if (changes.length > 0) this.#changesSubject.next({ changes });
    }
    return missing;
  }

  /** Parses an acked snapshot doc into the copy; returns the change if content moved. */
  #ingestAckedDoc(docSnap: QueryDocumentSnapshot<DocumentData>): LedgerChange | null {
    const record = docSnap.data() as LedgerRecord;
    if (!record || typeof record.type !== 'string' || typeof record.id !== 'string') return null;
    const deleted = record.deleted === true;
    const sig = opSig(record.payload ?? null, deleted);
    const prev = this.#ledgerCopy.get(docSnap.id) ?? null;
    if (prev?.sig === sig) return null; // no content change (metadata-only echo)
    this.#ledgerCopy.set(docSnap.id, { sig, deleted, type: record.type, id: record.id });
    return { record, prevSig: prev?.sig ?? null };
  }

  async #loadPersistedCopy(familyId: string): Promise<void> {
    if (this.#primed) return;
    try {
      const raw = await this.#storageService.get(LEDGER_COPY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        familyId?: string;
        records?: [string, LedgerCopyEntry][];
      };
      if (parsed.familyId !== familyId || !Array.isArray(parsed.records)) return;
      this.#ledgerCopy = new Map(parsed.records);
      this.#primed = true; // a previously saved copy means we were primed before
    } catch (err) {
      console.warn('[FamilySyncService] Failed to load persisted ledger copy:', err);
    }
  }

  #schedulePersistCopy(familyId: string): void {
    if (this.#persistTimer !== null) return;
    this.#persistTimer = setTimeout(() => {
      this.#persistTimer = null;
      const payload = JSON.stringify({
        familyId,
        savedAt: new Date().toISOString(),
        records: Array.from(this.#ledgerCopy.entries()),
      });
      void this.#storageService.set(LEDGER_COPY_KEY, payload).catch((err) => {
        console.warn('[FamilySyncService] Failed to persist ledger copy:', err);
      });
    }, 1500);
  }

  /** Fans the legacy `state/current` document out into ledger records — once. */
  async #migrateLegacyStateDoc(familyId: string, currentUid: string): Promise<void> {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await getSharedFirestore();
      const stateSnap = await getDoc(doc(db, 'families', familyId, 'state', 'current'));
      if (!stateSnap.exists()) return; // fresh family — nothing to migrate

      const data = stateSnap.data() as {
        doc?: BackupDocument;
        deletedEntryIds?: string[];
        lastWriter?: LedgerWriter;
      };
      const legacy = data.doc;
      if (!legacy) return;

      const writer: LedgerWriter = {
        uid: currentUid,
        email: this.#authService.userEmail() ?? '',
        role: data.lastWriter?.uid === currentUid ? data.lastWriter.role : 'owner',
      };
      const deleted = new Set(data.deletedEntryIds ?? []);
      const ops: LedgerOp[] = [];
      for (const entry of legacy.expenses ?? []) {
        if (deleted.has(entry.id)) continue;
        ops.push({ type: 'expense', id: entry.id, payload: entry, deleted: false });
      }
      for (const id of deleted) {
        ops.push({ type: 'expense', id, payload: null, deleted: true });
      }
      for (const item of legacy.accountAdjustments ?? []) {
        ops.push({ type: 'adjustment', id: item.id, payload: item, deleted: false });
      }
      for (const item of legacy.debtPayments ?? []) {
        ops.push({ type: 'debt-payment', id: item.id, payload: item, deleted: false });
      }
      for (const item of legacy.accounts ?? []) {
        ops.push({ type: 'account', id: item.id, payload: item, deleted: false });
      }
      for (const item of legacy.debts ?? []) {
        ops.push({ type: 'debt', id: item.id, payload: item, deleted: false });
      }
      console.log('[FamilySyncService] Migrating legacy family state →', ops.length, 'ledger records.');
      await this.commitRecords(familyId, ops, writer);
    } catch (err) {
      // Non-fatal: each device's diff push re-uploads its local state anyway.
      console.warn('[FamilySyncService] Legacy state migration failed:', err);
    }
  }
}
