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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { userId, intervalMinutes } = body;

    // Validate required fields
    if (!userId || !intervalMinutes) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['userId', 'intervalMinutes']
        })
      };
    }

    // Validate interval range (15 minutes to 8 hours)
    if (intervalMinutes < 15 || intervalMinutes > 480) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid interval',
          message: 'Interval must be between 15 and 480 minutes'
        })
      };
    }

    console.log(`Updating preferences for user: ${userId} to ${intervalMinutes} minutes`);

    // Check if user exists
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'User not found',
          message: 'Please enable notifications first'
        })
      };
    }

    // Update preferences
    await db.collection('users').doc(userId).update({
      intervalMinutes,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Preferences updated successfully for user: ${userId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Preferences updated successfully',
        userId,
        intervalMinutes
      })
    };
  } catch (error) {
    console.error('Error updating preferences:', error);
    
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
