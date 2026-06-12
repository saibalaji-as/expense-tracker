import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StorageService } from '../../../core/services/storage.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { UserFeedbackService } from '../../../core/services/user-feedback.service';

interface ExpenseWidgetPlugin {
  isAdded(): Promise<{ added: boolean }>;
  isSupported(): Promise<{ supported: boolean }>;
  requestPin(): Promise<{ supported: boolean }>;
  refresh(): Promise<void>;
}

const ExpenseWidget = registerPlugin<ExpenseWidgetPlugin>('ExpenseWidget');

const DISMISSED_KEY = 'spenza_widget_promo_dismissed';

@Component({
  selector: 'app-widget-promo-dialog',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <!-- Backdrop -->
      <div class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" aria-hidden="true"></div>

      <!-- Dialog -->
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Home Screen Widget"
        class="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl sm:mx-auto sm:max-w-sm"
      >
        <!-- Header -->
        <div class="flex items-start gap-4">
          <span class="shrink-0 text-[2rem] leading-none">📲</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-semibold text-foreground">Home Screen Widget</p>
              @if (!subscriptionService.isPro()) {
                <span class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:bg-primary/20 dark:text-primary">Pro</span>
              }
            </div>
            <p class="mt-1 text-sm text-muted-foreground">Add the Spenza widget to your home screen to log expenses instantly — without opening the app.</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="mt-5">
          @if (subscriptionService.isPro()) {
            <div class="flex flex-col gap-3">
              <button
                type="button"
                (click)="onAddWidget()"
                [disabled]="isRequestingPin()"
                class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                @if (isRequestingPin()) {
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                } @else {
                  📲
                }
                Add Widget
              </button>
              @if (!widgetPinSupported()) {
                <p class="text-xs text-muted-foreground text-center">To add manually: long-press your home screen → Widgets → Spenza.</p>
              }
            </div>
          } @else {
            <a
              routerLink="/subscribe"
              (click)="dismiss()"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              ✨ Upgrade to Pro
            </a>
          }
        </div>

        <!-- Don't show again -->
        <label class="mt-4 flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            [checked]="dontShowAgain()"
            (change)="onDontShowAgainChange($event)"
            class="h-4 w-4 rounded border-border accent-primary cursor-pointer"
          />
          <span class="text-sm text-muted-foreground">Don't show again</span>
        </label>
      </div>
    }
  `,
})
export class WidgetPromoDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly storageService = inject(StorageService);
  readonly subscriptionService = inject(SubscriptionService);
  private readonly feedback = inject(UserFeedbackService);

  readonly visible = signal(false);
  readonly isRequestingPin = signal(false);
  readonly widgetPinSupported = signal(false);
  readonly dontShowAgain = signal(false);

  private checked = false;

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated() && !this.checked) {
        this.checked = true;
        void this.maybeShow();
      }
    });
  }

  private async maybeShow(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const dismissed = await this.storageService.get(DISMISSED_KEY);
    if (dismissed === '1') return;

    try {
      const { added } = await ExpenseWidget.isAdded();
      if (added) {
        await this.storageService.set(DISMISSED_KEY, '1');
        return;
      }
    } catch {
      // fall through and show the dialog if the check fails
    }

    try {
      const { supported } = await ExpenseWidget.isSupported();
      this.widgetPinSupported.set(supported);
    } catch {
      this.widgetPinSupported.set(false);
    }

    this.visible.set(true);
  }

  async onAddWidget(): Promise<void> {
    if (this.isRequestingPin()) return;
    this.isRequestingPin.set(true);
    try {
      const { supported } = await ExpenseWidget.requestPin();
      if (supported) {
        this.feedback.success('Widget request sent', 'Follow the system prompt to add the Spenza widget to your home screen.');
      } else {
        this.feedback.info('Not supported', 'Your launcher does not support pinning widgets this way. Long-press your home screen and choose Widgets to add it manually.');
      }
      await this.storageService.set(DISMISSED_KEY, '1');
      this.visible.set(false);
    } catch {
      this.feedback.info('Add widget manually', 'Long-press your home screen, choose Widgets, and find Spenza.');
    } finally {
      this.isRequestingPin.set(false);
    }
  }

  async onDontShowAgainChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.dontShowAgain.set(checked);
    if (checked) {
      await this.storageService.set(DISMISSED_KEY, '1');
      this.visible.set(false);
    }
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
