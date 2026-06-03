import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AuthService } from '../services/auth.service';
import { SubscriptionService, SubscriptionStatus } from '../services/subscription.service';

// Opens the subscribe page on native (external browser handoff) or returns a
// web redirect — shared by both the expired-subscription and free-on-pro-only paths.
async function redirectToSubscribe(
  authService: AuthService,
  router: Router
): Promise<boolean | UrlTree> {
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

export const subscriptionGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
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

  // Free tier is blocked on routes marked `data: { proOnly: true }` and redirected
  // to subscribe; on ordinary guarded routes free tier is allowed through as normal.
  const isProOnly = route.data?.['proOnly'] === true;
  if (sub.tier === 'free') {
    if (!isProOnly) return true;
    return redirectToSubscribe(authService, router);
  }

  if (!sub.isActive) {
    return redirectToSubscribe(authService, router);
  }

  return true;
};
