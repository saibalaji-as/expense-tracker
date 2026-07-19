import { Injectable, inject, signal } from '@angular/core';
import type { CircleDocument, CircleExpense, CircleMember } from '../models/circle.model';
import { AuthService } from './auth.service';
import { getSharedFirestore } from './firestore-db';

export type CircleSyncStatus = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Firestore sync for Circle Splits (docs/circle-splits-plan.md §6).
 *
 * Separate from FamilySyncService by design: circles are N-member,
 * expense-only, free-tier, and ephemeral. Circle documents are read-only for
 * clients (Functions own membership/status); expense records are written
 * directly under security rules (author-owned, tombstone deletes).
 *
 * Circle data NEVER enters ExpenseStore/Drive backup — the only bridge is the
 * per-head share posted as one ExpenseEntry on Settle Up, done by the UI.
 */
@Injectable({ providedIn: 'root' })
export class CircleSyncService {
  readonly #authService = inject(AuthService);

  readonly circles = signal<CircleDocument[]>([]);
  readonly syncStatus = signal<CircleSyncStatus>('idle');

  /** Expenses of the currently opened circle, tombstones included (UI filters). */
  readonly activeCircleId = signal<string | null>(null);
  readonly activeCircleExpenses = signal<CircleExpense[]>([]);
  readonly expensesStatus = signal<CircleSyncStatus>('idle');

  #circlesUnsubscribe: (() => void) | null = null;
  #expensesUnsubscribe: (() => void) | null = null;
  #listeningUid: string | null = null;

  /** Attach the my-circles listener. Resolves the uid itself; idempotent per uid. */
  async startListening(): Promise<void> {
    this.syncStatus.set('connecting');
    try {
      await this.#authService.ensureFirebaseSignedInSilently();
      const uid = this.#authService.firebaseUid();
      if (!uid) {
        this.syncStatus.set('error');
        return;
      }
      if (this.#listeningUid === uid && this.#circlesUnsubscribe) {
        this.syncStatus.set('connected');
        return;
      }
      this.#detachCircles();
      this.#listeningUid = uid;
      const { collection, onSnapshot, query, where } = await import('firebase/firestore');
      const db = await getSharedFirestore();
      const circlesQuery = query(
        collection(db, 'circles'),
        where('memberUids', 'array-contains', uid),
      );
      this.#circlesUnsubscribe = onSnapshot(
        circlesQuery,
        (snapshot) => {
          const docs = snapshot.docs
            .map((d) => d.data() as CircleDocument)
            .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
          this.circles.set(docs);
          this.syncStatus.set('connected');
        },
        (error) => {
          console.warn('[CircleSync] circles listener error:', error);
          this.syncStatus.set('error');
        },
      );
    } catch (error) {
      console.warn('[CircleSync] startListening failed:', error);
      this.syncStatus.set('error');
    }
  }

  #detachCircles(): void {
    this.#circlesUnsubscribe?.();
    this.#circlesUnsubscribe = null;
    this.#listeningUid = null;
    this.circles.set([]);
  }

  stopListening(): void {
    this.#detachCircles();
    this.closeCircle();
    this.syncStatus.set('idle');
  }

  /** Attach the expense listener for one circle. Idempotent per circle. */
  async openCircle(circleId: string): Promise<void> {
    if (this.activeCircleId() === circleId && this.#expensesUnsubscribe) return;
    this.closeCircle();
    this.activeCircleId.set(circleId);
    this.expensesStatus.set('connecting');
    try {
      await this.#authService.ensureFirebaseSignedInSilently();
      const { collection, onSnapshot } = await import('firebase/firestore');
      const db = await getSharedFirestore();
      const expensesRef = collection(db, 'circles', circleId, 'expenses');
      this.#expensesUnsubscribe = onSnapshot(
        expensesRef,
        (snapshot) => {
          const docs = snapshot.docs
            .map((d) => d.data() as CircleExpense)
            .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
          this.activeCircleExpenses.set(docs);
          this.expensesStatus.set('connected');
        },
        (error) => {
          console.warn('[CircleSync] expenses listener error:', error);
          this.expensesStatus.set('error');
        },
      );
    } catch (error) {
      console.warn('[CircleSync] openCircle failed:', error);
      this.expensesStatus.set('error');
    }
  }

  closeCircle(): void {
    this.#expensesUnsubscribe?.();
    this.#expensesUnsubscribe = null;
    this.activeCircleId.set(null);
    this.activeCircleExpenses.set([]);
    this.expensesStatus.set('idle');
  }

  /** The member seat of the given uid inside a circle, or null. */
  memberForUid(circle: CircleDocument, uid: string | null): CircleMember | null {
    if (!uid) return null;
    return Object.values(circle.members).find((m) => m.uid === uid) ?? null;
  }

  async addExpense(
    circleId: string,
    input: {
      description: string;
      amount: number;
      date: string;
      paidByMemberId: string;
      participantMemberIds: string[];
    },
  ): Promise<void> {
    const authorUid = await this.#requireUid();
    const { doc, setDoc, collection } = await import('firebase/firestore');
    const db = await getSharedFirestore();
    const ref = doc(collection(db, 'circles', circleId, 'expenses'));
    const now = new Date().toISOString();
    const record: CircleExpense = {
      expenseId: ref.id,
      circleId,
      description: input.description.trim(),
      amount: input.amount,
      date: input.date,
      paidByMemberId: input.paidByMemberId,
      participantMemberIds: [...new Set(input.participantMemberIds)],
      authorUid,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    await setDoc(ref, record);
  }

  async updateExpense(
    circleId: string,
    expenseId: string,
    patch: Partial<Pick<CircleExpense, 'description' | 'amount' | 'date' | 'paidByMemberId' | 'participantMemberIds'>>,
  ): Promise<void> {
    await this.#requireUid();
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getSharedFirestore();
    await updateDoc(doc(db, 'circles', circleId, 'expenses', expenseId), {
      ...patch,
      ...(patch.participantMemberIds
        ? { participantMemberIds: [...new Set(patch.participantMemberIds)] }
        : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Tombstone — circle expense docs are never deleted (rules enforce this). */
  async removeExpense(circleId: string, expenseId: string): Promise<void> {
    await this.#requireUid();
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getSharedFirestore();
    await updateDoc(doc(db, 'circles', circleId, 'expenses', expenseId), {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  }

  async #requireUid(): Promise<string> {
    await this.#authService.ensureFirebaseSignedInSilently();
    const uid = this.#authService.firebaseUid();
    if (!uid) throw new Error('Not signed in to Firebase');
    return uid;
  }
}
