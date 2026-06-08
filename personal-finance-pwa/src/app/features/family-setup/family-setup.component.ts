import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  LucideAngularModule, LucideIconProvider, LUCIDE_ICONS,
  Crown, Users, Copy, Check, Loader2, AlertCircle, Lock,
} from 'lucide-angular';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { FamilyApiService, FamilyApiError } from '../../core/services/family-api.service';
import { FamilySyncService } from '../../core/services/family-sync.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { AuthService } from '../../core/services/auth.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { TranslatePipe } from '../../shared/pipes';
import { ClearableInputDirective } from '../../shared/components';

type SetupStep =
  | 'role-select'
  | 'owner-creating'
  | 'owner-ready'
  | 'partner-enter-code'
  | 'partner-joining'
  | 'done'
  | 'owner-paywall';

@Component({
  selector: 'app-family-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ClearableInputDirective, LucideAngularModule, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Crown, Users, Copy, Check, Loader2, AlertCircle, Lock }),
    },
  ],
  template: `
    <div class="min-h-[50vh] flex items-center justify-center p-6">
      <div class="w-full max-w-lg">

        <!-- Step: Role Selection -->
        @if (step() === 'role-select') {
          <div class="mb-8 text-center">
            <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'family.title' | translate }}</h1>
            <p class="text-muted-foreground text-sm">{{ 'family.description' | translate }}</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <button type="button" (click)="onSelectOwner()"
              class="glass-card flex flex-col items-center gap-4 p-6 rounded-2xl transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                <lucide-icon name="crown" class="h-7 w-7" />
              </span>
              <div class="text-center">
                <p class="font-semibold text-base mb-1">{{ 'family.owner.title' | translate }}</p>
                <p class="text-xs text-muted-foreground">{{ 'family.owner.description' | translate }}</p>
              </div>
            </button>
            <button type="button" (click)="onSelectPartner()"
              class="glass-card flex flex-col items-center gap-4 p-6 rounded-2xl transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                <lucide-icon name="users" class="h-7 w-7" />
              </span>
              <div class="text-center">
                <p class="font-semibold text-base mb-1">{{ 'family.partner.title' | translate }}</p>
                <p class="text-xs text-muted-foreground">{{ 'family.partner.description' | translate }}</p>
              </div>
            </button>
          </div>
        }

        <!-- Step: Owner — Pro paywall -->
        @if (step() === 'owner-paywall') {
          <div class="text-center">
            <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow mx-auto mb-6">
              <lucide-icon name="lock" class="h-7 w-7" />
            </span>
            <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'family.ownerPaywall.title' | translate }}</h1>
            <p class="text-muted-foreground text-sm mb-8">{{ 'family.ownerPaywall.description' | translate }}</p>
            <button type="button" (click)="onGoToPro()"
              class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold mb-3">
              {{ 'family.ownerPaywall.upgrade' | translate }}
            </button>
            <button type="button" (click)="step.set('role-select')"
              class="w-full rounded-2xl border border-border px-6 py-3 text-sm text-muted-foreground hover:bg-accent transition-colors">
              {{ 'family.ownerPaywall.back' | translate }}
            </button>
          </div>
        }

        <!-- Step: Owner — creating family + invite (loading or invite-retry error) -->
        @if (step() === 'owner-creating') {
          <div class="text-center">
            @if (!errorMessage()) {
              <lucide-icon name="loader-2" class="h-10 w-10 animate-spin mx-auto mb-4 text-primary" />
              <p class="text-muted-foreground text-sm">{{ 'family.checking' | translate }}</p>
            } @else {
              <div class="glass-card border-destructive/40 bg-destructive/10 p-4 mb-6 rounded-2xl text-left" role="alert">
                <div class="flex items-start gap-3">
                  <lucide-icon name="alert-circle" class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p class="text-sm text-destructive">{{ errorMessage()! | translate }}</p>
                </div>
              </div>
              <button type="button" (click)="onRetryInvite()"
                class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold mb-3">
                {{ 'common.retry' | translate }}
              </button>
              <button type="button" (click)="step.set('role-select')"
                class="w-full rounded-2xl border border-border px-6 py-3 text-sm text-muted-foreground hover:bg-accent transition-colors">
                {{ 'family.ownerPaywall.back' | translate }}
              </button>
            }
          </div>
        }

        <!-- Step: Owner — ready, show invite code -->
        @if (step() === 'owner-ready') {
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'family.invite.ownerReady.title' | translate }}</h1>
            <p class="text-muted-foreground text-xs mb-4">{{ 'family.invite.ownerReady.expiry' | translate }}</p>

            <!-- Invite code display with copy button -->
            <div class="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-4 mb-4">
              <code class="flex-1 font-mono text-2xl font-bold tracking-widest text-center text-foreground">
                {{ inviteCode() }}
              </code>
              <button type="button" (click)="onCopyCode()"
                class="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
                [attr.aria-label]="'family.copyFileId' | translate">
                @if (copied()) {
                  <lucide-icon name="check" class="h-4 w-4" style="color: var(--success)" />
                } @else {
                  <lucide-icon name="copy" class="h-4 w-4" />
                }
              </button>
            </div>

            <!-- Instruction -->
            <div class="glass-card p-4 rounded-2xl mb-6 text-sm text-muted-foreground">
              <p>{{ 'family.invite.ownerReady.instruction' | translate }}</p>
            </div>
          </div>

          <button type="button" (click)="onProceedToApp()"
            class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold">
            {{ 'family.invite.ownerReady.continue' | translate }}
          </button>
        }

        <!-- Step: Partner — enter invite code -->
        @if (step() === 'partner-enter-code') {
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'family.invite.partner.title' | translate }}</h1>
            <p class="text-muted-foreground text-sm mb-4">{{ 'family.invite.partner.description' | translate }}</p>

            @if (errorMessage()) {
              <div class="glass-card border-destructive/40 bg-destructive/10 p-4 mb-4 rounded-2xl" role="alert">
                <div class="flex items-start gap-3">
                  <lucide-icon name="alert-circle" class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p class="text-sm text-destructive">{{ errorMessage()! | translate }}</p>
                </div>
              </div>
            }

            <input appClearable
              type="text"
              [(ngModel)]="inviteCodeInput"
              [placeholder]="'family.invite.partner.placeholder' | translate"
              class="w-full rounded-2xl border border-border bg-card/60 px-4 py-3 font-mono text-base uppercase tracking-widest text-foreground outline-none focus:border-primary mb-3"
              maxlength="8"
              autocomplete="off"
              autocapitalize="characters"
              aria-label="Invite code"
              (input)="onInviteCodeInput($event)"
            />

            <button type="button" (click)="onPartnerJoin()"
              [disabled]="!inviteCodeInput.trim()"
              class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              {{ 'family.invite.partner.connect' | translate }}
            </button>
          </div>
        }

        <!-- Step: Partner — joining -->
        @if (step() === 'partner-joining') {
          <div class="text-center">
            <lucide-icon name="loader-2" class="h-10 w-10 animate-spin mx-auto mb-4 text-primary" />
            <p class="text-muted-foreground text-sm">{{ 'family.connecting' | translate }}</p>
          </div>
        }

      </div>
    </div>
  `,
})
export class FamilySetupComponent {
  private readonly backupModeService = inject(BackupModeService);
  private readonly familyApiService = inject(FamilyApiService);
  private readonly familySyncService = inject(FamilySyncService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly authService = inject(AuthService);
  private readonly userFeedback = inject(UserFeedbackService);
  private readonly router = inject(Router);

  readonly step = signal<SetupStep>('role-select');
  /** Stores an i18n key or plain English string shown in error banners. */
  readonly errorMessage = signal<string | null>(null);
  readonly inviteCode = signal<string | null>(null);
  readonly copied = signal(false);

  inviteCodeInput = '';

  /** Stored after createFamily succeeds so invite retry can reuse the same familyId. */
  #pendingFamilyId: string | null = null;

  onSelectOwner(): void {
    this.errorMessage.set(null);
    if (!this.subscriptionService.isPro()) {
      this.step.set('owner-paywall');
      return;
    }
    this.#startOwnerFlow();
  }

  onSelectPartner(): void {
    this.step.set('partner-enter-code');
    this.errorMessage.set(null);
    this.inviteCodeInput = '';
  }

  onInviteCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    this.inviteCodeInput = upper;
    input.value = upper;
  }

  async onGoToPro(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        const url = await this.authService.createSubscriptionPageUrl();
        await Browser.open({ url });
      } catch (err) {
        console.error('[FamilySetup] Could not open subscription page:', err);
      }
    } else {
      await this.router.navigate(['/subscribe']);
    }
  }

  async onRetryInvite(): Promise<void> {
    if (!this.#pendingFamilyId) return;
    this.errorMessage.set(null);
    await this.#createInviteAndFinish(this.#pendingFamilyId);
  }

  async onCopyCode(): Promise<void> {
    const code = this.inviteCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard unavailable — user can manually copy the displayed code
    }
  }

  async onProceedToApp(): Promise<void> {
    await this.router.navigate(['/daily']);
  }

  async onPartnerJoin(): Promise<void> {
    const code = this.inviteCodeInput.trim().toUpperCase();
    if (!code) return;

    this.step.set('partner-joining');
    this.errorMessage.set(null);

    try {
      const { familyId } = await this.familyApiService.redeemFamilyInvite(code);
      await this.backupModeService.setFirestoreFamilyId(familyId);
      await this.backupModeService.setFamilyConfig(null, null, 'partner');
      const uid = this.authService.firebaseUid();
      if (uid) {
        this.familySyncService.startListening(familyId, uid);
      }
      await this.router.navigate(['/daily']);
    } catch (err: unknown) {
      if (err instanceof FamilyApiError) {
        if (err.status === 404) {
          this.errorMessage.set('family.invite.error.expired');
        } else if (err.status === 409) {
          // 409 now only occurs when a *different* user already redeemed this code.
          // Same-user retries are handled server-side (idempotent — returns familyId).
          this.errorMessage.set('family.invite.error.alreadyUsed');
        } else {
          this.errorMessage.set('family.invite.error.network');
        }
      } else {
        this.errorMessage.set('family.invite.error.network');
      }
      this.step.set('partner-enter-code');
    }
  }

  #startOwnerFlow(): void {
    this.step.set('owner-creating');
    this.errorMessage.set(null);
    this.#pendingFamilyId = null;

    void (async () => {
      let familyId: string;
      try {
        const result = await this.familyApiService.createFamily();
        familyId = result.familyId;
        this.#pendingFamilyId = familyId;
      } catch (err) {
        console.error('[FamilySetup] createFamily failed:', err);
        this.userFeedback.error('Connection failed. Please try again.');
        this.step.set('role-select');
        return;
      }

      await this.#createInviteAndFinish(familyId);
    })();
  }

  async #createInviteAndFinish(familyId: string): Promise<void> {
    this.errorMessage.set(null);
    try {
      const invite = await this.familyApiService.createFamilyInvite(familyId);
      await this.backupModeService.setFirestoreFamilyId(familyId);
      await this.backupModeService.setFamilyConfig(null, null, 'owner');
      const uid = this.authService.firebaseUid();
      if (uid) {
        this.familySyncService.startListening(familyId, uid);
      }
      this.inviteCode.set(invite.inviteCode);
      this.step.set('owner-ready');
    } catch (err) {
      console.error('[FamilySetup] createFamilyInvite failed:', err);
      this.errorMessage.set('family.invite.error.network');
    }
  }
}
