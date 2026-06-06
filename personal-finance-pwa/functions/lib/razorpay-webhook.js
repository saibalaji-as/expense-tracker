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
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookHealthCheck = exports.razorpayWebhook = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
const crypto = __importStar(require("crypto"));
const firestore_1 = require("firebase-admin/firestore");
function verifySignature(body, signature, secret) {
    const expectedBuf = crypto.createHmac('sha256', secret).update(body).digest();
    try {
        const sigBuf = Buffer.from(signature, 'hex');
        return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(expectedBuf, sigBuf);
    }
    catch {
        return false;
    }
}
function expiresAtFromSubscription(planId, currentEnd) {
    // Prefer the authoritative billing period end from Razorpay over a local calculation.
    if (currentEnd && currentEnd > 0)
        return new Date(currentEnd * 1000);
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
exports.razorpayWebhook = functions.onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
    // rawBody is typed on firebase-functions v2 Request (v6.x+); no cast needed
    const rawBody = req.rawBody;
    const signature = req.headers['x-razorpay-signature'];
    console.log('razorpayWebhook received', {
        method: req.method,
        hasSignature: !!signature,
        hasRawBody: !!rawBody,
        rawBodyLength: rawBody?.length ?? 0,
    });
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.error('razorpayWebhook: RAZORPAY_WEBHOOK_SECRET not set');
        res.status(500).send('Server misconfiguration');
        return;
    }
    if (!signature || !rawBody) {
        console.error('razorpayWebhook: missing signature or rawBody', { hasSignature: !!signature, hasRawBody: !!rawBody });
        res.status(400).send('Missing signature or body');
        return;
    }
    if (!verifySignature(rawBody.toString(), signature, secret)) {
        console.error('razorpayWebhook: signature verification failed');
        res.status(401).send('Invalid signature');
        return;
    }
    console.log('razorpayWebhook: signature verified');
    const event = req.body;
    const eventType = event.event ?? '';
    const ACTIVATE_EVENTS = ['subscription.charged', 'subscription.activated'];
    const CANCEL_EVENTS = ['subscription.cancelled', 'subscription.halted'];
    if (![...ACTIVATE_EVENTS, ...CANCEL_EVENTS].includes(eventType)) {
        console.log('razorpayWebhook: event ignored', { eventType });
        res.status(200).send('Event ignored');
        return;
    }
    const subscription = event.payload?.subscription?.entity;
    const uid = subscription?.notes?.uid;
    if (!uid) {
        // Log the full notes so we can see what arrived (no sensitive payment data in notes)
        console.warn('razorpayWebhook: no uid in subscription notes', {
            eventType,
            notes: subscription?.notes ?? null,
            subscriptionId: subscription?.id ?? null,
        });
        res.status(200).send('No uid — skipped');
        return;
    }
    console.log('razorpayWebhook: uid resolved', { uid, planId: subscription?.plan_id, eventType });
    const subRef = admin
        .firestore()
        .collection('users')
        .doc(uid)
        .collection('subscription')
        .doc('status');
    if (CANCEL_EVENTS.includes(eventType)) {
        // Guard against accidentally downgrading a user who upgraded mid-cycle:
        // if the Firestore doc already references a *different* (newer) subscription,
        // this cancel event belongs to the old plan — skip the free-downgrade.
        const currentDoc = await subRef.get();
        const currentSubId = currentDoc.exists
            ? currentDoc.data()?.razorpaySubscriptionId
            : undefined;
        if (currentDoc.exists && currentSubId && currentSubId !== subscription?.id) {
            console.log('razorpayWebhook: cancel event for superseded subscription — user has a newer active subscription, skipping free downgrade', {
                uid,
                cancelledSubId: subscription?.id ?? null,
                activeSubId: currentSubId,
                eventType,
            });
            res.status(200).send('OK');
            return;
        }
        await subRef.set({
            tier: 'free',
            razorpaySubscriptionId: subscription?.id ?? '',
            cancelPending: false,
            cancelledAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        }, { merge: true });
        console.log('razorpayWebhook: subscription cancelled', { uid });
        res.status(200).send('OK');
        return;
    }
    const paymentEntity = event.payload?.payment?.entity;
    const planId = subscription?.plan_id;
    const currentEnd = subscription?.current_end;
    const razorpayPaymentId = paymentEntity?.id;
    const yearlyId = process.env.RAZORPAY_PLAN_YEARLY_ID;
    const planType = !!yearlyId && planId === yearlyId ? 'yearly' : 'monthly';
    const expiresAt = expiresAtFromSubscription(planId ?? '', currentEnd);
    const writeData = {
        tier: 'pro',
        provider: 'razorpay',
        razorpaySubscriptionId: subscription?.id ?? '',
        planId: planId ?? '',
        planType,
        expiresAt: firestore_1.Timestamp.fromDate(expiresAt),
        updatedAt: firestore_1.Timestamp.now(),
    };
    if (razorpayPaymentId)
        writeData['razorpayPaymentId'] = razorpayPaymentId;
    await subRef.set(writeData, { merge: true });
    console.log('razorpayWebhook: Firestore write succeeded', {
        uid,
        tier: 'pro',
        planType,
        expiresAt: expiresAt.toISOString(),
    });
    res.status(200).send('OK');
});
/** Health-check endpoint — verify all required env vars are configured before going live. */
exports.webhookHealthCheck = functions.onRequest({ cors: false, invoker: 'public' }, async (_req, res) => {
    res.status(200).json({
        status: 'ok',
        webhookSecretConfigured: !!process.env.RAZORPAY_WEBHOOK_SECRET,
        planMonthlyConfigured: !!process.env.RAZORPAY_PLAN_MONTHLY_ID,
        planYearlyConfigured: !!process.env.RAZORPAY_PLAN_YEARLY_ID,
        timestamp: new Date().toISOString(),
    });
});
//# sourceMappingURL=razorpay-webhook.js.map