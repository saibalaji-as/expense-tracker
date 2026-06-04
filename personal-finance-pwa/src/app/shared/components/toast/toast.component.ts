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
import { UserFeedbackService, UserFeedbackTone } from '../../../core/services/user-feedback.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    @if (feedback.message(); as message) {
      <div
        [class]="toastClass(message.tone)"
        [attr.role]="message.tone === 'error' || message.tone === 'warning' ? 'alert' : 'status'"
        [attr.aria-live]="message.tone === 'error' || message.tone === 'warning' ? 'assertive' : 'polite'"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold">{{ message.title }}</p>
          @if (message.detail) {
            <p class="mt-0.5 text-xs opacity-90">{{ message.detail }}</p>
          }
        </div>
        @if (showSwitchToSingleUser()) {
          <button
            class="ml-3 text-white underline text-sm font-semibold hover:text-red-200 focus:outline-none whitespace-nowrap"
            (click)="onSwitchToSingleUser()"
          >
            Switch to Single User
          </button>
        }
        <button
          class="ml-3 shrink-0 text-white opacity-70 hover:opacity-100 focus:outline-none"
          aria-label="Dismiss notification"
          (click)="dismiss()"
        >
          ✕
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent implements OnInit, OnDestroy {
  readonly showSwitchToSingleUser = signal(false);

  readonly feedback = inject(UserFeedbackService);
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly backupModeService = inject(BackupModeService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private subscription?: Subscription;
  private driveSubscription?: Subscription;

  ngOnInit(): void {
    this.subscription = this.sheetsService.apiError$.subscribe((error) => {
      this.feedback.error(
        'Could not save to Google Sheets.',
        `${error.message} Check your connection and spreadsheet access, then try again.`,
        false
      );
    });

    this.driveSubscription = driveError$.subscribe((error) => {
      const driveErr = error as DriveApiError;
      const mode = this.backupModeService.getMode();

      if (mode === 'family' && driveErr.status === 403) {
        // Persistent toast with "Switch to Single User" action
        this.feedback.error(
          'Shared backup access was revoked.',
          'Ask the owner to share the family Drive folder again, or switch this device to Single User mode.',
          true
        );
        this.showSwitchToSingleUser.set(true);
        return;
      }

      if (mode === 'family' && driveErr.status === 404) {
        this.showSwitchToSingleUser.set(false);
        this.feedback.error(
          'Shared backup file was not found.',
          'Ask the owner to confirm the family backup still exists in Google Drive.',
          true
        );
        return;
      }

      // Skip FAMILY_SETUP_INCOMPLETE — handled by App component navigation
      if (driveErr.message === 'FAMILY_SETUP_INCOMPLETE') {
        return;
      }

      if (driveErr.status === 401) {
        this.authService.clearToken();
        this.showSwitchToSingleUser.set(false);
        this.feedback.error(
          'Google session expired.',
          'Please sign out and sign in again to continue.',
          true
        );
        return;
      }

      this.showSwitchToSingleUser.set(false);
      this.feedback.error(
        'Could not save changes to Google Drive.',
        'Check your internet connection and Drive permissions, then try again.',
        true
      );
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.driveSubscription?.unsubscribe();
  }

  dismiss(): void {
    this.showSwitchToSingleUser.set(false);
    this.feedback.dismiss();
  }

  async onSwitchToSingleUser(): Promise<void> {
    await this.backupModeService.clearAll();
    this.dismiss();
    await this.router.navigate(['/mode-select']);
  }

  toastClass(tone: UserFeedbackTone): string {
    const base = 'fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-0 right-0 z-[70] mx-4 flex items-start gap-3 rounded-2xl p-4 text-white shadow-2xl min-[887px]:bottom-6 min-[887px]:left-auto min-[887px]:right-6 min-[887px]:w-[min(420px,calc(100vw-3rem))]';
    const toneClass: Record<UserFeedbackTone, string> = {
      success: 'bg-emerald-600',
      error: 'bg-red-600',
      warning: 'bg-amber-600',
      info: 'bg-sky-600',
    };
    return `${base} ${toneClass[tone]}`;
  }
}
