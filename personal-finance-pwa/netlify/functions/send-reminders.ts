import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import * as admin from 'firebase-admin';
import { getHourlyReminderMessage } from './reminder-messages';
import { getDailyReminderSlot, getReminderSlot, resolveTimezone } from './scheduler-utils';

// Netlify scheduled function — runs every minute so push fallback reminders can
// respect the user's chosen reminder minute even when the app is closed.
export const config = { schedule: '* * * * *' };

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
    console.log('Starting reminder check...');

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
      const { fcmToken, timezone, dailyReminderEnabled, reminderHour, reminderMinute } = data;

      // Resolve timezone — falls back to "UTC" for missing/invalid values
      const resolvedTz = resolveTimezone(timezone);

      // Prefer the user-selected daily reminder time when available. Older
      // push-only registrations keep the existing hourly 08:00-22:00 behavior.
      const reminderSlot = dailyReminderEnabled === true
        ? getDailyReminderSlot(utcNow, resolvedTz, reminderHour, reminderMinute)
        : getReminderSlot(utcNow, resolvedTz);
      if (!reminderSlot) {
        console.log(`⏭️  Skipping user ${userId} (outside reminder slot in ${resolvedTz})`);
        skippedCount++;
        continue;
      }

      const userRef = db.collection('users').doc(userId);
      let claimedSlot = false;
      await db.runTransaction(async (transaction) => {
        const latestDoc = await transaction.get(userRef);
        const latestData = latestDoc.data();

        if (!latestDoc.exists || latestData?.lastReminderSlot === reminderSlot) {
          return;
        }

        transaction.set(userRef, {
          lastReminderSlot: reminderSlot,
          lastReminderClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        claimedSlot = true;
      });

      if (!claimedSlot) {
        console.log(`⏭️  Skipping user ${userId} (already claimed/sent for ${reminderSlot} in ${resolvedTz})`);
        skippedCount++;
        continue;
      }

      // Build FCM message
      const reminderMessage = getHourlyReminderMessage(reminderSlot);
      const message = {
        notification: {
          title: reminderMessage.title,
          body: reminderMessage.body,
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
        await userRef.set({
          lastReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
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

    console.log('Reminder check complete:', summary);

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
