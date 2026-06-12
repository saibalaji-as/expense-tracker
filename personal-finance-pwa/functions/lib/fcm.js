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
exports.unregisterToken = exports.registerToken = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
const scheduler_utils_1 = require("./scheduler-utils");
const auth_1 = require("./auth");
exports.registerToken = functions.onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    // Only signed-in Spenza users may write to the token registry.
    let authUid;
    try {
        authUid = await (0, auth_1.requireFirebaseUid)(req);
    }
    catch {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const { userId, fcmToken, timezone, timestamp, dailyReminderEnabled, reminderHour, reminderMinute } = req.body;
    if (!userId || !fcmToken) {
        res.status(400).json({ error: 'Missing required fields', required: ['userId', 'fcmToken'] });
        return;
    }
    const db = admin.firestore();
    const ref = db.collection('users').doc(userId);
    // Bind the registration to the Firebase account that created it.
    // Legacy docs (no ownerUid) are claimed on first authenticated write.
    const existing = await ref.get();
    const existingOwner = existing.exists ? existing.data()?.ownerUid : undefined;
    if (existingOwner && existingOwner !== authUid) {
        res.status(403).json({ error: 'Forbidden: registration belongs to another account' });
        return;
    }
    await ref.set({
        fcmToken,
        ownerUid: authUid,
        timezone: (0, scheduler_utils_1.resolveTimezone)(timezone),
        enabled: true,
        dailyReminderEnabled: dailyReminderEnabled === true,
        reminderHour: Number.isInteger(reminderHour) ? reminderHour : null,
        reminderMinute: Number.isInteger(reminderMinute) ? reminderMinute : null,
        registeredAt: timestamp || Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true, message: 'Token registered successfully', userId });
});
exports.unregisterToken = functions.onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    let authUid;
    try {
        authUid = await (0, auth_1.requireFirebaseUid)(req);
    }
    catch {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const { userId } = req.body;
    if (!userId) {
        res.status(400).json({ error: 'Missing required field', required: ['userId'] });
        return;
    }
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        res.json({ success: true, message: 'User already unregistered', userId });
        return;
    }
    const ownerUid = userDoc.data()?.ownerUid;
    if (ownerUid && ownerUid !== authUid) {
        res.status(403).json({ error: 'Forbidden: registration belongs to another account' });
        return;
    }
    await db.collection('users').doc(userId).delete();
    res.json({ success: true, message: 'Token unregistered successfully', userId });
});
//# sourceMappingURL=fcm.js.map