import * as admin from 'firebase-admin';
import { createRazorpaySubscription, verifyRazorpayPayment, restoreRazorpaySubscription, cancelRazorpaySubscription } from './razorpay';
import { razorpayWebhook, webhookHealthCheck } from './razorpay-webhook';
import { createSubscriptionHandoff, redeemSubscriptionHandoff } from './subscription-handoff';
import { sendReminders } from './send-reminders';
import { registerToken, unregisterToken } from './fcm';
import { extractReceipt } from './ai-receipt';
import { generateInsights } from './ai-insights';
import { parseVoiceExpense } from './ai-voice';
import { testNotification } from './test-notification';
import { createFamily, createFamilyInvite, redeemFamilyInvite, dissolveFamily, leaveFamily } from './family';

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
  registerToken,
  unregisterToken,
  extractReceipt,
  generateInsights,
  parseVoiceExpense,
  testNotification,
  createFamily,
  createFamilyInvite,
  redeemFamilyInvite,
  dissolveFamily,
  leaveFamily,
};
