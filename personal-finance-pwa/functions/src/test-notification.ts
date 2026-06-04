import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';

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

export const testNotification = onRequest({ cors: true }, async (req, res) => {
  try {
    const db = admin.firestore();
    const userId = (req.query['userId'] as string | undefined) || (req.body as { userId?: string })?.userId;

    if (!userId) {
      const snapshot = await db.collection('users').get();
      if (snapshot.empty) {
        res.json({ success: false, message: 'No users found. Enable notifications in the app first.' });
        return;
      }

      const results = await Promise.allSettled(
        snapshot.docs.map((doc) => {
          const { fcmToken } = doc.data() as { fcmToken: string };
          return admin.messaging().send({ ...TEST_MESSAGE, token: fcmToken });
        })
      );

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

    const { fcmToken } = userDoc.data() as { fcmToken: string };
    await admin.messaging().send({ ...TEST_MESSAGE, token: fcmToken });
    res.json({ success: true, message: 'Test notification sent successfully!', userId });
  } catch (error) {
    console.error('[testNotification] Error', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
