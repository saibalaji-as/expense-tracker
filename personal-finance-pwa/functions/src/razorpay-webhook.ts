import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expectedBuf = crypto.createHmac('sha256', secret).update(body).digest();
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

function expiresAtFromSubscription(planId: string, currentEnd: number | undefined): Date {
  // Prefer the authoritative billing period end from Razorpay over a local calculation.
  if (currentEnd && currentEnd > 0) return new Date(currentEnd * 1000);
  const yearlyId = process.env.RAZORPAY_PLAN_YEARLY_ID;
  if (!yearlyId) {
    console.error('RAZORPAY_PLAN_YEARLY_ID is not set — yearly plans will be treated as monthly');
  }
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

    const ACTIVATE_EVENTS = ['subscription.charged', 'subscription.activated'];
    const CANCEL_EVENTS = ['subscription.cancelled', 'subscription.halted'];

    if (![...ACTIVATE_EVENTS, ...CANCEL_EVENTS].includes(eventType)) {
      res.status(200).send('Event ignored');
      return;
    }

    const subscription = event.payload?.subscription?.entity as Record<string, any> | undefined;
    const uid: string | undefined = subscription?.notes?.uid;

    if (!uid) {
      console.warn('razorpayWebhook: no uid in notes', { eventType });
      res.status(200).send('No uid — skipped');
      return;
    }

    const subRef = admin
      .firestore()
      .collection('users')
      .doc(uid)
      .collection('subscription')
      .doc('status');

    if (CANCEL_EVENTS.includes(eventType)) {
      await subRef.set(
        {
          tier: 'free',
          razorpaySubscriptionId: subscription?.id ?? '',
          cancelledAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      res.status(200).send('OK');
      return;
    }

    const paymentEntity = event.payload?.payment?.entity as Record<string, any> | undefined;
    const planId: string | undefined = subscription?.plan_id;
    const currentEnd: number | undefined = subscription?.current_end;
    const razorpayPaymentId: string | undefined = paymentEntity?.id;

    const yearlyId = process.env.RAZORPAY_PLAN_YEARLY_ID;
    const planType = !!yearlyId && planId === yearlyId ? 'yearly' : 'monthly';
    const expiresAt = expiresAtFromSubscription(planId ?? '', currentEnd);

    const writeData: Record<string, unknown> = {
      tier: 'pro',
      provider: 'razorpay',
      razorpaySubscriptionId: subscription?.id ?? '',
      planId: planId ?? '',
      planType,
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: Timestamp.now(),
    };
    if (razorpayPaymentId) writeData['razorpayPaymentId'] = razorpayPaymentId;

    await subRef.set(writeData, { merge: true });

    res.status(200).send('OK');
  }
);
