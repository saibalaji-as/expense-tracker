import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AuthService } from '../services/auth.service';
import { SubscriptionService, SubscriptionStatus } from '../services/subscription.service';

export const subscriptionGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const subscriptionService = inject(SubscriptionService);
  const router = inject(Router);

  await authService.sessionRestored;

  // No UID yet — let authGuard handle authentication, don't block here
  const uid = authService.firebaseUid();
  if (!uid) return true;

  let sub: SubscriptionStatus;

  if (subscriptionService.loaded()) {
    // startListening() already received a Firestore response — reuse it to avoid
    // a duplicate read on every route navigation
    sub = subscriptionService.status();
  } else {
    // Race fetchOnce against a 5-second timeout.
    // On timeout the guard falls back to the cached signal value so a Pro user
    // who is temporarily offline (or whose startListening() fired before the
    // guard runs) is not incorrectly downgraded to free.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const result = await Promise.race([subscriptionService.fetchOnce(uid), timeout]);
    sub = result ?? subscriptionService.status();
  }

  // Free tier always gets through — guard only blocks pro-only routes
  if (sub.tier === 'free') return true;

  if (!sub.isActive) {
    if (Capacitor.isNativePlatform()) {
      try {
        const url = await authService.createSubscriptionPageUrl();
        await Browser.open({ url });
      } catch (err) {
        console.error('[subscriptionGuard] Could not open subscription page:', err);
      }
      return false;
    }
    return router.createUrlTree(['/subscribe']);
  }

  return true;
};
