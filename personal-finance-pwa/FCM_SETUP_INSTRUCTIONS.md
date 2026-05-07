# Firebase Cloud Messaging Setup Instructions

## Step 1: Update Firebase Configuration Files

You need to update the following files with your actual Firebase credentials:

### 1. Frontend Configuration
**File:** `src/app/core/config/firebase.config.ts`

Replace the placeholder values with your Firebase web app config:
- Get from: Firebase Console > Project Settings > General > Your apps > Web app
- Also add your VAPID key from: Project Settings > Cloud Messaging > Web Push certificates

```typescript
export const firebaseConfig = {
  apiKey: "AIzaSy...",                    // Your actual API key
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123...",
  vapidKey: "BNxxx..."                    // Your VAPID key
};
```

### 2. Service Worker Configuration
**File:** `public/firebase-messaging-sw.js`

Update the `firebase.initializeApp()` call with the same config (without vapidKey):

```javascript
firebase.initializeApp({
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123..."
});
```

## Step 2: Set Netlify Environment Variables

You need to add these environment variables in your Netlify Dashboard:

1. Go to: **Site Settings > Environment Variables**
2. Add the following variables (get values from your Firebase service account JSON):

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----
```

**Important:** 
- For `FIREBASE_PRIVATE_KEY`, copy the entire private key including the BEGIN/END lines
- Keep the `\n` characters in the key (they represent line breaks)
- Don't add quotes around the value in Netlify UI

## Step 3: Verify Setup

After updating the files:

1. ✅ Check `src/app/core/config/firebase.config.ts` has real values
2. ✅ Check `public/firebase-messaging-sw.js` has real values
3. ✅ Verify Netlify environment variables are set
4. ✅ Commit and push changes (but NOT the service account JSON file!)
5. ✅ Deploy to Netlify

## Security Notes

- ✅ `.gitignore` is already configured to exclude `.env` and `firebase-adminsdk-*.json`
- ✅ Never commit your service account JSON file to Git
- ✅ Frontend config (API key, etc.) is safe to commit - it's meant to be public
- ✅ Backend credentials (private key) must only be in Netlify environment variables

## Next Steps

Once configuration is complete, proceed to Phase 3 to create the FCM service and integrate with your app.
