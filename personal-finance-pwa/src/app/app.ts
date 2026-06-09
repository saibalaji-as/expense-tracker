import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { AppShellComponent } from './shared/components/app-shell/app-shell.component';
import { WidgetPromoDialogComponent } from './shared/components/widget-promo-dialog/widget-promo-dialog.component';
import { ExpenseStore, driveError$ } from './core/services/expense-store.service';
import { AuthService } from './core/services/auth.service';
import { BackupModeService } from './core/services/backup-mode.service';
import { SubscriptionService } from './core/services/subscription.service';
import { FamilySyncService } from './core/services/family-sync.service';
import { DriveApiError, DriveParseError } from './core/services/google-drive.service';
import { shouldRedirectToIncomeSetup } from './core/guards/setup-income-gate';

const LOADING_TIMEOUT_MS = 30000;
const DRIVE_POLL_INTERVAL_MS = 30000;
const BOOTSTRAP_RETRY_DELAYS_MS = [750, 2000];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, OfflineBannerComponent, ToastComponent, AppShellComponent, WidgetPromoDialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly familySyncService = inject(FamilySyncService);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly loadingError = signal<string | null>(null);
  readonly needsFamilyMigration = signal(false);
  readonly migrationBannerDismissed = signal(false);
  private loadingTimeoutId: number | null = null;
  private drivePollIntervalId: number | null = null;
  private driveErrorSubscription: Subscription | null = null;
  private routeScrollSubscription: Subscription | null = null;
  private isRefreshingFromDrive = false;
  private hasRenderedCachedData = false;

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

    // Ensure subscription listener is running before any route guard fires
    const restoredUid = this.authService.firebaseUid();
    if (restoredUid) {
      this.subscriptionService.ensureStarted(restoredUid);
    }

    // NOTE: family sync listener is NOT started here — it must start only after
    // expenseStore.loadFromDrive() completes (lines below and in bootstrapDriveInBackground).
    // Starting it early causes a race: the initial Firestore snapshot applies deltas to the
    // store, then loadFromDrive() overwrites the store with the (empty) Drive file, and since
    // all delta IDs are already in #processedIds they are never re-emitted.

    if (!this.authService.isAuthenticated()) {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
      return;
    }

    const loadedCachedData = await this.tryLoadCachedStartupData();
    if (loadedCachedData) {
      this.clearLoadingTimeout();
      this.loadingError.set(null);
      this.isLoading.set(false);
      this.hasRenderedCachedData = true;
      await this.redirectAfterDataAvailable();
      void this.bootstrapDriveInBackground();
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
    try {
      await this.withBootstrapRetries(() => this.backupModeService.loadFromDrive(), 'backup config');
    } catch (err: unknown) {
      if ((err as any)?.status === 403) {
        // The token is invalid or missing the required scopes. Discard it so
        // the next ensureToken() call forces a fresh interactive consent, then
        // send the user to the re-auth page rather than the new-user flow.
        this.authService.clearToken();
        this.clearLoadingTimeout();
        this.isLoading.set(false);
        console.warn('[App] Drive config returned 403 — redirecting to re-auth:', err);
        await this.router.navigate(['/auth/callback']);
        return;
      }
      throw err;
    }

    this.checkLegacyFamilyMode();

    const mode = this.backupModeService.getMode();
    if (mode === null) {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
      await this.router.navigate(['/mode-select']);
      return;
    }
    // Only redirect to family-setup when both the old Drive IDs and the new Firestore ID are absent.
    // Firestore-backed family users have no sharedFileId by design.
    if (mode === 'family' && !this.backupModeService.getSharedFileId() && !this.backupModeService.getFamilyId()) {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
      await this.router.navigate(['/family-setup']);
      return;
    }

    // ── Loophole 2: owner subscription lapse check ────────────────────────────
    // The subscription listener is already running (started above). Wait for it
    // to settle (max 6s), then block the owner if their Pro subscription lapsed.
    // Partners are free-tier by design — skip the check for them.
    if (mode === 'family' && this.backupModeService.getOwnerRole() === 'owner') {
      await this.subscriptionService.waitUntilLoaded();
      if (!this.subscriptionService.isPro()) {
        this.clearLoadingTimeout();
        this.isLoading.set(false);
        await this.router.navigate(['/subscribe']);
        return;
      }
    }

    console.log('[App] Starting Drive bootstrap...');
    await this.withBootstrapRetries(async () => {
      await this.expenseStore.loadFromDrive();
      if (this.expenseStore.syncStatus() === 'error') {
        throw new Error('Drive bootstrap failed.');
      }
    }, 'backup data');
    console.log('[App] Drive bootstrap complete. driveFileId:', this.expenseStore.driveFileId());

    this.loadingError.set(null);
    this.tryStartFamilySync();
    this.startDrivePollLoop();
    await this.redirectAfterDataAvailable();
  }

  private async tryLoadCachedStartupData(): Promise<boolean> {
    const mode = this.backupModeService.getMode();
    const localSetupComplete =
      mode === 'single' ||
      (mode === 'family' && (!!this.backupModeService.getSharedFileId() || !!this.backupModeService.getFamilyId()));

    if (!localSetupComplete) return false;

    return this.expenseStore.loadFromLocalCache();
  }

  private async redirectAfterDataAvailable(): Promise<void> {
    const currentUrl = this.router.url.split('?')[0].split('#')[0];
    const isSetupRoute = currentUrl === '/mode-select' || currentUrl === '/family-setup';

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

  private async bootstrapDriveInBackground(): Promise<void> {
    try {
      await this.backupModeService.loadFromDrive();
      this.checkLegacyFamilyMode();

      const mode = this.backupModeService.getMode();
      if (mode === null || (mode === 'family' && !this.backupModeService.getSharedFileId() && !this.backupModeService.getFamilyId())) {
        return;
      }

      // ── Loophole 2 (cached path): owner subscription lapse check ─────────────
      // Same gate as the non-cached path — owner whose Pro lapsed gets redirected
      // to /subscribe even when they had a valid local cache on startup.
      if (mode === 'family' && this.backupModeService.getOwnerRole() === 'owner') {
        await this.subscriptionService.waitUntilLoaded();
        if (!this.subscriptionService.isPro()) {
          await this.router.navigate(['/subscribe']);
          return;
        }
      }

      await this.expenseStore.loadFromDrive();
      if (this.expenseStore.syncStatus() !== 'error') {
        this.startDrivePollLoop();
        await this.redirectAfterDataAvailable();
        // Owner proactively pushes current state so the Firestore document always exists
        // for any partner that joins or re-logs in before the owner makes a local change.
        if (this.backupModeService.getMode() === 'family' &&
            this.backupModeService.getOwnerRole() === 'owner') {
          this.expenseStore.pushFamilyStateNow();
        }
      }
    } catch (err) {
      console.warn('[App] Background Drive bootstrap failed:', err);
    } finally {
      // Family sync uses Firebase Auth, not the Google OAuth token — start it
      // even when Drive fails so the Firestore listener runs on reload when the
      // in-memory access token has been lost.
      this.tryStartFamilySync();
    }
  }

  private async withBootstrapRetries<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= BOOTSTRAP_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        // 403 is an auth failure — retrying won't help, bail immediately.
        if ((err as any)?.status === 403) break;
        const delay = BOOTSTRAP_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        console.warn(`[App] ${label} load failed, retrying in ${delay}ms:`, err);
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private tryStartFamilySync(): void {
    const familyId = this.backupModeService.getFamilyId();
    if (this.backupModeService.getMode() !== 'family' || !familyId) return;

    const status = this.familySyncService.syncStatus();
    const listeningToSameFamily = this.familySyncService.familyId() === familyId;

    if (listeningToSameFamily && status !== 'error') {
      // Detect stale WebSocket: if supposedly connected but no event in 2+ minutes, force restart.
      const lastSync = this.familySyncService.lastSyncAt();
      if (status === 'connected' && lastSync) {
        const staleSince = Date.now() - new Date(lastSync).getTime();
        if (staleSince < 2 * 60 * 1000) return; // still fresh — do nothing
      } else if (status !== 'connected') {
        return; // 'idle' with correct family — nothing to fix
      }
      // Connected but stale (> 2 min with no event) — fall through to restart.
    }

    // startListening handles Firebase auth internally via ensureFirebaseSignedInSilently.
    this.familySyncService.startListening(familyId, this.authService.firebaseUid() ?? '');
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
      this.tryStartFamilySync();
    }
  };

  private readonly focusHandler = () => {
    void this.refreshBackupIfChanged();
    this.tryStartFamilySync();
  };

  private readonly resumeHandler = () => {
    void this.refreshBackupIfChanged();
    this.tryStartFamilySync();
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
        case 401:
          return 'Google session expired. Please sign out and sign in again.';
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
        // Only Drive-based family (sharedFileId set, no Firestore ID) is incomplete here.
        // Firestore-family members have no sharedFileId by design — don't redirect them.
        if (this.backupModeService.getSharedFileId() && !this.backupModeService.getFamilyId()) {
          void this.router.navigate(['/family-setup']);
        }
        return;
      }

      if (driveErr.status === 401) {
        this.authService.clearToken();
        console.warn('[App] Drive returned 401 — token cleared, user must re-sign-in:', driveErr);
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
      if (!this.hasRenderedCachedData) {
        this.loadingError.set(errorMessage);
        this.isLoading.set(false); // Stop loading state when error occurs
      }

      console.error('[App] Drive error:', err);
    });

    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('focus', this.focusHandler);
    // Capacitor fires 'resume' on the document when the native app returns to foreground.
    // This is more reliable than visibilitychange on Android/iOS after long background sessions.
    document.addEventListener('resume', this.resumeHandler);
    this.routeScrollSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.scrollToPageTop());

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
    this.familySyncService.stopListening();
    this.driveErrorSubscription?.unsubscribe();
    this.routeScrollSubscription?.unsubscribe();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('focus', this.focusHandler);
    document.removeEventListener('resume', this.resumeHandler);
  }

  dismissMigrationBanner(): void {
    this.migrationBannerDismissed.set(true);
  }

  private checkLegacyFamilyMode(): void {
    const isOldFamilyMode =
      this.backupModeService.getMode() === 'family'
      && (this.backupModeService.sharedFileId() || this.backupModeService.familyFolderId())
      && !this.backupModeService.getFamilyId();
    if (isOldFamilyMode) {
      this.needsFamilyMigration.set(true);
    }
  }

  private scrollToPageTop(): void {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }
}
