import { Injectable, inject, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { firebaseConfig } from '../config/firebase.config';
import { AuthService } from './auth.service';
import type { Firestore } from 'firebase/firestore';
import type { FamilyActivityDelta } from '../models/family-sync.model';

@Injectable({ providedIn: 'root' })
export class FamilySyncService {
  readonly #authService = inject(AuthService);

  readonly familyId = signal<string | null>(null);
  readonly partnerEmail = signal<string | null>(null);
  readonly syncStatus = signal<'idle' | 'connected' | 'error'>('idle');
  readonly lastSyncAt = signal<string | null>(null);

  #db: Firestore | null = null;
  #unsubscribe: (() => void) | null = null;
  readonly #processedIds = new Set<string>();
  readonly #activitySubject = new Subject<FamilyActivityDelta[]>();

  readonly activity$: Observable<FamilyActivityDelta[]> = this.#activitySubject.asObservable();

  async #getDb(): Promise<Firestore> {
    if (this.#db) return this.#db;
    const { getApps, initializeApp } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    this.#db = getFirestore(app);
    return this.#db;
  }

  startListening(familyId: string, _currentUid: string): void {
    this.stopListening();
    this.familyId.set(familyId);

    void (async () => {
      try {
        await this.#authService.ensureFirebaseSignedInSilently();
        // Bail if another startListening call superseded this one while awaiting.
        if (this.familyId() !== familyId) return;

        const { collection, query, orderBy, limit, onSnapshot } = await import('firebase/firestore');
        const db = await this.#getDb();
        const activityRef = collection(db, 'families', familyId, 'activity');
        const q = query(activityRef, orderBy('timestamp', 'desc'), limit(200));

        let connectedOnce = false;
        let retried = false;

        const attachListener = () => {
          this.#unsubscribe = onSnapshot(q, (snapshot) => {
            const newDeltas: FamilyActivityDelta[] = [];
            for (const docSnap of snapshot.docs) {
              const activityId = docSnap.id;
              if (!this.#processedIds.has(activityId)) {
                this.#processedIds.add(activityId);
                newDeltas.push({ activityId, ...docSnap.data() } as FamilyActivityDelta);
              }
            }
            if (!connectedOnce) {
              connectedOnce = true;
              this.syncStatus.set('connected');
            }
            this.lastSyncAt.set(new Date().toISOString());
            if (newDeltas.length > 0) {
              this.#activitySubject.next(newDeltas);
            }
          }, (err) => {
            console.warn('[FamilySyncService] Firestore error:', err);
            this.syncStatus.set('error');
            if (!retried) {
              retried = true;
              setTimeout(() => {
                if (this.familyId() === familyId) {
                  attachListener();
                }
              }, 3000);
            }
          });
        };

        console.log('[FamilySyncService] Firestore listener attached for family:', familyId);
        attachListener();
      } catch (err) {
        console.warn('[FamilySyncService] startListening failed:', err);
        this.syncStatus.set('error');
      }
    })();
  }

  stopListening(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.familyId.set(null);
    this.partnerEmail.set(null);
    this.syncStatus.set('idle');
    this.#processedIds.clear();
  }

  async pushDelta(familyId: string, delta: Omit<FamilyActivityDelta, 'activityId'>): Promise<void> {
    await this.#authService.ensureFirebaseSignedInSilently();
    const { collection, addDoc } = await import('firebase/firestore');
    const db = await this.#getDb();
    await addDoc(collection(db, 'families', familyId, 'activity'), delta);
  }
}
