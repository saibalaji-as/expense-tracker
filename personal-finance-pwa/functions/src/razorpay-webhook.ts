import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

function expiresAtForPlanId(planId: string): Date {
  const yearlyId = process.env.RAZORPAY_PLAN_YEARLY_ID ?? '';
  const isYearly = !!yearlyId && planId === yearlyId;
  const d = new Date();
  d.setMonth(d.getMonth() + (isYearly ? 12 : 1));
  return d;
}

/** Razorpay webhook — updates Firestore on subscription.charged / subscription.activated. */
export const razorpayWebhook = functions.onRequest(
  { cors: false, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not set');
      res.status(500).send('Server misconfiguration');
      return;
    }

    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = (req as any).rawBody as Buffer | undefined;

    if (!signature || !rawBody) {
      res.status(400).send('Missing signature or body');
      return;
    }

    if (!verifySignature(rawBody.toString(), signature, secret)) {
      res.status(401).send('Invalid signature');
      return;
    }

    const event = req.body as Record<string, any>;
    const eventType: string = event.event ?? '';

    if (!['subscription.charged', 'subscription.activated'].includes(eventType)) {
      res.status(200).send('Event ignored');
      return;
    }

    const subscription = event.payload?.subscription?.entity as Record<string, any> | undefined;
    const uid: string | undefined = subscription?.notes?.uid;
    const planId: string | undefined = subscription?.plan_id;

    if (!uid) {
      console.warn('razorpayWebhook: no uid in notes', { eventType });
      res.status(200).send('No uid — skipped');
      return;
    }

    const expiresAt = expiresAtForPlanId(planId ?? '');

    await admin
      .firestore()
      .collection('users')
      .doc(uid)
      .collection('subscription')
      .doc('status')
      .set(
        {
          tier: 'pro',
          provider: 'razorpay',
          razorpaySubscriptionId: subscription?.id ?? '',
          planId: planId ?? '',
          expiresAt: Timestamp.fromDate(expiresAt),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

    res.status(200).send('OK');
  }
);
