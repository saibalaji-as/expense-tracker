# FCM Integration Architecture

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER DEVICE (PWA)                            │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Settings Component                             │   │
│  │  [Enable Notifications] [Interval: 60 min] [Disable]      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │           NotificationService (Orchestrator)                │   │
│  │  • Manages state (enabled/disabled)                        │   │
│  │  • Generates user ID                                       │   │
│  │  • Coordinates FCM + local notifications                   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                  FCM Service                                │   │
│  │  • Initialize Firebase                                     │   │
│  │  • Request FCM token                                       │   │
│  │  • Register service worker                                 │   │
│  │  • Call backend APIs                                       │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │         firebase-messaging-sw.js (Service Worker)           │   │
│  │  • Runs in background                                      │   │
│  │  • Receives FCM messages                                   │   │
│  │  • Shows notifications                                     │   │
│  │  • Handles clicks                                          │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────────────┐
│                    NETLIFY SERVERLESS FUNCTIONS                      │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ register-token   │  │ send-reminders   │  │ update-prefs    │  │
│  │ POST /api/...    │  │ GET /api/...     │  │ POST /api/...   │  │
│  │                  │  │                  │  │                 │  │
│  │ • Receive token  │  │ • Query users    │  │ • Update user   │  │
│  │ • Store in DB    │  │ • Check timing   │  │ • Save to DB    │  │
│  │ • Return success │  │ • Send FCM msg   │  │ • Return OK     │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘  │
│                              ↑                                       │
│                              │ Triggered by                         │
│                    ┌─────────────────────┐                         │
│                    │   CRON-JOB.ORG      │                         │
│                    │   Every 15 minutes  │                         │
│                    └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      FIREBASE SERVICES                               │
│                                                                      │
│  ┌────────────────────────────┐  ┌──────────────────────────────┐ │
│  │      Firestore Database     │  │  Firebase Cloud Messaging    │ │
│  │                             │  │                              │ │
│  │  users/                     │  │  • Receives notification     │ │
│  │    user_123.../             │  │    request from backend      │ │
│  │      fcmToken: "abc..."     │  │  • Delivers to device        │ │
│  │      intervalMinutes: 60    │  │  • Works in sleep mode       │ │
│  │      lastNotifiedAt: 123... │  │  • Wakes device              │ │
│  │      createdAt: ...         │  │  • Handles retries           │ │
│  └────────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────────┐
                    │   USER DEVICE       │
                    │   (Even in sleep)   │
                    │   🔔 Notification!  │
                    └─────────────────────┘
```

## Data Flow Examples

### 1. Enable Notifications

```
User clicks "Enable"
  ↓
NotificationService.enable(60)
  ↓
Request permission → "granted"
  ↓
FcmService.registerForNotifications("user_123", 60)
  ↓
Firebase SDK → getToken() → "fcm_token_abc123..."
  ↓
POST /.netlify/functions/register-token
  Body: { userId: "user_123", fcmToken: "fcm_token_abc123...", intervalMinutes: 60 }
  ↓
Netlify Function → Firebase Admin SDK
  ↓
Firestore.collection('users').doc('user_123').set({
  fcmToken: "fcm_token_abc123...",
  intervalMinutes: 60,
  lastNotifiedAt: 0,
  createdAt: now
})
  ↓
Response: { success: true }
  ↓
User sees: "Notifications enabled ✅"
```

### 2. Send Scheduled Notification

```
Cron-job.org triggers (every 15 min)
  ↓
GET /.netlify/functions/send-reminders
  ↓
Netlify Function:
  - Query Firestore for all users
  - For each user:
    - Check: (now - lastNotifiedAt) >= intervalMinutes?
    - If yes:
      - Send FCM message via Firebase Admin SDK
      - Update lastNotifiedAt = now
  ↓
Firebase Cloud Messaging
  ↓
Delivers to device (even if sleeping)
  ↓
firebase-messaging-sw.js receives message
  ↓
Shows notification: "Spenza 💸 - Don't forget to log your expenses!"
  ↓
User clicks notification
  ↓
App opens/focuses
```

### 3. Update Interval

```
User changes interval to 120 minutes
  ↓
NotificationService.updateInterval(120)
  ↓
FcmService.updatePreferences("user_123", 120)
  ↓
POST /.netlify/functions/update-preferences
  Body: { userId: "user_123", intervalMinutes: 120 }
  ↓
Firestore.collection('users').doc('user_123').update({
  intervalMinutes: 120,
  updatedAt: now
})
  ↓
Response: { success: true }
  ↓
Next notification will be sent after 120 minutes
```

### 4. Disable Notifications

```
User clicks "Disable"
  ↓
NotificationService.disable()
  ↓
FcmService.unregister("user_123")
  ↓
POST /.netlify/functions/unregister-token
  Body: { userId: "user_123" }
  ↓
Firestore.collection('users').doc('user_123').delete()
  ↓
Response: { success: true }
  ↓
No more notifications will be sent
```

## Key Components

### Frontend (Phase 3 - ✅ Complete)
- `fcm.service.ts` - FCM token management
- `notification.service.ts` - Orchestration layer
- `firebase-messaging-sw.js` - Background message handler
- `firebase.config.ts` - Firebase configuration

### Backend (Phase 4 - Next)
- `register-token.ts` - Store FCM tokens
- `send-reminders.ts` - Send scheduled notifications
- `update-preferences.ts` - Update user settings
- `unregister-token.ts` - Remove tokens

### External Services
- **Firebase Firestore** - User data storage
- **Firebase Cloud Messaging** - Notification delivery
- **Cron-job.org** - Scheduled triggers
- **Netlify** - Hosting + serverless functions

## Security

### Frontend (Public)
- ✅ API keys are safe to expose (Firebase web config)
- ✅ VAPID key is public
- ✅ All committed to Git

### Backend (Private)
- 🔒 Service account private key (Netlify env vars only)
- 🔒 Never committed to Git
- 🔒 Only accessible to Netlify functions

### Firestore Rules
```javascript
// Only backend can read/write
allow read, write: if false;
```

## Free Tier Limits

| Service | Free Tier | Your Usage (50 users) |
|---------|-----------|----------------------|
| Firebase FCM | Unlimited | ✅ Well within |
| Firestore | 50K reads/day | ✅ ~4,800/day (96 checks × 50 users) |
| Firestore | 20K writes/day | ✅ ~4,800/day |
| Firestore | 1GB storage | ✅ ~50KB (50 users × 1KB each) |
| Netlify Functions | 125K requests/month | ✅ ~4,320/month (96 checks × 30 days) |
| Cron-job.org | 60 requests/hour | ✅ 4 requests/hour (every 15 min) |

**Conclusion:** All services well within free tier limits! 🎉
