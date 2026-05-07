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

/**
 * Test function to send a notification immediately to a specific user
 * Usage: /.netlify/functions/test-notification?userId=YOUR_USER_ID
 */
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
    // Get userId from query parameter
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      // If no userId provided, send to all users
      console.log('No userId provided, sending to all users...');
      
      const usersSnapshot = await db.collection('users').get();
      
      if (usersSnapshot.empty) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'No users found. Please enable notifications in your app first.',
            hint: 'Go to Settings → Enable Notifications'
          })
        };
      }

      const notifications: Promise<any>[] = [];
      let sentCount = 0;
      let errorCount = 0;

      for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        const { fcmToken } = data;

        console.log(`Sending test notification to user: ${doc.id}`);

        const message = {
          notification: {
            title: '🧪 Test Notification',
            body: 'This is a test notification from Spenza! If you see this, FCM is working! 🎉'
          },
          token: fcmToken,
          webpush: {
            fcmOptions: {
              link: '/'
            },
            notification: {
              icon: '/icons/icon-192x192.png',
              badge: '/icons/icon-96x96.png',
              tag: 'spenza-test',
              requireInteraction: false,
              vibrate: [200, 100, 200]
            }
          }
        };

        const notificationPromise = admin.messaging()
          .send(message)
          .then(() => {
            console.log(`✅ Test notification sent to user: ${doc.id}`);
            sentCount++;
          })
          .catch((error) => {
            console.error(`❌ Failed to send to user ${doc.id}:`, error.code, error.message);
            errorCount++;
          });

        notifications.push(notificationPromise);
      }

      await Promise.all(notifications);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Test notification sent to ${sentCount} user(s)`,
          sent: sentCount,
          errors: errorCount,
          totalUsers: usersSnapshot.size
        })
      };
    }

    // Send to specific user
    console.log(`Sending test notification to user: ${userId}`);

    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'User not found',
          message: `No user found with ID: ${userId}`,
          hint: 'Check Firestore console for correct userId'
        })
      };
    }

    const userData = userDoc.data();
    const { fcmToken } = userData!;

    // Send test notification
    const message = {
      notification: {
        title: '🧪 Test Notification',
        body: 'This is a test notification from Spenza! If you see this, FCM is working! 🎉'
      },
      token: fcmToken,
      webpush: {
        fcmOptions: {
          link: '/'
        },
        notification: {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'spenza-test',
          requireInteraction: false,
          vibrate: [200, 100, 200]
        }
      }
    };

    await admin.messaging().send(message);

    console.log(`✅ Test notification sent successfully to user: ${userId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Test notification sent successfully!',
        userId,
        hint: 'Check your device for the notification'
      })
    };
  } catch (error) {
    console.error('Error sending test notification:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check Netlify function logs for details'
      })
    };
  }
};
