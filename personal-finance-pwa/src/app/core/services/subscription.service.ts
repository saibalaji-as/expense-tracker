import { Injectable, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase.config';

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

  #db = getFirestore(
    getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
  );
  #unsubscribe: Unsubscribe | null = null;

  /** Call once after Firebase UID is known. Starts a real-time listener on the subscription doc. */
  startListening(uid: string): void {
    this.#unsubscribe?.();
    const ref = doc(this.#db, 'users', uid, 'subscription', 'status');
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
      const ref = doc(this.#db, 'users', uid, 'subscription', 'status');
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
