import { inject, Injector, runInInjectionContext } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { BackupModeService } from '../services/backup-mode.service';
import { AuthService } from '../services/auth.service';
import { shouldRedirectToIncomeSetup } from './setup-income-gate';

function isFamilySetupComplete(backupModeService: BackupModeService): boolean {
  return (
    backupModeService.getMode() === 'family' &&
    (!!backupModeService.getSharedFileId() || !!backupModeService.getFamilyId()) &&
    !!backupModeService.getOwnerRole()
  );
}

export const setupGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const backupModeService = inject(BackupModeService);
  const injector = inject(Injector);
  const router = inject(Router);

  await Promise.all([
    authService.sessionRestored,
    backupModeService.initialized,
  ]);

  const { ExpenseStore } = await import('../services/expense-store.service');
  const expenseStore = runInInjectionContext(injector, () => inject(ExpenseStore));

  const url = state.url.split('?')[0].split('#')[0];
  let mode = backupModeService.getMode();

  const localSetupComplete =
    mode === 'single' ||
    (mode === 'family' && isFamilySetupComplete(backupModeService));

  // Old Drive-based family users have sharedFileId but no firestoreFamilyId — they need
  // to go through /family-setup to migrate to Firestore sync.
  const needsFamilyMigration =
    mode === 'family' &&
    !!backupModeService.getSharedFileId() &&
    !backupModeService.getFamilyId();

  if (localSetupComplete) {
    if (url === '/mode-select' || (url === '/family-setup' && !needsFamilyMigration)) {
      return router.createUrlTree([
        expenseStore.driveFileId() && expenseStore.monthlyIncome() <= 0 ? '/limits' : '/daily',
      ]);
    }

    return shouldRedirectToIncomeSetup(url, expenseStore.driveFileId(), expenseStore.monthlyIncome())
      ? router.createUrlTree(['/limits'], { queryParams: { onboarding: 'income' } })
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
    return router.createUrlTree([
      expenseStore.driveFileId() && expenseStore.monthlyIncome() <= 0 ? '/limits' : '/daily',
    ]);
  }

  return shouldRedirectToIncomeSetup(url, expenseStore.driveFileId(), expenseStore.monthlyIncome())
    ? router.createUrlTree(['/limits'], { queryParams: { onboarding: 'income' } })
    : true;
};
