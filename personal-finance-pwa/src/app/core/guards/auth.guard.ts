import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for persisted session to be restored from storage before deciding.
  // Without this, a page reload always redirects to /auth/callback because
  // isAuthenticated() is false until the async storage read completes.
  await authService.sessionRestored;

  if (authService.isAuthenticated()) return true;

  return router.createUrlTree(['/auth/callback']);
};