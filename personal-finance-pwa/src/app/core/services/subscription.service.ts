import { Injectable, inject, signal } from '@angular/core';
import { firebaseConfig } from '../config/firebase.config';
import { AuthService } from './auth.service';
import type { Firestore } from 'firebase/firestore';

export type SubscriptionTier = 'free' | 'pro';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  isActive: boolean;
  planType: 'monthly' | 'yearly' | null;
  cancelPending: boolean;
}

const FREE_STATUS: SubscriptionStatus = { tier: 'free', expiresAt: null, isActive: true, planType: null, cancelPending: false };

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  readonly #authService = inject(AuthService);

  readonly status = signal<SubscriptionStatus>(FREE_STATUS);
  readonly loaded = signal(false);

  #db: Firestore | null = null;
  #unsubscribe: (() => void) | null = null;
  #listeningUid: string | null = null;

  async #getDb(): Promise<Firestore> {
    if (this.#db) return this.#db;
    const { getApps, initializeApp } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    this.#db = getFirestore(app);
    return this.#db;
  }

  /** Starts listening for the given UID only if not already listening for that UID. Safe to call from multiple places. */
  ensureStarted(uid: string): void {
    if (this.#listeningUid === uid) return;
    void this.startListening(uid);
  }

  /** Resolves once loaded() is true, or after 6 seconds (whichever comes first). */
  waitUntilLoaded(): Promise<void> {
    if (this.loaded()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const deadline = setTimeout(() => {
        clearInterval(poll);
        resolve();
      }, 6000);
      const poll = setInterval(() => {
        if (this.loaded()) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve();
        }
      }, 50);
    });
  }

  /** Call once after Firebase UID is known. Starts a real-time listener on the subscription doc. */
  async startListening(uid: string): Promise<void> {
    console.log('[Sub] listening on uid:', uid);
    this.#unsubscribe?.();
    this.#listeningUid = uid;
    this.loaded.set(false);
    const { doc, onSnapshot } = await import('firebase/firestore');
    const db = await this.#getDb();
    // Ensure Firebase Auth has a signed-in user before starting the Firestore listener.
    // On cold starts (kill → relaunch) the Firebase Auth IndexedDB session may not be
    // restored. ensureFirebaseSignedInSilently() waits for authStateReady() and, if
    // currentUser is still null but a Google access token is available, re-signs in
    // silently — avoiding permission-denied on the first Firestore request.
    await this.#authService.ensureFirebaseSignedInSilently();
    // Bail if another startListening call superseded this one while we were awaiting.
    if (this.#listeningUid !== uid) return;
    const ref = doc(db, 'users', uid, 'subscription', 'status');
    let errorRetries = 0;
    const attachListener = () => {
      this.#unsubscribe = onSnapshot(ref, (snap) => {
        errorRetries = 0;
        if (!snap.exists()) {
          this.status.set(FREE_STATUS);
        } else {
          const data = snap.data();
          const expiresAt = data['expiresAt']?.toDate?.() ?? null;
          const tier: SubscriptionTier = data['tier'] === 'pro' ? 'pro' : 'free';
          const isActive = tier === 'free' || (expiresAt ? expiresAt > new Date() : false);
          const planType: 'monthly' | 'yearly' | null =
            data['planType'] === 'yearly' ? 'yearly' : data['planType'] === 'monthly' ? 'monthly' : null;
          const cancelPending: boolean = data['cancelPending'] === true;
          this.status.set({ tier, expiresAt, isActive, planType, cancelPending });
        }
        this.loaded.set(true);
      }, () => {
        // Firestore error (permission-denied or network failure).
        // Retry up to 2 times before giving up, so a transient auth hiccup on cold
        // start doesn't permanently lock the user onto free tier.
        if (!this.loaded() && errorRetries < 2 && this.#listeningUid === uid) {
          errorRetries++;
          const delay = errorRetries * 1000;
          setTimeout(() => {
            if (this.#listeningUid === uid) attachListener();
          }, delay);
          return;
        }
        // Preserve an existing pro status so a paying user on a flaky connection
        // is not incorrectly redirected to /subscribe.
        if (!this.loaded()) {
          this.status.set(FREE_STATUS);
          this.loaded.set(true);
        }
      });
    };
    attachListener();
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
      const planType: 'monthly' | 'yearly' | null =
        data['planType'] === 'yearly' ? 'yearly' : data['planType'] === 'monthly' ? 'monthly' : null;
      const cancelPending: boolean = data['cancelPending'] === true;
      const result: SubscriptionStatus = { tier, expiresAt, isActive, planType, cancelPending };
      // Keep the signal up to date so components that read status() directly
      // see the correct value even before startListening()'s onSnapshot fires.
      this.status.set(result);
      this.loaded.set(true);
      return result;
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
    this.#listeningUid = null;
  }
}
