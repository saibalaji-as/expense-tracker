import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getHourlyReminderMessage } from './reminder-messages';
import { getDailyReminderSlot, getReminderSlot, resolveTimezone } from './scheduler-utils';

// Runs every minute so per-user reminder minutes are respected even when app is closed.
export const sendReminders = onSchedule('every 1 minutes', async () => {
  const db = getFirestore();
  const messaging = getMessaging();

  const utcNow = new Date();

  const usersSnapshot = await db
    .collection('users')
    .where('enabled', '==', true)
    .get();

  console.log(`sendReminders: found ${usersSnapshot.size} enabled users`);

  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let tokenRemovedCount = 0;

  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    const userId = doc.id;
    const { fcmToken, timezone, dailyReminderEnabled, reminderHour, reminderMinute } = data;

    const resolvedTz = resolveTimezone(timezone);

    const reminderSlot = dailyReminderEnabled === true
      ? getDailyReminderSlot(utcNow, resolvedTz, reminderHour, reminderMinute)
      : getReminderSlot(utcNow, resolvedTz);

    if (!reminderSlot) {
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
        lastReminderClaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      claimedSlot = true;
    });

    if (!claimedSlot) {
      console.log(`⏭️  Skipping user ${userId} (already sent for ${reminderSlot} in ${resolvedTz})`);
      skippedCount++;
      continue;
    }

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
      await messaging.send(message);
      await userRef.set({
        lastReminderSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`✅ Notification sent to user: ${userId}`);
      sentCount++;
    } catch (fcmError: any) {
      const errorCode: string = fcmError?.code ?? '';

      if (
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/registration-token-not-registered'
      ) {
        // Invalid token — remove the stale user record
        console.log(`🗑️  Removing invalid token for user: ${userId} (${errorCode})`);
        await db.collection('users').doc(userId).delete();
        tokenRemovedCount++;
      } else {
        console.error(`❌ Failed to send to user ${userId}:`, errorCode, fcmError?.message);
        errorCount++;
      }
    }
  }

  console.log(
    `sendReminders complete: ${usersSnapshot.size} users — ` +
    `${sentCount} sent, ${skippedCount} skipped, ${errorCount} errors, ${tokenRemovedCount} tokens removed`
  );
});
