import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { GoogleSheetsService } from '../../../core/services/google-sheets.service';
import { driveError$ } from '../../../core/services/expense-store.service';
import { BackupModeService } from '../../../core/services/backup-mode.service';
import { DriveApiError } from '../../../core/services/google-drive.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    @if (currentMessage()) {
      <div
        class="fixed bottom-16 left-0 right-0 mx-4 bg-red-600 text-white rounded-lg p-3 flex justify-between items-center z-50"
        role="alert"
        aria-live="assertive"
      >
        <span class="text-sm flex-1">{{ currentMessage() }}</span>
        @if (showSwitchToSingleUser()) {
          <button
            class="ml-3 text-white underline text-sm font-semibold hover:text-red-200 focus:outline-none whitespace-nowrap"
            (click)="onSwitchToSingleUser()"
          >
            Switch to Single User
          </button>
        }
        @if (!isPersistent()) {
          <button
            class="ml-3 text-white hover:text-red-200 focus:outline-none"
            aria-label="Dismiss notification"
            (click)="dismiss()"
          >
            ✕
          </button>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent implements OnInit, OnDestroy {
  readonly currentMessage = signal<string>('');
  readonly isPersistent = signal(false);
  readonly showSwitchToSingleUser = signal(false);

  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly backupModeService = inject(BackupModeService);
  private readonly router = inject(Router);
  private subscription?: Subscription;
  private driveSubscription?: Subscription;
  private dismissTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.subscription = this.sheetsService.apiError$.subscribe((error) => {
      this.showMessage(error.message, false, false);
    });

    this.driveSubscription = driveError$.subscribe((error) => {
      const driveErr = error as DriveApiError;
      const mode = this.backupModeService.getMode();

      if (mode === 'family' && driveErr.status === 403) {
        // Persistent toast with "Switch to Single User" action
        this.showMessage(
          'Access to the shared backup was revoked. Switch to Single User mode or ask the Owner to re-share.',
          true,
          true
        );
        return;
      }

      if (mode === 'family' && driveErr.status === 404) {
        this.showMessage('Shared backup file not found. The Owner may have deleted it.', false, false);
        return;
      }

      // Skip FAMILY_SETUP_INCOMPLETE — handled by App component navigation
      if (driveErr.message === 'FAMILY_SETUP_INCOMPLETE') {
        return;
      }

      const message = 'message' in error ? error.message : (error as Error).message;
      this.showMessage(message ?? 'Google Drive sync error', false, false);
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.driveSubscription?.unsubscribe();
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
  }

  dismiss(): void {
    this.currentMessage.set('');
    this.isPersistent.set(false);
    this.showSwitchToSingleUser.set(false);
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }
  }

  async onSwitchToSingleUser(): Promise<void> {
    await this.backupModeService.clearAll();
    this.dismiss();
    await this.router.navigate(['/mode-select']);
  }

  private showMessage(message: string, persistent: boolean, showSwitch: boolean): void {
    this.currentMessage.set(message);
    this.isPersistent.set(persistent);
    this.showSwitchToSingleUser.set(showSwitch);

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }

    if (!persistent) {
      this.dismissTimer = setTimeout(() => {
        this.currentMessage.set('');
        this.isPersistent.set(false);
        this.showSwitchToSingleUser.set(false);
        this.dismissTimer = undefined;
      }, 5000);
    }
  }
}
