import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Users,
  Plus,
  Link2,
  Share2,
  Pencil,
  Trash2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HandCoins,
  UserPlus,
  UserMinus,
  Settings2,
  X,
} from 'lucide-angular';
import {
  buildCircleLink,
  type CircleDocument,
  type CircleExpense,
  type CircleMember,
} from '../../core/models/circle.model';
import {
  buildShareSummaryText,
  computeMemberBalances,
  computeSettlementTransfers,
} from '../../core/utils/circle-settlement';
import { toLocalDateString } from '../../core/utils/local-date';
import { AuthService } from '../../core/services/auth.service';
import { CircleApiService, CircleApiError } from '../../core/services/circle-api.service';
import { CircleSyncService } from '../../core/services/circle-sync.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { TranslatePipe } from '../../shared/pipes';

type Tab = 'expenses' | 'balances' | 'settle';

/**
 * Circle detail — expenses, balances, Settle Up (docs/circle-splits-plan.md §7).
 * Budget rule: circle spends never touch personal expenses; only the member's
 * own per-head share is posted on Settle Up (source: 'circle-settle').
 */
@Component({
  selector: 'app-circle-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ModalComponent, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        Users, Plus, Link2, Share2, Pencil, Trash2, ArrowLeft, ArrowRight, CheckCircle2, HandCoins,
        UserPlus, UserMinus, Settings2, X,
      }),
    },
  ],
  template: `
    @if (circle(); as c) {
      <div class="space-y-5">

        <!-- Header -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <button (click)="goBack()" class="rounded-xl p-2 hover:bg-accent" [attr.aria-label]="'common.back' | translate">
              <lucide-icon name="arrow-left" class="h-5 w-5" />
            </button>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-bold tracking-tight">{{ c.name }}</h1>
                @if (c.status === 'settled') {
                  <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                    {{ 'splits.settledChip' | translate }}
                  </span>
                }
              </div>
              <p class="text-xs text-muted-foreground">
                {{ i18n.t('splits.detail.total', { amount: fmt(totalSpent()), count: activeExpenses().length }) }}
              </p>
            </div>
          </div>
          @if (c.status === 'active') {
            <div class="flex shrink-0 items-center gap-1.5">
              @if (isOwner()) {
                <button
                  (click)="openManageMembers()"
                  class="rounded-xl border border-border p-2 hover:bg-accent"
                  [attr.aria-label]="'splits.members.manage' | translate"
                >
                  <lucide-icon name="settings-2" class="h-4 w-4" />
                </button>
              }
              <button
                (click)="shareInvite()"
                class="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <lucide-icon name="link-2" class="h-4 w-4" />
                {{ 'splits.detail.invite' | translate }}
              </button>
            </div>
          }
        </div>

        <!-- My position banner -->
        @if (myBalance(); as mine) {
          <div class="glass-card rounded-xl p-4">
            <p class="text-xs text-muted-foreground">{{ 'splits.detail.myPosition' | translate }}</p>
            <p class="mt-1 text-lg font-bold"
               [class.text-emerald-500]="mine.net > 0"
               [class.text-red-500]="mine.net < 0">
              @if (mine.net > 0) {
                {{ i18n.t('splits.detail.getBack', { amount: fmt(mine.net) }) }}
              } @else if (mine.net < 0) {
                {{ i18n.t('splits.detail.owe', { amount: fmt(-mine.net) }) }}
              } @else {
                {{ 'splits.detail.evenSteven' | translate }}
              }
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ i18n.t('splits.detail.paidShare', { paid: fmt(mine.paid), share: fmt(mine.share) }) }}
            </p>
          </div>
        }

        <!-- Tabs -->
        <div class="flex rounded-xl bg-muted p-1 gap-1">
          @for (tab of tabs; track tab) {
            <button
              (click)="activeTab.set(tab)"
              [class]="activeTab() === tab
                ? 'flex-1 rounded-lg py-2 text-sm font-medium transition-all bg-background text-foreground shadow-sm'
                : 'flex-1 rounded-lg py-2 text-sm font-medium transition-all text-muted-foreground'"
            >
              {{ ('splits.tab.' + tab) | translate }}
            </button>
          }
        </div>

        <!-- ── Expenses tab ── -->
        @if (activeTab() === 'expenses') {
          @if (c.status === 'active') {
            <button
              (click)="openAddExpense()"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90"
            >
              <lucide-icon name="plus" class="h-4 w-4" />
              {{ 'splits.expense.add' | translate }}
            </button>
          }

          <div class="space-y-3">
            @if (activeExpenses().length === 0) {
              <div class="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
                {{ 'splits.expense.empty' | translate }}
              </div>
            }
            @for (expense of activeExpenses(); track expense.expenseId) {
              <div class="glass-card rounded-xl p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{{ expense.description }}</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {{ expense.date }} ·
                      {{ i18n.t('splits.expense.paidBy', { name: memberName(expense.paidByMemberId) }) }} ·
                      {{ i18n.t('splits.expense.splitAmong', { count: expense.participantMemberIds.length }) }}
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="font-semibold">{{ fmt(expense.amount) }}</p>
                    @if (canEdit(expense) && c.status === 'active') {
                      <div class="mt-1 flex justify-end gap-1">
                        <button (click)="openEditExpense(expense)" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" [attr.aria-label]="'common.edit' | translate">
                          <lucide-icon name="pencil" class="h-3.5 w-3.5" />
                        </button>
                        <button (click)="confirmDelete(expense)" class="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10" [attr.aria-label]="'common.delete' | translate">
                          <lucide-icon name="trash-2" class="h-3.5 w-3.5" />
                        </button>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        }

        <!-- ── Balances tab ── -->
        @if (activeTab() === 'balances') {
          <div class="space-y-3">
            @for (balance of balances(); track balance.memberId) {
              <div class="glass-card rounded-xl p-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{{ memberName(balance.memberId) }}</p>
                    @if (!isClaimed(balance.memberId)) {
                      <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {{ 'splits.balances.notJoined' | translate }}
                      </span>
                    }
                  </div>
                  <p class="font-semibold"
                     [class.text-emerald-500]="balance.net > 0"
                     [class.text-red-500]="balance.net < 0">
                    {{ balance.net > 0 ? '+' : '' }}{{ fmt(balance.net) }}
                  </p>
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ i18n.t('splits.detail.paidShare', { paid: fmt(balance.paid), share: fmt(balance.share) }) }}
                </p>
              </div>
            }
          </div>
        }

        <!-- ── Settle Up tab ── -->
        @if (activeTab() === 'settle') {
          <div class="space-y-3">
            @if (transfers().length === 0) {
              <div class="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
                {{ 'splits.settle.allSquare' | translate }}
              </div>
            }
            @for (transfer of transfers(); track $index) {
              <div class="glass-card flex items-center justify-between rounded-xl p-4">
                <div class="flex min-w-0 items-center gap-2 text-sm">
                  <span class="truncate font-medium">{{ memberName(transfer.fromMemberId) }}</span>
                  <lucide-icon name="arrow-right" class="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span class="truncate font-medium">{{ memberName(transfer.toMemberId) }}</span>
                </div>
                <p class="shrink-0 font-semibold">{{ fmt(transfer.amount) }}</p>
              </div>
            }

            <button
              (click)="shareSummary()"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              <lucide-icon name="share-2" class="h-4 w-4" />
              {{ 'splits.settle.share' | translate }}
            </button>

            @if (c.status === 'active' && isOwner()) {
              <button
                (click)="isSettleConfirmOpen.set(true)"
                class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow"
              >
                <lucide-icon name="check-circle-2" class="h-4 w-4" />
                {{ 'splits.settle.action' | translate }}
              </button>
            }

            @if (c.status === 'settled') {
              <div class="glass-card flex items-start gap-2.5 rounded-xl p-4">
                <lucide-icon name="hand-coins" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <p class="text-xs text-muted-foreground">{{ 'splits.settle.autoLogged' | translate }}</p>
              </div>
            }
          </div>
        }

        <!-- ── Add/edit expense modal ── -->
        <app-modal
          [title]="(editingExpenseId() ? 'splits.expense.editTitle' : 'splits.expense.addTitle') | translate"
          [isOpen]="isExpenseModalOpen()"
          [showActions]="false"
          (cancelled)="isExpenseModalOpen.set(false)"
        >
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium" for="exp-desc">{{ 'splits.expense.description' | translate }}</label>
              <input id="exp-desc" [(ngModel)]="formDescription" maxlength="80"
                [placeholder]="'splits.expense.descriptionPlaceholder' | translate"
                class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium" for="exp-amount">{{ 'splits.expense.amount' | translate }}</label>
                <input id="exp-amount" type="number" inputmode="decimal" min="0.01" step="0.01" [(ngModel)]="formAmount"
                  class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium" for="exp-date">{{ 'splits.expense.date' | translate }}</label>
                <input id="exp-date" type="date" [(ngModel)]="formDate"
                  class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium" for="exp-paidby">{{ 'splits.expense.paidByLabel' | translate }}</label>
              <select id="exp-paidby" [(ngModel)]="formPaidBy"
                class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                @for (member of membersList(); track member.memberId) {
                  <option [value]="member.memberId">{{ member.name }}</option>
                }
              </select>
            </div>
            <div>
              <p class="mb-1 text-sm font-medium">{{ 'splits.expense.participants' | translate }}</p>
              <p class="mb-2 text-xs text-muted-foreground">{{ 'splits.expense.participantsHint' | translate }}</p>
              <div class="flex flex-wrap gap-2">
                @for (member of membersList(); track member.memberId) {
                  <button
                    (click)="toggleParticipant(member.memberId)"
                    [class]="formParticipants().includes(member.memberId)
                      ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                      : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground'"
                  >{{ member.name }}</button>
                }
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-2">
              <button (click)="isExpenseModalOpen.set(false)"
                class="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent">
                {{ 'common.cancel' | translate }}
              </button>
              <button (click)="saveExpense()" [disabled]="isSaving() || !formValid()"
                class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                {{ 'common.save' | translate }}
              </button>
            </div>
          </div>
        </app-modal>

        <!-- ── Delete confirm ── -->
        <app-modal
          [title]="'splits.expense.deleteTitle' | translate"
          [isOpen]="deleteTarget() !== null"
          (confirmed)="deleteExpense()"
          (cancelled)="deleteTarget.set(null)"
        >
          <p class="text-sm text-muted-foreground">{{ 'splits.expense.deleteBody' | translate }}</p>
        </app-modal>

        <!-- ── Settle confirm ── -->
        <app-modal
          [title]="'splits.settle.confirmTitle' | translate"
          [isOpen]="isSettleConfirmOpen()"
          (confirmed)="settleCircle()"
          (cancelled)="isSettleConfirmOpen.set(false)"
        >
          <p class="text-sm text-muted-foreground">{{ 'splits.settle.confirmBody' | translate }}</p>
        </app-modal>

        <!-- ── Manage members (owner) ── -->
        <app-modal
          [title]="'splits.members.manage' | translate"
          [isOpen]="isManageMembersOpen()"
          [showActions]="false"
          (cancelled)="isManageMembersOpen.set(false)"
        >
          <div class="space-y-4">
            <p class="text-xs text-muted-foreground">{{ 'splits.members.hint' | translate }}</p>
            <div class="space-y-2">
              @for (member of membersList(); track member.memberId) {
                <div class="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{{ member.name }}</p>
                    <p class="text-[11px] text-muted-foreground">
                      {{ (member.uid !== null ? 'splits.members.joined' : 'splits.balances.notJoined') | translate }}
                    </p>
                  </div>
                  @if (member.uid !== c.ownerUid) {
                    <button
                      (click)="removeMember(member)"
                      [disabled]="isSaving() || memberInvolved(member.memberId)"
                      [title]="memberInvolved(member.memberId) ? ('splits.members.removeBlocked' | translate) : ''"
                      class="rounded-lg p-2 text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                      [attr.aria-label]="'splits.members.remove' | translate"
                    >
                      <lucide-icon name="user-minus" class="h-4 w-4" />
                    </button>
                  }
                </div>
              }
            </div>
            <div class="flex gap-2">
              <input
                [(ngModel)]="newMemberName"
                (keydown.enter)="addMember()"
                [placeholder]="'splits.members.addPlaceholder' | translate"
                maxlength="40"
                class="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                (click)="addMember()"
                [disabled]="isSaving() || newMemberName().trim().length === 0"
                class="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                <lucide-icon name="user-plus" class="h-4 w-4" />
                {{ 'splits.members.add' | translate }}
              </button>
            </div>
            <p class="text-[11px] text-muted-foreground">{{ 'splits.members.retroNote' | translate }}</p>
          </div>
        </app-modal>

      </div>
    } @else {
      <div class="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
        {{ 'splits.loading' | translate }}
      </div>
    }
  `,
})
export class CircleDetailComponent implements OnInit, OnDestroy {
  readonly circleSync = inject(CircleSyncService);
  readonly i18n = inject(I18nService);
  private readonly circleApi = inject(CircleApiService);
  private readonly authService = inject(AuthService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly tabs: Tab[] = ['expenses', 'balances', 'settle'];
  readonly activeTab = signal<Tab>('expenses');

  private readonly circleId = signal<string>('');

  readonly circle = computed<CircleDocument | null>(
    () => this.circleSync.circles().find((c) => c.circleId === this.circleId()) ?? null,
  );
  readonly membersList = computed<CircleMember[]>(() => {
    const c = this.circle();
    return c ? Object.values(c.members).sort((a, b) => a.name.localeCompare(b.name)) : [];
  });
  readonly activeExpenses = computed(() =>
    this.circleSync.activeCircleExpenses().filter((e) => !e.deleted),
  );
  readonly totalSpent = computed(() =>
    Math.round(this.activeExpenses().reduce((sum, e) => sum + e.amount * 100, 0)) / 100,
  );
  readonly balances = computed(() =>
    computeMemberBalances(this.membersList(), this.circleSync.activeCircleExpenses()),
  );
  readonly transfers = computed(() => computeSettlementTransfers(this.balances()));
  readonly myMember = computed<CircleMember | null>(() => {
    const c = this.circle();
    return c ? this.circleSync.memberForUid(c, this.authService.firebaseUid()) : null;
  });
  readonly myBalance = computed(() => {
    const mine = this.myMember();
    return mine ? this.balances().find((b) => b.memberId === mine.memberId) ?? null : null;
  });
  readonly isOwner = computed(() => this.circle()?.ownerUid === this.authService.firebaseUid());

  // Expense form state
  readonly isExpenseModalOpen = signal(false);
  readonly editingExpenseId = signal<string | null>(null);
  readonly formDescription = signal('');
  readonly formAmount = signal<number | null>(null);
  readonly formDate = signal(toLocalDateString());
  readonly formPaidBy = signal('');
  readonly formParticipants = signal<string[]>([]);
  readonly isSaving = signal(false);

  readonly deleteTarget = signal<CircleExpense | null>(null);
  readonly isSettleConfirmOpen = signal(false);

  // Manage members (owner)
  readonly isManageMembersOpen = signal(false);
  readonly newMemberName = signal('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.circleId.set(id);
    void this.circleSync.startListening();
    void this.circleSync.openCircle(id);
  }

  ngOnDestroy(): void {
    this.circleSync.closeCircle();
  }

  goBack(): void {
    void this.router.navigate(['/splits']);
  }

  fmt(amount: number): string {
    const currency = this.circle()?.currency || 'INR';
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  memberName(memberId: string): string {
    return this.circle()?.members[memberId]?.name ?? '?';
  }

  isClaimed(memberId: string): boolean {
    return this.circle()?.members[memberId]?.uid !== null;
  }

  canEdit(expense: CircleExpense): boolean {
    const uid = this.authService.firebaseUid();
    return !!uid && (expense.authorUid === uid || this.isOwner());
  }

  // ── Expense CRUD ──
  openAddExpense(): void {
    this.editingExpenseId.set(null);
    this.formDescription.set('');
    this.formAmount.set(null);
    this.formDate.set(toLocalDateString());
    this.formPaidBy.set(this.myMember()?.memberId ?? this.membersList()[0]?.memberId ?? '');
    this.formParticipants.set(this.membersList().map((m) => m.memberId));
    this.isExpenseModalOpen.set(true);
  }

  openEditExpense(expense: CircleExpense): void {
    this.editingExpenseId.set(expense.expenseId);
    this.formDescription.set(expense.description);
    this.formAmount.set(expense.amount);
    this.formDate.set(expense.date);
    this.formPaidBy.set(expense.paidByMemberId);
    this.formParticipants.set([...expense.participantMemberIds]);
    this.isExpenseModalOpen.set(true);
  }

  toggleParticipant(memberId: string): void {
    const current = this.formParticipants();
    this.formParticipants.set(
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  }

  formValid(): boolean {
    const amount = Number(this.formAmount());
    return (
      this.formDescription().trim().length > 0 &&
      Number.isFinite(amount) &&
      amount > 0 &&
      !!this.formDate() &&
      !!this.formPaidBy() &&
      this.formParticipants().length > 0
    );
  }

  async saveExpense(): Promise<void> {
    if (!this.formValid() || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      const input = {
        description: this.formDescription().trim(),
        amount: Math.round(Number(this.formAmount()) * 100) / 100,
        date: this.formDate(),
        paidByMemberId: this.formPaidBy(),
        participantMemberIds: this.formParticipants(),
      };
      const editingId = this.editingExpenseId();
      if (editingId) {
        await this.circleSync.updateExpense(this.circleId(), editingId, input);
      } else {
        await this.circleSync.addExpense(this.circleId(), input);
      }
      this.isExpenseModalOpen.set(false);
      this.feedback.success(this.i18n.t('splits.expense.saved'));
    } catch (error) {
      console.warn('[Splits] saveExpense failed:', error);
      this.feedback.error(this.i18n.t('splits.expense.saveFailed'));
    } finally {
      this.isSaving.set(false);
    }
  }

  confirmDelete(expense: CircleExpense): void {
    this.deleteTarget.set(expense);
  }

  async deleteExpense(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleteTarget.set(null);
    try {
      await this.circleSync.removeExpense(this.circleId(), target.expenseId);
      this.feedback.success(this.i18n.t('splits.expense.deleted'));
    } catch (error) {
      console.warn('[Splits] deleteExpense failed:', error);
      this.feedback.error(this.i18n.t('splits.expense.saveFailed'));
    }
  }

  // ── Manage members (owner) ──
  openManageMembers(): void {
    this.newMemberName.set('');
    this.isManageMembersOpen.set(true);
  }

  /** True when the member paid for or participates in any live bill — removal
   *  would corrupt balances, so the button is disabled (server re-checks). */
  memberInvolved(memberId: string): boolean {
    return this.circleSync
      .activeCircleExpenses()
      .some(
        (e) =>
          !e.deleted &&
          (e.paidByMemberId === memberId || e.participantMemberIds.includes(memberId)),
      );
  }

  async addMember(): Promise<void> {
    const name = this.newMemberName().trim();
    if (!name || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      await this.circleApi.updateCircle({ circleId: this.circleId(), addMemberNames: [name] });
      this.newMemberName.set('');
      this.feedback.success(this.i18n.t('splits.members.added'));
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.members.failed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  async removeMember(member: CircleMember): Promise<void> {
    if (this.isSaving() || this.memberInvolved(member.memberId)) return;
    this.isSaving.set(true);
    try {
      await this.circleApi.updateCircle({ circleId: this.circleId(), removeMemberId: member.memberId });
      this.feedback.success(this.i18n.t('splits.members.removed'));
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.members.failed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Invite ──
  async shareInvite(): Promise<void> {
    try {
      const { inviteCode } = await this.circleApi.createCircleInvite(this.circleId());
      const link = buildCircleLink(inviteCode);
      const text = this.i18n.t('splits.detail.inviteText', {
        circle: this.circle()?.name ?? '',
        link,
        code: inviteCode,
      });
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        this.feedback.success(this.i18n.t('splits.detail.inviteCopied'));
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return; // user closed share sheet
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.detail.inviteFailed'), detail);
    }
  }

  // ── Share summary ──
  async shareSummary(): Promise<void> {
    const c = this.circle();
    if (!c) return;
    const text = buildShareSummaryText(
      c.name,
      this.membersList(),
      this.circleSync.activeCircleExpenses(),
      (n) => this.fmt(n),
    );
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        this.feedback.success(this.i18n.t('splits.settle.summaryCopied'));
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      console.warn('[Splits] shareSummary failed:', error);
    }
  }

  // ── Settle Up ──
  async settleCircle(): Promise<void> {
    this.isSettleConfirmOpen.set(false);
    try {
      await this.circleApi.settleCircle(this.circleId());
      // The per-head share is auto-logged into Daily by CircleSyncService the
      // moment the listener sees the settled status — no user action needed.
      this.feedback.success(
        this.i18n.t('splits.settle.done'),
        this.i18n.t('splits.settle.autoLogged'),
      );
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.settle.failed'), detail);
    }
  }
}
