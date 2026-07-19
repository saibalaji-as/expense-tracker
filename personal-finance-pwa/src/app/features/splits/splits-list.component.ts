import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Users,
  Plus,
  Link2,
  ChevronRight,
  CheckCircle2,
  X,
} from 'lucide-angular';
import { PENDING_CIRCLE_JOIN_KEY } from '../../core/models/circle.model';
import { CircleApiService, CircleApiError } from '../../core/services/circle-api.service';
import { CircleSyncService } from '../../core/services/circle-sync.service';
import { CurrencyService } from '../../core/services/currency.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { I18nService } from '../../core/services/i18n.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { TranslatePipe } from '../../shared/pipes';

/**
 * Splits home — the user's Circles (docs/circle-splits-plan.md §7).
 */
@Component({
  selector: 'app-splits-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ModalComponent, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Users, Plus, Link2, ChevronRight, CheckCircle2, X }),
    },
  ],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'splits.title' | translate }}</h1>
          <p class="text-sm text-muted-foreground mt-0.5">{{ 'splits.subtitle' | translate }}</p>
        </div>
        <button
          (click)="openCreate()"
          class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90"
        >
          <lucide-icon name="plus" class="h-4 w-4" />
          {{ 'splits.create' | translate }}
        </button>
      </div>

      <!-- Circle list -->
      <div class="space-y-3">
        @if (circleSync.syncStatus() === 'connecting' && circleSync.circles().length === 0) {
          <div class="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
            {{ 'splits.loading' | translate }}
          </div>
        } @else if (circleSync.circles().length === 0) {
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <lucide-icon name="users" class="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p class="text-sm font-medium">{{ 'splits.empty.title' | translate }}</p>
            <p class="mt-1 max-w-xs text-xs text-muted-foreground">{{ 'splits.empty.body' | translate }}</p>
          </div>
        }

        @for (circle of circleSync.circles(); track circle.circleId) {
          <button
            class="glass-card block w-full rounded-xl p-4 text-left transition-transform active:scale-[0.99]"
            (click)="openCircle(circle.circleId)"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="users" class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="truncate font-medium text-foreground">{{ circle.name }}</p>
                  @if (circle.status === 'settled') {
                    <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                      {{ 'splits.settledChip' | translate }}
                    </span>
                  }
                </div>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ memberSummary(circle) }}
                </p>
              </div>
              <lucide-icon name="chevron-right" class="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </button>
        }
      </div>

      <!-- Join by code -->
      <div class="glass-card rounded-xl p-4">
        <p class="text-sm font-medium">{{ 'splits.join.title' | translate }}</p>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ 'splits.join.hint' | translate }}</p>
        <div class="mt-3 flex gap-2">
          <input
            [(ngModel)]="joinCode"
            [placeholder]="'splits.join.placeholder' | translate"
            maxlength="8"
            autocapitalize="characters"
            class="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            (click)="joinByCode()"
            [disabled]="joinCode().trim().length < 4"
            class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <lucide-icon name="link-2" class="h-4 w-4" />
            {{ 'splits.join.action' | translate }}
          </button>
        </div>
      </div>

      <!-- Create circle modal -->
      <app-modal
        [title]="'splits.createModal.title' | translate"
        [isOpen]="isCreateOpen()"
        [showActions]="false"
        (cancelled)="isCreateOpen.set(false)"
      >
        <div class="space-y-4">
          <div>
            <label class="mb-1 block text-sm font-medium" for="circle-name">
              {{ 'splits.createModal.name' | translate }}
            </label>
            <input
              id="circle-name"
              [(ngModel)]="newCircleName"
              [placeholder]="'splits.createModal.namePlaceholder' | translate"
              maxlength="40"
              class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label class="mb-1 block text-sm font-medium" for="member-name">
              {{ 'splits.createModal.members' | translate }}
            </label>
            <p class="mb-2 text-xs text-muted-foreground">{{ 'splits.createModal.membersHint' | translate }}</p>
            <div class="flex gap-2">
              <input
                id="member-name"
                [(ngModel)]="newMemberName"
                (keydown.enter)="addMemberChip()"
                [placeholder]="'splits.createModal.memberPlaceholder' | translate"
                maxlength="40"
                class="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                (click)="addMemberChip()"
                class="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <lucide-icon name="plus" class="h-4 w-4" />
              </button>
            </div>
            @if (memberChips().length > 0) {
              <div class="mt-2 flex flex-wrap gap-2">
                @for (name of memberChips(); track $index) {
                  <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {{ name }}
                    <button (click)="removeMemberChip($index)" [attr.aria-label]="'common.delete' | translate">
                      <lucide-icon name="x" class="h-3 w-3" />
                    </button>
                  </span>
                }
              </div>
            }
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button
              (click)="isCreateOpen.set(false)"
              class="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              {{ 'common.cancel' | translate }}
            </button>
            <button
              (click)="createCircle()"
              [disabled]="isCreating() || newCircleName().trim().length === 0"
              class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              <lucide-icon name="check-circle-2" class="h-4 w-4" />
              {{ isCreating() ? ('splits.createModal.creating' | translate) : ('splits.createModal.confirm' | translate) }}
            </button>
          </div>
        </div>
      </app-modal>
    </div>
  `,
})
export class SplitsListComponent implements OnInit {
  readonly circleSync = inject(CircleSyncService);
  private readonly circleApi = inject(CircleApiService);
  private readonly currencyService = inject(CurrencyService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly joinCode = signal('');
  readonly isCreateOpen = signal(false);
  readonly newCircleName = signal('');
  readonly newMemberName = signal('');
  readonly memberChips = signal<string[]>([]);
  readonly isCreating = signal(false);

  async ngOnInit(): Promise<void> {
    // Resume a Circle Link captured before sign-in (docs/circle-splits-plan.md §6).
    const pending = await Preferences.get({ key: PENDING_CIRCLE_JOIN_KEY });
    if (pending.value) {
      await Preferences.remove({ key: PENDING_CIRCLE_JOIN_KEY });
      void this.router.navigate(['/join', pending.value]);
      return;
    }
    void this.circleSync.startListening();
  }

  memberSummary(circle: { members: Record<string, { uid: string | null }> }): string {
    const members = Object.values(circle.members);
    const joined = members.filter((m) => m.uid !== null).length;
    return this.i18n.t('splits.memberSummary', { total: members.length, joined });
  }

  openCircle(circleId: string): void {
    void this.router.navigate(['/splits', circleId]);
  }

  joinByCode(): void {
    const code = this.joinCode().trim().toUpperCase();
    if (code.length < 4) return;
    void this.router.navigate(['/join', code]);
  }

  openCreate(): void {
    this.newCircleName.set('');
    this.newMemberName.set('');
    this.memberChips.set([]);
    this.isCreateOpen.set(true);
  }

  addMemberChip(): void {
    const name = this.newMemberName().trim();
    if (!name) return;
    if (this.memberChips().length >= 19) {
      this.feedback.warning(this.i18n.t('splits.createModal.tooMany'));
      return;
    }
    this.memberChips.set([...this.memberChips(), name]);
    this.newMemberName.set('');
  }

  removeMemberChip(index: number): void {
    this.memberChips.set(this.memberChips().filter((_, i) => i !== index));
  }

  async createCircle(): Promise<void> {
    const name = this.newCircleName().trim();
    if (!name || this.isCreating()) return;
    this.isCreating.set(true);
    try {
      const { circleId } = await this.circleApi.createCircle({
        name,
        currency: this.currencyService.currency(),
        memberNames: this.memberChips(),
      });
      this.isCreateOpen.set(false);
      this.feedback.success(this.i18n.t('splits.createModal.created'));
      void this.router.navigate(['/splits', circleId]);
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.createModal.failed'), detail);
    } finally {
      this.isCreating.set(false);
    }
  }
}
