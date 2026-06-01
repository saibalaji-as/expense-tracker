import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AuthService } from '../services/auth.service';
import { SubscriptionService } from '../services/subscription.service';

const SUBSCRIBE_URL = 'https://spenza-finance.web.app/#/subscribe';

export const subscriptionGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const subscriptionService = inject(SubscriptionService);
  const router = inject(Router);

  await authService.sessionRestored;

  const uid = authService.firebaseUid();
  if (!uid) {
    // No Firebase UID yet — allow through (authGuard already gates authentication)
    return true;
  }

  const sub = await subscriptionService.fetchOnce(uid);

  // Free tier always gets through — guard only blocks pro-only routes
  if (sub.tier === 'free') return true;

  if (!sub.isActive) {
    if (Capacitor.isNativePlatform()) {
      // On Android: open the web subscribe page.
      // Install @capacitor/browser and replace this with Browser.open() for in-app browser.
      window.open(SUBSCRIBE_URL, '_system');
      return false;
    }
    return router.createUrlTree(['/subscribe']);
  }

  return true;
};
