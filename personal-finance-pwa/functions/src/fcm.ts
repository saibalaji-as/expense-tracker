import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import { resolveTimezone } from './scheduler-utils';
import { requireFirebaseUid } from './auth';

export const registerToken = functions.onRequest(
  { cors: true, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Only signed-in Spenza users may write to the token registry.
    let authUid: string;
    try {
      authUid = await requireFirebaseUid(req);
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      userId,
      fcmToken,
      timezone,
      timestamp,
      platform,
      tokenOnly,
      dailyReminderEnabled,
      reminderHour,
      reminderMinute,
    } = req.body;

    if (!userId || !fcmToken) {
      res.status(400).json({ error: 'Missing required fields', required: ['userId', 'fcmToken'] });
      return;
    }

    const db = admin.firestore();
    const ref = db.collection('users').doc(userId);

    // Bind the registration to the Firebase account that created it.
    // Legacy docs (no ownerUid) are claimed on first authenticated write.
    const existing = await ref.get();
    const existingOwner = existing.exists ? (existing.data()?.ownerUid as string | undefined) : undefined;
    if (existingOwner && existingOwner !== authUid) {
      res.status(403).json({ error: 'Forbidden: registration belongs to another account' });
      return;
    }

    // Always-present device-token fields. `platform` lets the reminder scheduler
    // target web devices only (native uses local notifications).
    const payload: Record<string, unknown> = {
      fcmToken,
      ownerUid: authUid,
      timezone: resolveTimezone(timezone),
      registeredAt: timestamp || Date.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (platform === 'web' || platform === 'native') {
      payload.platform = platform;
    }

    // `tokenOnly` registrations (e.g. ensuring a web datetime-reminder can be
    // delivered) must NOT opt the device into the recurring daily/hourly nudge
    // scheduler — so we leave `enabled` and the daily-reminder fields untouched.
    if (tokenOnly !== true) {
      payload.enabled = true;
      payload.dailyReminderEnabled = dailyReminderEnabled === true;
      payload.reminderHour = Number.isInteger(reminderHour) ? reminderHour : null;
      payload.reminderMinute = Number.isInteger(reminderMinute) ? reminderMinute : null;
    }

    await ref.set(payload, { merge: true });

    res.json({ success: true, message: 'Token registered successfully', userId });
  }
);

export const unregisterToken = functions.onRequest(
  { cors: true, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    let authUid: string;
    try {
      authUid = await requireFirebaseUid(req);
    } catch {
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

    const ownerUid = userDoc.data()?.ownerUid as string | undefined;
    if (ownerUid && ownerUid !== authUid) {
      res.status(403).json({ error: 'Forbidden: registration belongs to another account' });
      return;
    }

    await db.collection('users').doc(userId).delete();
    res.json({ success: true, message: 'Token unregistered successfully', userId });
  }
);
