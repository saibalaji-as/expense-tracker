import { Injectable, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  ACTIVE_CIRCLES_CACHE_KEY,
  CIRCLE_SETTLE_EXPENSE_SOURCE,
  CIRCLE_SETTLE_LOGGED_KEY,
  type ActiveCircleCacheItem,
  type CircleDocument,
  type CircleExpense,
  type CircleMember,
} from '../models/circle.model';
import type { ExpenseEntry } from '../models';
import { buildShareSummaryText, computeCarriedShare } from '../utils/circle-settlement';
import { toLocalDateString } from '../utils/local-date';
import { AuthService } from './auth.service';
import { CurrencyService } from './currency.service';
import {
  ExpenseStore,
  widgetCircleExpensePending$,
  type WidgetCircleExpensePush,
} from './expense-store.service';
import { getSharedFirestore } from './firestore-db';

export type CircleSyncStatus = 'idle' | 'connecting' | 'connected' | 'error';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Firestore sync for Circle Splits (docs/circle-splits-plan.md).
 *
 * Accounting model (simplified 2026-07-19, replacing the linked-entry/true-up
 * design): circle bills live ONLY in the circle while it is active — they
 * never touch Daily, budgets, or accounts. When the circle is settled, each
 * member's device auto-logs ONE Daily expense for their per-head share
 * (source 'circle-settle') with the Share Summary as the comment.
 *
 * The service also caches active circles to Preferences for the native
 * widget's Circle button, and pushes widget-captured circle expenses
 * (queue kind 'circle-expense') into Firestore.
 */
@Injectable({ providedIn: 'root' })
export class CircleSyncService {
  readonly #authService = inject(AuthService);
  readonly #expenseStore = inject(ExpenseStore);
  readonly #currencyService = inject(CurrencyService);

  readonly circles = signal<CircleDocument[]>([]);
  readonly syncStatus = signal<CircleSyncStatus>('idle');

  /** Circles where the signed-in user holds a claimed seat and status is active. */
  readonly activeCircles = signal<CircleDocument[]>([]);

  /** Expenses of the currently opened circle, tombstones included (UI filters). */
  readonly activeCircleId = signal<string | null>(null);
  readonly activeCircleExpenses = signal<CircleExpense[]>([]);
  readonly expensesStatus = signal<CircleSyncStatus>('idle');

  #circlesUnsubscribe: (() => void) | null = null;
  #expensesUnsubscribe: (() => void) | null = null;
  #listeningUid: string | null = null;
  /** Circles already auto-logged this session (persistent marker dedupes across sessions). */
  readonly #settleLogged = new Set<string>();

  constructor() {
    // Widget Circle-button expenses: the store's queue flush hands them over
    // here for the Firestore write. ReplaySubject covers flushes that ran
    // before this service was instantiated; the fixed doc id (= queue item
    // id) makes any repeat push idempotent.
    widgetCircleExpensePending$.subscribe((push) => {
      void this.#pushWidgetCircleExpense(push);
    });
  }

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
          this.activeCircles.set(
            docs.filter((c) => c.status === 'active' && this.memberForUid(c, uid) !== null),
          );
          this.syncStatus.set('connected');
          void this.#writeWidgetCache(docs, uid);
          for (const circle of docs) {
            if (circle.status === 'settled' && !this.#settleLogged.has(circle.circleId)) {
              this.#settleLogged.add(circle.circleId);
              void this.#autoLogSettledCircle(circle);
            }
          }
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
    this.activeCircles.set([]);
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
  ): Promise<string> {
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
    return ref.id;
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

  // ── Settle Up auto-log ────────────────────────────────────────────────────

  /**
   * When a circle turns settled, log ONE Daily expense for my per-head share
   * with the Share Summary as the comment. Runs on each member's own device
   * the moment its circles listener sees the settled status — no user action
   * needed. Dedupe: the comment carries `[circleId]`; an existing
   * 'circle-settle' entry with that tag means this device (or another of the
   * user's devices, via Drive sync) already logged it.
   */
  async #autoLogSettledCircle(circle: CircleDocument): Promise<void> {
    const uid = this.#authService.firebaseUid();
    const mine = this.memberForUid(circle, uid);
    if (!uid || !mine) return;

    // PERSISTENT dedupe FIRST: once this device auto-logged (or deliberately
    // skipped) a settled circle, never log it again — even when the user
    // deleted the resulting Daily entry. The old entry-comment scan alone
    // re-created deleted entries on the next app start.
    if (await this.#isSettleMarked(uid, circle.circleId)) return;

    const alreadyLogged = this.#expenseStore
      .entries()
      .some(
        (e) =>
          e.source === CIRCLE_SETTLE_EXPENSE_SOURCE &&
          (e.comment ?? '').includes(`[${circle.circleId}]`),
      );
    if (alreadyLogged) {
      await this.#markSettleLogged(uid, circle.circleId);
      return;
    }

    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const db = await getSharedFirestore();
      const snapshot = await getDocs(collection(db, 'circles', circle.circleId, 'expenses'));
      const expenses = snapshot.docs.map((d) => d.data() as CircleExpense);
      const members = Object.values(circle.members);

      // Family rule: heads (and individuals) carry their whole family's
      // share; non-head family members carry 0 — their head covers them and
      // the settled screen shows the acknowledgment instead.
      const myShare = computeCarriedShare(mine.memberId, members, expenses);
      if (myShare <= 0) {
        await this.#markSettleLogged(uid, circle.circleId);
        return;
      }

      const summary = buildShareSummaryText(circle.name, members, expenses, (n) =>
        this.#currencyService.format(n),
      );
      const type = 'Miscellaneous';
      const limitAmount =
        ((this.#expenseStore.limitMap()[type]?.userPercentage ?? 0) *
          this.#expenseStore.monthlyIncome()) / 100;
      const entry: ExpenseEntry = {
        id: crypto.randomUUID(),
        date: toLocalDateString(),
        amount: round2(myShare),
        type,
        limit: limitAmount,
        savings: round2(limitAmount - myShare),
        timestamp: new Date().toISOString(),
        comment: `${summary}\n[${circle.circleId}]`,
        source: CIRCLE_SETTLE_EXPENSE_SOURCE,
      };
      await this.#expenseStore.addEntry(entry);
      await this.#markSettleLogged(uid, circle.circleId);
    } catch (err) {
      console.warn('[CircleSync] settle auto-log failed:', err);
      this.#settleLogged.delete(circle.circleId); // retry on next snapshot
    }
  }

  /** Persistent per-device `${uid}:${circleId}` settle-log markers. */
  async #isSettleMarked(uid: string, circleId: string): Promise<boolean> {
    try {
      const { value } = await Preferences.get({ key: CIRCLE_SETTLE_LOGGED_KEY });
      const marks: unknown = value ? JSON.parse(value) : [];
      return Array.isArray(marks) && marks.includes(`${uid}:${circleId}`);
    } catch {
      return false;
    }
  }

  async #markSettleLogged(uid: string, circleId: string): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: CIRCLE_SETTLE_LOGGED_KEY });
      const parsed: unknown = value ? JSON.parse(value) : [];
      const marks = new Set<string>(Array.isArray(parsed) ? (parsed as string[]) : []);
      marks.add(`${uid}:${circleId}`);
      await Preferences.set({ key: CIRCLE_SETTLE_LOGGED_KEY, value: JSON.stringify([...marks]) });
    } catch (err) {
      console.warn('[CircleSync] settle-log marker write failed:', err);
    }
  }

  // ── Widget Circle-button expenses ─────────────────────────────────────────

  /**
   * Push a widget-captured circle expense to Firestore. Paid by me, split
   * among all members. The queue item id doubles as the doc id, so replays
   * are idempotent; the SDK's persistent cache makes the write durable
   * offline.
   */
  async #pushWidgetCircleExpense(push: WidgetCircleExpensePush): Promise<void> {
    try {
      const authorUid = await this.#requireUid();
      let circle = this.circles().find((c) => c.circleId === push.circleId);
      if (!circle) {
        await this.startListening();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        circle = this.circles().find((c) => c.circleId === push.circleId);
      }
      if (!circle || circle.status !== 'active') {
        console.warn('[CircleSync] widget circle expense dropped — circle missing/settled:', push.circleId);
        return;
      }
      const mine = this.memberForUid(circle, authorUid);
      if (!mine) return;

      const { doc, setDoc } = await import('firebase/firestore');
      const db = await getSharedFirestore();
      const now = new Date().toISOString();
      const record: CircleExpense = {
        expenseId: push.id,
        circleId: circle.circleId,
        description: push.description?.trim() || 'Widget expense',
        amount: push.amount,
        date: push.date,
        paidByMemberId: mine.memberId,
        participantMemberIds: Object.keys(circle.members),
        authorUid,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      await setDoc(doc(db, 'circles', circle.circleId, 'expenses', push.id), record);
    } catch (err) {
      console.warn('[CircleSync] widget circle expense push failed:', err);
    }
  }

  // ── Native widget cache ───────────────────────────────────────────────────

  async #writeWidgetCache(circles: CircleDocument[], uid: string): Promise<void> {
    try {
      const email = this.#authService.userEmail() ?? '';
      const items: ActiveCircleCacheItem[] = circles
        .filter((c) => c.status === 'active')
        .map((c) => {
          const mine = this.memberForUid(c, uid);
          return mine
            ? {
                circleId: c.circleId,
                name: c.name,
                myMemberId: mine.memberId,
                memberIds: Object.keys(c.members),
              }
            : null;
        })
        .filter((c): c is ActiveCircleCacheItem => c !== null);
      await Preferences.set({
        key: ACTIVE_CIRCLES_CACHE_KEY,
        value: JSON.stringify({ email, circles: items }),
      });
    } catch (err) {
      console.warn('[CircleSync] widget cache write failed:', err);
    }
  }

  async #requireUid(): Promise<string> {
    await this.#authService.ensureFirebaseSignedInSilently();
    const uid = this.#authService.firebaseUid();
    if (!uid) throw new Error('Not signed in to Firebase');
    return uid;
  }
}
