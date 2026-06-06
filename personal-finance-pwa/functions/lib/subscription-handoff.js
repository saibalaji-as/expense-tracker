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
exports.redeemSubscriptionHandoff = exports.createSubscriptionHandoff = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("./auth");
const HANDOFF_TTL_MS = 5 * 60 * 1000;
const HANDOFF_REDEEM_RETRY_MS = 60 * 1000;
const CORS_ORIGINS = [
    'https://spenza-finance.web.app',
    'http://localhost:4200',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
];
async function deleteExpiredSubscriptionHandoffs() {
    const expired = await admin.firestore()
        .collection('subscriptionHandoffs')
        .where('expiresAt', '<=', firestore_1.Timestamp.now())
        .limit(100)
        .get();
    if (expired.empty)
        return;
    const batch = admin.firestore().batch();
    expired.docs.forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit();
}
exports.createSubscriptionHandoff = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const uid = await (0, auth_1.requireFirebaseUid)(req);
        const handoff = admin.firestore().collection('subscriptionHandoffs').doc();
        await handoff.set({
            uid,
            expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + HANDOFF_TTL_MS),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        try {
            await deleteExpiredSubscriptionHandoffs();
        }
        catch (err) {
            console.warn('Expired subscription handoff cleanup failed:', err);
        }
        res.json({ code: handoff.id });
    }
    catch (err) {
        console.warn('Subscription handoff creation failed:', err);
        res.status(401).json({ error: 'Could not authorize subscription handoff' });
    }
});
exports.redeemSubscriptionHandoff = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
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
            const expiresAt = data?.expiresAt;
            const redeemedAt = data?.redeemedAt;
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
            transaction.update(handoff, { redeemedAt: firestore_1.Timestamp.now() });
            return String(data.uid);
        });
        const customToken = await admin.auth().createCustomToken(uid);
        res.json({ customToken });
    }
    catch (err) {
        console.warn('Subscription handoff redemption failed:', err);
        res.status(401).json({ error: 'Subscription handoff is invalid or expired' });
    }
});
//# sourceMappingURL=subscription-handoff.js.map