import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ArrowDownLeft,
  Banknote,
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Inbox,
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Settings,
  X,
} from 'lucide-angular';
import {
  ModalComponent,
  SectionCardComponent,
  ThemedSelectComponent,
  type ThemedSelectOption,
} from '../../shared/components';
import { CurrencyFormatPipe, TranslatePipe } from '../../shared/pipes';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { SpendNotificationAccessService } from '../../core/services/spend-notification-access.service';
import { AuthService } from '../../core/services/auth.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { CurrencyService } from '../../core/services/currency.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import {
  ExpenseEntry,
  NotificationInboxItem,
  PREDEFINED_EXPENSE_TYPES,
} from '../../core/models';
import { inboxItemLocalDate } from '../../core/utils/notification-inbox.util';
import { formatLocalTime, parseLocalDate, toLocalDateString } from '../../core/utils/local-date';

type InboxFilter = 'all' | 'expenses' | 'income' | 'cards';

interface PendingGroup {
  date: string;
  items: NotificationInboxItem[];
}

/**
 * Notification inbox screen: recovers spend detections whose Android prompt
 * was cleared/missed, and lets the user log or dismiss them in-app.
 * Inbox data is device-local only (see notification-inbox.model.ts).
 */
@Component({
  selector: 'app-notifications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    ModalComponent,
    SectionCardComponent,
    ThemedSelectComponent,
    TranslatePipe,
    CurrencyFormatPipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        ArrowDownLeft, Banknote, BellRing, Check, ChevronDown, ChevronUp,
        CreditCard, Inbox, Settings, X,
      }),
    },
  ],
  template: `
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-5">

      <header>
        <h1 class="text-xl font-semibold tracking-tight md:text-2xl">
          {{ 'notifications.title' | translate }}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'notifications.subtitle' | translate }}
        </p>
      </header>

      <!-- ── Listener setup / availability ─────────────────────── -->
      @if (!access.supported()) {
        <app-section-card>
          <div class="flex items-start gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <lucide-icon name="bell-ring" class="h-5 w-5" />
            </span>
            <p class="text-sm text-muted-foreground">{{ 'notifications.setup.androidOnly' | translate }}</p>
          </div>
        </app-section-card>
      } @else if (setupNeeded()) {
        <app-section-card [title]="'notifications.setup.title' | translate">
          <p class="text-sm text-muted-foreground">{{ 'notifications.setup.body' | translate }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            @if (!access.promptEnabled()) {
              <button
                type="button"
                class="gradient-primary rounded-full px-4 py-2 text-sm font-semibold text-white shadow-glow"
                (click)="onEnablePrompts()"
              >
                {{ 'notifications.setup.enable' | translate }}
              </button>
            }
            @if (!access.permissionGranted()) {
              <button
                type="button"
                class="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
                (click)="access.openSettings()"
              >
                <span class="inline-flex items-center gap-2">
                  <lucide-icon name="settings" class="h-4 w-4" />
                  {{ 'notifications.setup.openSettings' | translate }}
                </span>
              </button>
            }
          </div>
        </app-section-card>
      }

      <!-- ── Recovery banner ────────────────────────────────────── -->
      @if (recoveryTotal() > 0) {
        <div class="glass-card border border-amber-500/30 bg-amber-500/10 p-4">
          <p class="text-sm font-semibold">
            {{ 'notifications.recovery.title' | translate }}
          </p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ i18n.t('notifications.recovery.body', {
                amount: currencyService.format(recoveryTotal(), i18n.locale()),
                count: pendingSpendCount()
            }) }}
          </p>
        </div>
      }

      <!-- ── Filters ────────────────────────────────────────────── -->
      <div class="flex flex-wrap gap-2">
        @for (option of filterOptions; track option.value) {
          <button
            type="button"
            class="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
            [class]="filter() === option.value
              ? 'gradient-primary text-white shadow-glow'
              : 'border border-border text-muted-foreground hover:bg-accent'"
            (click)="filter.set(option.value)"
          >
            {{ option.labelKey | translate }}
          </button>
        }
      </div>

      <!-- ── Pending review ─────────────────────────────────────── -->
      <app-section-card [title]="'notifications.pending.title' | translate">
        @if (!inbox.loaded()) {
          <p class="text-sm text-muted-foreground">…</p>
        } @else if (pendingGroups().length === 0) {
          <div class="flex flex-col items-center gap-2 py-6 text-center">
            <span class="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <lucide-icon name="inbox" class="h-6 w-6" />
            </span>
            <p class="text-sm text-muted-foreground">{{ 'notifications.pending.empty' | translate }}</p>
          </div>
        } @else {
          <div class="flex flex-col gap-5">
            @for (group of pendingGroups(); track group.date) {
              <div>
                <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ formatDay(group.date) }}
                </p>
                <div class="flex flex-col gap-2">
                  @for (item of group.items; track item.id) {
                    <div class="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/60 p-3">
                      <span class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <lucide-icon [name]="kindIcon(item)" class="h-5 w-5" />
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-baseline justify-between gap-2">
                          <p class="text-sm font-semibold">{{ item.amount | currencyFormat }}</p>
                          <span class="shrink-0 text-[11px] text-muted-foreground">{{ formatTime(item) }}</span>
                        </div>
                        <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span class="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                            {{ kindLabelKey(item) | translate }}
                          </span>
                          @if (item.cardLast4) {
                            <span class="rounded-full border border-border px-2 py-0.5">···· {{ item.cardLast4 }}</span>
                          }
                        </p>
                        @if (item.comment) {
                          <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ item.comment }}</p>
                        }
                        <div class="mt-2.5 flex gap-2">
                          <button
                            type="button"
                            class="gradient-primary inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow"
                            (click)="openLog(item)"
                          >
                            <lucide-icon name="check" class="h-3.5 w-3.5" />
                            {{ 'notifications.action.log' | translate }}
                          </button>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                            (click)="onDismiss(item)"
                          >
                            <lucide-icon name="x" class="h-3.5 w-3.5" />
                            {{ 'notifications.action.dismiss' | translate }}
                          </button>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </app-section-card>

      <!-- ── Handled history ────────────────────────────────────── -->
      <app-section-card [title]="'notifications.history.title' | translate">
        <button
          action
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
          (click)="showHistory.set(!showHistory())"
        >
          <lucide-icon [name]="showHistory() ? 'chevron-up' : 'chevron-down'" class="h-3.5 w-3.5" />
          {{ (showHistory() ? 'notifications.history.hide' : 'notifications.history.show') | translate }}
        </button>

        @if (showHistory()) {
          @if (inbox.handledItems().length === 0) {
            <p class="text-sm text-muted-foreground">{{ 'notifications.history.empty' | translate }}</p>
          } @else {
            <div class="flex flex-col gap-2">
              @for (item of handledFiltered(); track item.id) {
                <div class="flex items-center gap-3 rounded-2xl border border-border/50 p-3 opacity-80">
                  <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <lucide-icon [name]="kindIcon(item)" class="h-4 w-4" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium">{{ item.amount | currencyFormat }}</p>
                    <p class="text-[11px] text-muted-foreground">
                      {{ formatDay(itemDate(item)) }} · {{ kindLabelKey(item) | translate }}
                    </p>
                  </div>
                  <span
                    class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    [class]="item.status === 'dismissed'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'"
                  >
                    {{ statusLabelKey(item) | translate }}
                  </span>
                </div>
              }
            </div>
          }
        } @else {
          <p class="text-sm text-muted-foreground">
            {{ i18n.t('notifications.history.summary', { count: inbox.handledItems().length }) }}
          </p>
        }
      </app-section-card>
    </div>

    <!-- ── Log modal ────────────────────────────────────────────── -->
    <app-modal
      [title]="'notifications.log.title' | translate"
      [isOpen]="logTarget() !== null"
      [showActions]="false"
      (cancelled)="closeLog()"
    >
      @if (logTarget(); as target) {
        <div class="flex flex-col gap-4">

          <div>
            <label class="mb-1 block text-xs font-semibold text-muted-foreground" for="inbox-log-amount">
              {{ 'notifications.log.amount' | translate }}
            </label>
            <input
              id="inbox-log-amount"
              type="number"
              inputmode="decimal"
              min="0"
              class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              [(ngModel)]="logAmount"
            />
          </div>

          @if (isExpenseKind(target)) {
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground">
                {{ 'notifications.log.category' | translate }}
              </label>
              <app-themed-select
                [options]="categoryOptions()"
                [value]="logCategory()"
                (valueChange)="logCategory.set($event)"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground">
                {{ 'notifications.log.payFrom' | translate }}
              </label>
              <app-themed-select
                [options]="paymentOptions()"
                [placeholder]="'notifications.log.noAccount' | translate"
                [value]="logPayment()"
                (valueChange)="logPayment.set($event)"
              />
            </div>
          }

          @if (target.kind === 'income' || target.kind === 'salary') {
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground">
                {{ 'notifications.log.account' | translate }}
              </label>
              <app-themed-select
                [options]="accountOptions()"
                [placeholder]="'notifications.log.chooseAccount' | translate"
                [value]="logAccountId()"
                (valueChange)="logAccountId.set($event)"
              />
            </div>
          }

          @if (target.kind === 'cc-payment') {
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground">
                {{ 'notifications.log.paidFrom' | translate }}
              </label>
              <app-themed-select
                [options]="accountOptions()"
                [placeholder]="'notifications.log.chooseAccount' | translate"
                [value]="logAccountId()"
                (valueChange)="logAccountId.set($event)"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground">
                {{ 'notifications.log.card' | translate }}
              </label>
              <app-themed-select
                [options]="cardOptions()"
                [placeholder]="'notifications.log.chooseCard' | translate"
                [value]="logCardId()"
                (valueChange)="logCardId.set($event)"
              />
            </div>
          }

          <div>
            <label class="mb-1 block text-xs font-semibold text-muted-foreground" for="inbox-log-comment">
              {{ 'notifications.log.comment' | translate }}
            </label>
            <input
              id="inbox-log-comment"
              type="text"
              class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              [(ngModel)]="logComment"
            />
          </div>

          <p class="text-[11px] text-muted-foreground">
            {{ i18n.t('notifications.log.dateHint', { date: formatDay(itemDate(target)) }) }}
          </p>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              (click)="closeLog()"
            >
              {{ 'notifications.log.cancel' | translate }}
            </button>
            <button
              type="button"
              class="gradient-primary rounded-full px-5 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
              [disabled]="isSaving()"
              (click)="saveLog()"
            >
              {{ 'notifications.log.save' | translate }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `,
})
export class NotificationsComponent implements OnInit {
  readonly inbox = inject(NotificationInboxService);
  readonly access = inject(SpendNotificationAccessService);
  readonly i18n = inject(I18nService);
  readonly currencyService = inject(CurrencyService);
  private readonly store = inject(ExpenseStore);
  private readonly auth = inject(AuthService);
  private readonly backupMode = inject(BackupModeService);
  private readonly feedback = inject(UserFeedbackService);

  readonly filter = signal<InboxFilter>('all');
  readonly showHistory = signal(false);

  readonly filterOptions: Array<{ value: InboxFilter; labelKey: string }> = [
    { value: 'all', labelKey: 'notifications.filter.all' },
    { value: 'expenses', labelKey: 'notifications.filter.expenses' },
    { value: 'income', labelKey: 'notifications.filter.income' },
    { value: 'cards', labelKey: 'notifications.filter.cards' },
  ];

  // ── Log modal state ─────────────────────────────────────────────
  readonly logTarget = signal<NotificationInboxItem | null>(null);
  readonly logCategory = signal('Miscellaneous');
  readonly logPayment = signal('');
  readonly logAccountId = signal('');
  readonly logCardId = signal('');
  readonly isSaving = signal(false);
  logAmount: number | null = null;
  logComment = '';

  readonly setupNeeded = computed(
    () => this.access.supported() && (!this.access.permissionGranted() || !this.access.promptEnabled()),
  );

  readonly pendingSpendCount = computed(
    () => this.inbox.pendingItems().filter((item) => item.kind === 'expense' || item.kind === 'cc-spend').length,
  );

  readonly recoveryTotal = computed(() => {
    // Reads items() so the banner recalculates as statuses change.
    this.inbox.items();
    return this.inbox.pendingExpenseTotal(this.currencyService.currency());
  });

  readonly filteredPending = computed(() => this.applyFilter(this.inbox.pendingItems()));
  readonly handledFiltered = computed(() => this.applyFilter(this.inbox.handledItems()));

  readonly pendingGroups = computed<PendingGroup[]>(() => {
    const groups = new Map<string, NotificationInboxItem[]>();
    for (const item of this.filteredPending()) {
      const date = inboxItemLocalDate(item) || 'unknown';
      const bucket = groups.get(date) ?? [];
      bucket.push(item);
      groups.set(date, bucket);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => ({ date, items }));
  });

  readonly categoryOptions = computed<ThemedSelectOption[]>(() => {
    const custom = this.store.limits()
      .map((limit) => limit.type)
      .filter((type) => !PREDEFINED_EXPENSE_TYPES.includes(type));
    return [...PREDEFINED_EXPENSE_TYPES, ...custom].map((type) => ({ value: type, label: type }));
  });

  readonly accountOptions = computed<ThemedSelectOption[]>(() =>
    this.store.activeAccounts().map((account) => ({
      value: account.id,
      label: account.name,
      icon: 'wallet-cards',
    })),
  );

  readonly cardOptions = computed<ThemedSelectOption[]>(() =>
    this.activeCards().map((card) => ({
      value: card.id,
      label: card.cardLast4 ? `${card.name} ···· ${card.cardLast4}` : card.name,
      icon: 'credit-card',
    })),
  );

  readonly paymentOptions = computed<ThemedSelectOption[]>(() => [
    { value: '', label: this.i18n.t('notifications.log.noAccount') },
    ...this.accountOptions().map((option) => ({ ...option, value: `acct:${option.value}` })),
    ...this.cardOptions().map((option) => ({ ...option, value: `debt:${option.value}` })),
  ]);

  constructor() {
    // Duplicate auto-match: expenses already logged manually silence their
    // matching pending detections. Re-runs as entries/items change and
    // stabilizes once no pending item matches.
    effect(() => {
      const entries = this.store.entries();
      if (!this.inbox.loaded() || this.inbox.pendingCount() === 0) return;
      void this.inbox.autoMatch(entries);
    });
  }

  ngOnInit(): void {
    void this.inbox.load();
    void this.access.refreshStatus();
  }

  // ── Row helpers ─────────────────────────────────────────────────
  isExpenseKind(item: NotificationInboxItem): boolean {
    return item.kind === 'expense' || item.kind === 'cc-spend';
  }

  kindIcon(item: NotificationInboxItem): string {
    switch (item.kind) {
      case 'cc-spend':
      case 'cc-payment':
        return 'credit-card';
      case 'income':
      case 'salary':
        return 'arrow-down-left';
      default:
        return 'banknote';
    }
  }

  kindLabelKey(item: NotificationInboxItem): string {
    switch (item.kind) {
      case 'cc-spend': return 'notifications.kind.ccSpend';
      case 'cc-payment': return 'notifications.kind.ccPayment';
      case 'income': return 'notifications.kind.income';
      case 'salary': return 'notifications.kind.salary';
      default: return 'notifications.kind.expense';
    }
  }

  statusLabelKey(item: NotificationInboxItem): string {
    switch (item.status) {
      case 'dismissed': return 'notifications.status.dismissed';
      case 'auto-handled': return 'notifications.status.autoHandled';
      default: return 'notifications.status.logged';
    }
  }

  itemDate(item: NotificationInboxItem): string {
    return inboxItemLocalDate(item) || toLocalDateString();
  }

  formatDay(date: string): string {
    const today = toLocalDateString();
    if (date === today) return this.i18n.t('notifications.day.today');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date === toLocalDateString(yesterday)) return this.i18n.t('notifications.day.yesterday');
    const parsed = parseLocalDate(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'short' });
  }

  formatTime(item: NotificationInboxItem): string {
    return formatLocalTime(item.detectedAt, this.i18n.locale());
  }

  // ── Actions ─────────────────────────────────────────────────────
  onEnablePrompts(): void {
    void this.access.setPromptEnabled(true);
  }

  async onDismiss(item: NotificationInboxItem): Promise<void> {
    await this.inbox.dismiss(item.id);
    this.feedback.info(this.i18n.t('notifications.feedback.dismissed'));
  }

  openLog(item: NotificationInboxItem): void {
    this.logTarget.set(item);
    this.logAmount = item.amount;
    this.logComment = item.comment;
    this.logCategory.set('Miscellaneous');
    this.isSaving.set(false);

    const cards = this.activeCards();
    const matchedCard = item.cardLast4
      ? cards.find((card) => card.cardLast4 === item.cardLast4)
      : undefined;
    const defaultAccount = this.store.defaultAccount();

    if (item.kind === 'cc-payment') {
      this.logCardId.set(matchedCard?.id ?? (cards.length === 1 ? cards[0].id : ''));
      this.logAccountId.set(defaultAccount?.id ?? '');
    } else if (item.kind === 'income' || item.kind === 'salary') {
      this.logAccountId.set(defaultAccount?.id ?? '');
    } else if (item.kind === 'cc-spend' && (matchedCard || cards.length === 1)) {
      this.logPayment.set(`debt:${(matchedCard ?? cards[0]).id}`);
    } else {
      this.logPayment.set(defaultAccount ? `acct:${defaultAccount.id}` : '');
    }
  }

  closeLog(): void {
    this.logTarget.set(null);
  }

  async saveLog(): Promise<void> {
    const item = this.logTarget();
    if (!item || this.isSaving()) return;

    const amount = Number(this.logAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.feedback.warning(this.i18n.t('notifications.feedback.invalidAmount'));
      return;
    }

    this.isSaving.set(true);
    try {
      if (item.kind === 'income' || item.kind === 'salary') {
        await this.saveIncome(item, amount);
      } else if (item.kind === 'cc-payment') {
        await this.saveCcPayment(item, amount);
      } else {
        await this.saveExpense(item, amount);
      }
      this.feedback.success(this.i18n.t('notifications.feedback.logged'));
      this.closeLog();
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      this.feedback.warning(this.i18n.t('notifications.feedback.logFailed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  private async saveExpense(item: NotificationInboxItem, amount: number): Promise<void> {
    const date = this.itemDate(item);
    const type = this.logCategory() || 'Miscellaneous';
    const limit = this.calculateDailyLimit(type, date);
    const payment = this.logPayment();
    const actor = this.activityActor();

    const entry: ExpenseEntry = {
      id: crypto.randomUUID(),
      date,
      amount,
      type,
      limit,
      savings: limit - amount,
      timestamp: new Date().toISOString(),
      comment: this.logComment.trim() || undefined,
      accountId: payment.startsWith('acct:') ? payment.slice(5) : undefined,
      debtId: payment.startsWith('debt:') ? payment.slice(5) : undefined,
      source: 'notification-prompt',
      createdByEmail: actor.email,
      createdByRole: actor.role,
    };

    await this.store.addEntry(entry);
    await this.inbox.markLogged(item.id, entry.id);
  }

  private async saveIncome(item: NotificationInboxItem, amount: number): Promise<void> {
    const accountId = this.logAccountId();
    if (!accountId) {
      throw new Error(this.i18n.t('notifications.log.chooseAccount'));
    }
    let reason = this.logComment.trim();
    if (item.kind === 'salary' && !reason.toLowerCase().includes('salary')) {
      // Tag salary credits so the missing-salary reminder sees this month as done.
      reason = reason ? `Salary · ${reason}` : 'Salary';
    }
    await this.store.adjustAccountBalance({
      accountId,
      amount,
      kind: 'increase',
      reason: reason || undefined,
    });
    await this.inbox.markLogged(item.id);
  }

  private async saveCcPayment(item: NotificationInboxItem, amount: number): Promise<void> {
    const accountId = this.logAccountId();
    const cardId = this.logCardId();
    if (!accountId) throw new Error(this.i18n.t('notifications.log.chooseAccount'));
    if (!cardId) throw new Error(this.i18n.t('notifications.log.chooseCard'));

    const card = this.activeCards().find((candidate) => candidate.id === cardId);
    if (!card) throw new Error(this.i18n.t('notifications.log.chooseCard'));

    await this.store.recordDebtPayment({
      debtId: cardId,
      accountId,
      // The SMS amount can exceed tracked outstanding when older spends were
      // never logged; cap so state stays consistent (same rule as auto-tally).
      amount: Math.min(amount, card.remainingBalance),
      date: this.itemDate(item),
      comment: this.logComment.trim() || 'Credit card bill payment (from notification inbox)',
    });
    await this.inbox.markLogged(item.id);
  }

  // ── Internals ───────────────────────────────────────────────────
  private applyFilter(items: NotificationInboxItem[]): NotificationInboxItem[] {
    const filter = this.filter();
    if (filter === 'all') return items;
    return items.filter((item) => {
      if (filter === 'expenses') return item.kind === 'expense';
      if (filter === 'income') return item.kind === 'income' || item.kind === 'salary';
      return item.kind === 'cc-spend' || item.kind === 'cc-payment';
    });
  }

  private activeCards() {
    return this.store.debts().filter((debt) => debt.type === 'credit-card' && debt.status === 'active');
  }

  private calculateDailyLimit(type: string, dateStr: string): number {
    const limitEntry = this.store.limitMap()[type];
    const income = this.store.monthlyIncome();
    const monthlyLimit = limitEntry ? (limitEntry.userPercentage / 100) * income : 0;
    const active = parseLocalDate(dateStr);
    const base = Number.isNaN(active.getTime()) ? new Date() : active;
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return Math.ceil(monthlyLimit / daysInMonth) || 0;
  }

  private activityActor(): { email?: string; role: 'owner' | 'partner' | 'single' } {
    const role = this.backupMode.getMode() === 'family'
      ? this.backupMode.getOwnerRole() ?? 'partner'
      : 'single';
    return { email: this.auth.userEmail() ?? undefined, role };
  }
}
