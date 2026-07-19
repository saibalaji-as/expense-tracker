import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Users,
  UserCheck,
  UserPlus,
  AlertTriangle,
} from 'lucide-angular';
import { PENDING_CIRCLE_JOIN_KEY } from '../../core/models/circle.model';
import { AuthService } from '../../core/services/auth.service';
import { CircleApiService, CircleApiError } from '../../core/services/circle-api.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { TranslatePipe } from '../../shared/pipes';

interface Preview {
  circleId: string;
  name: string;
  memberCount: number;
  alreadyMember: boolean;
  status: 'active' | 'settled';
  unclaimedMembers: { memberId: string; name: string }[];
}

/**
 * Circle Link landing (docs/circle-splits-plan.md §7): public route.
 * Unauthenticated visitors get their code parked in Preferences and are sent
 * to sign-in; the app shell resumes the join afterwards.
 */
@Component({
  selector: 'app-join-circle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Users, UserCheck, UserPlus, AlertTriangle }),
    },
  ],
  template: `
    <div class="mx-auto max-w-md space-y-5 py-6">
      @if (isLoading()) {
        <div class="glass-card rounded-xl p-8 text-center text-sm text-muted-foreground">
          {{ 'splits.joinPage.loading' | translate }}
        </div>
      } @else if (errorKey()) {
        <div class="glass-card rounded-xl p-8 text-center">
          <lucide-icon name="alert-triangle" class="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <p class="font-medium">{{ errorKey()! | translate }}</p>
          <button
            (click)="goToSplits()"
            class="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {{ 'splits.joinPage.backToSplits' | translate }}
          </button>
        </div>
      } @else if (preview(); as p) {
        <div class="glass-card rounded-xl p-6 text-center">
          <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <lucide-icon name="users" class="h-7 w-7" />
          </div>
          <h1 class="text-xl font-bold tracking-tight">{{ p.name }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ i18n.t('splits.joinPage.invitedBody', { count: p.memberCount }) }}
          </p>
        </div>

        @if (p.unclaimedMembers.length > 0) {
          <div class="glass-card rounded-xl p-4">
            <p class="text-sm font-medium">{{ 'splits.joinPage.claimTitle' | translate }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ 'splits.joinPage.claimHint' | translate }}</p>
            <div class="mt-3 space-y-2">
              @for (seat of p.unclaimedMembers; track seat.memberId) {
                <button
                  (click)="selectedSeat.set(selectedSeat() === seat.memberId ? null : seat.memberId)"
                  [class]="selectedSeat() === seat.memberId
                    ? 'flex w-full items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 text-left'
                    : 'flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left hover:bg-accent'"
                >
                  <lucide-icon name="user-check" class="h-4 w-4 shrink-0"
                    [class]="selectedSeat() === seat.memberId ? 'text-primary' : 'text-muted-foreground'" />
                  <span class="text-sm font-medium">{{ seat.name }}</span>
                </button>
              }
            </div>
          </div>
        }

        <div class="glass-card rounded-xl p-4">
          <p class="text-sm font-medium">{{ 'splits.joinPage.newTitle' | translate }}</p>
          <input
            [(ngModel)]="displayName"
            [placeholder]="'splits.joinPage.namePlaceholder' | translate"
            maxlength="40"
            [disabled]="selectedSeat() !== null"
            class="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"
          />
        </div>

        <button
          (click)="join()"
          [disabled]="isJoining()"
          class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow disabled:opacity-40"
        >
          <lucide-icon name="user-plus" class="h-4 w-4" />
          {{ isJoining() ? ('splits.joinPage.joining' | translate) : ('splits.joinPage.join' | translate) }}
        </button>
      }
    </div>
  `,
})
export class JoinCircleComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);
  private readonly circleApi = inject(CircleApiService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly errorKey = signal<string | null>(null);
  readonly preview = signal<Preview | null>(null);
  readonly selectedSeat = signal<string | null>(null);
  readonly displayName = signal('');
  readonly isJoining = signal(false);

  private code = '';

  async ngOnInit(): Promise<void> {
    this.code = (this.route.snapshot.paramMap.get('code') ?? '').trim().toUpperCase();
    if (!this.code) {
      this.errorKey.set('splits.joinPage.invalid');
      this.isLoading.set(false);
      return;
    }

    await this.authService.sessionRestored;
    if (!this.authService.isAuthenticated()) {
      // Park the code; app shell resumes /join/:code after sign-in.
      await Preferences.set({ key: PENDING_CIRCLE_JOIN_KEY, value: this.code });
      void this.router.navigate(['/auth/callback']);
      return;
    }

    try {
      const p = await this.circleApi.previewCircleInvite(this.code);
      if (p.alreadyMember) {
        void this.router.navigate(['/splits', p.circleId]);
        return;
      }
      if (p.status !== 'active') {
        this.errorKey.set('splits.joinPage.settled');
        this.isLoading.set(false);
        return;
      }
      this.preview.set(p);
      this.displayName.set(this.authService.displayName() ?? '');
      this.isLoading.set(false);
    } catch (error) {
      this.errorKey.set(
        error instanceof CircleApiError && error.status === 404
          ? 'splits.joinPage.expired'
          : 'splits.joinPage.failed',
      );
      this.isLoading.set(false);
    }
  }

  goToSplits(): void {
    void this.router.navigate(['/splits']);
  }

  async join(): Promise<void> {
    if (this.isJoining()) return;
    this.isJoining.set(true);
    try {
      const seat = this.selectedSeat();
      const { circleId } = await this.circleApi.redeemCircleInvite({
        inviteCode: this.code,
        ...(seat ? { claimMemberId: seat } : { displayName: this.displayName().trim() }),
      });
      this.feedback.success(this.i18n.t('splits.joinPage.welcome'));
      void this.router.navigate(['/splits', circleId]);
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.joinPage.failed'), detail);
      this.isJoining.set(false);
    }
  }
}
