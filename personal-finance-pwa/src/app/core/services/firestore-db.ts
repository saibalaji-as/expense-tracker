import { firebaseConfig } from '../config/firebase.config';
import type { Firestore } from 'firebase/firestore';

/**
 * Single shared Firestore instance for the whole app, initialized with a
 * PERSISTENT local cache (IndexedDB). The persistent cache is what makes
 * family-ledger writes durable across app restarts while offline — the SDK
 * owns queuing/retry, replacing the old hand-rolled `familyPushPending`
 * machinery (docs/family-sync-centralization-plan.md).
 *
 * All services that need Firestore MUST use this instead of calling
 * `getFirestore()` directly: whoever initializes the default instance first
 * fixes its cache settings, so a stray `getFirestore()` racing ahead of this
 * would silently downgrade the app to a memory-only cache.
 */

let db: Firestore | null = null;
let initializing: Promise<Firestore> | null = null;

export function getSharedFirestore(): Promise<Firestore> {
  if (db) return Promise.resolve(db);
  initializing ??= (async () => {
    const { getApps, initializeApp } = await import('firebase/app');
    const firestore = await import('firebase/firestore');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    try {
      db = firestore.initializeFirestore(app, {
        localCache: firestore.persistentLocalCache(),
      });
    } catch {
      // Already initialized elsewhere (or persistence unavailable) — reuse the
      // default instance. Sync still converges via diff reconciliation pushes;
      // only restart-offline durability degrades.
      db = firestore.getFirestore(app);
    }
    return db;
  })();
  return initializing;
}
