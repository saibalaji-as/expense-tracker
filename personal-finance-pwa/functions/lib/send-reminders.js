"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReminders = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const reminder_messages_1 = require("./reminder-messages");
const scheduler_utils_1 = require("./scheduler-utils");
// Runs every minute so per-user reminder minutes are respected even when app is closed.
exports.sendReminders = (0, scheduler_1.onSchedule)('every 1 minutes', async () => {
    const db = (0, firestore_1.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
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
        const resolvedTz = (0, scheduler_utils_1.resolveTimezone)(timezone);
        const reminderSlot = dailyReminderEnabled === true
            ? (0, scheduler_utils_1.getDailyReminderSlot)(utcNow, resolvedTz, reminderHour, reminderMinute)
            : (0, scheduler_utils_1.getReminderSlot)(utcNow, resolvedTz);
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
                lastReminderClaimedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            claimedSlot = true;
        });
        if (!claimedSlot) {
            console.log(`⏭️  Skipping user ${userId} (already sent for ${reminderSlot} in ${resolvedTz})`);
            skippedCount++;
            continue;
        }
        const reminderMessage = (0, reminder_messages_1.getHourlyReminderMessage)(reminderSlot);
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
                lastReminderSentAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log(`✅ Notification sent to user: ${userId}`);
            sentCount++;
        }
        catch (fcmError) {
            const errorCode = fcmError?.code ?? '';
            if (errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered') {
                // Invalid token — remove the stale user record
                console.log(`🗑️  Removing invalid token for user: ${userId} (${errorCode})`);
                await db.collection('users').doc(userId).delete();
                tokenRemovedCount++;
            }
            else {
                console.error(`❌ Failed to send to user ${userId}:`, errorCode, fcmError?.message);
                errorCount++;
            }
        }
    }
    console.log(`sendReminders complete: ${usersSnapshot.size} users — ` +
        `${sentCount} sent, ${skippedCount} skipped, ${errorCount} errors, ${tokenRemovedCount} tokens removed`);
});
//# sourceMappingURL=send-reminders.js.map