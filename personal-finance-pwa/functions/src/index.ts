import * as admin from 'firebase-admin';
import { createRazorpaySubscription, verifyRazorpayPayment } from './razorpay';
import { razorpayWebhook } from './razorpay-webhook';
import { createSubscriptionHandoff, redeemSubscriptionHandoff } from './subscription-handoff';

admin.initializeApp();

export {
  createRazorpaySubscription,
  verifyRazorpayPayment,
  razorpayWebhook,
  createSubscriptionHandoff,
  redeemSubscriptionHandoff,
};
