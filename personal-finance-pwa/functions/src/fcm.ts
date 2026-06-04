import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import { resolveTimezone } from './scheduler-utils';

const CORS_ORIGINS = [
  'https://spenza-finance.web.app',
  'https://spenzaio.netlify.app',
  'http://localhost:4200',
  'https://localhost',    // Capacitor Android WebView
  'http://localhost',     // older Capacitor / emulator
  'capacitor://localhost', // Capacitor iOS
];

export const registerToken = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { userId, fcmToken, timezone, timestamp, dailyReminderEnabled, reminderHour, reminderMinute } = req.body;

    if (!userId || !fcmToken) {
      res.status(400).json({ error: 'Missing required fields', required: ['userId', 'fcmToken'] });
      return;
    }

    const db = admin.firestore();
    await db.collection('users').doc(userId).set({
      fcmToken,
      timezone: resolveTimezone(timezone),
      enabled: true,
      dailyReminderEnabled: dailyReminderEnabled === true,
      reminderHour: Number.isInteger(reminderHour) ? reminderHour : null,
      reminderMinute: Number.isInteger(reminderMinute) ? reminderMinute : null,
      registeredAt: timestamp || Date.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ success: true, message: 'Token registered successfully', userId });
  }
);

export const unregisterToken = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
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

    await db.collection('users').doc(userId).delete();
    res.json({ success: true, message: 'Token unregistered successfully', userId });
  }
);
