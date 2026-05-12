import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { AppShellComponent } from './shared/components/app-shell/app-shell.component';
import { ExpenseStore, driveError$ } from './core/services/expense-store.service';
import { AuthService } from './core/services/auth.service';
import { BackupModeService } from './core/services/backup-mode.service';
import { DriveApiError, DriveParseError } from './core/services/google-drive.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, OfflineBannerComponent, ToastComponent, AppShellComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly loadingError = signal<string | null>(null);
  private loadingTimeoutId: number | null = null;

  private startLoadingTimeout(): void {
    // Clear any existing timeout
    if (this.loadingTimeoutId !== null) {
      clearTimeout(this.loadingTimeoutId);
    }

    this.loadingTimeoutId = window.setTimeout(() => {
      if (this.isLoading()) {
        console.warn('[App] Loading timeout after 10s');
        this.loadingError.set('Couldn\'t load data');
        this.isLoading.set(false);
      }
    }, 10000); // 10 seconds
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
    void this.expenseStore.loadFromDrive();
  }

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
    driveError$.subscribe((err) => {
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

    // Wait for persisted auth state to be read from storage before checking
    await this.authService.sessionRestored;

    console.log('[App] sessionRestored — isAuthenticated:', this.authService.isAuthenticated());

    if (!this.authService.isAuthenticated()) {
      // Not authenticated (or scope version changed — user needs to sign in again)
      this.clearLoadingTimeout();
      this.isLoading.set(false);
      return;
    }

    // Load config from Drive to get cross-device mode/sharedFileId
    await this.backupModeService.loadFromDrive();

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

    console.log('[App] Starting Drive bootstrap...');
    try {
      await this.expenseStore.loadFromDrive();
      console.log('[App] Drive bootstrap complete. driveFileId:', this.expenseStore.driveFileId());
    } catch (err) {
      // Error already handled by driveError$ subscription
      console.error('[App] Bootstrap failed:', err);
    } finally {
      this.clearLoadingTimeout();
      this.isLoading.set(false);
    }
  }
}
