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
exports.restoreRazorpaySubscription = exports.cancelRazorpaySubscription = exports.verifyRazorpayPayment = exports.createRazorpaySubscription = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
const razorpay_1 = __importDefault(require("razorpay"));
const crypto = __importStar(require("crypto"));
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("./auth");
function getRazorpay() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret)
        throw new Error('Razorpay credentials not configured');
    return new razorpay_1.default({ key_id: keyId, key_secret: keySecret });
}
function resolvePlanId(planType) {
    const id = planType === 'yearly'
        ? process.env.RAZORPAY_PLAN_YEARLY_ID
        : process.env.RAZORPAY_PLAN_MONTHLY_ID;
    if (!id)
        throw new Error(`Plan ID not configured for type: ${planType}`);
    return id;
}
const CORS_ORIGINS = ['https://spenza.site', 'http://localhost:4200'];
/**
 * Creates a Razorpay subscription.
 * Accepts { planType: 'monthly' | 'yearly' } — resolves the actual plan ID
 * on the backend so the frontend never controls which plan gets created.
 */
exports.createRazorpaySubscription = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const { planType } = req.body;
    if (planType !== 'monthly' && planType !== 'yearly') {
        res.status(400).json({ error: 'planType must be monthly or yearly' });
        return;
    }
    let uid;
    try {
        uid = await (0, auth_1.requireFirebaseUid)(req);
    }
    catch {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    try {
        const planId = resolvePlanId(planType);
        const rzp = getRazorpay();
        // Duplicate-protection and upgrade/downgrade gate
        const subRef = admin.firestore()
            .collection('users')
            .doc(uid)
            .collection('subscription')
            .doc('status');
        const existing = await subRef.get();
        if (existing.exists) {
            const data = existing.data();
            const expiresAt = data?.expiresAt?.toDate();
            const isActive = data?.tier === 'pro' && expiresAt && expiresAt > new Date();
            if (isActive) {
                const existingPlanType = data?.planType;
                const existingSubId = data?.razorpaySubscriptionId;
                if (existingPlanType === planType && data?.cancelPending === true) {
                    // User is resubscribing the same plan they just cancelled — clear the cancel flag
                    await subRef.set({ cancelPending: false, updatedAt: firestore_1.Timestamp.now() }, { merge: true });
                    console.log('createRazorpaySubscription: cancelPending cleared for resubscription', { uid });
                    // Fall through to create new subscription
                }
                else if (existingPlanType === planType) {
                    // Same plan, no cancel pending — block duplicate subscription
                    res.status(400).json({
                        error: `You already have an active Pro subscription for this plan`,
                    });
                    return;
                }
                if (planType === 'monthly') {
                    // Downgrade (yearly → monthly) — not allowed mid-cycle
                    res.status(400).json({
                        error: 'To switch to monthly, let your yearly plan expire first',
                    });
                    return;
                }
                // Upgrade: monthly → yearly — cancel old at cycle end, then create new
                if (existingSubId) {
                    await rzp.subscriptions.cancel(existingSubId, true);
                    console.log('createRazorpaySubscription: monthly subscription cancelled at cycle end for yearly upgrade', {
                        uid,
                        existingSubId,
                    });
                }
            }
        }
        const subscription = await rzp.subscriptions.create({
            plan_id: planId,
            total_count: planType === 'yearly' ? 10 : 120,
            quantity: 1,
            notes: { uid, planType },
        });
        res.json({ subscriptionId: subscription.id });
    }
    catch (err) {
        console.error('Razorpay subscription creation failed:', err);
        res.status(500).json({ error: 'Failed to create subscription' });
    }
});
/**
 * Verifies the Razorpay payment signature after checkout success.
 * Algorithm: HMAC-SHA256(payment_id + "|" + subscription_id, KEY_SECRET)
 * On success, writes pro status to Firestore immediately (webhook is authoritative backup).
 */
exports.verifyRazorpayPayment = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
        res.status(500).json({ error: 'Server misconfiguration' });
        return;
    }
    let uid;
    try {
        uid = await (0, auth_1.requireFirebaseUid)(req);
    }
    catch {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    // Verify HMAC-SHA256 signature
    const payload = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    const expectedBuf = crypto.createHmac('sha256', keySecret).update(payload).digest();
    let isValid = false;
    try {
        const sigBuf = Buffer.from(razorpay_signature, 'hex');
        isValid = sigBuf.length === expectedBuf.length &&
            crypto.timingSafeEqual(expectedBuf, sigBuf);
    }
    catch {
        isValid = false;
    }
    if (!isValid) {
        console.warn('Razorpay signature mismatch for uid:', uid);
        res.status(400).json({ error: 'Invalid payment signature' });
        return;
    }
    // Fetch the subscription from Razorpay to get the authoritative plan_id
    // (do not trust planType from the client for expiry calculation)
    const rzp = getRazorpay();
    let resolvedPlanId;
    let resolvedCurrentEnd;
    try {
        const sub = await rzp.subscriptions.fetch(razorpay_subscription_id);
        resolvedPlanId = sub.plan_id ?? '';
        resolvedCurrentEnd = sub.current_end;
    }
    catch (err) {
        console.error('Failed to fetch Razorpay subscription for plan resolution:', err);
        res.status(500).json({ error: 'Could not verify subscription plan' });
        return;
    }
    const yearlyPlanId = process.env.RAZORPAY_PLAN_YEARLY_ID ?? '';
    const isYearly = !!yearlyPlanId && resolvedPlanId === yearlyPlanId;
    const resolvedPlanType = isYearly ? 'yearly' : 'monthly';
    // Use Razorpay's authoritative period end if available, otherwise calculate
    const expiresAt = resolvedCurrentEnd
        ? new Date(resolvedCurrentEnd * 1000)
        : (() => { const d = new Date(); d.setMonth(d.getMonth() + (isYearly ? 12 : 1)); return d; })();
    await admin
        .firestore()
        .collection('users')
        .doc(uid)
        .collection('subscription')
        .doc('status')
        .set({
        tier: 'pro',
        provider: 'razorpay',
        razorpaySubscriptionId: razorpay_subscription_id,
        razorpayPaymentId: razorpay_payment_id,
        planId: resolvedPlanId,
        planType: resolvedPlanType,
        expiresAt: firestore_1.Timestamp.fromDate(expiresAt),
        updatedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
    res.json({ success: true });
});
/**
 * Cancels a Razorpay subscription at cycle end so the user keeps Pro access until expiry.
 * Sets cancelPending: true in Firestore — the webhook sets tier: free when the period ends.
 */
exports.cancelRazorpaySubscription = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    let uid;
    try {
        uid = await (0, auth_1.requireFirebaseUid)(req);
    }
    catch {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    const subRef = admin.firestore()
        .collection('users')
        .doc(uid)
        .collection('subscription')
        .doc('status');
    const snap = await subRef.get();
    if (!snap.exists) {
        res.status(400).json({ error: 'No active subscription found' });
        return;
    }
    const data = snap.data();
    const expiresAt = data['expiresAt']?.toDate?.();
    const tier = data['tier'] ?? 'free';
    if (tier !== 'pro') {
        res.status(400).json({ error: 'No active Pro subscription to cancel' });
        return;
    }
    if (!expiresAt || expiresAt <= new Date()) {
        res.status(400).json({ error: 'Subscription has already expired' });
        return;
    }
    if (data['cancelPending'] === true) {
        res.status(400).json({ error: 'Subscription is already pending cancellation' });
        return;
    }
    const razorpaySubscriptionId = data['razorpaySubscriptionId'];
    if (!razorpaySubscriptionId) {
        res.status(400).json({ error: 'No Razorpay subscription ID on record' });
        return;
    }
    try {
        const rzp = getRazorpay();
        await rzp.subscriptions.cancel(razorpaySubscriptionId, true);
        await subRef.set({
            cancelPending: true,
            cancelledAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        }, { merge: true });
        console.log('cancelRazorpaySubscription: cancelled at cycle end', { uid, razorpaySubscriptionId });
        res.json({ success: true, expiresAt: expiresAt.toISOString() });
    }
    catch (err) {
        console.error('cancelRazorpaySubscription failed:', err);
        res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
    }
});
/**
 * Restores Pro access for a user who paid but whose verification failed.
 * Looks up the given Razorpay subscription, confirms it belongs to the
 * authenticated user (uid matches notes.uid), and writes Pro to Firestore.
 */
exports.restoreRazorpaySubscription = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const { subscriptionId } = req.body;
    if (!subscriptionId) {
        res.status(400).json({ error: 'subscriptionId is required' });
        return;
    }
    let uid;
    try {
        uid = await (0, auth_1.requireFirebaseUid)(req);
    }
    catch {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    try {
        const rzp = getRazorpay();
        const sub = await rzp.subscriptions.fetch(subscriptionId);
        const subAny = sub;
        // Verify this subscription belongs to the authenticated user
        const notesUid = subAny.notes?.uid;
        if (notesUid !== uid) {
            console.warn('restoreRazorpaySubscription: uid mismatch', { uid, notesUid, subscriptionId });
            res.status(403).json({ error: 'Subscription does not belong to this account' });
            return;
        }
        const status = subAny.status ?? '';
        if (!['active', 'authenticated', 'charged'].includes(status)) {
            res.status(400).json({ error: `Subscription is not active (status: ${status})` });
            return;
        }
        const planId = subAny.plan_id ?? '';
        const currentEnd = subAny.current_end;
        const yearlyPlanId = process.env.RAZORPAY_PLAN_YEARLY_ID ?? '';
        const isYearly = !!yearlyPlanId && planId === yearlyPlanId;
        const planType = isYearly ? 'yearly' : 'monthly';
        const expiresAt = currentEnd
            ? new Date(currentEnd * 1000)
            : (() => { const d = new Date(); d.setMonth(d.getMonth() + (isYearly ? 12 : 1)); return d; })();
        await admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('subscription')
            .doc('status')
            .set({
            tier: 'pro',
            provider: 'razorpay',
            razorpaySubscriptionId: subscriptionId,
            planId,
            planType,
            expiresAt: firestore_1.Timestamp.fromDate(expiresAt),
            updatedAt: firestore_1.Timestamp.now(),
        }, { merge: true });
        console.log('restoreRazorpaySubscription: Pro restored', { uid, subscriptionId, planType });
        res.json({ success: true, planType, expiresAt: expiresAt.toISOString() });
    }
    catch (err) {
        console.error('restoreRazorpaySubscription failed:', err);
        res.status(500).json({ error: 'Could not restore subscription' });
    }
});
//# sourceMappingURL=razorpay.js.map