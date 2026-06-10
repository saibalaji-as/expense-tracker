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
  Users,
  TrendingUp,
  ShieldCheck,
  Smartphone,
  Zap,
} from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { FamilySyncService } from '../../core/services/family-sync.service';
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
        Users,
        TrendingUp,
        ShieldCheck,
        Smartphone,
        Zap,
      }),
    },
  ],
  styles: [`
    .landing-root {
      position: relative;
      min-height: 100vh;
      overflow-x: hidden;
    }

    .blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(90px);
      opacity: 0.18;
      background: var(--gradient-primary);
      pointer-events: none;
      z-index: 0;
    }
    .blob-1 {
      width: 520px; height: 520px;
      top: -120px; left: -160px;
      animation: floatA 20s ease-in-out infinite;
    }
    .blob-2 {
      width: 380px; height: 380px;
      top: 30%; right: -100px;
      animation: floatB 26s ease-in-out infinite;
    }
    .blob-3 {
      width: 300px; height: 300px;
      bottom: 10%; left: 40%;
      animation: floatC 32s ease-in-out infinite;
    }

    @keyframes floatA {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(40px, 30px) scale(1.05); }
      66% { transform: translate(-20px, 50px) scale(0.97); }
    }
    @keyframes floatB {
      0%, 100% { transform: translate(0, 0) scale(1); }
      40% { transform: translate(-50px, 40px) scale(1.08); }
      70% { transform: translate(20px, -30px) scale(0.95); }
    }
    @keyframes floatC {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(-30px, -40px) scale(1.06); }
    }

    .hero-section {
      position: relative;
      z-index: 1;
      max-width: 680px;
      margin: 0 auto;
      padding: 5rem 1.5rem 3rem;
      text-align: center;
    }

    .tagline-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.3rem 0.85rem;
      border-radius: 999px;
      border: 1px solid color-mix(in oklab, var(--primary) 40%, transparent);
      background: color-mix(in oklab, var(--primary) 8%, transparent);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      margin-bottom: 1.5rem;
    }

    .sign-in-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 1rem 2rem;
      border-radius: 1rem;
      font-size: 1rem;
      font-weight: 600;
      width: 100%;
      max-width: 360px;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .sign-in-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: var(--primary);
      box-shadow: 0 0 24px color-mix(in oklab, var(--primary) 35%, transparent);
    }
    .sign-in-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .trust-strip {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.4rem 1.2rem;
      margin-top: 1.25rem;
    }
    .trust-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      color: var(--muted-foreground);
    }
    .trust-dot {
      width: 3px; height: 3px;
      border-radius: 50%;
      background: var(--muted-foreground);
      opacity: 0.4;
    }

    .features-section {
      position: relative;
      z-index: 1;
      max-width: 1100px;
      margin: 0 auto;
      padding: 1rem 1.5rem 5rem;
    }
    .features-heading {
      text-align: center;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 2rem;
      letter-spacing: -0.02em;
    }

    .features-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: 1fr;
    }
    @media (min-width: 640px) {
      .features-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1024px) {
      .features-grid { grid-template-columns: repeat(4, 1fr); }
      .feature-card-wide { grid-column: span 2; }
    }

    .feature-card {
      border-radius: var(--radius-xl);
      border: 1px solid color-mix(in oklab, var(--primary) 20%, transparent);
      background-color: color-mix(in oklab, var(--card) 55%, transparent);
      backdrop-filter: blur(12px);
      padding: 1.5rem;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      animation: fadeInUp 0.5s ease both;
    }
    .feature-card:hover {
      transform: translateY(-4px);
      border-color: color-mix(in oklab, var(--primary) 50%, transparent);
      box-shadow: 0 8px 32px color-mix(in oklab, var(--primary) 15%, transparent);
    }

    .feature-card-wide .feature-inner {
      display: flex;
      align-items: flex-start;
      gap: 1.25rem;
    }
    .feature-card-wide .feature-text { flex: 1; }

    .feature-icon-wrap {
      display: grid;
      place-items: center;
      width: 3rem; height: 3rem;
      border-radius: 0.75rem;
      background: var(--gradient-primary);
      flex-shrink: 0;
      margin-bottom: 1rem;
      box-shadow: 0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent);
    }
    .feature-card-wide .feature-icon-wrap { margin-bottom: 0; }

    .feature-title {
      font-size: 0.9375rem;
      font-weight: 700;
      margin-bottom: 0.375rem;
      letter-spacing: -0.01em;
    }
    .feature-desc {
      font-size: 0.8125rem;
      color: var(--muted-foreground);
      line-height: 1.5;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .bottom-cta {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 0 1.5rem 5rem;
    }

    .retry-card {
      border-radius: var(--radius-xl);
      border: 1px solid color-mix(in oklab, var(--destructive) 40%, transparent);
      background: color-mix(in oklab, var(--destructive) 10%, transparent);
      padding: 1rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      max-width: 360px;
      margin-left: auto;
      margin-right: auto;
    }
  `],
  template: `
    <div class="landing-root">

      <!-- Animated background blobs -->
      <div aria-hidden="true" class="blob blob-1"></div>
      <div aria-hidden="true" class="blob blob-2"></div>
      <div aria-hidden="true" class="blob blob-3"></div>

      <!-- ── HERO ── -->
      <section class="hero-section">

        <!-- Logo -->
        <div style="display:flex; align-items:center; justify-content:center; gap:0.75rem; margin-bottom:1.5rem;">
          <span style="display:grid; place-items:center; width:3.5rem; height:3.5rem; border-radius:1rem; flex-shrink:0;"
                class="gradient-primary shadow-glow">
            <lucide-icon name="wallet" style="width:1.75rem; height:1.75rem; color:white;" />
          </span>
          <span style="font-size:1.5rem; font-weight:800; letter-spacing:-0.02em;">
            Spenza
          </span>
        </div>

        <!-- Tagline chip -->
        <div>
          <span class="tagline-chip">
            <lucide-icon name="zap" style="width:0.75rem; height:0.75rem;" class="gradient-text" />
            <span class="gradient-text">{{ 'auth.tagline' | translate }}</span>
          </span>
        </div>

        <!-- Headline -->
        <h1 style="font-size:clamp(1.75rem, 5vw, 2.75rem); font-weight:800; letter-spacing:-0.03em; line-height:1.15; margin-bottom:1rem;">
          {{ 'auth.title' | translate }}
        </h1>

        <!-- Subtitle -->
        <p style="font-size:1rem; color:var(--muted-foreground); margin-bottom:2rem; max-width:480px; margin-left:auto; margin-right:auto; line-height:1.6;">
          {{ 'auth.subtitle' | translate }}
        </p>

        <!-- Sign-in / Error -->
        @if (errorMessage()) {
          <div class="retry-card" role="alert" aria-live="polite">
            <lucide-icon name="alert-circle" style="width:1.25rem; height:1.25rem; flex-shrink:0;" class="text-destructive" />
            <p style="font-size:0.875rem;" class="text-destructive">{{ errorMessage() }}</p>
          </div>
          <button (click)="onSignIn()"
            class="sign-in-btn gradient-primary shadow-glow"
            style="color:white; border:none;">
            {{ 'common.retry' | translate }}
          </button>
        } @else {
          <button (click)="onSignIn()"
            [disabled]="isLoading()"
            [attr.aria-busy]="isLoading() ? 'true' : null"
            [attr.aria-label]="'auth.signIn' | translate"
            class="sign-in-btn glass-card">
            @if (isLoading()) {
              <lucide-icon name="loader-2" style="width:1.25rem; height:1.25rem;" class="animate-spin" />
              <span>{{ 'auth.signingIn' | translate }}</span>
            } @else {
              <svg style="width:1.25rem; height:1.25rem; flex-shrink:0;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>{{ 'auth.signIn' | translate }}</span>
            }
          </button>
        }

        <!-- Trust badges -->
        <div class="trust-strip">
          <span class="trust-item">
            <lucide-icon name="shield-check" style="width:0.875rem; height:0.875rem;" />
            {{ 'auth.trust.free' | translate }}
          </span>
          <span class="trust-dot"></span>
          <span class="trust-item">{{ 'auth.trust.private' | translate }}</span>
          <span class="trust-dot"></span>
          <span class="trust-item">{{ 'auth.trust.noads' | translate }}</span>
          <span class="trust-dot"></span>
          <span class="trust-item">{{ 'auth.trust.drive' | translate }}</span>
        </div>

      </section>

      <!-- ── FEATURES ── -->
      <section class="features-section">
        <h2 class="features-heading">
          <span class="gradient-text">{{ 'auth.features.heading' | translate }}</span>
        </h2>

        <div class="features-grid">

          <!-- Wide card: Daily -->
          <div class="feature-card feature-card-wide" style="animation-delay: 0.05s;">
            <div class="feature-inner">
              <div class="feature-icon-wrap">
                <lucide-icon name="calendar-days" style="width:1.25rem; height:1.25rem; color:white;" />
              </div>
              <div class="feature-text">
                <h3 class="feature-title">{{ 'auth.feature.daily.title' | translate }}</h3>
                <p class="feature-desc">{{ 'auth.feature.daily.description' | translate }}</p>
              </div>
            </div>
          </div>

          <!-- Wide card: Dashboard -->
          <div class="feature-card feature-card-wide" style="animation-delay: 0.1s;">
            <div class="feature-inner">
              <div class="feature-icon-wrap">
                <lucide-icon name="layout-dashboard" style="width:1.25rem; height:1.25rem; color:white;" />
              </div>
              <div class="feature-text">
                <h3 class="feature-title">{{ 'auth.feature.dashboard.title' | translate }}</h3>
                <p class="feature-desc">{{ 'auth.feature.dashboard.description' | translate }}</p>
              </div>
            </div>
          </div>

          <!-- Regular cards -->
          @for (feature of regularFeatures; track feature.titleKey; let i = $index) {
            <div class="feature-card" [style.animation-delay]="(0.15 + i * 0.05) + 's'">
              <div class="feature-icon-wrap">
                <lucide-icon [name]="feature.icon" style="width:1.125rem; height:1.125rem; color:white;" />
              </div>
              <h3 class="feature-title">{{ feature.titleKey | translate }}</h3>
              <p class="feature-desc">{{ feature.descriptionKey | translate }}</p>
            </div>
          }

        </div>
      </section>

      <!-- ── BOTTOM CTA ── -->
      <section class="bottom-cta">
        @if (!errorMessage()) {
          <button (click)="onSignIn()"
            [disabled]="isLoading()"
            class="sign-in-btn gradient-primary shadow-glow"
            style="color:white; border:none;">
            @if (isLoading()) {
              <lucide-icon name="loader-2" style="width:1.25rem; height:1.25rem;" class="animate-spin" />
              <span>{{ 'auth.signingIn' | translate }}</span>
            } @else {
              <span>{{ 'auth.signIn' | translate }}</span>
            }
          </button>
        }
      </section>

    </div>
  `,
})
export class AuthCallbackComponent {
  private readonly authService = inject(AuthService);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly familySyncService = inject(FamilySyncService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  readonly regularFeatures = [
    { icon: 'sliders-horizontal', titleKey: 'auth.feature.limits.title', descriptionKey: 'auth.feature.limits.description' },
    { icon: 'cloud', titleKey: 'auth.feature.sync.title', descriptionKey: 'auth.feature.sync.description' },
    { icon: 'users', titleKey: 'auth.feature.family.title', descriptionKey: 'auth.feature.family.description' },
    { icon: 'trending-up', titleKey: 'auth.feature.insights.title', descriptionKey: 'auth.feature.insights.description' },
    { icon: 'shield-check', titleKey: 'auth.feature.privacy.title', descriptionKey: 'auth.feature.privacy.description' },
    { icon: 'smartphone', titleKey: 'auth.feature.offline.title', descriptionKey: 'auth.feature.offline.description' },
  ];

  async onSignIn(): Promise<void> {
    this.errorMessage.set(null);
    this.isLoading.set(true);

    try {
      const signInResult = await this.authService.signIn();
      if (signInResult.accountChanged) {
        await this.resetAccountScopedLocalState();
      }

      const uid = this.authService.firebaseUid();
      if (uid) this.subscriptionService.ensureStarted(uid);

      await this.backupModeService.loadFromDrive(true);

      const mode = this.backupModeService.getMode();
      if (mode === null) {
        await this.router.navigate(['/mode-select']);
        return;
      }

      if (mode === 'family' && !this.backupModeService.getSharedFileId() && !this.backupModeService.getFamilyId()) {
        await this.router.navigate(['/family-setup']);
        return;
      }

      await this.router.navigate(['/daily']);

      const familyId = this.backupModeService.getFamilyId();
      void (async () => {
        await this.expenseStore.loadFromDrive();
        if (mode === 'family' && familyId && uid) {
          this.familySyncService.startListening(familyId, uid);
        }
      })();
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
