import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK (singleton pattern)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

const db = admin.firestore();

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    console.log('Starting reminder check...');
    
    const now = Date.now();
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`Found ${usersSnapshot.size} registered users`);

    const notifications: Promise<any>[] = [];
    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const debugInfo: any[] = [];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const { fcmToken, intervalMinutes, lastNotifiedAt = 0 } = data;

      // Calculate if notification is due
      const intervalMs = intervalMinutes * 60 * 1000;
      const timeSinceLastNotification = now - lastNotifiedAt;
      const minutesSinceLast = Math.round(timeSinceLastNotification / 60000);
      const minutesUntilNext = Math.round((intervalMs - timeSinceLastNotification) / 60000);

      debugInfo.push({
        userId: doc.id,
        intervalMinutes,
        lastNotifiedAt,
        minutesSinceLastNotification: minutesSinceLast,
        minutesUntilNext: minutesUntilNext > 0 ? minutesUntilNext : 0,
        isDue: timeSinceLastNotification >= intervalMs
      });

      if (timeSinceLastNotification >= intervalMs) {
        console.log(`Sending notification to user: ${doc.id} (last notified ${Math.round(timeSinceLastNotification / 60000)} minutes ago)`);

        // Prepare FCM message
        const message = {
          notification: {
            title: 'Spenza 💸',
            body: "Don't forget to log your expenses!"
          },
          token: fcmToken,
          webpush: {
            fcmOptions: {
              link: '/'
            },
            notification: {
              icon: '/icons/icon-192x192.png',
              badge: '/icons/icon-96x96.png',
              tag: 'spenza-reminder',
              requireInteraction: false,
              vibrate: [200, 100, 200]
            }
          }
        };

        // Send notification and update timestamp
        const notificationPromise = admin.messaging()
          .send(message)
          .then(() => {
            console.log(`✅ Notification sent to user: ${doc.id}`);
            sentCount++;
            
            // Update last notified timestamp
            return db.collection('users').doc(doc.id).update({
              lastNotifiedAt: now,
              lastNotificationSentAt: admin.firestore.FieldValue.serverTimestamp()
            });
          })
          .catch((error) => {
            console.error(`❌ Failed to send to user ${doc.id}:`, error.code, error.message);
            errorCount++;
            
            // Handle invalid tokens
            if (
              error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered'
            ) {
              console.log(`Removing invalid token for user: ${doc.id}`);
              return db.collection('users').doc(doc.id).delete();
            }
          });

        notifications.push(notificationPromise);
      } else {
        console.log(`⏭️  Skipping user ${doc.id} (next notification in ${minutesUntilNext} minutes)`);
        skippedCount++;
      }
    }

    // Wait for all notifications to complete
    await Promise.all(notifications);

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      totalUsers: usersSnapshot.size,
      sent: sentCount,
      skipped: skippedCount,
      errors: errorCount,
      message: `Processed ${usersSnapshot.size} users: ${sentCount} sent, ${skippedCount} skipped, ${errorCount} errors`,
      debug: debugInfo
    };

    console.log('Reminder check complete:', summary);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(summary)
    };
  } catch (error) {
    console.error('Error in send-reminders function:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
