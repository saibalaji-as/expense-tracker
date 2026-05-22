import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { AppShellComponent } from './shared/components/app-shell/app-shell.component';
import { ExpenseStore, driveError$ } from './core/services/expense-store.service';
import { AuthService } from './core/services/auth.service';
import { BackupModeService } from './core/services/backup-mode.service';
import { DriveApiError, DriveParseError } from './core/services/google-drive.service';
import { shouldRedirectToIncomeSetup } from './core/guards/setup-income-gate';

const LOADING_TIMEOUT_MS = 30000;
const DRIVE_POLL_INTERVAL_MS = 30000;
const BOOTSTRAP_RETRY_DELAYS_MS = [750, 2000];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, OfflineBannerComponent, ToastComponent, AppShellComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly loadingError = signal<string | null>(null);
  private loadingTimeoutId: number | null = null;
  private drivePollIntervalId: number | null = null;
  private driveErrorSubscription: Subscription | null = null;
  private isRefreshingFromDrive = false;

  private startLoadingTimeout(): void {
    // Clear any existing timeout
    if (this.loadingTimeoutId !== null) {
      clearTimeout(this.loadingTimeoutId);
    }

    this.loadingTimeoutId = window.setTimeout(() => {
      if (this.isLoading()) {
        console.warn(`[App] Loading timeout after ${LOADING_TIMEOUT_MS / 1000}s`);
        this.loadingError.set('Couldn\'t load data');
        this.isLoading.set(false);
      }
    }, LOADING_TIMEOUT_MS);
  }

  private clearLoadingTimeout(): void {
    if (this.loadingTimeoutId !== null) {
      clearTimeout(this.loadingTimeoutId);
      this.loadingTimeoutId = null;
    }
  }

  retryLoading(): void {
    console.log('[App] User initiated retry');
    this.loadingError.set(null);
    this.isLoading.set(true);
    this.startLoadingTimeout(); // Restart timeout timer
    void (async () => {
      try {
        await this.bootstrapData();
      } catch (err) {
        console.error('[App] Retry failed:', err);
      } finally {
        this.clearLoadingTimeout();
        this.isLoading.set(false);
      }
    })();
  }

  private async bootstrapData(): Promise<void> {
    // Wait for persisted auth and backup-mode caches before using their signals.
    await Promise.all([
      this.authService.sessionRestored,
      this.backupModeService.initialized,
    ]);

    console.log('[App] sessionRestored — isAuthenticated:', this.authService.isAuthenticated());

    if (!this.authService.isAuthenticated()) {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
      return;
    }

    if (this.router.url.startsWith('/auth/callback') && this.authService.needsInteractiveWebToken()) {
      this.clearLoadingTimeout();
      this.loadingError.set(null);
      this.isLoading.set(false);
      return;
    }

    if (this.authService.needsInteractiveWebToken()) {
      this.clearLoadingTimeout();
      this.loadingError.set(null);
      this.isLoading.set(false);
      await this.router.navigate(['/auth/callback']);
      return;
    }

    // Load config from Drive to get cross-device mode/sharedFileId.
    await this.withBootstrapRetries(() => this.backupModeService.loadFromDrive(), 'backup config');

    const mode = this.backupModeService.getMode();
    if (mode === null) {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
      await this.router.navigate(['/mode-select']);
      return;
    }
    if (mode === 'family' && !this.backupModeService.getSharedFileId()) {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
      await this.router.navigate(['/family-setup']);
      return;
    }

    const currentUrl = this.router.url.split('?')[0].split('#')[0];
    const isSetupRoute = currentUrl === '/mode-select' || currentUrl === '/family-setup';

    console.log('[App] Starting Drive bootstrap...');
    await this.withBootstrapRetries(async () => {
      await this.expenseStore.loadFromDrive();
      if (this.expenseStore.syncStatus() === 'error') {
        throw new Error('Drive bootstrap failed.');
      }
    }, 'backup data');
    console.log('[App] Drive bootstrap complete. driveFileId:', this.expenseStore.driveFileId());

    this.loadingError.set(null);
    this.startDrivePollLoop();

    const needsIncomeSetup = this.expenseStore.monthlyIncome() <= 0;

    if (isSetupRoute) {
      await this.router.navigate([needsIncomeSetup ? '/limits' : '/daily'], {
        queryParams: needsIncomeSetup ? { onboarding: 'income' } : undefined,
      });
      return;
    }

    if (
      shouldRedirectToIncomeSetup(
        currentUrl,
        this.expenseStore.driveFileId(),
        this.expenseStore.monthlyIncome()
      )
    ) {
      await this.router.navigate(['/limits'], { queryParams: { onboarding: 'income' } });
    }
  }

  private async withBootstrapRetries<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= BOOTSTRAP_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await operation();
      } catch (err) {
        if (this.authService.needsInteractiveWebToken()) {
          await this.router.navigate(['/auth/callback']);
          throw err;
        }
        lastError = err;
        const delay = BOOTSTRAP_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        console.warn(`[App] ${label} load failed, retrying in ${delay}ms:`, err);
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private startDrivePollLoop(): void {
    if (this.drivePollIntervalId !== null || !this.expenseStore.driveFileId()) {
      return;
    }

    this.drivePollIntervalId = window.setInterval(() => {
      void this.refreshBackupIfChanged();
    }, DRIVE_POLL_INTERVAL_MS);
  }

  private stopDrivePollLoop(): void {
    if (this.drivePollIntervalId !== null) {
      clearInterval(this.drivePollIntervalId);
      this.drivePollIntervalId = null;
    }
  }

  private async refreshBackupIfChanged(): Promise<void> {
    if (
      this.isRefreshingFromDrive ||
      this.isLoading() ||
      this.loadingError() ||
      !this.authService.isAuthenticated() ||
      !this.expenseStore.driveFileId() ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    this.isRefreshingFromDrive = true;
    try {
      await this.expenseStore.refreshFromDriveIfChanged();
    } catch (err) {
      console.warn('[App] Drive poll refresh failed:', err);
    } finally {
      this.isRefreshingFromDrive = false;
    }
  }

  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      void this.refreshBackupIfChanged();
    }
  };

  private readonly focusHandler = () => {
    void this.refreshBackupIfChanged();
  };

  /**
   * Maps Drive error types to user-friendly error messages
   * @param err - DriveApiError or DriveParseError from the Drive service
   * @returns User-friendly error message string
   */
  private mapDriveErrorToMessage(err: DriveApiError | DriveParseError): string {
    // Handle DriveApiError with status codes
    if ('status' in err) {
      switch (err.status) {
        case 403:
          return 'Access denied. Please check sharing permissions.';
        case 404:
          return 'Backup file not found. Please check your Drive.';
        default:
          // Check for network-related errors in the message
          if (err.message?.toLowerCase().includes('network') || 
              err.message?.toLowerCase().includes('fetch')) {
            return 'Network error. Please check your connection.';
          }
          return 'Couldn\'t load data';
      }
    }
    // Handle DriveParseError or any other error type
    return 'Couldn\'t load data';
  }

  async ngOnInit(): Promise<void> {
    // Start timeout timer
    this.startLoadingTimeout();

    // Forward Drive errors to the toast notification mechanism
    this.driveErrorSubscription = driveError$.subscribe((err) => {
      const driveErr = err as DriveApiError;
      const mode = this.backupModeService.getMode();

      if (driveErr.message === 'FAMILY_SETUP_INCOMPLETE') {
        void this.router.navigate(['/family-setup']);
        return;
      }

      if (mode === 'family' && driveErr.status === 403) {
        // Persistent 403 toast handled by ToastComponent via driveError$ subscription
        // The message is already set correctly in ExpenseStore
        console.error('[App] Family backup access revoked:', driveErr);
        return;
      }

      if (mode === 'family' && driveErr.status === 404) {
        console.error('[App] Family backup file not found:', driveErr);
        return;
      }

      // Map error to user-friendly message and set loading error state
      const errorMessage = this.mapDriveErrorToMessage(err);
      this.loadingError.set(errorMessage);
      this.isLoading.set(false); // Stop loading state when error occurs

      console.error('[App] Drive error:', err);
    });

    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('focus', this.focusHandler);

    try {
      await this.bootstrapData();
    } catch (err) {
      // Error already handled by driveError$ subscription
      console.error('[App] Bootstrap failed:', err);
    } finally {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.clearLoadingTimeout();
    this.stopDrivePollLoop();
    this.driveErrorSubscription?.unsubscribe();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('focus', this.focusHandler);
  }
}
