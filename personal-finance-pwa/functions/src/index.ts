import * as admin from 'firebase-admin';
import { createRazorpaySubscription, verifyRazorpayPayment } from './razorpay';
import { razorpayWebhook } from './razorpay-webhook';
import { createSubscriptionHandoff, redeemSubscriptionHandoff } from './subscription-handoff';
import { sendReminders } from './send-reminders';

admin.initializeApp();

export {
  createRazorpaySubscription,
  verifyRazorpayPayment,
  razorpayWebhook,
  createSubscriptionHandoff,
  redeemSubscriptionHandoff,
  sendReminders,
};
