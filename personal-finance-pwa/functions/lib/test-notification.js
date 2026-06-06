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
exports.testNotification = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const TEST_MESSAGE = {
    notification: {
        title: 'Test Notification',
        body: 'This is a test notification from Spenza! If you see this, FCM is working!',
    },
    webpush: {
        fcmOptions: { link: '/' },
        notification: {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            tag: 'spenza-test',
            requireInteraction: false,
            vibrate: [200, 100, 200],
        },
    },
};
exports.testNotification = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const db = admin.firestore();
        const userId = req.query['userId'] || req.body?.userId;
        if (!userId) {
            const snapshot = await db.collection('users').get();
            if (snapshot.empty) {
                res.json({ success: false, message: 'No users found. Enable notifications in the app first.' });
                return;
            }
            const results = await Promise.allSettled(snapshot.docs.map((doc) => {
                const { fcmToken } = doc.data();
                return admin.messaging().send({ ...TEST_MESSAGE, token: fcmToken });
            }));
            const sent = results.filter((r) => r.status === 'fulfilled').length;
            const errors = results.filter((r) => r.status === 'rejected').length;
            res.json({ success: true, message: `Test notification sent to ${sent} user(s)`, sent, errors, totalUsers: snapshot.size });
            return;
        }
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            res.status(404).json({ success: false, error: 'User not found', userId });
            return;
        }
        const { fcmToken } = userDoc.data();
        await admin.messaging().send({ ...TEST_MESSAGE, token: fcmToken });
        res.json({ success: true, message: 'Test notification sent successfully!', userId });
    }
    catch (error) {
        console.error('[testNotification] Error', error instanceof Error ? error.message : error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
//# sourceMappingURL=test-notification.js.map