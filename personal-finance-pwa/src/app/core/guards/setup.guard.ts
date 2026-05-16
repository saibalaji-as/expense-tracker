import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { BackupModeService } from '../services/backup-mode.service';
import { AuthService } from '../services/auth.service';

function isFamilySetupComplete(backupModeService: BackupModeService): boolean {
  return (
    backupModeService.getMode() === 'family' &&
    !!backupModeService.getSharedFileId() &&
    !!backupModeService.getOwnerRole()
  );
}

export const setupGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const backupModeService = inject(BackupModeService);
  const router = inject(Router);

  await Promise.all([
    authService.sessionRestored,
    backupModeService.initialized,
  ]);

  if (authService.needsInteractiveWebToken()) {
    return router.createUrlTree(['/auth/callback']);
  }

  const url = state.url.split('?')[0].split('#')[0];
  let mode = backupModeService.getMode();

  const localSetupComplete =
    mode === 'single' ||
    (mode === 'family' && isFamilySetupComplete(backupModeService));

  if (localSetupComplete) {
    return url === '/mode-select' || url === '/family-setup'
      ? router.createUrlTree(['/daily'])
      : true;
  }

  if (authService.isAuthenticated()) {
    await backupModeService.loadFromDrive();
    mode = backupModeService.getMode();
  }

  if (mode === null) {
    return url === '/mode-select' || url === '/family-setup'
      ? true
      : router.createUrlTree(['/mode-select']);
  }

  if (mode === 'family' && !isFamilySetupComplete(backupModeService)) {
    return url === '/family-setup' ? true : router.createUrlTree(['/family-setup']);
  }

  if ((url === '/mode-select' || url === '/family-setup') && mode !== null) {
    return router.createUrlTree(['/daily']);
  }

  return true;
};
