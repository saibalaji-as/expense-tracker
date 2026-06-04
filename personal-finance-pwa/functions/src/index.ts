import * as admin from 'firebase-admin';
import { createRazorpaySubscription, verifyRazorpayPayment, restoreRazorpaySubscription, cancelRazorpaySubscription } from './razorpay';
import { razorpayWebhook, webhookHealthCheck } from './razorpay-webhook';
import { createSubscriptionHandoff, redeemSubscriptionHandoff } from './subscription-handoff';
import { sendReminders } from './send-reminders';
import { registerToken, unregisterToken } from './fcm';

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
};
