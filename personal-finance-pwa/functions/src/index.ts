import * as admin from 'firebase-admin';
import { createRazorpaySubscription, verifyRazorpayPayment, restoreRazorpaySubscription, cancelRazorpaySubscription } from './razorpay';
import { razorpayWebhook, webhookHealthCheck } from './razorpay-webhook';
import { createSubscriptionHandoff, redeemSubscriptionHandoff } from './subscription-handoff';
import { sendReminders } from './send-reminders';
import { sendDueReminders } from './send-due-reminders';
import { registerToken, unregisterToken } from './fcm';
import { extractReceipt } from './ai-receipt';
import { generateInsights } from './ai-insights';
import { parseVoiceExpense } from './ai-voice';
import { parseVoiceReminder } from './ai-reminder';
// SECURITY: testNotification is intentionally NOT deployed to production.
// It allowed unauthenticated callers to push notifications to every user.
// Re-import locally only when testing with the Firebase emulator.
import { createFamily, createFamilyInvite, redeemFamilyInvite, dissolveFamily, leaveFamily } from './family';
import { syncWidgetExpenseToFamily } from './widget-sync';
import { exchangeGoogleAuthCode, getGoogleAccessToken } from './google-tokens';

admin.initializeApp();

export {
  createRazorpaySubscription,
  verifyRazorpayPayment,
  restoreRazorpaySubscription,
  cancelRazorpaySubscription,
  razorpayWebhook,
  webhookHealthCheck,
  createSubscriptionHandoff,
  redeemSubscriptionHandoff,
  sendReminders,
  sendDueReminders,
  registerToken,
  unregisterToken,
  extractReceipt,
  generateInsights,
  parseVoiceExpense,
  parseVoiceReminder,
  createFamily,
  createFamilyInvite,
  redeemFamilyInvite,
  dissolveFamily,
  leaveFamily,
  syncWidgetExpenseToFamily,
  exchangeGoogleAuthCode,
  getGoogleAccessToken,
};
