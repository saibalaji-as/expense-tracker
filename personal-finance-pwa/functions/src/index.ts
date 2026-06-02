import * as admin from 'firebase-admin';
import { createRazorpaySubscription, verifyRazorpayPayment } from './razorpay';
import { createStripeSession, stripeWebhook } from './stripe';
import { razorpayWebhook } from './razorpay-webhook';
import { sendReminders } from './send-reminders';
import { createSubscriptionHandoff, redeemSubscriptionHandoff } from './subscription-handoff';

admin.initializeApp();

export {
  createRazorpaySubscription,
  verifyRazorpayPayment,
  razorpayWebhook,
  createStripeSession,
  stripeWebhook,
  sendReminders,
  createSubscriptionHandoff,
  redeemSubscriptionHandoff,
};
