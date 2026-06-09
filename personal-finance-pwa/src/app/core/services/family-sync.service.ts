import { Injectable, inject, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { firebaseConfig } from '../config/firebase.config';
import { AuthService } from './auth.service';
import type { BackupDocument } from './google-drive.service';
import type { Firestore } from 'firebase/firestore';

export interface FamilyStateWriter {
  uid: string;
  email: string;
  role: 'owner' | 'partner';
}

@Injectable({ providedIn: 'root' })
export class FamilySyncService {
  readonly #authService = inject(AuthService);

  readonly familyId = signal<string | null>(null);
  readonly partnerEmail = signal<string | null>(null);
  readonly syncStatus = signal<'idle' | 'connected' | 'error'>('idle');
  readonly lastSyncAt = signal<string | null>(null);

  #db: Firestore | null = null;
  #unsubscribe: (() => void) | null = null;
  #familyDocUnsubscribe: (() => void) | null = null;
  #processedIds = new Set<string>();

  readonly #stateSubject = new Subject<{ doc: BackupDocument; revision: number }>();
  readonly #dissolvedSubject = new Subject<void>();

  readonly state$: Observable<{ doc: BackupDocument; revision: number }> = this.#stateSubject.asObservable();
  readonly dissolution$: Observable<void> = this.#dissolvedSubject.asObservable();

  async #getDb(): Promise<Firestore> {
    if (this.#db) return this.#db;
    const { getApps, initializeApp } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    this.#db = getFirestore(app);
    return this.#db;
  }

  startListening(familyId: string, currentUid: string): void {
    this.stopListening();
    this.familyId.set(familyId);

    void (async () => {
      try {
        await this.#authService.ensureFirebaseSignedInSilently();
        if (this.familyId() !== familyId) return;

        const { doc, onSnapshot } = await import('firebase/firestore');
        const db = await this.#getDb();
        const stateRef = doc(db, 'families', familyId, 'state', 'current');
        const familyRef = doc(db, 'families', familyId);

        let connectedOnce = false;
        let retried = false;

        const attachStateListener = () => {
          this.#unsubscribe = onSnapshot(stateRef, (snapshot) => {
            if (!connectedOnce) {
              connectedOnce = true;
              this.syncStatus.set('connected');
            }
            this.lastSyncAt.set(new Date().toISOString());

            if (!snapshot.exists()) return;
            const data = snapshot.data() as {
              doc: BackupDocument;
              lastWriter: FamilyStateWriter;
              updatedAt: string;
              revision: number;
            };

            // First snapshot: always emit regardless of author (fixes initial state transfer for new partner).
            // Subsequent snapshots: only emit if the remote writer is not the current user.
            const isFirstSnapshot = this.#processedIds.size === 0;
            const snapshotId = `${snapshot.id}-r${data.revision ?? 0}`;
            if (this.#processedIds.has(snapshotId)) return;
            this.#processedIds.add(snapshotId);

            if (!isFirstSnapshot && data.lastWriter?.uid === currentUid) return;
            this.#stateSubject.next({ doc: data.doc, revision: data.revision ?? 0 });
          }, (err) => {
            console.warn('[FamilySyncService] Firestore state snapshot error:', err);
            this.syncStatus.set('error');
            if (err.code === 'permission-denied') return;
            if (!retried) {
              retried = true;
              setTimeout(() => {
                if (this.familyId() === familyId) attachStateListener();
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

        console.log('[FamilySyncService] Firestore state listener attached for family:', familyId);
        attachStateListener();
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
    this.#processedIds = new Set<string>();
  }

  async pushState(
    familyId: string,
    docData: BackupDocument,
    writer: FamilyStateWriter
  ): Promise<void> {
    await this.#authService.ensureFirebaseSignedInSilently();
    const { doc, runTransaction } = await import('firebase/firestore');
    const db = await this.#getDb();
    const stateRef = doc(db, 'families', familyId, 'state', 'current');

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(stateRef);
      const currentRevision: number = snap.exists() ? ((snap.data()['revision'] as number | undefined) ?? 0) : 0;
      // JSON round-trip strips undefined values that Firestore rejects (optional array fields not yet populated).
      const payload = JSON.parse(JSON.stringify({
        doc: docData,
        lastWriter: writer,
        updatedAt: new Date().toISOString(),
        revision: currentRevision + 1,
      }));
      tx.set(stateRef, payload);
    });
  }
}
