import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { Timestamp } from 'firebase-admin/firestore';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

/** Creates a Stripe Checkout session and returns its URL. */
export const createStripeSession = functions.onRequest(
  { cors: ['https://spenza.site', 'http://localhost:4200'], invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { priceId, uid } = req.body as { priceId?: string; uid?: string };
    if (!priceId || !uid) {
      res.status(400).json({ error: 'priceId and uid are required' });
      return;
    }

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `https://spenza.site/#/subscribe?success=1`,
        cancel_url: `https://spenza.site/#/subscribe`,
        metadata: { uid },
        subscription_data: { metadata: { uid } },
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe session creation failed:', err);
      res.status(500).json({ error: 'Failed to create session' });
    }
  }
);

/** Stripe webhook — updates Firestore subscription status on successful payment. */
export const stripeWebhook = functions.onRequest(
  { cors: false, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).send('STRIPE_WEBHOOK_SECRET not configured');
      return;
    }

    const sig = req.headers['stripe-signature'] as string;
    const rawBody = (req as any).rawBody as Buffer;

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe signature verification failed:', err);
      res.status(400).send('Webhook signature verification failed');
      return;
    }

    if (event.type !== 'invoice.paid') {
      res.status(200).send('Event ignored');
      return;
    }

    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoice.subscription as string;

    if (!subscriptionId) {
      res.status(200).send('No subscription ID');
      return;
    }

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const uid: string | undefined = subscription.metadata?.uid;

    if (!uid) {
      console.warn('Stripe webhook: no uid in subscription metadata');
      res.status(200).send('No uid — skipped');
      return;
    }

    const periodEnd = new Date((subscription as any).current_period_end * 1000);

    await admin.firestore()
      .collection('users').doc(uid)
      .collection('subscription').doc('status')
      .set({
        tier: 'pro',
        provider: 'stripe',
        stripeSubscriptionId: subscriptionId,
        expiresAt: Timestamp.fromDate(periodEnd),
        updatedAt: Timestamp.now(),
      }, { merge: true });

    res.status(200).send('OK');
  }
);
