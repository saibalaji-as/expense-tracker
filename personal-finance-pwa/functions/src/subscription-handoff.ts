import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requireFirebaseUid } from './auth';

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const HANDOFF_REDEEM_RETRY_MS = 60 * 1000;
const CORS_ORIGINS = [
  'https://spenza-finance.web.app',
  'http://localhost:4200',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];

async function deleteExpiredSubscriptionHandoffs(): Promise<void> {
  const expired = await admin.firestore()
    .collection('subscriptionHandoffs')
    .where('expiresAt', '<=', Timestamp.now())
    .limit(100)
    .get();
  if (expired.empty) return;

  const batch = admin.firestore().batch();
  expired.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  await batch.commit();
}

export const createSubscriptionHandoff = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const uid = await requireFirebaseUid(req);
      const handoff = admin.firestore().collection('subscriptionHandoffs').doc();
      await handoff.set({
        uid,
        expiresAt: Timestamp.fromMillis(Date.now() + HANDOFF_TTL_MS),
        createdAt: FieldValue.serverTimestamp(),
      });
      try {
        await deleteExpiredSubscriptionHandoffs();
      } catch (err) {
        console.warn('Expired subscription handoff cleanup failed:', err);
      }
      res.json({ code: handoff.id });
    } catch (err) {
      console.warn('Subscription handoff creation failed:', err);
      res.status(401).json({ error: 'Could not authorize subscription handoff' });
    }
  }
);

export const redeemSubscriptionHandoff = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code) {
      res.status(400).json({ error: 'Handoff code is required' });
      return;
    }

    try {
      const handoff = admin.firestore().collection('subscriptionHandoffs').doc(code);
      const uid = await admin.firestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(handoff);
        const data = snapshot.data();
        const expiresAt = data?.expiresAt as Timestamp | undefined;
        const redeemedAt = data?.redeemedAt as Timestamp | undefined;
        if (!snapshot.exists || !data?.uid || !expiresAt || expiresAt.toMillis() <= Date.now()) {
          throw new Error('Subscription handoff is invalid or expired');
        }

        // Mobile browsers can re-enter the Angular route while Firebase Auth is
        // still signing in. Keep a short retry window so the same browser link
        // can finish authorizing without making the handoff broadly reusable.
        if (redeemedAt && redeemedAt.toMillis() + HANDOFF_REDEEM_RETRY_MS <= Date.now()) {
          throw new Error('Subscription handoff was already redeemed');
        }

        // Mark as redeemed atomically inside the transaction so concurrent
        // redemption attempts are blocked even if the function crashes after commit.
        transaction.update(handoff, { redeemedAt: Timestamp.now() });
        return String(data.uid);
      });

      const customToken = await admin.auth().createCustomToken(uid);
      res.json({ customToken });
    } catch (err) {
      console.warn('Subscription handoff redemption failed:', err);
      res.status(401).json({ error: 'Subscription handoff is invalid or expired' });
    }
  }
);
