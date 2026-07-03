import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';

export async function requireFirebaseUid(req: Request): Promise<string> {
  const authorization = req.headers.authorization ?? '';
  const match = authorization.match(/^Bearer (.+)$/);
  if (!match) {
    throw new Error('Missing Firebase ID token');
  }

  const decoded = await admin.auth().verifyIdToken(match[1]);
  return decoded.uid;
}

/**
 * Throws unless the given uid has an active Pro subscription, per the same
 * users/{uid}/subscription/status document the client SubscriptionService reads.
 * Use this to enforce Pro-only features server-side — client-side isPro() checks
 * (button visibility, route guards) are UX only and never a security boundary,
 * since any signed-in user can call a Firebase Function endpoint directly.
 */
export async function requireProTier(uid: string): Promise<void> {
  const snap = await admin.firestore().doc(`users/${uid}/subscription/status`).get();
  if (!snap.exists) {
    throw new Error('Pro subscription required');
  }
  const data = snap.data()!;
  const tier = data['tier'] === 'pro' ? 'pro' : 'free';
  if (tier !== 'pro') {
    throw new Error('Pro subscription required');
  }
  const expiresAt = data['expiresAt']?.toDate?.() ?? null;
  const isActive = expiresAt ? expiresAt > new Date() : false;
  if (!isActive) {
    throw new Error('Pro subscription required');
  }
}
