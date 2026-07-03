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
exports.requireFirebaseUid = requireFirebaseUid;
exports.requireProTier = requireProTier;
const admin = __importStar(require("firebase-admin"));
async function requireFirebaseUid(req) {
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
async function requireProTier(uid) {
    const snap = await admin.firestore().doc(`users/${uid}/subscription/status`).get();
    if (!snap.exists) {
        throw new Error('Pro subscription required');
    }
    const data = snap.data();
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
//# sourceMappingURL=auth.js.map