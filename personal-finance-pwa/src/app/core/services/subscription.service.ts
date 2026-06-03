import { Injectable, signal } from '@angular/core';
import { firebaseConfig } from '../config/firebase.config';
import type { Firestore } from 'firebase/firestore';

export type SubscriptionTier = 'free' | 'pro';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  isActive: boolean;
}

const FREE_STATUS: SubscriptionStatus = { tier: 'free', expiresAt: null, isActive: true };

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  readonly status = signal<SubscriptionStatus>(FREE_STATUS);
  readonly loaded = signal(false);

  #db: Firestore | null = null;
  #unsubscribe: (() => void) | null = null;

  async #getDb(): Promise<Firestore> {
    if (this.#db) return this.#db;
    const { getApps, initializeApp } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    this.#db = getFirestore(app);
    return this.#db;
  }

  /** Call once after Firebase UID is known. Starts a real-time listener on the subscription doc. */
  async startListening(uid: string): Promise<void> {
    this.#unsubscribe?.();
    const { doc, onSnapshot } = await import('firebase/firestore');
    const db = await this.#getDb();
    const ref = doc(db, 'users', uid, 'subscription', 'status');
    this.#unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        this.status.set(FREE_STATUS);
      } else {
        const data = snap.data();
        const expiresAt = data['expiresAt']?.toDate?.() ?? null;
        const tier: SubscriptionTier = data['tier'] === 'pro' ? 'pro' : 'free';
        const isActive = tier === 'free' || (expiresAt ? expiresAt > new Date() : false);
        this.status.set({ tier, expiresAt, isActive });
      }
      this.loaded.set(true);
    }, () => {
      // Firestore unavailable — default to free
      this.status.set(FREE_STATUS);
      this.loaded.set(true);
    });
  }

  /** One-shot fetch — used by the subscription guard on native (no persistent listener needed). */
  async fetchOnce(uid: string): Promise<SubscriptionStatus> {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await this.#getDb();
      const ref = doc(db, 'users', uid, 'subscription', 'status');
      const snap = await getDoc(ref);
      if (!snap.exists()) return FREE_STATUS;
      const data = snap.data();
      const expiresAt = data['expiresAt']?.toDate?.() ?? null;
      const tier: SubscriptionTier = data['tier'] === 'pro' ? 'pro' : 'free';
      const isActive = tier === 'free' || (expiresAt ? expiresAt > new Date() : false);
      return { tier, expiresAt, isActive };
    } catch {
      return FREE_STATUS;
    }
  }

  isPro(): boolean {
    const s = this.status();
    return s.tier === 'pro' && s.isActive;
  }

  stopListening(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }
}
