import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AuthService } from '../services/auth.service';
import { SubscriptionService, SubscriptionStatus } from '../services/subscription.service';

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

  const uid = authService.firebaseUid();
  if (!uid) return true;

  // Guarantee the listener is running, then wait for the first snapshot (max 6s).
  subscriptionService.ensureStarted(uid);
  await subscriptionService.waitUntilLoaded();

  const sub: SubscriptionStatus = subscriptionService.status();

  const requiresPro = route.data?.['requiresPro'] === true;

  if (!requiresPro) return true;

  // Pro-only route: block free users and users with expired subscriptions.
  if (sub.tier === 'free' || !sub.isActive) {
    return redirectToSubscribe(authService, router);
  }

  return true;
};
