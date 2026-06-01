import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Wallet,
  AlertCircle,
  Loader2,
  CalendarDays,
  SlidersHorizontal,
  LayoutDashboard,
  Cloud,
} from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { TranslatePipe } from '../../shared/pipes';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        Wallet,
        AlertCircle,
        Loader2,
        CalendarDays,
        SlidersHorizontal,
        LayoutDashboard,
        Cloud,
      }),
    },
  ],
  template: `
    <div class="min-h-[50vh] flex items-center justify-center p-6 overflow-x-hidden">
      <div class="w-full max-w-6xl">
        <!-- Desktop: two-column grid -->
        <div class="grid gap-12 md:grid-cols-2">
          
          <!-- Hero section -->
          <div class="relative flex flex-col justify-center overflow-hidden">
            <!-- Logo -->
            <div class="flex items-center gap-3 mb-8">
              <span class="grid h-16 w-16 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                <lucide-icon name="wallet" class="h-8 w-8" />
              </span>
              <span class="text-2xl font-bold">
                Spend<span class="gradient-text">Wise</span>
              </span>
            </div>

            <!-- Headline -->
            <h1 class="text-3xl font-bold tracking-tight md:text-4xl mb-4">
              {{ 'auth.title' | translate }}
            </h1>

            <!-- Subtitle -->
            <p class="text-muted-foreground mb-8">
              {{ 'auth.subtitle' | translate }}
            </p>

            <!-- Sign-in button -->
            @if (errorMessage()) {
              <!-- Error card -->
              <div class="glass-card border-destructive/40 bg-destructive/10 p-4 mb-4" role="alert" aria-live="polite">
                <div class="flex items-start gap-3">
                  <lucide-icon name="alert-circle" class="h-5 w-5 text-destructive shrink-0" />
                  <div class="flex-1">
                    <p class="text-sm text-destructive">{{ errorMessage() }}</p>
                  </div>
                </div>
              </div>
              <button 
                (click)="onSignIn()" 
                class="gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold transition-all w-full hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {{ 'common.retry' | translate }}
              </button>
            } @else {
              <button 
                (click)="onSignIn()" 
                [disabled]="isLoading()"
                [attr.aria-busy]="isLoading() ? 'true' : null"
                [attr.aria-label]="'auth.signIn' | translate"
                class="glass-card flex items-center justify-center gap-3 p-4 rounded-2xl transition-all hover:border-primary hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                @if (isLoading()) {
                  <lucide-icon name="loader-2" class="h-6 w-6 animate-spin" />
                  <span class="font-semibold">{{ 'auth.signingIn' | translate }}</span>
                } @else {
                  <!-- Google logo SVG -->
                  <svg class="h-6 w-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span class="font-semibold">{{ 'auth.signIn' | translate }}</span>
                }
              </button>
            }

            <!-- Decorative blob - contained within parent -->
            <div 
              aria-hidden="true"
              class="absolute -right-8 -top-8 h-48 w-48 rounded-full opacity-30 blur-3xl gradient-primary pointer-events-none md:-right-16 md:-top-16 md:h-64 md:w-64" 
            ></div>
          </div>

          <!-- Features section -->
          <div class="grid gap-4 sm:grid-cols-2">
            @for (feature of features; track feature.titleKey) {
              <div class="glass-card p-5">
                <div class="grid h-12 w-12 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow mb-4">
                  <lucide-icon [name]="feature.icon" class="h-6 w-6" />
                </div>
                <h3 class="text-base font-semibold mb-2">{{ feature.titleKey | translate }}</h3>
                <p class="text-sm text-muted-foreground">{{ feature.descriptionKey | translate }}</p>
              </div>
            }
          </div>

        </div>
      </div>
    </div>
  `,
})
export class AuthCallbackComponent {
  private readonly authService = inject(AuthService);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  readonly features = [
    {
      icon: 'calendar-days',
      titleKey: 'auth.feature.daily.title',
      descriptionKey: 'auth.feature.daily.description'
    },
    {
      icon: 'sliders-horizontal',
      titleKey: 'auth.feature.limits.title',
      descriptionKey: 'auth.feature.limits.description'
    },
    {
      icon: 'layout-dashboard',
      titleKey: 'auth.feature.dashboard.title',
      descriptionKey: 'auth.feature.dashboard.description'
    },
    {
      icon: 'cloud',
      titleKey: 'auth.feature.sync.title',
      descriptionKey: 'auth.feature.sync.description'
    }
  ];

  async onSignIn(): Promise<void> {
    this.errorMessage.set(null);
    this.isLoading.set(true);

    try {
      const signInResult = await this.authService.signIn();
      if (signInResult.accountChanged) {
        await this.resetAccountScopedLocalState();
      }

      // Start Firestore subscription listener once Firebase UID is available
      const uid = this.authService.firebaseUid();
      if (uid) this.subscriptionService.startListening(uid);

      await this.backupModeService.loadFromDrive(true);

      // Check if a backup mode has been selected yet.
      // If not (new user or after a mode switch), go to mode selection first.
      const mode = this.backupModeService.getMode();
      if (mode === null) {
        await this.router.navigate(['/mode-select']);
        return;
      }

      // Family mode with no file ID means setup is incomplete
      if (mode === 'family' && !this.backupModeService.getSharedFileId()) {
        await this.router.navigate(['/family-setup']);
        return;
      }

      // Mode is set — bootstrap Drive data and navigate to the app
      await this.expenseStore.loadFromDrive();
      await this.router.navigate(['/daily']);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async resetAccountScopedLocalState(): Promise<void> {
    this.expenseStore.clearLocalData();
    await Promise.all([
      this.expenseStore.clearLocalBackupCache(),
      this.backupModeService.clearLocalCacheForAccountSwitch(),
    ]);
  }
}
