import { Injectable, inject, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { getSharedFirestore } from './firestore-db';
import { opJson } from '../utils/family-ledger.util';
import {
  ledgerDocId,
  type LedgerChange,
  type LedgerCopyEntry,
  type LedgerOp,
  type LedgerRecord,
  type LedgerWriter,
} from '../models/family-ledger.model';
import type { BackupDocument } from './google-drive.service';

export type FamilyStateWriter = LedgerWriter;

/**
 * Family Ledger sync (docs/family-sync-centralization-plan.md).
 *
 * ONE receive path: a collection listener on `families/{id}/ledger` — every
 * changed record doc is emitted through `changes$` together with the copy this
 * device previously knew (for the store's local-divergence guard).
 *
 * ONE send path: `commitRecords()` — batched idempotent upserts. With the
 * persistent Firestore cache, offline writes are queued durably by the SDK
 * and delivered when connectivity returns, even across app restarts.
 *
 * The legacy full-state document (`state/current`) is migrated into ledger
 * records once, the first time a member attaches to an empty ledger.
 */
@Injectable({ providedIn: 'root' })
export class FamilySyncService {
  readonly #authService = inject(AuthService);

  readonly familyId = signal<string | null>(null);
  readonly partnerEmail = signal<string | null>(null);
  readonly syncStatus = signal<'idle' | 'connected' | 'error'>('idle');
  readonly lastSyncAt = signal<string | null>(null);

  #unsubscribe: (() => void) | null = null;
  #familyDocUnsubscribe: (() => void) | null = null;
  /** This device's view of what the ledger contains, per doc id. */
  #ledgerCopy = new Map<string, LedgerCopyEntry>();
  #primed = false;

  readonly #changesSubject = new Subject<{ changes: LedgerChange[]; primed: boolean }>();
  readonly #dissolvedSubject = new Subject<void>();

  /** Ledger doc changes (own echoes included — the store's apply is idempotent). */
  readonly changes$: Observable<{ changes: LedgerChange[]; primed: boolean }> =
    this.#changesSubject.asObservable();
  readonly dissolution$: Observable<void> = this.#dissolvedSubject.asObservable();

  /** True once the first ledger snapshot arrived — diff pushes are meaningful. */
  isPrimed(): boolean {
    return this.#primed;
  }

  /** Read-only view of the device's ledger copy for the outgoing diff. */
  ledgerCopy(): ReadonlyMap<string, LedgerCopyEntry> {
    return this.#ledgerCopy;
  }

  startListening(familyId: string, currentUid: string): void {
    this.stopListening();
    this.familyId.set(familyId);

    void (async () => {
      try {
        await this.#authService.ensureFirebaseSignedInSilently();
        if (this.familyId() !== familyId) return;

        const { collection, doc, onSnapshot } = await import('firebase/firestore');
        const db = await getSharedFirestore();
        const ledgerRef = collection(db, 'families', familyId, 'ledger');
        const familyRef = doc(db, 'families', familyId);

        let retried = false;

        const attachLedgerListener = () => {
          this.#unsubscribe = onSnapshot(ledgerRef, (snapshot) => {
            this.syncStatus.set('connected');
            this.lastSyncAt.set(new Date().toISOString());

            const changes: LedgerChange[] = [];
            for (const change of snapshot.docChanges()) {
              if (change.type === 'removed') continue; // deletions are tombstones, never removals
              const record = change.doc.data() as LedgerRecord;
              if (!record || typeof record.type !== 'string' || typeof record.id !== 'string') continue;
              const docId = change.doc.id;
              const prev = this.#ledgerCopy.get(docId) ?? null;
              const json = opJson(record.payload ?? null, record.deleted === true);
              this.#ledgerCopy.set(docId, {
                json,
                deleted: record.deleted === true,
                type: record.type,
                id: record.id,
              });
              if (prev?.json === json) continue; // no content change (metadata-only echo)
              changes.push({ record, prevJson: prev?.json ?? null });
            }

            const firstSnapshot = !this.#primed;
            this.#primed = true;
            if (changes.length > 0 || firstSnapshot) {
              this.#changesSubject.next({ changes, primed: true });
            }

            // One-time migration: empty ledger + legacy full-state doc present.
            if (firstSnapshot && snapshot.size === 0 && !snapshot.metadata.fromCache) {
              void this.#migrateLegacyStateDoc(familyId, currentUid);
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

        console.log('[FamilySyncService] Ledger listener attached for family:', familyId);
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
    this.familyId.set(null);
    this.partnerEmail.set(null);
    this.syncStatus.set('idle');
    this.#ledgerCopy = new Map();
    this.#primed = false;
  }

  /**
   * Upserts ledger records (batched, ≤400 per batch). Fire-and-forget by
   * design: with the persistent cache the SDK guarantees delivery, and the
   * commit promise only resolves on server ack (which would hang offline).
   * Errors are logged — the next diff push re-produces any missing ops.
   */
  async commitRecords(familyId: string, ops: LedgerOp[], writer: LedgerWriter): Promise<void> {
    if (ops.length === 0) return;
    await this.#authService.ensureFirebaseSignedInSilently();
    const { collection, doc, writeBatch } = await import('firebase/firestore');
    const db = await getSharedFirestore();
    const ledgerRef = collection(db, 'families', familyId, 'ledger');
    const updatedAt = new Date().toISOString();

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
      batch.commit().catch((err) => {
        console.warn('[FamilySyncService] Ledger batch commit failed (diff push will heal):', err);
      });
    }
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
