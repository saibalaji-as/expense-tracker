import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';

type PlanType = 'monthly' | 'yearly';

function getRazorpay(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay credentials not configured');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function resolvePlanId(planType: PlanType): string {
  const id =
    planType === 'yearly'
      ? process.env.RAZORPAY_PLAN_YEARLY_ID
      : process.env.RAZORPAY_PLAN_MONTHLY_ID;
  if (!id) throw new Error(`Plan ID not configured for type: ${planType}`);
  return id;
}

const CORS_ORIGINS = ['https://spenza-finance.web.app', 'http://localhost:4200'];

/**
 * Creates a Razorpay subscription.
 * Accepts { planType: 'monthly' | 'yearly', uid } — resolves the actual plan ID
 * on the backend so the frontend never controls which plan gets created.
 */
export const createRazorpaySubscription = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { planType, uid } = req.body as { planType?: string; uid?: string };

    if (!uid) {
      res.status(400).json({ error: 'uid is required' });
      return;
    }
    if (planType !== 'monthly' && planType !== 'yearly') {
      res.status(400).json({ error: 'planType must be monthly or yearly' });
      return;
    }

    try {
      const planId = resolvePlanId(planType as PlanType);
      const rzp = getRazorpay();

      const subscription = await rzp.subscriptions.create({
        plan_id: planId,
        total_count: planType === 'yearly' ? 10 : 120, // ~10 years / ~10 years months
        quantity: 1,
        notes: { uid, planType },
      });

      res.json({ subscriptionId: subscription.id });
    } catch (err) {
      console.error('Razorpay subscription creation failed:', err);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  }
);

/**
 * Verifies the Razorpay payment signature after checkout success.
 * Algorithm: HMAC-SHA256(payment_id + "|" + subscription_id, KEY_SECRET)
 * On success, writes pro status to Firestore immediately (webhook is authoritative backup).
 */
export const verifyRazorpayPayment = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, uid, planType } =
      req.body as {
        razorpay_payment_id?: string;
        razorpay_subscription_id?: string;
        razorpay_signature?: string;
        uid?: string;
        planType?: string;
      };

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature || !uid) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      res.status(500).json({ error: 'Server misconfiguration' });
      return;
    }

    // Verify HMAC-SHA256 signature
    const payload = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    const expected = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(razorpay_signature, 'hex')
    );

    if (!isValid) {
      console.warn('Razorpay signature mismatch for uid:', uid);
      res.status(400).json({ error: 'Invalid payment signature' });
      return;
    }

    // Signature valid — write pro access to Firestore
    const isYearly = planType === 'yearly';
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (isYearly ? 12 : 1));

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
          razorpaySubscriptionId: razorpay_subscription_id,
          razorpayPaymentId: razorpay_payment_id,
          planType: planType ?? 'monthly',
          expiresAt: Timestamp.fromDate(expiresAt),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

    res.json({ success: true });
  }
);
