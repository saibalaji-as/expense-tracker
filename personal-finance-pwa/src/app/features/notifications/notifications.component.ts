import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
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
  Mic,
  Pencil,
  RotateCcw,
  Settings,
  Sparkles,
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
import { SubscriptionService } from '../../core/services/subscription.service';
import { AiVoiceExpenseService } from '../../core/services/ai-voice-expense.service';
import {
  ExpenseEntry,
  NotificationInboxItem,
  PREDEFINED_EXPENSE_TYPES,
} from '../../core/models';
import { inboxItemLocalDate } from '../../core/utils/notification-inbox.util';
import { CommentSuggestion, commentSuggestionsFor } from '../../core/utils/comment-suggestions';
import { formatLocalTime, parseLocalDate, toLocalDateString } from '../../core/utils/local-date';

type InboxFilter = 'all' | 'expenses' | 'income' | 'cards';

interface PendingGroup {
  date: string;
  items: NotificationInboxItem[];
}

type VoiceMode = 'expense' | 'comment';

/** What the log sheet edits: a new record from a detection, or an existing one. */
type LogMode =
  | { kind: 'create' }
  | { kind: 'edit-entry'; entryId: string }
  | { kind: 'edit-payment'; paymentId: string };

/** How a handled history row can be acted on. */
type HistoryAction = 'edit' | 'log-again' | 'log' | null;

/** History lookback for personal comment suggestions. */
const SUGGESTION_HISTORY_DAYS = 120;

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
        CreditCard, Inbox, Mic, Pencil, RotateCcw, Settings, Sparkles, X,
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
                @let linked = linkedEntry(item);
                @let action = historyAction(item);
                <div class="flex items-start gap-3 rounded-2xl border border-border/50 p-3">
                  <span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <lucide-icon [name]="kindIcon(item)" class="h-4 w-4" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline justify-between gap-2">
                      <p class="text-sm font-medium">{{ (linked?.amount ?? item.amount) | currencyFormat }}</p>
                      <span
                        class="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        [class]="item.status === 'dismissed'
                          ? 'bg-muted text-muted-foreground'
                          : action === 'log-again'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'"
                      >
                        {{ (action === 'log-again' ? 'notifications.status.missing' : statusLabelKey(item)) | translate }}
                      </span>
                    </div>
                    <p class="text-[11px] text-muted-foreground">
                      {{ formatDay(itemDate(item)) }} · {{ (linked?.type ?? (kindLabelKey(item) | translate)) }}
                    </p>
                    @if (linked?.comment) {
                      <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{{ linked?.comment }}</p>
                    } @else if (action === 'log-again') {
                      <p class="mt-0.5 text-xs text-muted-foreground">{{ 'notifications.history.missingHint' | translate }}</p>
                    }
                    @if (action) {
                      <div class="mt-2 flex gap-2">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent"
                          [class]="action === 'edit' ? '' : 'border-primary/40 text-primary'"
                          (click)="onHistoryAction(item, action)"
                        >
                          <lucide-icon [name]="action === 'edit' ? 'pencil' : 'rotate-ccw'" class="h-3.5 w-3.5" />
                          {{ historyActionKey(action) | translate }}
                        </button>
                      </div>
                    }
                  </div>
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

    <!-- ── Log / edit modal ─────────────────────────────────────── -->
    <app-modal
      [title]="(logMode().kind === 'create' ? 'notifications.log.title' : 'notifications.log.editTitle') | translate"
      [isOpen]="logTarget() !== null"
      [showActions]="false"
      (cancelled)="closeLog()"
    >
      @if (logTarget(); as target) {
        <div class="flex flex-col gap-4">

          <!-- Voice smart-fill (same as the widget / Daily form) -->
          @if (isExpenseKind(target) && subscription.isPro()) {
            <div class="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary-glow/5 to-success/10 p-3">
              <div class="flex items-center gap-3">
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                  <lucide-icon name="sparkles" class="h-4 w-4" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold">{{ 'daily.voiceExpense.title' | translate }}</p>
                  <p class="text-[11px] leading-snug text-muted-foreground">{{ 'daily.voiceExpense.hint' | translate }}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition"
                  [class]="voiceMode() === 'expense'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-primary/30 bg-primary/10 text-primary'"
                  [disabled]="isParsingVoice() || (voiceMode() !== null && voiceMode() !== 'expense')"
                  [attr.aria-label]="'daily.voiceExpense.action' | translate"
                  (click)="voiceMode() === 'expense' ? stopVoice() : startVoice('expense')"
                >
                  @if (isParsingVoice()) {
                    <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                  } @else {
                    <lucide-icon name="mic" class="h-4 w-4" />
                  }
                  {{ (voiceMode() === 'expense' ? 'daily.voice.stop' : 'daily.voiceExpense.action') | translate }}
                </button>
              </div>
              @if (voiceMode() === 'expense') {
                <p class="mt-2 text-xs font-medium text-destructive">{{ 'daily.voiceExpense.listening' | translate }}</p>
              } @else if (isParsingVoice()) {
                <p class="mt-2 text-xs font-medium text-primary">{{ 'daily.voiceParsing' | translate }}</p>
              }
            </div>
          }

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
              [ngModel]="logAmount()"
              (ngModelChange)="logAmount.set($event)"
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
              @if (logMode().kind === 'edit-payment') {
                <p class="rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm">{{ cardLabel(logCardId()) }}</p>
              } @else {
                <app-themed-select
                  [options]="cardOptions()"
                  [placeholder]="'notifications.log.chooseCard' | translate"
                  [value]="logCardId()"
                  (valueChange)="logCardId.set($event)"
                />
              }
            </div>
          }

          <div>
            <label class="mb-1 block text-xs font-semibold text-muted-foreground" for="inbox-log-comment">
              {{ 'notifications.log.comment' | translate }}
            </label>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <input
                  id="inbox-log-comment"
                  type="text"
                  class="w-full rounded-2xl border border-border bg-background py-2.5 pl-4 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  [placeholder]="'daily.commentPlaceholder' | translate"
                  [ngModel]="logComment()"
                  (ngModelChange)="logComment.set($event)"
                />
                @if (logComment()) {
                  <button
                    type="button"
                    class="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    [attr.aria-label]="'daily.clearComment' | translate"
                    (click)="logComment.set('')"
                  >
                    <lucide-icon name="x" class="h-3.5 w-3.5" />
                  </button>
                }
              </div>
              <button
                type="button"
                class="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border transition"
                [class]="voiceMode() === 'comment'
                  ? 'border-destructive bg-destructive/10 text-destructive'
                  : 'border-border bg-background text-muted-foreground hover:text-primary'"
                [disabled]="isParsingVoice() || (voiceMode() !== null && voiceMode() !== 'comment')"
                [attr.aria-label]="'daily.commentVoice.action' | translate"
                (click)="voiceMode() === 'comment' ? stopVoice() : startVoice('comment')"
              >
                <lucide-icon name="mic" class="h-4 w-4" />
              </button>
            </div>
            @if (voiceMode() === 'comment') {
              <p class="mt-1 text-xs text-destructive">{{ 'daily.commentVoice.listening' | translate }}</p>
            }

            @if (commentSuggestions().length > 0) {
              <p class="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {{ 'notifications.log.suggestions' | translate }}
              </p>
              <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                @for (chip of commentSuggestions(); track chip.label) {
                  <button
                    type="button"
                    class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition"
                    [class]="isChipApplied(chip)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:bg-accent'"
                    (click)="applySuggestion(chip)"
                  >
                    {{ chip.emoji }} {{ chip.label }}
                  </button>
                }
              </div>
            }
          </div>

          <p class="text-[11px] text-muted-foreground">
            {{ i18n.t('notifications.log.dateHint', { date: formatDay(logDate()) }) }}
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
              class="gradient-primary inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
              [disabled]="isSaving()"
              (click)="saveLog()"
            >
              @if (isSaving()) {
                <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              }
              {{ (logMode().kind === 'create' ? 'notifications.log.save' : 'notifications.log.update') | translate }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `,
})
export class NotificationsComponent implements OnInit, OnDestroy {
  readonly inbox = inject(NotificationInboxService);
  readonly access = inject(SpendNotificationAccessService);
  readonly i18n = inject(I18nService);
  readonly currencyService = inject(CurrencyService);
  readonly subscription = inject(SubscriptionService);
  private readonly store = inject(ExpenseStore);
  private readonly auth = inject(AuthService);
  private readonly backupMode = inject(BackupModeService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly aiVoice = inject(AiVoiceExpenseService);

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
  readonly logMode = signal<LogMode>({ kind: 'create' });
  readonly logDate = signal(toLocalDateString());
  readonly logCategory = signal('Miscellaneous');
  readonly logPayment = signal('');
  readonly logAccountId = signal('');
  readonly logCardId = signal('');
  readonly logAmount = signal<number | null>(null);
  readonly logComment = signal('');
  readonly isSaving = signal(false);

  // ── Voice (mirrors the widget / Daily form) ─────────────────────
  readonly voiceMode = signal<VoiceMode | null>(null);
  readonly isParsingVoice = signal(false);
  private recognition: { stop(): void; abort?(): void } | null = null;

  /** Type-aware quick comments: user's frequent ones first, then the curated list. */
  readonly commentSuggestions = computed<CommentSuggestion[]>(() => {
    const target = this.logTarget();
    if (!target || !this.isExpenseKind(target)) return [];
    const since = new Date();
    since.setDate(since.getDate() - SUGGESTION_HISTORY_DAYS);
    const sinceDate = toLocalDateString(since);
    const history = this.store.entries().filter((entry) => entry.date >= sinceDate);
    return commentSuggestionsFor(this.logCategory(), { history });
  });

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

  ngOnDestroy(): void {
    this.recognition?.abort?.();
    this.recognition = null;
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

  /** Opens the sheet to log a NEW record from a detection. */
  openLog(item: NotificationInboxItem): void {
    this.resetSheet(item, { kind: 'create' });
    this.logAmount.set(item.amount);
    this.logComment.set(item.comment);
    this.logCategory.set('Miscellaneous');

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

  /** Opens the sheet on the record a handled detection created / matched. */
  openEdit(item: NotificationInboxItem): void {
    const payment = this.linkedPayment(item);
    if (payment) {
      const entry = this.store.entries().find((candidate) => candidate.id === payment.expenseId);
      this.resetSheet(item, { kind: 'edit-payment', paymentId: payment.id });
      this.logDate.set(payment.date);
      this.logAmount.set(payment.amount);
      this.logAccountId.set(payment.accountId);
      this.logCardId.set(payment.debtId);
      this.logComment.set(entry?.comment ?? '');
      return;
    }

    const entry = this.linkedEntry(item);
    if (!entry) {
      this.openLog(item);
      return;
    }
    this.resetSheet(item, { kind: 'edit-entry', entryId: entry.id });
    this.logDate.set(entry.date);
    this.logAmount.set(entry.amount);
    this.logCategory.set(entry.type);
    this.logComment.set(entry.comment ?? '');
    this.logPayment.set(
      entry.debtId ? `debt:${entry.debtId}` : entry.accountId ? `acct:${entry.accountId}` : '',
    );
  }

  closeLog(): void {
    this.stopVoice();
    this.logTarget.set(null);
  }

  // ── History helpers ─────────────────────────────────────────────
  /** The expense entry a handled detection created or matched, if it still exists. */
  linkedEntry(item: NotificationInboxItem): ExpenseEntry | null {
    if (!item.linkedEntryId || item.status === 'pending' || item.status === 'dismissed') return null;
    const payment = this.linkedPayment(item);
    const entryId = payment ? payment.expenseId : item.linkedEntryId;
    return this.store.entries().find((entry) => entry.id === entryId) ?? null;
  }

  private linkedPayment(item: NotificationInboxItem) {
    if (item.kind !== 'cc-payment' || !item.linkedEntryId) return null;
    return this.store.debtPayments().find((payment) => payment.id === item.linkedEntryId) ?? null;
  }

  historyAction(item: NotificationInboxItem): HistoryAction {
    if (item.status === 'dismissed') return 'log';
    if (item.kind === 'income' || item.kind === 'salary') return null; // adjustments aren't editable
    if (item.kind === 'cc-payment') return this.linkedPayment(item) ? 'edit' : null;
    const entry = this.linkedEntry(item);
    // Debt-payment entries are owned by Finances (the store rejects edits here).
    if (entry) return entry.source === 'debt-payment' ? null : 'edit';
    // Logged/auto-matched but the entry is gone (e.g. lost before it reached
    // storage, or deleted later): offer to log it again. Only once data has
    // loaded, so a cold start never flags everything as missing.
    if (item.linkedEntryId && this.store.driveFileId()) return 'log-again';
    return null;
  }

  historyActionKey(action: HistoryAction): string {
    switch (action) {
      case 'edit': return 'notifications.action.edit';
      case 'log-again': return 'notifications.action.logAgain';
      default: return 'notifications.action.log';
    }
  }

  onHistoryAction(item: NotificationInboxItem, action: HistoryAction): void {
    if (action === 'edit') this.openEdit(item);
    else if (action) this.openLog(item);
  }

  cardLabel(cardId: string): string {
    return this.cardOptions().find((option) => option.value === cardId)?.label ?? '';
  }

  // ── Comment suggestions ─────────────────────────────────────────
  isChipApplied(chip: CommentSuggestion): boolean {
    return this.logComment().toLowerCase().includes(chip.label.toLowerCase());
  }

  applySuggestion(chip: CommentSuggestion): void {
    const current = this.logComment().trim();
    const detectionText = (this.logTarget()?.comment ?? '').trim();
    if (!current || current === detectionText) {
      // Replace the raw SMS text / empty field with a clean note.
      this.logComment.set(chip.label);
    } else if (this.isChipApplied(chip)) {
      return;
    } else {
      this.logComment.set(`${current} · ${chip.label}`);
    }
  }

  // ── Voice ───────────────────────────────────────────────────────
  startVoice(mode: VoiceMode): void {
    const w = window as unknown as Record<string, unknown>;
    const Recognition = (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as
      | (new () => any)
      | undefined;
    if (!Recognition) {
      this.feedback.warning(
        this.i18n.t('daily.voiceUnsupportedTitle'),
        this.i18n.t('daily.voice.unsupportedBrowser'),
      );
      return;
    }

    this.recognition?.abort?.();
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = this.i18n.speechRecognitionLang();
    recognition.onstart = () => this.voiceMode.set(mode);
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript ?? '').trim();
      if (!transcript || !this.logTarget()) return;
      if (mode === 'expense') {
        void this.applyVoiceExpense(transcript);
      } else {
        this.appendToComment(transcript);
      }
    };
    recognition.onerror = () => this.voiceMode.set(null);
    recognition.onend = () => this.voiceMode.set(null);
    this.recognition = recognition;
    recognition.start();
  }

  stopVoice(): void {
    this.recognition?.stop();
    this.voiceMode.set(null);
  }

  private appendToComment(text: string): void {
    const current = this.logComment().trim();
    const detectionText = (this.logTarget()?.comment ?? '').trim();
    this.logComment.set(!current || current === detectionText ? text : `${current} ${text}`);
  }

  /**
   * Gemini smart fill from the user's OWN speech only. The SMS-derived
   * detection text is never sent (privacy rule: notification contents stay
   * on device).
   */
  private async applyVoiceExpense(transcript: string): Promise<void> {
    this.isParsingVoice.set(true);
    try {
      const attempt = await this.aiVoice.parse({
        transcript,
        locale: this.i18n.locale(),
        currency: this.currencyService.currency(),
        categories: this.categoryOptions().map((option) => option.value),
        today: this.logDate(),
      });
      if (!this.logTarget()) return; // sheet closed meanwhile
      const expense = attempt.expense;
      if (!expense) {
        this.appendToComment(transcript);
        this.feedback.info(this.i18n.t('daily.voiceTranscriptSaved'), this.i18n.t('daily.voiceAiUnavailable'));
        return;
      }
      if (expense.amount && expense.amount > 0) this.logAmount.set(expense.amount);
      const type = this.matchCategory(expense.type);
      if (type) this.logCategory.set(type);
      this.logComment.set(expense.comment?.trim() || transcript);
      this.feedback.success(this.i18n.t('daily.voiceFilledTitle'), this.i18n.t('daily.voiceFilledDetail'));
    } catch {
      if (this.logTarget()) {
        this.appendToComment(transcript);
        this.feedback.info(this.i18n.t('daily.voiceTranscriptSaved'), this.i18n.t('daily.voiceAiUnavailable'));
      }
    } finally {
      this.isParsingVoice.set(false);
    }
  }

  private matchCategory(type: string | null | undefined): string | null {
    const key = (type ?? '').trim().toLowerCase();
    if (!key) return null;
    const options = this.categoryOptions().map((option) => option.value);
    return options.find((name) => name.toLowerCase() === key)
      ?? options.find((name) => name.toLowerCase().includes(key) || key.includes(name.toLowerCase()))
      ?? null;
  }

  // ── Save ────────────────────────────────────────────────────────
  async saveLog(): Promise<void> {
    const item = this.logTarget();
    if (!item || this.isSaving()) return;

    const amount = Number(this.logAmount());
    if (!Number.isFinite(amount) || amount <= 0) {
      this.feedback.warning(this.i18n.t('notifications.feedback.invalidAmount'));
      return;
    }

    this.stopVoice();
    this.isSaving.set(true);
    const mode = this.logMode();
    try {
      if (mode.kind === 'edit-entry') {
        await this.updateExpense(mode.entryId, amount);
      } else if (mode.kind === 'edit-payment') {
        await this.updateCcPayment(mode.paymentId, amount);
      } else if (item.kind === 'income' || item.kind === 'salary') {
        await this.saveIncome(item, amount);
      } else if (item.kind === 'cc-payment') {
        await this.saveCcPayment(item, amount);
      } else {
        await this.saveExpense(item, amount);
      }
      this.feedback.success(this.i18n.t(
        mode.kind === 'create' ? 'notifications.feedback.logged' : 'notifications.feedback.updated',
      ));
      // Only reached once the record is in the durable local snapshot — closing
      // the app or this sheet from here on can no longer lose it.
      if (this.logTarget()?.id === item.id) this.closeLog();
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      this.feedback.warning(this.i18n.t('notifications.feedback.logFailed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Runs a store mutation and waits only until it is LOCALLY durable, not for
   * the Drive round-trip (which the store retries in the background and never
   * throws for). Store mutations validate and patch state synchronously, so a
   * validation error still rejects here, and the inbox item is claimed in the
   * same tick so the auto-match effect can't mislabel it "Already logged".
   */
  private async commitLocally(
    item: NotificationInboxItem,
    mutate: () => Promise<void>,
    linkId: () => string | undefined,
  ): Promise<void> {
    const previous = item;
    const operation = mutate();
    operation.catch(() => undefined); // surfaced through the race below
    void this.inbox.markLogged(item.id, linkId());
    try {
      await Promise.race([operation, this.store.whenLocallySaved()]);
    } catch (error) {
      await this.inbox.restore(previous);
      throw error;
    }
  }

  private async saveExpense(item: NotificationInboxItem, amount: number): Promise<void> {
    const date = this.logDate();
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
      comment: this.logComment().trim() || undefined,
      accountId: payment.startsWith('acct:') ? payment.slice(5) : undefined,
      debtId: payment.startsWith('debt:') ? payment.slice(5) : undefined,
      source: 'notification-prompt',
      createdByEmail: actor.email,
      createdByRole: actor.role,
    };

    await this.commitLocally(item, () => this.store.addEntry(entry), () => entry.id);
  }

  private async updateExpense(entryId: string, amount: number): Promise<void> {
    const existing = this.store.entries().find((entry) => entry.id === entryId);
    if (!existing) throw new Error(this.i18n.t('notifications.history.missingHint'));
    const type = this.logCategory() || existing.type;
    const limit = type === existing.type ? existing.limit : this.calculateDailyLimit(type, existing.date);
    const payment = this.logPayment();
    const updated: ExpenseEntry = {
      ...existing,
      amount,
      type,
      limit,
      savings: limit - amount,
      comment: this.logComment().trim() || undefined,
      accountId: payment.startsWith('acct:') ? payment.slice(5) : undefined,
      debtId: payment.startsWith('debt:') ? payment.slice(5) : undefined,
    };
    const operation = this.store.updateEntry(updated);
    operation.catch(() => undefined);
    await Promise.race([operation, this.store.whenLocallySaved()]);
  }

  private async saveIncome(item: NotificationInboxItem, amount: number): Promise<void> {
    const accountId = this.logAccountId();
    if (!accountId) {
      throw new Error(this.i18n.t('notifications.log.chooseAccount'));
    }
    let reason = this.logComment().trim();
    if (item.kind === 'salary' && !reason.toLowerCase().includes('salary')) {
      // Tag salary credits so the missing-salary reminder sees this month as done.
      reason = reason ? `Salary · ${reason}` : 'Salary';
    }
    const before = new Set(this.store.accountAdjustments().map((adjustment) => adjustment.id));
    await this.commitLocally(
      item,
      () => this.store.adjustAccountBalance({
        accountId,
        amount,
        kind: 'increase',
        reason: reason || undefined,
      }),
      () => this.store.accountAdjustments().find((adjustment) => !before.has(adjustment.id))?.id,
    );
  }

  private async saveCcPayment(item: NotificationInboxItem, amount: number): Promise<void> {
    const accountId = this.logAccountId();
    const cardId = this.logCardId();
    if (!accountId) throw new Error(this.i18n.t('notifications.log.chooseAccount'));
    if (!cardId) throw new Error(this.i18n.t('notifications.log.chooseCard'));

    const card = this.activeCards().find((candidate) => candidate.id === cardId);
    if (!card) throw new Error(this.i18n.t('notifications.log.chooseCard'));

    const before = new Set(this.store.debtPayments().map((payment) => payment.id));
    await this.commitLocally(
      item,
      () => this.store.recordDebtPayment({
        debtId: cardId,
        accountId,
        // The SMS amount can exceed tracked outstanding when older spends were
        // never logged; cap so state stays consistent (same rule as auto-tally).
        amount: Math.min(amount, card.remainingBalance),
        date: this.logDate(),
        comment: this.logComment().trim() || 'Credit card bill payment (from notification inbox)',
      }),
      () => this.store.debtPayments().find((payment) => !before.has(payment.id))?.id,
    );
  }

  private async updateCcPayment(paymentId: string, amount: number): Promise<void> {
    const payment = this.store.debtPayments().find((candidate) => candidate.id === paymentId);
    if (!payment) throw new Error(this.i18n.t('notifications.history.missingHint'));
    const accountId = this.logAccountId();
    if (!accountId) throw new Error(this.i18n.t('notifications.log.chooseAccount'));
    const operation = this.store.updateDebtPayment(paymentId, {
      accountId,
      amount,
      date: payment.date,
      comment: this.logComment().trim() || undefined,
    });
    operation.catch(() => undefined);
    await Promise.race([operation, this.store.whenLocallySaved()]);
  }

  // ── Internals ───────────────────────────────────────────────────
  private resetSheet(item: NotificationInboxItem, mode: LogMode): void {
    this.stopVoice();
    this.isParsingVoice.set(false);
    this.isSaving.set(false);
    this.logMode.set(mode);
    this.logDate.set(this.itemDate(item));
    this.logPayment.set('');
    this.logAccountId.set('');
    this.logCardId.set('');
    this.logTarget.set(item);
  }

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
