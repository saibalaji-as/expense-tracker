import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import * as admin from 'firebase-admin';
import { shouldSendReminder, resolveTimezone } from './scheduler-utils';

// Netlify scheduled function — runs every hour on the hour
export const config = { schedule: '0 * * * *' };

// Initialize Firebase Admin SDK (singleton pattern)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

const db = admin.firestore();

export const handler: Handler = async (
  _event: HandlerEvent,
  _context: HandlerContext
) => {
  try {
    console.log('Starting hourly reminder check...');

    const utcNow = new Date();

    // Query only opted-in users
    const usersSnapshot = await db
      .collection('users')
      .where('enabled', '==', true)
      .get();

    console.log(`Found ${usersSnapshot.size} enabled users`);

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let tokenRemovedCount = 0;

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const userId = doc.id;
      const { fcmToken, timezone } = data;

      // Resolve timezone — falls back to "UTC" for missing/invalid values
      const resolvedTz = resolveTimezone(timezone);

      // Hour-of-day gate: sole delivery criterion
      if (!shouldSendReminder(utcNow, resolvedTz)) {
        console.log(`⏭️  Skipping user ${userId} (outside active window in ${resolvedTz})`);
        skippedCount++;
        continue;
      }

      // Build FCM message
      const message = {
        notification: {
          title: 'Spenza 💸',
          body: "Don't forget to log your expenses!",
        },
        token: fcmToken,
        webpush: {
          fcmOptions: {
            link: '/daily',
          },
          notification: {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            tag: 'spenza-reminder',
            requireInteraction: false,
            vibrate: [200, 100, 200],
          },
        },
      };

      try {
        await admin.messaging().send(message);
        console.log(`✅ Notification sent to user: ${userId}`);
        sentCount++;
      } catch (fcmError: any) {
        const errorCode: string = fcmError?.code ?? '';

        if (
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/registration-token-not-registered'
        ) {
          // Invalid token — remove the User_Record from Firestore
          console.log(`🗑️  Removing invalid token for user: ${userId} (${errorCode})`);
          await db.collection('users').doc(userId).delete();
          tokenRemovedCount++;
        } else {
          // Non-token error — log and continue processing remaining users
          console.error(
            `❌ Failed to send notification to user ${userId}:`,
            errorCode,
            fcmError?.message
          );
          errorCount++;
        }
      }
    }

    const summary = {
      success: true,
      timestamp: utcNow.toISOString(),
      totalEnabledUsers: usersSnapshot.size,
      sent: sentCount,
      skipped: skippedCount,
      errors: errorCount,
      tokensRemoved: tokenRemovedCount,
      message: `Processed ${usersSnapshot.size} enabled users: ${sentCount} sent, ${skippedCount} skipped, ${errorCount} errors, ${tokenRemovedCount} tokens removed`,
    };

    console.log('Hourly reminder check complete:', summary);

    return {
      statusCode: 200,
      body: JSON.stringify(summary),
    };
  } catch (error) {
    console.error('Error in send-reminders function:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
