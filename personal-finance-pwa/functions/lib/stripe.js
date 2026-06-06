"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = exports.createStripeSession = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
const stripe_1 = __importDefault(require("stripe"));
const firestore_1 = require("firebase-admin/firestore");
function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key)
        throw new Error('STRIPE_SECRET_KEY not configured');
    return new stripe_1.default(key, { apiVersion: '2025-02-24.acacia' });
}
/** Creates a Stripe Checkout session and returns its URL. */
exports.createStripeSession = functions.onRequest({ cors: ['https://spenza-finance.web.app', 'http://localhost:4200'], invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const { priceId, uid } = req.body;
    if (!priceId || !uid) {
        res.status(400).json({ error: 'priceId and uid are required' });
        return;
    }
    try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `https://spenza-finance.web.app/#/subscribe?success=1`,
            cancel_url: `https://spenza-finance.web.app/#/subscribe`,
            metadata: { uid },
            subscription_data: { metadata: { uid } },
        });
        res.json({ url: session.url });
    }
    catch (err) {
        console.error('Stripe session creation failed:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});
/** Stripe webhook — updates Firestore subscription status on successful payment. */
exports.stripeWebhook = functions.onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        res.status(500).send('STRIPE_WEBHOOK_SECRET not configured');
        return;
    }
    const sig = req.headers['stripe-signature'];
    const rawBody = req.rawBody;
    let event;
    try {
        event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
    }
    catch (err) {
        console.error('Stripe signature verification failed:', err);
        res.status(400).send('Webhook signature verification failed');
        return;
    }
    if (event.type !== 'invoice.paid') {
        res.status(200).send('Event ignored');
        return;
    }
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) {
        res.status(200).send('No subscription ID');
        return;
    }
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const uid = subscription.metadata?.uid;
    if (!uid) {
        console.warn('Stripe webhook: no uid in subscription metadata');
        res.status(200).send('No uid — skipped');
        return;
    }
    const periodEnd = new Date(subscription.current_period_end * 1000);
    await admin.firestore()
        .collection('users').doc(uid)
        .collection('subscription').doc('status')
        .set({
        tier: 'pro',
        provider: 'stripe',
        stripeSubscriptionId: subscriptionId,
        expiresAt: firestore_1.Timestamp.fromDate(periodEnd),
        updatedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
    res.status(200).send('OK');
});
//# sourceMappingURL=stripe.js.map