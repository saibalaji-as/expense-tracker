// NOT DEPLOYED — port reminder logic from netlify/functions/send-reminders.ts before enabling
import * as functions from 'firebase-functions/v2/scheduler';

/**
 * Scheduled reminder — runs every 30 minutes.
 * Migrated from Netlify scheduled function.
 * Implement FCM reminder logic here (port from netlify/functions/send-reminders.ts).
 */
export const sendReminders = functions.onSchedule('every 30 minutes', async () => {
  // TODO: port reminder logic from netlify/functions/send-reminders.ts
  console.log('sendReminders: scheduled run');
});
