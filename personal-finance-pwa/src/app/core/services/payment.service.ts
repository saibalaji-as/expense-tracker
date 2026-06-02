import { Injectable } from '@angular/core';

export type PlanId = 'pro_monthly' | 'pro_yearly';
export type PlanType = 'monthly' | 'yearly';

export interface PricingPlan {
  id: PlanId;
  planType: PlanType;
  label: string;
  priceINR: number;
  priceDisplay: string;
  period: string;
  savings?: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'pro_monthly',
    planType: 'monthly',
    label: 'Pro Monthly',
    priceINR: 499,
    priceDisplay: '₹499',
    period: '/month',
  },
  {
    id: 'pro_yearly',
    planType: 'yearly',
    label: 'Pro Yearly',
    priceINR: 3999,
    priceDisplay: '₹3,999',
    period: '/year',
    savings: 'Save 33%',
  },
];

// Cloud Run URLs for Firebase Functions v2
const FN_CREATE_SUBSCRIPTION = 'https://createrazorpaysubscription-yvut3l44sq-uc.a.run.app';
const FN_VERIFY_PAYMENT = 'https://verifyrazorpaypayment-yvut3l44sq-uc.a.run.app';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  async openRazorpay(plan: PricingPlan, idToken: string, email: string | null): Promise<void> {
    await this.#loadRazorpayScript();

    // Step 1 — create subscription on backend (backend resolves real plan ID)
    const createRes = await fetch(FN_CREATE_SUBSCRIPTION, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planType: plan.planType }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error((err as any).error ?? 'Failed to create subscription');
    }
    const { subscriptionId } = await createRes.json();

    // Step 2 — open Razorpay Standard Checkout
    return new Promise((resolve, reject) => {
      const options = {
        key: this.#razorpayKey(),
        subscription_id: subscriptionId,
        name: 'Spenza',
        description: plan.label,
        image: '/icons/icon-192x192.png',
        prefill: { email: email ?? '' },
        theme: { color: '#6366f1' },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          try {
            // Step 3 — verify signature on backend, write Firestore
            await this.#verifyPayment(response, idToken, plan.planType);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled')),
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failRes: any) =>
        reject(new Error(failRes.error?.description ?? 'Payment failed'))
      );
      rzp.open();
    });
  }

  async #verifyPayment(
    response: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    },
    idToken: string,
    planType: PlanType
  ): Promise<void> {
    const verifyRes = await fetch(FN_VERIFY_PAYMENT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...response, planType }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new Error((err as any).error ?? 'Payment verification failed');
    }
  }

  #razorpayKey(): string {
    return (window as any).__RAZORPAY_KEY_ID__ ?? '';
  }

  #loadRazorpayScript(): Promise<void> {
    if ((window as any).Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
      document.head.appendChild(script);
    });
  }
}
