import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked, isDevMode } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  TrendingUp,
  TrendingDown,
  Mic,
  Trash2,
  Plus,
  Pencil,
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Paperclip,
  FileText,
  ExternalLink,
  Sparkles,
  Eye,
  RotateCw,
  Wand2,
  Check,
  Crop,
  Users,
  WalletCards,
  CreditCard,
  Image,
  Lock,
} from 'lucide-angular';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { SyncService } from '../../core/services/sync.service';
import { StorageService } from '../../core/services/storage.service';
import { I18nService } from '../../core/services/i18n.service';
import { CurrencyService } from '../../core/services/currency.service';
import { GoogleDriveService } from '../../core/services/google-drive.service';
import { ReceiptExtractionService } from '../../core/services/receipt-extraction.service';
import { ReceiptExtractionSessionService } from '../../core/services/receipt-extraction-session.service';
import { AiVoiceExpenseService } from '../../core/services/ai-voice-expense.service';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { BackupModeService, OwnerRole } from '../../core/services/backup-mode.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { DailyExpenseDraft, DailyExpenseDraftService } from '../../core/services/daily-expense-draft.service';
import { AssetAccount, DebtAccount, ExpenseEntry, ExpenseReceipt } from '../../core/models';

/** Prefix distinguishing credit-card values from asset-account IDs in the payment selector. */
const DEBT_PAYMENT_OPTION_PREFIX = 'debt:';
import { CurrencyFormatPipe, TranslatePipe } from '../../shared/pipes';
import {
  ButtonComponent,
  ModalComponent,
  SectionCardComponent,
  CategoryIconComponent,
  ProgressRingComponent,
  ThemedSelectComponent,
  ThemedSelectOption,
  ClearableInputDirective,
} from '../../shared/components';
import {
  CATEGORY_DEFS,
  PREDEFINED_EXPENSE_TYPES,
  getCategoryDef,
  getCategoryIdByName,
} from '../../core/models/category-definitions';
import { formatLocalTime, parseLocalDate, toLocalDateString } from '../../core/utils/local-date';
import { Capacitor } from '@capacitor/core';

interface SplitBillRow {
  id: string;
  type: string;
  amount: number | null;
  comment: string;
}

interface CategoryChoice {
  id: string;
  name: string;
}

interface ReceiptEditorState {
  file: File;
  url: string;
  rotation: 0 | 90 | 180 | 270;
  enhance: boolean;
  crop: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

const RECEIPT_UPLOAD_MAX_DIMENSION = 1600;
const RECEIPT_UPLOAD_TARGET_BYTES = 120 * 1024;
const RECEIPT_UPLOAD_JPEG_QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4, 0.32];
const RECEIPT_UPLOAD_SCALE_STEP = 0.82;

@Component({
  selector: 'app-daily-expense',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CurrencyFormatPipe,
    TranslatePipe,
    ButtonComponent,
    ModalComponent,
    SectionCardComponent,
    CategoryIconComponent,
    ProgressRingComponent,
    ThemedSelectComponent,
    ClearableInputDirective,
    LucideAngularModule,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ TrendingUp, TrendingDown, Mic, Trash2, Plus, Pencil, X, Calendar, ChevronDown, ChevronUp, AlertTriangle, Paperclip, FileText, ExternalLink, Sparkles, Eye, RotateCw, Wand2, Check, Crop, Users, WalletCards, CreditCard, Image, Lock }),
    },
  ],
  template: `
    <div>

      <!-- Offline toast -->
      @if (offlineToast()) {
        <div
          class="mb-4 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
          role="alert"
          aria-live="polite"
        >
          Entry saved locally — will sync when online
        </div>
      }

      <!-- Overspending warning -->
      @if (lastMonthOverspend(); as warning) {
        <div
          class="mb-4 rounded-2xl border border-warning/40 bg-warning/10 p-4"
          role="alert"
          aria-live="assertive"
        >
          <div class="flex items-start gap-3">
            <div class="shrink-0 mt-0.5">
              <lucide-icon name="alert-triangle" class="h-5 w-5 text-warning" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-semibold text-warning-foreground mb-1">
                ⚠️ Budget Alert: {{ getCatName(warning.type) }}
              </h3>
              <p class="text-sm text-warning-foreground mb-2">
                You overspent on <strong>{{ getCatName(warning.type) }}</strong> last month by 
                <strong>{{ warning.overspentAmount | currencyFormat }}</strong>.
              </p>
              <div class="flex items-center gap-4 text-xs text-warning mb-3">
                <span>Last Month Spent: <strong>{{ warning.lastMonthSpent | currencyFormat }}</strong></span>
                <span>•</span>
                <span>Monthly Limit: <strong>{{ warning.lastMonthLimit | currencyFormat }}</strong></span>
              </div>
              <p class="text-xs text-warning italic">
                💡 Consider if this expense is necessary to avoid overspending again this month.
              </p>
            </div>
            <button
              type="button"
              (click)="dismissOverspendWarning(warning.type)"
              aria-label="Dismiss warning"
              class="shrink-0 grid h-6 w-6 place-items-center rounded-lg text-warning transition-all hover:bg-warning/20"
            >
              <lucide-icon name="x" class="h-4 w-4" />
            </button>
          </div>
        </div>
      }

      <!-- Hero glass card -->
      <div class="mb-4 glass-card relative overflow-hidden p-5 md:p-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {{ selectedDateLabel() }}
            </p>
              <h1 class="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{{ dateStr() }}</h1>
              <p class="mt-2 text-sm text-muted-foreground">
              {{ 'daily.hero.spentPrefix' | translate }}
              <span class="font-semibold text-foreground">{{ totalToday() | currencyFormat }}</span>
              {{ 'daily.hero.of' | translate }}
              <span class="font-semibold text-foreground">{{ dailyBudget() | currencyFormat }}</span>
              {{ isToday() ? ('daily.hero.todaySuffix' | translate) : ('daily.hero.daySuffix' | translate) }}
            </p>
          </div>
          <app-progress-ring
            [value]="dayPct()"
            [label]="dayPct() + '%'"
            [sub]="'daily.progress.used' | translate"
            [size]="88"
          />
        </div>
        <!-- Decorative gradient blob - contained within card -->
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full opacity-40 blur-3xl md:-right-16 md:-top-16 md:h-56 md:w-56"
          [style.background-image]="'var(--gradient-primary)'"
        ></div>
      </div>

      <!-- Two-column grid: stacks on mobile, 50/50 on tablet, 3/5 + 2/5 on desktop -->
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">

        <!-- Log Expense SectionCard -->
        <app-section-card
          class="xl:col-span-3"
          [title]="'daily.log.title' | translate"
          [description]="'daily.log.description' | translate"
        >
          <!-- Edit mode banner -->
          @if (isEditMode()) {
            <div class="mb-4 flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3">
              <div class="flex items-center gap-2">
                <lucide-icon name="pencil" class="h-4 w-4 text-primary" />
                <span class="text-sm font-medium text-primary">{{ 'daily.editingExpense' | translate }}</span>
              </div>
              <button
                type="button"
                (click)="cancelEdit()"
                aria-label="Cancel editing"
                class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
              >
                <lucide-icon name="x" class="h-4 w-4" />
              </button>
            </div>
          }

          <form [formGroup]="form" (ngSubmit)="onSubmit()">

            <!-- Voice expense smart-fill -->
            @if (subscriptionService.isPro()) {
              <div class="mb-4 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary-glow/5 to-success/10 p-3">
                <div class="flex items-center gap-3">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                    <lucide-icon name="sparkles" class="h-4 w-4" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <p class="text-sm font-semibold text-foreground">{{ 'daily.voiceExpense.title' | translate }}</p>
                      <span class="rounded-full border border-primary/25 bg-background/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                        {{ 'daily.voiceExpense.geminiBadge' | translate }}
                      </span>
                    </div>
                    <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ 'daily.voiceExpense.hint' | translate }}</p>
                  </div>
                  <button
                    type="button"
                    [attr.aria-label]="'daily.voiceExpense.action' | translate"
                    [disabled]="isParsingVoiceExpense() || (isRecording() && recordingMode() !== 'expense')"
                    (click)="recordingMode() === 'expense' ? stopVoiceRecording() : startVoiceExpenseRecording()"
                    class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    [class.border-destructive]="recordingMode() === 'expense'"
                    [class.bg-destructive\/10]="recordingMode() === 'expense'"
                    [class.text-destructive]="recordingMode() === 'expense'"
                    [class.border-primary\/30]="recordingMode() !== 'expense'"
                    [class.bg-primary\/10]="recordingMode() !== 'expense'"
                    [class.text-primary]="recordingMode() !== 'expense'"
                    [class.opacity-60]="isParsingVoiceExpense() || (isRecording() && recordingMode() !== 'expense')"
                    [class.cursor-not-allowed]="isParsingVoiceExpense() || (isRecording() && recordingMode() !== 'expense')"
                  >
                    @if (isParsingVoiceExpense()) {
                      <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                    } @else {
                      <lucide-icon name="mic" class="h-4 w-4" />
                    }
                    <span class="hidden sm:inline">{{ (recordingMode() === 'expense' ? 'daily.voice.stop' : 'daily.voiceExpense.action') | translate }}</span>
                  </button>
                </div>
                @if (recordingMode() === 'expense') {
                  <p class="mt-2 text-xs font-medium text-destructive">{{ 'daily.voiceExpense.listening' | translate }}</p>
                } @else if (isParsingVoiceExpense()) {
                  <p class="mt-2 text-xs font-medium text-primary">{{ 'daily.voiceParsing' | translate }}</p>
                }
              </div>
            } @else {
              <div class="mb-4 rounded-2xl border border-border bg-card/40 p-3">
                <div class="flex items-center gap-3">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <lucide-icon name="lock" class="h-4 w-4" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-foreground">Voice Logging — Pro feature</p>
                    <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Record expenses in your voice and let AI fill in the form.</p>
                  </div>
                  <button
                    type="button"
                    (click)="router.navigate(['/subscribe'])"
                    class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition-all hover:border-primary/60"
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            }

            <!-- Category chips -->
            <div>
              <p class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{{ 'daily.expenseType' | translate }}<span class="text-destructive ml-0.5">*</span></p>
              <div class="flex flex-wrap gap-1.5">
                @for (cat of visibleCategories(); track cat.id) {
                  <button
                    type="button"
                    (click)="selectCategory(cat)"
                    [attr.aria-label]="getCategoryLabel(cat)"
                    [attr.aria-pressed]="isActiveCat(cat)"
                    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 relative"
                    [class.border-transparent]="isActiveCat(cat)"
                    [class.shadow-glow]="isActiveCat(cat)"
                    [class.border-border]="!isActiveCat(cat)"
                    [class.bg-card\/40]="!isActiveCat(cat)"
                    [class.text-muted-foreground]="!isActiveCat(cat)"
                    [class.hover\:text-foreground]="!isActiveCat(cat)"
                    [class.text-foreground]="isActiveCat(cat)"
                    [class.font-semibold]="isActiveCat(cat)"
                  >
                    @if (isActiveCat(cat)) {
                      <span 
                        class="absolute inset-0 rounded-full opacity-15"
                        [style.background-color]="'var(' + getCatColorVar(cat.name) + ')'"
                      ></span>
                    }
                    <span class="relative z-10 flex items-center gap-1.5">
                      <app-category-icon [categoryId]="getCatId(cat.name)" size="xs" />
                      {{ getCategoryLabel(cat) }}
                    </span>
                  </button>
                }
                
                <!-- Show More/Less Button -->
                @if (hasMoreCategories()) {
                  <button
                    type="button"
                    (click)="showAllCategories.set(!showAllCategories())"
                    class="inline-flex items-center gap-1 rounded-full border border-border bg-card/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-primary/30"
                  >
                    @if (showAllCategories()) {
                      <lucide-icon name="chevron-up" class="h-3 w-3" />
                      <span>{{ 'daily.showLess' | translate }}</span>
                    } @else {
                      <lucide-icon name="chevron-down" class="h-3 w-3" />
                      <span>{{ 'daily.showMore' | translate }}</span>
                    }
                  </button>
                }
              </div>
            </div>

            <!-- Amount + Date — same row -->
            <div class="mt-4 flex gap-2">
              <!-- Amount -->
              <div class="flex-1 min-w-0">
	                <label for="amount-input" class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{{ 'common.amount' | translate }}<span class="text-destructive ml-0.5">*</span></label>
                <div class="mt-1 flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-3 py-2 focus-within:border-primary focus-within:shadow-glow transition-all">
                  <span class="text-base font-semibold text-muted-foreground shrink-0">{{ currencyService.symbol() }}</span>
                  <input appClearable
                    id="amount-input"
                    type="number"
                    inputmode="decimal"
                    formControlName="amount"
                    placeholder="0"
                    class="w-full bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
              <!-- Date -->
              <div class="w-[50%] shrink-0">
	                <label for="date-input" class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{{ 'daily.date' | translate }}<span class="text-destructive ml-0.5">*</span></label>
                <div class="mt-1 flex items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-card/60 px-2.5 py-2 focus-within:border-primary focus-within:shadow-glow transition-all">
                  <lucide-icon name="calendar" class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input appClearable
                    id="date-input"
                    type="date"
                    formControlName="date"
                    [max]="maxDate"
                    class="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
                  />
                  @if (form.get('date')?.value !== maxDate) {
                    <button
                      type="button"
                      (click)="setToday()"
                      class="shrink-0 text-[10px] text-primary hover:underline"
                    >
	                      {{ 'common.today' | translate }}
                    </button>
                  }
                </div>
              </div>
            </div>

            @if (paymentAccountOptions().length > 0) {
              <div class="mt-2.5">
                <label for="account-input" class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{{ 'daily.paymentSource' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></label>
                <div class="mt-1">
                  <app-themed-select formControlName="accountId" [options]="paymentAccountOptions()" size="sm" />
                </div>
                @if (selectedAccount(); as account) {
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    {{ i18n.t('daily.paymentSourceBalance', { amount: currencyService.format(account.balance, i18n.locale()) }) }}
                  </p>
                }
                @if (selectedCreditCard(); as card) {
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    {{ i18n.t('daily.paymentCardOutstanding', { amount: currencyService.format(card.remainingBalance, i18n.locale()) }) }}
                  </p>
                }
              </div>
            }

            <!-- Live pills -->
            <div class="mt-2.5 grid grid-cols-2 gap-2">
              <!-- Remaining today -->
              <div
                class="rounded-xl border px-3 py-2 transition-all"
                [class.border-destructive\/40]="overBudget()"
                [class.bg-destructive\/10]="overBudget()"
                [class.text-destructive]="overBudget()"
                [class.border-border]="!overBudget()"
                [class.bg-card\/40]="!overBudget()"
              >
                <p class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">{{ 'daily.remaining' | translate }}</p>
                <p class="mt-1 text-sm font-semibold leading-none" [class.text-destructive]="overBudget()">
                  {{ remainingAfterEntry() | currencyFormat }}
                </p>
              </div>
              <!-- Savings (this entry) -->
              <div class="rounded-xl border border-border bg-card/40 px-3 py-2">
	                <p class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">{{ 'common.savings' | translate }}</p>
                <p
                  class="mt-1 flex items-center gap-1 text-sm font-semibold leading-none"
                  [style.color]="'var(--success)'"
                >
                  @if (savings() >= 0) {
                    <lucide-icon name="trending-up" class="h-3 w-3" />
                  } @else {
                    <lucide-icon name="trending-down" class="h-3 w-3" />
                  }
                  {{ savings() | currencyFormat }}
                </p>
              </div>
            </div>

            <!-- Comment + dictation mic -->
            <div class="mt-2.5">
	              <label for="comment-input" class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{{ 'daily.commentOptional' | translate }}</label>
              <div class="mt-1 flex items-center gap-2">
                <div class="relative flex-1">
                  <input
                    id="comment-input"
                    type="text"
                    formControlName="comment"
	                  [placeholder]="'daily.commentPlaceholder' | translate"
                    class="w-full rounded-xl border border-border bg-card/60 py-2 pl-3 pr-10 text-sm text-foreground outline-none focus:border-primary"
                  />
                  @if (commentHasValue()) {
                    <button
                      type="button"
                      (click)="clearComment()"
                      [attr.aria-label]="'daily.clearComment' | translate"
                      class="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <lucide-icon name="x" class="h-3.5 w-3.5" />
                    </button>
                  }
                </div>
                <button
                  type="button"
	                  [attr.aria-label]="'daily.commentVoice.action' | translate"
                  [disabled]="isParsingVoiceExpense() || (isRecording() && recordingMode() !== 'comment')"
                  (click)="recordingMode() === 'comment' ? stopVoiceRecording() : startCommentRecording()"
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  [class.border-destructive]="recordingMode() === 'comment'"
                  [class.bg-destructive\/10]="recordingMode() === 'comment'"
                  [class.text-destructive]="recordingMode() === 'comment'"
                  [class.opacity-60]="isParsingVoiceExpense() || (isRecording() && recordingMode() !== 'comment')"
                  [class.cursor-not-allowed]="isParsingVoiceExpense() || (isRecording() && recordingMode() !== 'comment')"
                  [class.border-border]="recordingMode() !== 'comment'"
                  [class.bg-card\/60]="recordingMode() !== 'comment'"
                  [class.text-muted-foreground]="recordingMode() !== 'comment'"
                  [class.hover\:text-primary]="recordingMode() !== 'comment'"
                  [class.hover\:shadow-glow]="recordingMode() !== 'comment'"
                >
                  <lucide-icon name="mic" class="h-4 w-4" />
                </button>
              </div>
              @if (recordingMode() === 'comment') {
                <p class="mt-1 text-xs text-destructive">{{ 'daily.commentVoice.listening' | translate }}</p>
              }
            </div>

            <!-- Bill / receipt attachment -->
            <div class="mt-3">
              <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {{ 'daily.receipt.label' | translate }}
              </p>
              <input
                #receiptInput
                type="file"
                accept="image/*,application/pdf"
                class="hidden"
                (change)="onReceiptSelected($event)"
              />
              <input
                #receiptCameraInput
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden"
                (change)="onReceiptSelected($event)"
              />
              <div class="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-3 py-2 transition-all hover:border-primary/40">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <lucide-icon name="paperclip" class="h-4 w-4" />
                </span>
                <div class="min-w-0 flex-1">
                  @if (selectedReceiptFile(); as file) {
                    <p class="truncate text-sm font-medium">{{ file.name }}</p>
                    <p class="text-[11px] text-muted-foreground">{{ formatFileSize(file.size) }}</p>
                  } @else if (editingEntry()?.receipt; as receipt) {
                    <p class="truncate text-sm font-medium">{{ receipt.fileName }}</p>
                    <p class="text-[11px] text-muted-foreground">{{ 'daily.receipt.keepExisting' | translate }}</p>
                  } @else {
                    <p class="text-sm font-medium">{{ 'daily.receipt.empty' | translate }}</p>
                    <p class="text-[11px] text-muted-foreground">{{ 'daily.receipt.hint' | translate }}</p>
                  }
                </div>
                @if (selectedReceiptFile()) {
                  <button
                    type="button"
                    (click)="clearSelectedReceipt()"
                    [attr.aria-label]="'daily.receipt.remove' | translate"
                    class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                  >
                    <lucide-icon name="x" class="h-4 w-4" />
                  </button>
                }
                <div class="flex shrink-0 gap-1.5">
                  @if (selectedReceiptFile(); as file) {
                    @if (isImageFile(file)) {
                      <button
                        type="button"
                        (click)="previewSelectedReceipt()"
                        class="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background/60 text-muted-foreground transition-all hover:border-primary/40 hover:text-primary"
                        [attr.aria-label]="'daily.receipt.preview' | translate"
                      >
                        <lucide-icon name="eye" class="h-4 w-4" />
                      </button>
                    }
                  }
                  @if (subscriptionService.isPro()) {
                    <button
                      type="button"
                      (click)="receiptCameraInput.click()"
                      class="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-all hover:border-primary/60"
                    >
                      {{ 'daily.receipt.scan' | translate }}
                    </button>
                    <button
                      type="button"
                      (click)="receiptInput.click()"
                      class="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/40"
                    >
                      {{ (selectedReceiptFile() || editingEntry()?.receipt ? 'daily.receipt.change' : 'daily.receipt.attach') | translate }}
                    </button>
                  } @else {
                    <button
                      type="button"
                      (click)="router.navigate(['/subscribe'])"
                      class="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:border-primary/40 hover:text-primary"
                    >
                      <lucide-icon name="lock" class="h-3.5 w-3.5" />
                      Receipt Scanner — Pro
                    </button>
                  }
                </div>
              </div>
              @if (receiptError()) {
                <p class="mt-1 text-xs text-destructive">{{ receiptError() }}</p>
              }
              @if (extractingReceipt()) {
                <div class="mt-2 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                  <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                  {{ 'daily.receipt.extracting' | translate }}
                </div>
              } @else if (receiptExtraction(); as extraction) {
                <div class="mt-2 rounded-xl border border-primary/25 bg-primary/10 p-3">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 text-xs font-semibold text-primary">
                      <lucide-icon name="sparkles" class="h-3.5 w-3.5" />
                      {{ 'daily.receipt.smartFill.title' | translate }}
                      <span
                        class="rounded-full border border-primary/25 bg-background/70 px-2 py-0.5 text-[10px] font-semibold text-primary"
                      >
                        {{ (receiptExtractionSource() === 'gemini' ? 'daily.receipt.smartFill.geminiBadge' : 'daily.receipt.smartFill.localBadge') | translate }}
                      </span>
                    </div>
                    <div class="flex gap-1.5">
                      @if (extraction.lineItems.length > 1) {
                        <button
                          type="button"
                          (click)="startSplitBillFromExtractedItems()"
                          class="rounded-lg border border-primary/30 bg-background/60 px-2.5 py-1 text-[11px] font-semibold text-primary transition-all hover:border-primary/60"
                        >
                          {{ 'daily.receipt.smartFill.splitItems' | translate }}
                        </button>
                      }
                      @if (!receiptExtractionApplied()) {
                        <button
                          type="button"
                          (click)="applyReceiptExtraction(true)"
                          class="rounded-lg border border-primary/30 bg-background/60 px-2.5 py-1 text-[11px] font-semibold text-primary transition-all hover:border-primary/60"
                        >
                          {{ 'daily.receipt.smartFill.apply' | translate }}
                        </button>
                      }
                    </div>
                  </div>
                  @if (receiptExtractionSource() === 'local' && receiptExtractionFallbackReason()) {
                    <p class="mb-2 text-[11px] text-muted-foreground">
                      {{ 'daily.receipt.smartFill.fallbackHint' | translate }}
                    </p>
                  }
                  @if (extraction.lineItems.length > 0) {
                    <div class="mb-2 rounded-lg border border-primary/15 bg-background/50 p-2">
                      <p class="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {{ 'daily.receipt.smartFill.itemsFound' | translate }}
                      </p>
                      <div class="max-h-32 space-y-1 overflow-y-auto pr-1">
                        @for (item of extraction.lineItems; track item.name + '-' + item.amount) {
                          <div class="flex items-start justify-between gap-2 text-[11px]">
                            <span class="min-w-0 flex-1 truncate text-foreground">{{ item.name }}</span>
                            <span class="shrink-0 font-semibold text-primary">{{ item.amount | currencyFormat }}</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                  <div class="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <p>
                      <span class="block font-medium text-foreground">{{ 'common.amount' | translate }}</span>
                      {{ extraction.amount ? (extraction.amount | currencyFormat) : ('daily.receipt.smartFill.notFound' | translate) }}
                      @if (extraction.amount && extraction.amountConfidence < 0.7) {
                        <span class="mt-0.5 block text-[10px] font-medium text-warning">{{ 'daily.receipt.smartFill.lowConfidence' | translate }}</span>
                      }
                    </p>
                    <p>
                      <span class="block font-medium text-foreground">{{ 'daily.date' | translate }}</span>
                      {{ extraction.date ?? ('daily.receipt.smartFill.notFound' | translate) }}
                    </p>
                    <p>
                      <span class="block font-medium text-foreground">{{ 'daily.expenseType' | translate }}</span>
                      {{ receiptExtractionTypeLabel(extraction.type) }}
                    </p>
                    <p>
                      <span class="block font-medium text-foreground">{{ 'common.comment' | translate }}</span>
                      {{ extraction.comment ?? ('daily.receipt.smartFill.notFound' | translate) }}
                    </p>
                  </div>
                  @if (extraction.amountCandidates.length > 1) {
                    <div class="mt-2 border-t border-primary/15 pt-2">
                      <p class="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {{ 'daily.receipt.smartFill.possibleTotals' | translate }}
                      </p>
                      <div class="flex flex-wrap gap-1.5">
                        @for (candidate of extraction.amountCandidates; track candidate) {
                          <button
                            type="button"
                            (click)="useReceiptAmountCandidate(candidate)"
                            class="rounded-lg border border-primary/25 bg-background/70 px-2.5 py-1 text-[11px] font-semibold text-primary transition-all hover:border-primary/60"
                          >
                            {{ candidate | currencyFormat }}
                          </button>
                        }
                      </div>
                    </div>
                  }
                  @if (receiptExtractionApplied()) {
                    <p class="mt-2 text-[11px] font-medium text-primary">{{ 'daily.receipt.smartFill.applied' | translate }}</p>
                  }
                </div>
              } @else if (receiptExtractionError()) {
                <p class="mt-1 text-xs text-muted-foreground">{{ receiptExtractionError() }}</p>
              }

              @if (splitBillMode()) {
                <div class="mt-3 overflow-hidden rounded-2xl border border-primary/15 bg-card/80 shadow-md backdrop-blur dark:bg-card/70">
                  <div class="border-b border-primary/10 bg-gradient-to-br from-primary/12 via-primary-glow/10 to-success/10 px-3.5 py-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                            <lucide-icon name="sparkles" class="h-4 w-4" />
                          </span>
                          <div class="min-w-0">
                            <p class="text-sm font-bold leading-tight text-foreground">{{ 'daily.receipt.split.title' | translate }}</p>
                            <p class="mt-0.5 text-[11px] text-muted-foreground">
                              {{ splitBillSubtitle() }}
                            </p>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        (click)="cancelSplitBill()"
                        class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-border/80 bg-background/70 px-2.5 text-[11px] font-semibold text-muted-foreground shadow-sm transition-all hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <lucide-icon name="x" class="h-3.5 w-3.5" />
                        {{ 'common.cancel' | translate }}
                      </button>
                    </div>

                    <div class="mt-3 grid grid-cols-2 gap-2">
                      <div class="rounded-xl border border-border/70 bg-background/70 px-3 py-2 shadow-sm">
                        <p class="text-[10px] font-semibold uppercase text-muted-foreground">{{ 'daily.receipt.split.total' | translate }}</p>
                        <p class="mt-0.5 text-sm font-bold text-foreground">{{ splitBillTotal() | currencyFormat }}</p>
                      </div>
                      <div class="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 shadow-sm">
                        <p class="text-[10px] font-semibold uppercase text-primary">{{ 'daily.receipt.split.split' | translate }}</p>
                        <p class="mt-0.5 text-sm font-bold text-primary">{{ splitRowsTotal() | currencyFormat }}</p>
                      </div>
                    </div>
                  </div>

                  <div class="space-y-2.5 p-3">
                    @for (row of splitRows(); track row.id) {
                      <div class="rounded-2xl border border-border/80 bg-background/65 p-2.5 shadow-sm transition-all focus-within:border-primary/50 focus-within:shadow-glow dark:bg-background/35">
                        <div class="grid grid-cols-[minmax(0,1fr)_6.75rem_2.25rem] items-end gap-2">
                          <label class="min-w-0">
                            <span class="mb-1 block pl-1 text-[10px] font-semibold uppercase text-muted-foreground">{{ 'daily.receipt.split.category' | translate }}</span>
                            <app-themed-select
                              [value]="row.type"
                              [options]="splitCategoryOptions()"
                              size="sm"
                              (valueChange)="updateSplitRow(row.id, 'type', $event)"
                            />
                          </label>
                          <label>
                            <span class="mb-1 block pl-1 text-[10px] font-semibold uppercase text-muted-foreground">{{ 'daily.receipt.split.amount' | translate }}</span>
                            <input appClearable
                              type="number"
                              inputmode="decimal"
                              [value]="row.amount ?? ''"
                              (input)="updateSplitRowFromEvent(row.id, 'amount', $event)"
                              class="h-11 w-full rounded-xl border border-border bg-card/80 px-3 py-2 text-right text-xs font-bold text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-muted/40"
                              placeholder="0"
                            />
                          </label>
                          <button
                            type="button"
                            (click)="removeSplitRow(row.id)"
                            [disabled]="splitRows().length <= 2"
                            class="grid h-11 w-9 place-items-center rounded-xl border border-border bg-card/80 text-muted-foreground transition-all hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 dark:bg-muted/40"
                            [attr.aria-label]="'daily.receipt.split.removeRow' | translate"
                          >
                            <lucide-icon name="x" class="h-4 w-4" />
                          </button>
                          <input appClearable
                            type="text"
                            [value]="row.comment"
                            (input)="updateSplitRowFromEvent(row.id, 'comment', $event)"
                            class="col-span-3 mt-2 h-10 rounded-xl border border-border bg-card/80 px-3 py-2 text-xs text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-muted/40"
                            [placeholder]="'daily.receipt.split.notePlaceholder' | translate"
                          />
                        </div>
                      </div>
                    }

                    <div class="flex flex-col gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        (click)="addSplitRow()"
                        class="inline-flex h-9 w-fit items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 text-[11px] font-bold text-primary transition-all hover:border-primary/50 hover:bg-primary/15"
                      >
                        <lucide-icon name="plus" class="h-3.5 w-3.5" />
                        {{ 'daily.receipt.split.addCategory' | translate }}
                      </button>
                      @if (!splitBillValid()) {
                        <p class="rounded-xl border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive">{{ 'daily.receipt.split.totalMismatch' | translate }}</p>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>

            <!-- Log button -->
            <button
              type="submit"
              [disabled]="(splitBillMode() ? !splitBillValid() : form.invalid) || isSavingExpense()"
              class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              @if (isSavingExpense()) {
                <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                {{ uploadingReceipt() ? ('daily.receipt.uploading' | translate) : ('daily.saving' | translate) }}
              } @else if (isEditMode()) {
                <lucide-icon name="pencil" class="h-4 w-4" />
                {{ actionLabel(true) }}
              } @else {
                <lucide-icon name="plus" class="h-4 w-4" />
                {{ splitBillMode() ? ('daily.receipt.split.logSplit' | translate) : actionLabel(false) }}
              }
            </button>

          </form>
        </app-section-card>

        <!-- Today's Entries SectionCard -->
        <app-section-card
          id="todays-entries"
          class="xl:col-span-2"
          [title]="entriesSectionTitle()"
          [description]="entriesDescription()"
        >
          <!-- Date selector header -->
          <div class="mb-4 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <lucide-icon name="calendar" class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm font-medium">{{ selectedDateLabel() }}</span>
              @if (!isToday()) {
                <button
                  type="button"
                  (click)="goToToday()"
                  class="text-xs text-primary hover:underline"
                >
                  {{ 'daily.entries.goToday' | translate }}
                </button>
              }
            </div>
          </div>

          <ul class="space-y-2.5">
            @for (group of groupedEntries(); track group.type) {
              <li class="group relative flex items-center gap-2 overflow-hidden rounded-2xl border border-border bg-card/40 p-3 transition-all hover:border-primary/30 cursor-pointer">
                <!-- Left color stripe -->
                <span
                  class="absolute inset-y-0 left-0 w-1"
                  [style.background-color]="'var(' + getCatColorVar(group.type) + ')'"
                ></span>
                <!-- Clickable area for detail view -->
                <div 
                  class="min-w-0 flex-1 flex items-center gap-2 overflow-hidden"
                  (click)="viewGroupDetail(group)"
                >
                  <!-- Category icon — add left margin to clear the stripe -->
                  <div class="ml-2 shrink-0">
                    <app-category-icon [categoryId]="getCatId(group.type)" />
                  </div>
                  <!-- Info -->
                  <div class="min-w-0 flex-1 overflow-hidden">
                    <div class="flex items-center gap-2">
                      <p class="truncate text-sm font-medium">{{ getCatName(group.type) }}</p>
                      @if (group.count > 1) {
                        <span class="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {{ group.count }}×
                        </span>
                      }
                    </div>
                    <p class="truncate text-xs text-muted-foreground">
                      @if (group.count === 1) {
                        {{ formatEntryTime(group.entries[0].timestamp) }} · {{ expenseActorLabel(group.entries[0]) }}@if (accountName(group.entries[0].accountId)) {<span> · {{ accountName(group.entries[0].accountId) }}</span>}@if (group.entries[0].comment) {<span> · {{ group.entries[0].comment }}</span>}
                      } @else {
                        {{ i18n.t('daily.entries.multiple', { count: group.count }) }} · {{ groupActorSummary(group.entries) }}
                      }
                    </p>
                  </div>
                  <!-- Amount + savings -->
                  <div class="shrink-0 text-right">
                    <p class="text-sm font-semibold">{{ group.totalAmount | currencyFormat }}</p>
                    <p class="text-[10px] text-muted-foreground">{{ 'daily.entries.limitShort' | translate }} {{ group.limit | currencyFormat }}</p>
                    @if (group.totalSavings > 0) {
                      <p class="text-[10px] font-medium" [style.color]="'var(--success)'">
                        +{{ group.totalSavings | currencyFormat }}
                      </p>
                    } @else if (group.totalSavings < 0) {
                      <p class="text-[10px] font-medium" [style.color]="'var(--destructive)'">
                        {{ group.totalSavings | currencyFormat }}
                      </p>
                    }
                  </div>
                </div>
                <!-- Action buttons: only show for single entries -->
                @if (group.count === 1 && canManageEntry(group.entries[0])) {
                  <div class="shrink-0 flex flex-col gap-1 opacity-100">
                    <!-- Edit button -->
                    <button
                      type="button"
                      (click)="editEntry(group.entries[0]); $event.stopPropagation()"
                      [attr.aria-label]="'common.editEntry' | translate"
                      class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <lucide-icon name="pencil" class="h-4 w-4" />
                    </button>
                    <!-- Delete button -->
                    <button
                      type="button"
                      (click)="deleteEntry(group.entries[0]); $event.stopPropagation()"
                      [attr.aria-label]="'common.deleteEntry' | translate"
                      class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <lucide-icon name="trash-2" class="h-4 w-4" />
                    </button>
                  </div>
                }
              </li>
            } @empty {
              <li class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                @if (isToday()) {
                  {{ 'daily.entries.emptyToday' | translate }}
                } @else {
                  {{ i18n.t('daily.entries.emptyDate', { date: selectedDateLabel() }) }}
                }
              </li>
            }
          </ul>
        </app-section-card>

      </div>
    </div>

    <!-- Expense Detail Popup -->
    @if (isViewingDetail()) {
      <div 
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        (click)="closeDetail()"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <div 
          class="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-3xl border border-border bg-card shadow-2xl"
          (click)="$event.stopPropagation()"
        >
          <!-- Single Entry View -->
          @if (viewingEntry(); as entry) {
            <!-- Compact Header with all metadata -->
            <div class="shrink-0 border-b border-border p-4">
              <!-- Title row -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <app-category-icon [categoryId]="getCatId(entry.type)" size="sm" />
                  <h2 id="detail-title" class="text-base font-semibold">{{ getCatName(entry.type) }}</h2>
                </div>
                <button
                  type="button"
                  (click)="closeDetail()"
                  [attr.aria-label]="'common.closeDetails' | translate"
                  class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
                >
                  <lucide-icon name="x" class="h-4 w-4" />
                </button>
              </div>
              
              <!-- Metadata grid -->
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div>
	                  <p class="text-[10px] text-muted-foreground">{{ 'common.amount' | translate }}</p>
                  <p class="font-semibold">{{ entry.amount | currencyFormat }}</p>
                </div>
                <div>
	                  <p class="text-[10px] text-muted-foreground">{{ 'common.limit' | translate }}</p>
                  <p class="font-semibold">{{ entry.limit | currencyFormat }}</p>
                </div>
                <div>
	                  <p class="text-[10px] text-muted-foreground">{{ 'common.savings' | translate }}</p>
                  <p 
                    class="font-semibold"
                    [style.color]="entry.savings >= 0 ? 'var(--success)' : 'var(--destructive)'"
                  >
                    {{ entry.savings >= 0 ? '+' : '' }}{{ entry.savings | currencyFormat }}
                  </p>
                </div>
              </div>
              
              <!-- Date/Time -->
              <div class="mt-2 text-[10px] text-muted-foreground">
                {{ entry.date }} at {{ formatEntryTime(entry.timestamp) }}
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <div class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <lucide-icon name="users" class="h-3.5 w-3.5" />
                  {{ expenseActorLabel(entry) }}
                </div>
                @if (accountName(entry.accountId)) {
                  <div class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    <lucide-icon name="wallet-cards" class="h-3.5 w-3.5" />
                    {{ accountName(entry.accountId) }}
                  </div>
                }
              </div>
              @if (entry.receipt) {
                @if (isImageReceipt(entry.receipt)) {
                  <button
                    type="button"
                    (click)="previewReceipt(entry.receipt)"
                    class="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/50 px-3 py-2 text-xs font-semibold text-primary transition-all hover:border-primary/40"
                  >
                    <lucide-icon name="eye" class="h-3.5 w-3.5" />
                    {{ 'daily.receipt.preview' | translate }}
                  </button>
                } @else {
                  <button
                    type="button"
                    (click)="previewReceipt(entry.receipt)"
                    class="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/50 px-3 py-2 text-xs font-semibold text-primary transition-all hover:border-primary/40"
                  >
                    <lucide-icon name="file-text" class="h-3.5 w-3.5" />
                    {{ 'daily.receipt.openPdf' | translate }}
                    <lucide-icon name="external-link" class="h-3 w-3" />
                  </button>
                }
              }
            </div>

            <!-- Comment Section (scrollable, takes maximum space) -->
            <div class="flex-1 overflow-y-auto p-4">
	              <p class="text-xs font-medium text-muted-foreground mb-2">{{ 'common.comment' | translate }}</p>
              @if (entry.comment) {
                <p class="text-sm leading-relaxed break-words">{{ entry.comment }}</p>
              } @else {
                <div class="flex items-center justify-center h-32 rounded-2xl border border-dashed border-border bg-card/20">
	                  <p class="text-xs text-muted-foreground">{{ 'daily.noComment' | translate }}</p>
                </div>
              }
            </div>

            <!-- Action Buttons (fixed at bottom) -->
            @if (canManageEntry(entry)) {
            <div class="shrink-0 flex gap-2 p-4 border-t border-border">
              <button
                type="button"
                (click)="editFromDetail(entry)"
                class="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-primary bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20"
              >
                <lucide-icon name="pencil" class="h-4 w-4" />
	                {{ 'common.edit' | translate }}
              </button>
              <button
                type="button"
                (click)="deleteFromDetail(entry)"
                class="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-destructive/20"
              >
                <lucide-icon name="trash-2" class="h-4 w-4" />
	                {{ 'common.delete' | translate }}
              </button>
            </div>
            }
          }

          <!-- Grouped Entries View -->
          @if (viewingGroupedEntries().length > 0) {
            @let entries = viewingGroupedEntries();
            @let firstEntry = entries[0];
            @let totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
            @let actualDailyLimit = this.calculateDailyLimit(firstEntry.type);
            @let totalSavings = actualDailyLimit - totalAmount;
            
            <!-- Compact Header with aggregated metadata -->
            <div class="shrink-0 border-b border-border p-4">
              <!-- Title row -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <app-category-icon [categoryId]="getCatId(firstEntry.type)" size="sm" />
                  <h2 id="detail-title" class="text-base font-semibold">{{ getCatName(firstEntry.type) }}</h2>
                  <span class="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {{ entries.length }}×
                  </span>
                </div>
                <button
                  type="button"
                  (click)="closeDetail()"
                  [attr.aria-label]="'common.closeDetails' | translate"
                  class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
                >
                  <lucide-icon name="x" class="h-4 w-4" />
                </button>
              </div>
              
              <!-- Aggregated Metadata grid -->
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div>
	                  <p class="text-[10px] text-muted-foreground">{{ 'daily.totalAmount' | translate }}</p>
                  <p class="font-semibold">{{ totalAmount | currencyFormat }}</p>
                </div>
                <div>
	                  <p class="text-[10px] text-muted-foreground">{{ 'daily.dailyLimit' | translate }}</p>
                  <p class="font-semibold">{{ actualDailyLimit | currencyFormat }}</p>
                </div>
                <div>
	                  <p class="text-[10px] text-muted-foreground">{{ 'daily.totalSavings' | translate }}</p>
                  <p 
                    class="font-semibold"
                    [style.color]="totalSavings >= 0 ? 'var(--success)' : 'var(--destructive)'"
                  >
                    {{ totalSavings >= 0 ? '+' : '' }}{{ totalSavings | currencyFormat }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Individual Entries List (scrollable) -->
            <div class="flex-1 overflow-y-auto p-4">
	              <p class="text-xs font-medium text-muted-foreground mb-3">{{ 'daily.individualEntries' | translate }}</p>
              <div class="space-y-2">
                @for (entry of entries; track entry.id) {
                  <div class="rounded-2xl border border-border bg-card/40 p-3">
                    <!-- Entry header -->
                    <div class="flex items-start justify-between gap-2 mb-2">
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <p class="text-sm font-semibold">{{ entry.amount | currencyFormat }}</p>
                          <span 
                            class="text-[10px] font-medium"
                            [style.color]="entry.savings >= 0 ? 'var(--success)' : 'var(--destructive)'"
                          >
                            {{ entry.savings >= 0 ? '+' : '' }}{{ entry.savings | currencyFormat }}
                          </span>
                        </div>
                        <p class="text-[10px] text-muted-foreground">
                          {{ formatEntryTime(entry.timestamp) }} · {{ expenseActorLabel(entry) }}@if (accountName(entry.accountId)) {<span> · {{ accountName(entry.accountId) }}</span>}
                        </p>
                      </div>
                      <!-- Action buttons -->
                      @if (canManageEntry(entry)) {
                      <div class="flex gap-1">
                        <button
                          type="button"
                          (click)="editFromDetail(entry)"
                          [attr.aria-label]="'common.editEntry' | translate"
                          class="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
                        >
                          <lucide-icon name="pencil" class="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          (click)="deleteFromDetail(entry)"
                          [attr.aria-label]="'common.deleteEntry' | translate"
                          class="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                        >
                          <lucide-icon name="trash-2" class="h-3.5 w-3.5" />
                        </button>
                      </div>
                      }
                    </div>
                    <!-- Comment -->
                    @if (entry.comment) {
                      <div class="mt-2 pt-2 border-t border-border/50">
	                        <p class="text-xs text-muted-foreground mb-1">{{ 'common.comment' | translate }}:</p>
                        <p class="text-xs leading-relaxed break-words">{{ entry.comment }}</p>
                      </div>
                    }
                    @if (entry.receipt) {
                      @if (isImageReceipt(entry.receipt)) {
                        <button
                          type="button"
                          (click)="previewReceipt(entry.receipt)"
                          class="mt-2 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-primary hover:underline"
                        >
                          <lucide-icon name="eye" class="h-3.5 w-3.5" />
                          {{ 'daily.receipt.preview' | translate }}
                        </button>
                      } @else {
                        <button
                          type="button"
                          (click)="previewReceipt(entry.receipt)"
                          class="mt-2 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-primary hover:underline"
                        >
                          <lucide-icon name="file-text" class="h-3.5 w-3.5" />
                          {{ 'daily.receipt.openPdf' | translate }}
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }

    @if (receiptEditor(); as editor) {
      <div
        class="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
        (click)="cancelReceiptEditor()"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-editor-title"
      >
        <div
          class="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
          (click)="$event.stopPropagation()"
        >
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
            <div class="min-w-0">
              <h2 id="receipt-editor-title" class="truncate text-base font-semibold">{{ 'daily.receipt.editor.title' | translate }}</h2>
              <p class="text-xs text-muted-foreground">{{ 'daily.receipt.editor.subtitle' | translate }}</p>
            </div>
            <button
              type="button"
              (click)="cancelReceiptEditor()"
              [attr.aria-label]="'common.cancel' | translate"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
            >
              <lucide-icon name="x" class="h-4 w-4" />
            </button>
          </div>

          <!-- Image area with interactive crop overlay -->
          <div class="min-h-0 flex-1 overflow-hidden bg-black/95">
            <div class="flex min-h-[46vh] items-center justify-center p-3">
              <div class="relative select-none" style="display:inline-block" #cropRef>
                <img
                  [src]="editor.url"
                  [alt]="editor.file.name"
                  class="block max-h-[55vh] max-w-full rounded-xl"
                  [style.filter]="editor.enhance ? 'grayscale(1) contrast(1.45) brightness(1.08)' : 'none'"
                  draggable="false"
                />
                <!-- Crop overlay (covers exactly the image) -->
                <div
                  class="absolute inset-0 touch-none overflow-visible"
                  (pointermove)="onCropPointerMove($event)"
                  (pointerup)="stopCropDrag($event)"
                  (pointercancel)="stopCropDrag($event)"
                >
                  <!-- Dark mask: top -->
                  <div class="pointer-events-none absolute left-0 right-0 bg-black/60 rounded-tl-xl rounded-tr-xl"
                       [style.height.%]="editor.crop.top"></div>
                  <!-- Dark mask: bottom -->
                  <div class="pointer-events-none absolute left-0 right-0 bg-black/60 rounded-bl-xl rounded-br-xl"
                       [style.top.%]="editor.crop.top + editor.crop.height"
                       [style.bottom.%]="0"></div>
                  <!-- Dark mask: left -->
                  <div class="pointer-events-none absolute bg-black/60"
                       [style.top.%]="editor.crop.top"
                       [style.height.%]="editor.crop.height"
                       [style.width.%]="editor.crop.left"></div>
                  <!-- Dark mask: right -->
                  <div class="pointer-events-none absolute bg-black/60"
                       [style.top.%]="editor.crop.top"
                       [style.height.%]="editor.crop.height"
                       [style.right.%]="0"
                       [style.width.%]="100 - editor.crop.left - editor.crop.width"></div>

                  <!-- Crop box -->
                  <div
                    class="absolute cursor-move border border-white/70"
                    [style.left.%]="editor.crop.left"
                    [style.top.%]="editor.crop.top"
                    [style.width.%]="editor.crop.width"
                    [style.height.%]="editor.crop.height"
                    (pointerdown)="startCropDrag('move', $event, cropRef)"
                  >
                    <!-- Rule-of-thirds grid -->
                    <div class="pointer-events-none absolute left-0 right-0 top-1/3 h-px bg-white/20"></div>
                    <div class="pointer-events-none absolute left-0 right-0 top-2/3 h-px bg-white/20"></div>
                    <div class="pointer-events-none absolute bottom-0 left-1/3 top-0 w-px bg-white/20"></div>
                    <div class="pointer-events-none absolute bottom-0 left-2/3 top-0 w-px bg-white/20"></div>

                    <!-- Corner handles (large touch targets) -->
                    <!-- NW -->
                    <div class="absolute -left-5 -top-5 flex h-10 w-10 cursor-nw-resize items-end justify-end"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('nw', $event, cropRef)">
                      <div class="pointer-events-none h-5 w-5 rounded-sm bg-white shadow-lg"></div>
                    </div>
                    <!-- NE -->
                    <div class="absolute -right-5 -top-5 flex h-10 w-10 cursor-ne-resize items-end justify-start"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('ne', $event, cropRef)">
                      <div class="pointer-events-none h-5 w-5 rounded-sm bg-white shadow-lg"></div>
                    </div>
                    <!-- SW -->
                    <div class="absolute -bottom-5 -left-5 flex h-10 w-10 cursor-sw-resize items-start justify-end"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('sw', $event, cropRef)">
                      <div class="pointer-events-none h-5 w-5 rounded-sm bg-white shadow-lg"></div>
                    </div>
                    <!-- SE -->
                    <div class="absolute -bottom-5 -right-5 flex h-10 w-10 cursor-se-resize items-start justify-start"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('se', $event, cropRef)">
                      <div class="pointer-events-none h-5 w-5 rounded-sm bg-white shadow-lg"></div>
                    </div>

                    <!-- Edge handles (pill-shaped, touch-friendly) -->
                    <!-- N -->
                    <div class="absolute left-1/2 top-0 flex h-7 w-14 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize items-center justify-center"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('n', $event, cropRef)">
                      <div class="pointer-events-none h-1.5 w-9 rounded-full bg-white/80 shadow"></div>
                    </div>
                    <!-- S -->
                    <div class="absolute bottom-0 left-1/2 flex h-7 w-14 -translate-x-1/2 translate-y-1/2 cursor-ns-resize items-center justify-center"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('s', $event, cropRef)">
                      <div class="pointer-events-none h-1.5 w-9 rounded-full bg-white/80 shadow"></div>
                    </div>
                    <!-- W -->
                    <div class="absolute left-0 top-1/2 flex h-14 w-7 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('w', $event, cropRef)">
                      <div class="pointer-events-none h-9 w-1.5 rounded-full bg-white/80 shadow"></div>
                    </div>
                    <!-- E -->
                    <div class="absolute right-0 top-1/2 flex h-14 w-7 translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center"
                         (pointerdown)="$event.stopPropagation(); startCropDrag('e', $event, cropRef)">
                      <div class="pointer-events-none h-9 w-1.5 rounded-full bg-white/80 shadow"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="shrink-0 space-y-2 border-t border-border p-4">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                (click)="rotateReceiptEditor()"
                class="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/40"
              >
                <lucide-icon name="rotate-cw" class="h-4 w-4" />
                {{ 'daily.receipt.editor.rotate' | translate }}
              </button>
              <button
                type="button"
                (click)="toggleReceiptEditorEnhance()"
                class="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all"
                [class.border-primary]="editor.enhance"
                [class.bg-primary\/10]="editor.enhance"
                [class.text-primary]="editor.enhance"
                [class.border-border]="!editor.enhance"
                [class.bg-background\/60]="!editor.enhance"
                [class.text-foreground]="!editor.enhance"
              >
                <lucide-icon name="wand-2" class="h-4 w-4" />
                {{ 'daily.receipt.editor.enhance' | translate }}
              </button>
              <button
                type="button"
                (click)="useOriginalReceiptImage()"
                class="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/40"
              >
                <lucide-icon name="image" class="h-4 w-4" />
                {{ 'daily.receipt.editor.useOriginal' | translate }}
              </button>
              <button
                type="button"
                (click)="applyReceiptEditor()"
                [disabled]="applyingReceiptEditor()"
                class="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-glow transition-all hover:opacity-95"
              >
                <lucide-icon name="check" class="h-4 w-4" />
                {{ 'daily.receipt.editor.useEdited' | translate }}
              </button>
            </div>
            <p class="text-center text-[11px] text-muted-foreground">{{ 'daily.receipt.editor.cropHint' | translate }}</p>
          </div>
        </div>
      </div>
    }

    @if (receiptPreview(); as preview) {
      <div
        class="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        (click)="closeReceiptPreview()"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-preview-title"
      >
        <div
          class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
          (click)="$event.stopPropagation()"
        >
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
            <div class="min-w-0">
              <h2 id="receipt-preview-title" class="truncate text-base font-semibold">{{ preview.fileName }}</h2>
              <p class="text-xs text-muted-foreground">{{ 'daily.receipt.previewTitle' | translate }}</p>
            </div>
            <button
              type="button"
              (click)="closeReceiptPreview()"
              [attr.aria-label]="'daily.receipt.closePreview' | translate"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
            >
              <lucide-icon name="x" class="h-4 w-4" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-auto bg-black/90 p-3">
            <img
              [src]="preview.url"
              [alt]="preview.fileName"
              class="mx-auto max-h-[75vh] max-w-full rounded-xl object-contain"
            />
          </div>
        </div>
      </div>
    }

    <!-- Delete Expense Confirmation Modal -->
    @if (pendingDeleteEntry(); as entry) {
      <app-modal
        [title]="'daily.deleteConfirm.title' | translate"
        [isOpen]="showDeleteModal()"
        [showActions]="false"
        (cancelled)="onDeleteCancelled()"
      >
        <p class="text-sm text-muted-foreground">{{ 'daily.deleteConfirm.message' | translate }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <app-button variant="ghost" (click)="onDeleteCancelled()">{{ 'common.cancel' | translate }}</app-button>
          <app-button variant="danger" (click)="onDeleteConfirmed()">{{ 'common.confirm' | translate }}</app-button>
        </div>
      </app-modal>
    }
  `,
})
export class DailyExpenseComponent implements OnInit, OnDestroy {
  // ─── Injections ───────────────────────────────────────────────────────────
  readonly expenseStore = inject(ExpenseStore);
  readonly syncService = inject(SyncService);
  private readonly fb = inject(FormBuilder);
  private readonly storageService = inject(StorageService);
  readonly i18n = inject(I18nService);
  readonly currencyService = inject(CurrencyService);
  private readonly googleDriveService = inject(GoogleDriveService);
  private readonly receiptExtractionService = inject(ReceiptExtractionService);
  private readonly receiptExtractionSession = inject(ReceiptExtractionSessionService);
  private readonly aiVoiceExpenseService = inject(AiVoiceExpenseService);
  private readonly authService = inject(AuthService);
  private readonly backupModeService = inject(BackupModeService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly draftService = inject(DailyExpenseDraftService);
  readonly subscriptionService = inject(SubscriptionService);
  readonly router = inject(Router);

  // ─── Reactive form ────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    expenseType: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    limit: [{ value: 0, disabled: true }],
    date: [toLocalDateString(), Validators.required], // Default to today
    accountId: [''],
    comment: [''],
  });

  readonly expenseTypes = PREDEFINED_EXPENSE_TYPES;

  /** All category definitions for the chip list */
  readonly categoryDefs = CATEGORY_DEFS;
  readonly availableCategories = computed<CategoryChoice[]>(() => {
    const choices: CategoryChoice[] = this.categoryDefs.map((category) => ({
      id: category.id,
      name: category.name,
    }));
    const existingTypes = new Set(choices.map((category) => category.name));

    for (const limit of this.expenseStore.limits()) {
      if (!existingTypes.has(limit.type)) {
        choices.push({
          id: `custom-${limit.type}`,
          name: limit.type,
        });
        existingTypes.add(limit.type);
      }
    }

    return choices;
  });

  // ─── Offline toast signal ─────────────────────────────────────────────────
  readonly offlineToast = signal(false);

  // ─── Overspending warning state ───────────────────────────────────────────
  private readonly acknowledgedWarnings = new Set<string>(); // Track acknowledged warnings per session
  private readonly acknowledgedTick = signal(0); // Bump to force computed re-evaluation after dismiss

  // ─── Reactive overspend check — re-runs when store data or selected type changes ──
  private readonly selectedType = computed(() => (this.formValue() as any)?.expenseType ?? '');

  readonly lastMonthOverspend = computed(() => {
    this.acknowledgedTick(); // Subscribe to dismissal changes
    const type = this.selectedType();
    if (!type || this.acknowledgedWarnings.has(type)) return null;

    const lastMonth = this.getPreviousMonth();
    const limitEntry = this.expenseStore.limitMap()[type];
    const income = this.expenseStore.monthlyIncome();
    const monthlyLimit = limitEntry ? (limitEntry.userPercentage / 100) * income : 0;

    if (monthlyLimit <= 0) return null; // Limits not loaded yet

    const lastMonthEntries = this.expenseStore.entries().filter(
      e => e.date.startsWith(lastMonth) && e.type === type
    );
    if (lastMonthEntries.length === 0) return null;

    const lastMonthSpent = lastMonthEntries.reduce((sum, e) => sum + e.amount, 0);
    const overspentAmount = lastMonthSpent - monthlyLimit;
    if (overspentAmount <= 0) return null;

    return { type, lastMonthSpent, lastMonthLimit: monthlyLimit, overspentAmount };
  });

  // ─── Edit mode state ──────────────────────────────────────────────────────
  readonly editingEntry = signal<ExpenseEntry | null>(null);
  readonly isEditMode = computed(() => this.editingEntry() !== null);

  // ─── Detail view state ────────────────────────────────────────────────────
  readonly viewingEntry = signal<ExpenseEntry | null>(null);
  readonly viewingGroupedEntries = signal<ExpenseEntry[]>([]);
  readonly isViewingDetail = computed(() => this.viewingEntry() !== null || this.viewingGroupedEntries().length > 0);
  readonly isViewingGroup = computed(() => this.viewingGroupedEntries().length > 1);
  readonly selectedReceiptFile = this.receiptExtractionSession.selectedFile;
  readonly receiptError = signal<string | null>(null);
  readonly receiptExtraction = this.receiptExtractionSession.extraction;
  readonly receiptExtractionError = this.receiptExtractionSession.extractionError;
  readonly receiptExtractionApplied = this.receiptExtractionSession.extractionApplied;
  readonly receiptExtractionSource = this.receiptExtractionSession.extractionSource;
  readonly receiptExtractionFallbackReason = this.receiptExtractionSession.extractionFallbackReason;
  readonly extractingReceipt = this.receiptExtractionSession.extracting;
  readonly uploadingReceipt = signal(false);
  readonly isSavingExpense = signal(false);
  readonly receiptPreview = signal<{ url: string; fileName: string } | null>(null);
  readonly receiptEditor = signal<ReceiptEditorState | null>(null);
  readonly applyingReceiptEditor = signal(false);
  private receiptPreviewObjectUrl: string | null = null;
  private receiptEditorObjectUrl: string | null = null;
  private cropDragState: {
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
    pointerId: number;
    containerRect: DOMRect;
    startPx: number;
    startPy: number;
    startCrop: { left: number; top: number; width: number; height: number };
  } | null = null;
  private readonly onCropPointerMoveDoc = (e: PointerEvent) => this.onCropPointerMove(e);
  private readonly onCropPointerUpDoc = (e: PointerEvent) => this.stopCropDrag(e);
  private readonly receiptAutoFilledFields = new Set<'amount' | 'date' | 'type' | 'comment'>();
  readonly splitBillMode = signal(false);
  readonly splitRows = signal<SplitBillRow[]>([]);
  readonly showDeleteModal = signal(false);
  readonly pendingDeleteEntry = signal<ExpenseEntry | null>(null);

  private activityActor(): { email?: string; role: OwnerRole | 'single' } {
    const role = this.backupModeService.getMode() === 'family'
      ? this.backupModeService.getOwnerRole() ?? 'partner'
      : 'single';
    return {
      email: this.authService.userEmail() ?? undefined,
      role,
    };
  }

  // ─── Selected date state ──────────────────────────────────────────────────
  readonly selectedDate = signal<string>(toLocalDateString()); // YYYY-MM-DD
  readonly isToday = computed(() => this.selectedDate() === toLocalDateString());
  
  // ─── Entries for selected date ───────────────────────────────────────────
  readonly selectedDateEntries = computed(() => {
    const date = this.selectedDate();
    const ccDebtIds = new Set(
      this.expenseStore.debts()
        .filter((d) => d.type === 'credit-card')
        .map((d) => d.id)
    );
    return this.expenseStore.entries().filter((e) => {
      if (e.date !== date) return false;
      // Hide CC repayments — they are tracked in the Finance screen only
      if (e.source === 'debt-payment' && e.debtId && ccDebtIds.has(e.debtId)) return false;
      return true;
    });
  });

  // ─── Grouped entries by expense type ─────────────────────────────────────
  readonly groupedEntries = computed(() => {
    const entries = this.selectedDateEntries();
    const groups = new Map<string, ExpenseEntry[]>();
    
    // Group entries by type
    for (const entry of entries) {
      const existing = groups.get(entry.type) || [];
      existing.push(entry);
      groups.set(entry.type, existing);
    }
    
    // Convert to array and sort by total amount (descending)
    return Array.from(groups.entries())
      .map(([type, entries]) => {
        const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
        const dailyLimit = this.calculateDailyLimit(type);
        const totalSavings = dailyLimit - totalAmount;
        
        return {
          type,
          entries,
          totalAmount,
          totalSavings,
          count: entries.length,
          limit: dailyLimit,
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);
  });

  // ─── Date label for display ──────────────────────────────────────────────
  readonly selectedDateLabel = computed(() => {
    if (this.isToday()) return this.i18n.t('common.today');
    const date = parseLocalDate(this.selectedDate());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (this.selectedDate() === toLocalDateString(yesterday)) {
      return this.i18n.t('common.yesterday');
    }
    
    return date.toLocaleDateString(this.i18n.locale(), {
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined 
    });
  });

  // ─── Max date for date picker (today) ─────────────────────────────────────
  readonly maxDate = toLocalDateString();

  // ─── Section card title for entries ──────────────────────────────────────
  readonly entriesSectionTitle = computed(() =>
    this.isToday()
      ? this.i18n.t('daily.entries.todayTitle')
      : this.i18n.t('daily.entries.dateTitle', { date: this.selectedDateLabel() })
  );

  readonly entriesDescription = computed(() =>
    this.i18n.t('daily.entries.loggedCategories', {
      count: this.selectedDateEntries().length,
      categories: this.groupedEntries().length,
    })
  );

  // ─── Category expansion state ─────────────────────────────────────────────
  readonly showAllCategories = signal(false);
  readonly visibleCategories = computed(() => {
    const selected = this.form.get('expenseType')?.value;
    const allCats = [...this.availableCategories()];
    
    // If a category is selected, move it to the front
    if (selected) {
      const selectedIndex = allCats.findIndex(cat => cat.name === selected);
      if (selectedIndex > -1) {
        const [selectedCat] = allCats.splice(selectedIndex, 1);
        allCats.unshift(selectedCat);
      }
    }
    
    // Show first 4 or all based on expansion state
    return this.showAllCategories() ? allCats : allCats.slice(0, 4);
  });
  
  readonly hasMoreCategories = computed(() => this.availableCategories().length > 4);

  // ─── Voice recognition ────────────────────────────────────────────────────
  readonly recordingMode = signal<'expense' | 'comment' | null>(null);
  readonly isRecording = computed(() => this.recordingMode() !== null);
  readonly isParsingVoiceExpense = signal(false);
  private recognition: any = null;

  // ─── Date string for hero — reactive to selectedDate ─────────────────────
  readonly dateStr = computed(() => {
    const date = new Date(this.selectedDate() + 'T00:00:00'); // local time
    return date.toLocaleDateString(this.i18n.locale(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  });

  // ─── Reactive form value signal ───────────────────────────────────────────
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.value,
  });
  readonly commentHasValue = computed(() => {
    this.formValue();
    return String(this.form.get('comment')?.value ?? '').trim().length > 0;
  });

  // ─── Savings computed signal ──────────────────────────────────────────────
  readonly savings = computed(() => {
    this.formValue();
    const limitVal = this.form.get('limit')?.value ?? 0;
    const amountVal = this.form.get('amount')?.value ?? 0;
    return (limitVal ?? 0) - (amountVal ?? 0);
  });

  // ─── Border class computed signal ─────────────────────────────────────────
  readonly borderClass = computed(() => {
    this.formValue();
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    if (amount > 0 && amount > limit) {
      return 'border-2 border-red-500 rounded-xl p-4';
    }
    if (amount > 0 && amount <= limit) {
      return 'border-2 border-green-500 rounded-xl p-4';
    }
    return 'p-4';
  });

  // ─── Over-budget check ────────────────────────────────────────────────────
  readonly overBudget = computed(() => {
    this.formValue();
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    return (amount ?? 0) > (limit ?? 0);
  });

  // ─── Remaining after this entry ───────────────────────────────────────────
  readonly remainingAfterEntry = computed(() => {
    this.formValue();
    const limit = this.form.get('limit')?.value ?? 0;
    const amount = this.form.get('amount')?.value ?? 0;
    return Math.max(0, (limit ?? 0) - (amount ?? 0));
  });

  // ─── Total spent for selected date (all categories) ─────────────────────
  readonly totalToday = computed(() =>
    this.selectedDateEntries().reduce((sum, e) => sum + e.amount, 0)
  );

  // ─── Daily budget (monthly income / 30) ──────────────────────────────────
  readonly dailyBudget = computed(() => {
    const income = this.expenseStore.monthlyIncome();
    return income > 0 ? Math.round(income / 30) : 0;
  });

  // ─── Day percentage for progress ring ────────────────────────────────────
  readonly dayPct = computed(() => {
    const total = this.totalToday();
    const limit = this.dailyBudget();
    if (limit <= 0) return 0;
    return Math.min(100, Math.round((total / limit) * 100));
  });

  // ─── Selected category definition ────────────────────────────────────────
  readonly selectedCategoryDef = computed(() => {
    this.formValue();
    const typeName = this.form.get('expenseType')?.value ?? '';
    return getCategoryDef(this.getCatId(typeName));
  });

  readonly activeAccounts = computed(() => this.expenseStore.activeAccounts());
  readonly activeCreditCards = computed(() =>
    this.expenseStore.debts().filter((debt) => debt.type === 'credit-card' && debt.status === 'active')
  );
  readonly selectedAccount = computed((): AssetAccount | null => {
    this.formValue();
    const accountId = this.form.get('accountId')?.value ?? '';
    return this.activeAccounts().find((account) => account.id === accountId) ?? null;
  });
  readonly selectedCreditCard = computed((): DebtAccount | null => {
    this.formValue();
    const value = this.form.get('accountId')?.value ?? '';
    if (typeof value !== 'string' || !value.startsWith(DEBT_PAYMENT_OPTION_PREFIX)) return null;
    const debtId = value.slice(DEBT_PAYMENT_OPTION_PREFIX.length);
    return this.activeCreditCards().find((card) => card.id === debtId) ?? null;
  });
  readonly paymentAccountOptions = computed<ThemedSelectOption[]>(() => {
    const accountOptions: ThemedSelectOption[] = this.activeAccounts().map((account) => ({
      value: account.id,
      label: `${account.name} · ${this.currencyService.format(account.balance, this.i18n.locale())}`,
      icon: 'wallet-cards',
    }));
    // Cards are only selectable when creating: editing a card-linked entry is
    // blocked by product rule, and attaching a card during edit would need
    // reverse/apply support in ExpenseStore.updateEntry.
    if (this.isEditMode()) return accountOptions;
    const cardOptions: ThemedSelectOption[] = this.activeCreditCards().map((card) => ({
      value: `${DEBT_PAYMENT_OPTION_PREFIX}${card.id}`,
      label: `${card.name} · ${this.i18n.t('daily.paymentCreditCard')}`,
      icon: 'credit-card',
    }));
    return [...accountOptions, ...cardOptions];
  });
  readonly splitCategoryOptions = computed<ThemedSelectOption[]>(() =>
    this.availableCategories().map((category) => ({
      value: category.name,
      label: this.getCategoryLabel(category),
    }))
  );

  readonly splitBillTotal = computed(() => this.receiptExtraction()?.amount ?? Number(this.form.get('amount')?.value ?? 0) ?? 0);
  readonly splitRowsTotal = computed(() =>
    Number(this.splitRows().reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2))
  );
  readonly splitBillSubtitle = computed(() =>
    this.i18n.t('daily.receipt.split.subtitle', { count: this.splitRows().length })
  );
  readonly splitBillValid = computed(() => {
    if (!this.splitBillMode()) return true;
    const total = this.splitBillTotal();
    if (total <= 0 || this.splitRows().length < 2) return false;
    const everyRowValid = this.splitRows().every((row) =>
      this.isAvailableCategoryName(row.type) && Number(row.amount ?? 0) > 0
    );
    return everyRowValid && Math.abs(this.splitRowsTotal() - total) < 0.01;
  });

  private typeChangeSub?: Subscription;
  private dateChangeSub?: Subscription;
  private draftSub?: Subscription;
  private offlineToastTimer?: ReturnType<typeof setTimeout>;
  private suppressDraftSave = false;

  constructor() {
    effect(() => {
      const extraction = this.receiptExtraction();
      const applied = this.receiptExtractionApplied();
      if (!extraction || applied) return;

      untracked(() => this.applyReceiptExtraction(false));
    });

    effect(() => {
      const accounts = this.activeAccounts();
      const cards = this.activeCreditCards();
      const defaultAccountId = this.defaultAccountId();

      untracked(() => {
        if (this.isEditMode()) return;
        const accountControl = this.form.get('accountId');
        if (!accountControl) return;

        const current = accountControl.value ?? '';
        // A valid credit-card selection must survive account-list changes.
        const currentIsValidCard =
          typeof current === 'string' &&
          current.startsWith(DEBT_PAYMENT_OPTION_PREFIX) &&
          cards.some((card) => `${DEBT_PAYMENT_OPTION_PREFIX}${card.id}` === current);
        if (currentIsValidCard) return;

        const currentIsValid = accounts.some((account) => account.id === current);
        if (accounts.length === 0 && cards.length === 0 && current) {
          accountControl.setValue('', { emitEvent: false });
        } else if ((accounts.length > 0 || cards.length > 0) && !currentIsValid) {
          accountControl.setValue(defaultAccountId, { emitEvent: false });
        }
      });
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (Capacitor.isNativePlatform()) return;
    const hasDraft = this.form.touched && (this.form.get('amount')?.value ?? 0) > 0;
    const hasExtraction = this.receiptExtractionSession.extraction() !== null;
    if (hasDraft || hasExtraction) {
      event.preventDefault();
      event.returnValue = ''; // Required for Chrome
    }
  }

  // ─── Type-selection logic ─────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    this.restoreDraft();

    const expenseTypeControl = this.form.get('expenseType');
    const limitControl = this.form.get('limit');
    const updateRemainingLimit = (): void => {
      const type = expenseTypeControl?.value;
      if (!limitControl) return;

      if (type) {
        const activeDate = this.form.get('date')?.value ?? this.selectedDate();
        const limitEntry = this.expenseStore.limitMap()[type];
        const income = this.expenseStore.monthlyIncome();
        const monthlyLimit = limitEntry ? (limitEntry.userPercentage / 100) * income : 0;
        const active = parseLocalDate(activeDate);
        const daysInMonth = new Date(active.getFullYear(), active.getMonth() + 1, 0).getDate();
        const dailyLimit = Math.ceil(monthlyLimit / daysInMonth);
        const spentOnActiveDate = this.expenseStore.entries()
          .filter(e => e.date === activeDate && e.type === type)
          .reduce((sum, e) => sum + e.amount, 0);

        limitControl.setValue(dailyLimit - spentOnActiveDate);
      } else {
        limitControl.setValue(0);
      }
    };

    if (expenseTypeControl && limitControl) {
      this.typeChangeSub = expenseTypeControl.valueChanges.subscribe(() => updateRemainingLimit());
    }

    const dateControl = this.form.get('date');
    if (dateControl) {
      this.dateChangeSub = dateControl.valueChanges.subscribe((date) => {
        if (date) {
          this.setActiveDate(date, false);
          updateRemainingLimit();
        }
      });
    }

    updateRemainingLimit();
    this.draftSub = this.form.valueChanges.subscribe(() => this.saveDraft());

    // Data is loaded from Google Drive on app bootstrap — no per-component fetch needed.
  }

  ngOnDestroy(): void {
    this.typeChangeSub?.unsubscribe();
    this.dateChangeSub?.unsubscribe();
    this.draftSub?.unsubscribe();
    if (this.offlineToastTimer) {
      clearTimeout(this.offlineToastTimer);
    }
    this.revokeReceiptPreviewUrl();
    this.revokeReceiptEditorUrl();
    this.recognition?.stop();
    document.removeEventListener('pointermove', this.onCropPointerMoveDoc);
    document.removeEventListener('pointerup', this.onCropPointerUpDoc);
    document.removeEventListener('pointercancel', this.onCropPointerUpDoc);
  }

  private restoreDraft(): void {
    const draft = this.draftService.getDraft();
    if (!draft) return;

    this.suppressDraftSave = true;
    try {
      this.form.patchValue({
        expenseType: draft.expenseType,
        amount: draft.amount,
        date: draft.date,
        accountId: draft.accountId ?? '',
        comment: draft.comment,
      }, { emitEvent: false });
      this.setActiveDate(draft.date, false);
      this.splitRows.set(draft.splitRows);
      this.splitBillMode.set(draft.splitBillMode);
    } finally {
      this.suppressDraftSave = false;
    }
  }

  private saveDraft(): void {
    if (this.suppressDraftSave || this.isEditMode()) return;

    const raw = this.form.getRawValue();
    const draft: DailyExpenseDraft = {
      expenseType: raw.expenseType ?? '',
      amount: raw.amount ?? null,
      date: raw.date ?? this.selectedDate(),
      accountId: raw.accountId ?? '',
      comment: raw.comment ?? '',
      splitBillMode: this.splitBillMode(),
      splitRows: this.splitRows(),
    };

    if (this.isEmptyDraft(draft)) {
      this.draftService.clearDraft();
    } else {
      this.draftService.saveDraft(draft);
    }
  }

  private isEmptyDraft(draft: DailyExpenseDraft): boolean {
    return !draft.expenseType
      && !draft.amount
      && !draft.accountId
      && !draft.comment.trim()
      && !draft.splitBillMode
      && draft.splitRows.length === 0
      && draft.date === toLocalDateString();
  }

  private clearDraftAndReset(value: {
    expenseType: string;
    amount: number | null;
    limit: number;
    date: string;
    accountId?: string;
    comment: string;
  }): void {
    this.suppressDraftSave = true;
    try {
      this.draftService.clearDraft();
      this.form.reset({
        ...value,
        accountId: value.accountId ?? this.defaultAccountId(),
      });
    } finally {
      this.suppressDraftSave = false;
    }
  }

  private defaultAccountId(): string {
    return this.expenseStore.defaultAccount()?.id ?? '';
  }

  private selectedPaymentAccountId(): string | undefined {
    const accountId = this.form.get('accountId')?.value ?? '';
    return this.activeAccounts().some((account) => account.id === accountId) ? accountId : undefined;
  }

  /** Resolve the payment selector into an entry link: asset account OR credit card. */
  private selectedPaymentLink(): { accountId?: string; debtId?: string } {
    const value = this.form.get('accountId')?.value ?? '';
    if (typeof value === 'string' && value.startsWith(DEBT_PAYMENT_OPTION_PREFIX)) {
      const debtId = value.slice(DEBT_PAYMENT_OPTION_PREFIX.length);
      return this.activeCreditCards().some((card) => card.id === debtId) ? { debtId } : {};
    }
    const accountId = this.selectedPaymentAccountId();
    return accountId ? { accountId } : {};
  }

  accountName(accountId: string | undefined): string {
    if (!accountId) return '';
    return this.expenseStore.accounts().find((account) => account.id === accountId)?.name ?? '';
  }

  // ─── Helper: map type name → category ID ─────────────────────────────────
  getCatId(type: string): string {
    const categoryId = getCategoryIdByName(type);
    return categoryId === 'custom' ? 'misc' : categoryId;
  }

  getCategoryLabel(category: CategoryChoice): string {
    return this.getCatName(category.name);
  }

  // ─── Helper: calculate daily limit for a category ────────────────────────
  calculateDailyLimit(type: string): number {
    const limitEntry = this.expenseStore.limitMap()[type];
    const income = this.expenseStore.monthlyIncome();
    const monthlyLimit = limitEntry ? (limitEntry.userPercentage / 100) * income : 0;
    
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyLimit = Math.ceil(monthlyLimit / daysInMonth);
    
    return dailyLimit;
  }

  // ─── Helper: map type name → CSS variable name ────────────────────────────
  getCatColorVar(type: string): string {
    return getCategoryDef(this.getCatId(type)).colorVar;
  }

  // ─── Helper: map type name → display name ────────────────────────────────
  getCatName(type: string): string {
    const categoryId = getCategoryIdByName(type);
    if (categoryId === 'custom') {
      return type;
    }
    return this.getCategoryNameById(categoryId);
  }

  receiptExtractionTypeLabel(type: string | null | undefined): string {
    const matchedType = this.matchAvailableCategory(type);
    if (matchedType) return this.getCatName(matchedType);

    const appliedType = this.receiptExtractionApplied()
      ? this.matchAvailableCategory(this.form.get('expenseType')?.value)
      : null;
    return appliedType
      ? this.getCatName(appliedType)
      : this.i18n.t('daily.receipt.smartFill.notFound');
  }

  getCategoryNameById(categoryId: string): string {
    const category = getCategoryDef(categoryId);
    const translated = this.i18n.t(`category.${category.id}`);
    return translated.startsWith('category.') ? category.name : translated;
  }

  actionLabel(isEdit: boolean): string {
    const typeName = this.form.get('expenseType')?.value ?? '';
    const category = typeName ? this.getCatName(typeName) : this.getCategoryNameById(this.selectedCategoryDef().id);
    return this.i18n.t(isEdit ? 'daily.updateCategory' : 'daily.logCategory', { category });
  }

  // ─── Helper: scroll to Today's Entries section ───────────────────────────
  private scrollToTodaysEntries(): void {
    // Use setTimeout to ensure DOM has updated with new entry
    setTimeout(() => {
      const element = document.getElementById('todays-entries');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  // ─── Helper: get previous month string (YYYY-MM) ─────────────────────────
  private getPreviousMonth(): string {
    const now = new Date();
    // Use local year/month to avoid UTC offset shifting the month
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed: 0=Jan, 4=May
    // month - 1 handles year boundary automatically (month=0 → -1 → Dec of prev year)
    const prev = new Date(year, month - 1, 1);
    const y = prev.getFullYear();
    const m = String(prev.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  // ─── Dismiss overspend warning ────────────────────────────────────────────
  dismissOverspendWarning(type: string): void {
    this.acknowledgedWarnings.add(type);
    this.acknowledgedTick.update(n => n + 1); // Trigger computed re-evaluation
  }

  // ─── Helper: check if a category chip is active ───────────────────────────
  isActiveCat(cat: CategoryChoice): boolean {
    return this.form.get('expenseType')?.value === cat.name;
  }

  // ─── Select category from chip ────────────────────────────────────────────
  selectCategory(cat: CategoryChoice): void {
    this.form.get('expenseType')?.setValue(cat.name);
    // Auto-collapse categories after selection
    this.showAllCategories.set(false);
  }

  clearComment(): void {
    this.form.get('comment')?.setValue('');
  }

  private isAvailableCategoryName(type: string | null | undefined): boolean {
    return !!this.matchAvailableCategory(type);
  }

  private matchAvailableCategory(type: string | null | undefined): string | null {
    const normalized = this.categoryMatchKey(type);
    if (!normalized) return null;

    const direct = this.availableCategories().find((category) => this.categoryMatchKey(category.name) === normalized);
    if (direct) return direct.name;

    const aliases: Record<string, string> = {
      food: 'Food & Groceries',
      grocery: 'Food & Groceries',
      groceries: 'Food & Groceries',
      restaurant: 'Dining Out',
      restaurants: 'Dining Out',
      dining: 'Dining Out',
      transport: 'Transportation',
      shopping: 'Shopping/Clothing',
      clothing: 'Shopping/Clothing',
      savings: 'Savings/Emergency Fund',
      emergency: 'Savings/Emergency Fund',
      misc: 'Miscellaneous',
      miscellaneous: 'Miscellaneous',
    };

    const alias = aliases[normalized];
    return alias && this.availableCategories().some((category) => category.name === alias) ? alias : null;
  }

  private categoryMatchKey(type: string | null | undefined): string {
    return String(type ?? '')
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  // ─── Helper: format ISO timestamp for display ─────────────────────────────
  formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleString(this.i18n.locale());
  }

  formatEntryTime(ts: string): string {
    return formatLocalTime(ts, this.i18n.locale());
  }

  expenseActorLabel(entry: ExpenseEntry): string {
    const role = entry.updatedByRole ?? entry.createdByRole;
    const email = entry.updatedByEmail ?? entry.createdByEmail;
    if (email) return this.nameFromEmail(email);
    if (role === 'owner') return this.i18n.t('dashboard.activity.owner');
    if (role === 'partner') return this.i18n.t('dashboard.activity.partner');
    if (role === 'single') return this.i18n.t('daily.entries.you');
    return this.i18n.t('dashboard.activity.existing');
  }

  private nameFromEmail(email: string): string {
    const prefix = email.split('@')[0]?.trim();
    if (!prefix) return email;

    const firstPart = prefix
      .split(/[._+\-\d]+/)
      .find((part) => part.length > 0) ?? prefix;

    return firstPart.charAt(0).toLocaleUpperCase(this.i18n.locale()) + firstPart.slice(1);
  }

  groupActorSummary(entries: ExpenseEntry[]): string {
    const labels = new Set(entries.map((entry) => this.expenseActorLabel(entry)));
    if (labels.size === 1) return [...labels][0];
    if (labels.size === 2 && labels.has(this.i18n.t('dashboard.activity.owner')) && labels.has(this.i18n.t('dashboard.activity.partner'))) {
      return this.i18n.t('daily.entries.ownerAndPartner');
    }
    return this.i18n.t('daily.entries.mixedActors');
  }

  onReceiptSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.receiptError.set(null);

    if (!file) return;

    this.resetReceiptAutoFilledValues();
    this.cancelSplitBill();

    const isSupported = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!isSupported) {
      this.receiptError.set(this.i18n.t('daily.receipt.invalidType'));
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this.receiptError.set(this.i18n.t('daily.receipt.tooLarge'));
      return;
    }

    void this.prepareReceiptFile(file);
  }

  clearSelectedReceipt(): void {
    this.resetReceiptAutoFilledValues();
    this.cancelSplitBill();
    this.cancelReceiptEditor();
    this.receiptExtractionSession.clear();
    this.receiptError.set(null);
  }

  applyReceiptExtraction(overwrite = false): void {
    const extraction = this.receiptExtraction();
    if (!extraction) return;

    let applied = false;
    const amountControl = this.form.get('amount');
    const dateControl = this.form.get('date');
    const typeControl = this.form.get('expenseType');
    const commentControl = this.form.get('comment');

    const canUseAmount = overwrite || extraction.amountConfidence >= 0.7;
    if (extraction.amount && canUseAmount && (overwrite || !amountControl?.value || this.receiptAutoFilledFields.has('amount'))) {
      amountControl?.setValue(extraction.amount);
      this.receiptAutoFilledFields.add('amount');
      applied = true;
    }

    if (extraction.date && (overwrite || !this.isEditMode() || this.receiptAutoFilledFields.has('date'))) {
      dateControl?.setValue(extraction.date);
      this.receiptAutoFilledFields.add('date');
      applied = true;
    }

    const matchedType = this.matchAvailableCategory(extraction.type);
    const fallbackType = this.matchAvailableCategory('Miscellaneous');
    const receiptType = matchedType ?? fallbackType;
    if (receiptType && (overwrite || !typeControl?.value || this.receiptAutoFilledFields.has('type'))) {
      typeControl?.setValue(receiptType);
      this.receiptAutoFilledFields.add('type');
      applied = true;
    }

    if (extraction.comment && (overwrite || !commentControl?.value || this.receiptAutoFilledFields.has('comment'))) {
      commentControl?.setValue(extraction.comment);
      this.receiptAutoFilledFields.add('comment');
      applied = true;
    }

    if (applied) {
      this.receiptExtractionApplied.set(true);
    }
  }

  useReceiptAmountCandidate(amount: number): void {
    this.form.get('amount')?.setValue(Number(amount.toFixed(2)));
    this.receiptAutoFilledFields.add('amount');
    this.receiptExtractionApplied.set(true);
  }

  formatFileSize(size: number): string {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
  }

  isImageReceipt(receipt: ExpenseReceipt): boolean {
    return receipt.mimeType.startsWith('image/');
  }

  previewSelectedReceipt(): void {
    const file = this.selectedReceiptFile();
    if (!file || !this.isImageFile(file)) return;

    const url = URL.createObjectURL(file);
    this.setReceiptPreview(url, file.name);
  }

  async rotateReceiptEditor(): Promise<void> {
    const editor = this.receiptEditor();
    if (!editor) return;
    const newRotation = ((editor.rotation + 90) % 360) as ReceiptEditorState['rotation'];
    const newUrl = newRotation === 0
      ? URL.createObjectURL(editor.file)
      : await this.renderRotatedPreview(editor.file, newRotation);
    this.revokeReceiptEditorUrl();
    this.receiptEditorObjectUrl = newUrl;
    this.receiptEditor.update(e => e ? {
      ...e,
      rotation: newRotation,
      url: newUrl,
      crop: { left: 0, top: 0, width: 100, height: 100 },
    } : e);
  }

  toggleReceiptEditorEnhance(): void {
    this.receiptEditor.update((editor) => editor ? { ...editor, enhance: !editor.enhance } : editor);
  }

  startCropDrag(
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w',
    event: PointerEvent,
    container: HTMLElement,
  ): void {
    event.preventDefault();
    const editor = this.receiptEditor();
    if (!editor) return;
    this.cropDragState = {
      type,
      pointerId: event.pointerId,
      containerRect: container.getBoundingClientRect(),
      startPx: event.clientX,
      startPy: event.clientY,
      startCrop: { ...editor.crop },
    };
    document.addEventListener('pointermove', this.onCropPointerMoveDoc);
    document.addEventListener('pointerup', this.onCropPointerUpDoc);
    document.addEventListener('pointercancel', this.onCropPointerUpDoc);
  }

  onCropPointerMove(event: PointerEvent): void {
    const drag = this.cropDragState;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { containerRect: r, startPx, startPy, startCrop: s, type } = drag;
    const dx = (event.clientX - startPx) / r.width * 100;
    const dy = (event.clientY - startPy) / r.height * 100;
    const MIN = 8;
    let { left, top, width, height } = s;
    if (type === 'move') {
      left = Math.max(0, Math.min(100 - width, left + dx));
      top = Math.max(0, Math.min(100 - height, top + dy));
    } else {
      if (type.includes('n')) {
        const newTop = Math.max(0, Math.min(top + height - MIN, top + dy));
        height += top - newTop;
        top = newTop;
      }
      if (type.includes('s')) {
        height = Math.max(MIN, Math.min(100 - top, height + dy));
      }
      if (type.includes('w')) {
        const newLeft = Math.max(0, Math.min(left + width - MIN, left + dx));
        width += left - newLeft;
        left = newLeft;
      }
      if (type.includes('e')) {
        width = Math.max(MIN, Math.min(100 - left, width + dx));
      }
    }
    this.receiptEditor.update(e => e ? { ...e, crop: { left, top, width, height } } : e);
  }

  stopCropDrag(event: PointerEvent): void {
    if (this.cropDragState?.pointerId !== event.pointerId) return;
    this.cropDragState = null;
    document.removeEventListener('pointermove', this.onCropPointerMoveDoc);
    document.removeEventListener('pointerup', this.onCropPointerUpDoc);
    document.removeEventListener('pointercancel', this.onCropPointerUpDoc);
  }

  cancelReceiptEditor(): void {
    this.receiptEditor.set(null);
    this.revokeReceiptEditorUrl();
  }

  async useOriginalReceiptImage(): Promise<void> {
    const editor = this.receiptEditor();
    if (!editor) return;
    const file = editor.file;
    this.cancelReceiptEditor();
    this.receiptExtractionSession.setSelectedFile(file);
    void this.extractReceiptFields(file);
  }

  async applyReceiptEditor(): Promise<void> {
    if (this.applyingReceiptEditor()) return;

    const editor = this.receiptEditor();
    if (!editor) return;

    this.applyingReceiptEditor.set(true);
    this.cancelReceiptEditor();

    try {
      const editedFile = await this.createEditedReceiptImage(editor);
      this.receiptExtractionSession.setSelectedFile(editedFile);
      void this.extractReceiptFields(editedFile);
    } catch (error) {
      if (isDevMode()) { console.warn('[DailyExpense] Receipt image edit failed, using original file:', error); }
      this.receiptExtractionSession.setSelectedFile(editor.file);
      void this.extractReceiptFields(editor.file);
    } finally {
      this.applyingReceiptEditor.set(false);
    }
  }

  async previewReceipt(receipt: ExpenseReceipt): Promise<void> {
    // appDataFolder receipts have no Drive web view (viewUrl is empty),
    // so both images and PDFs are served from a downloaded blob.
    if (!this.isImageReceipt(receipt)) {
      try {
        const blob = await this.googleDriveService.downloadFile(receipt.fileId);
        const typedBlob = blob.type ? blob : new Blob([blob], { type: receipt.mimeType || 'application/pdf' });
        window.open(URL.createObjectURL(typedBlob), '_blank', 'noopener,noreferrer');
      } catch (error) {
        if (isDevMode()) { console.warn('[DailyExpense] Failed to open receipt file:', error); }
        if (receipt.viewUrl) {
          window.open(receipt.viewUrl, '_blank', 'noopener,noreferrer');
        } else {
          this.feedback.error(this.i18n.t('daily.receipt.openFailed'));
        }
      }
      return;
    }

    try {
      const blob = await this.googleDriveService.downloadFile(receipt.fileId);
      const url = URL.createObjectURL(blob);
      this.setReceiptPreview(url, receipt.fileName);
    } catch (error) {
      if (isDevMode()) { console.warn('[DailyExpense] Failed to preview receipt image:', error); }
      if (receipt.viewUrl) {
        window.open(receipt.viewUrl, '_blank', 'noopener,noreferrer');
      } else {
        this.feedback.error(this.i18n.t('daily.receipt.openFailed'));
      }
    }
  }

  closeReceiptPreview(): void {
    this.receiptPreview.set(null);
    this.revokeReceiptPreviewUrl();
  }

  private setReceiptPreview(url: string, fileName: string): void {
    this.revokeReceiptPreviewUrl();
    this.receiptPreviewObjectUrl = url;
    this.receiptPreview.set({ url, fileName });
  }

  private revokeReceiptPreviewUrl(): void {
    if (this.receiptPreviewObjectUrl) {
      URL.revokeObjectURL(this.receiptPreviewObjectUrl);
      this.receiptPreviewObjectUrl = null;
    }
  }

  private revokeReceiptEditorUrl(): void {
    if (this.receiptEditorObjectUrl) {
      URL.revokeObjectURL(this.receiptEditorObjectUrl);
      this.receiptEditorObjectUrl = null;
    }
  }

  /**
   * Best-effort receipt upload that NEVER throws. A failed bill upload (offline,
   * Drive hiccup, expired token) must not abort or lose the expense itself — the
   * expense is the user's critical data. On failure we return failed:true so the
   * caller can still save the expense and warn the user that the bill will need
   * re-attaching, instead of discarding everything.
   */
  private async tryUploadSelectedReceipt(
    entryId: string,
    date: string,
  ): Promise<{ receipt?: ExpenseReceipt; failed: boolean }> {
    if (!this.selectedReceiptFile()) return { receipt: undefined, failed: false };
    try {
      const receipt = await this.uploadSelectedReceipt(entryId, date);
      return { receipt, failed: false };
    } catch (error) {
      console.error('[DailyExpense] Receipt upload failed; saving expense without it:', error);
      this.receiptError.set(this.i18n.t('daily.receipt.uploadFailed'));
      return { receipt: undefined, failed: true };
    }
  }

  private async uploadSelectedReceipt(entryId: string, date: string): Promise<ExpenseReceipt | undefined> {
    const file = this.selectedReceiptFile();
    if (!file) return undefined;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.receiptError.set(this.i18n.t('daily.receipt.offline'));
      throw new Error('Cannot upload receipt while offline.');
    }

    this.uploadingReceipt.set(true);
    try {
      // Receipts are stored in the user's private Drive appDataFolder (drive.appdata scope).
      const uploadFile = await this.prepareReceiptForUpload(file);
      return await this.googleDriveService.uploadReceiptFile(uploadFile, entryId, date);
    } finally {
      this.uploadingReceipt.set(false);
    }
  }

  private async prepareReceiptFile(file: File): Promise<void> {
    this.receiptExtractionSession.clear();

    if (file.type === 'application/pdf') {
      this.receiptExtractionSession.setSelectedFile(file);
      void this.extractReceiptFields(file);
      return;
    }

    this.openReceiptEditor(file);
  }

  private openReceiptEditor(file: File): void {
    this.revokeReceiptEditorUrl();
    this.receiptEditorObjectUrl = URL.createObjectURL(file);
    this.receiptEditor.set({
      file,
      url: this.receiptEditorObjectUrl,
      rotation: 0,
      enhance: true,
      crop: { left: 0, top: 0, width: 100, height: 100 },
    });
  }

  private async renderRotatedPreview(file: File, rotation: ReceiptEditorState['rotation']): Promise<string> {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = this.drawRotatedBitmap(bitmap, rotation);
      const blob = await this.canvasToJpegBlob(canvas, 0.88);
      return URL.createObjectURL(blob);
    } finally {
      bitmap.close();
    }
  }

  private async createEditedReceiptImage(editor: ReceiptEditorState): Promise<File> {
    const bitmap = await createImageBitmap(editor.file);
    try {
      const rotated = this.drawRotatedBitmap(bitmap, editor.rotation);
      const cropLeft = Math.round(rotated.width * editor.crop.left / 100);
      const cropTop = Math.round(rotated.height * editor.crop.top / 100);
      const cropWidth = Math.max(1, Math.round(rotated.width * editor.crop.width / 100));
      const cropHeight = Math.max(1, Math.round(rotated.height * editor.crop.height / 100));

      const canvas = document.createElement('canvas');
      canvas.width = Math.min(cropWidth, rotated.width - cropLeft);
      canvas.height = Math.min(cropHeight, rotated.height - cropTop);
      const context = canvas.getContext('2d', { willReadFrequently: editor.enhance });
      if (!context) return editor.file;

      context.drawImage(rotated, cropLeft, cropTop, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      if (editor.enhance) {
        this.enhanceReceiptCanvas(canvas);
      }

      const blob = await this.canvasToJpegBlob(canvas, 0.95);
      const baseName = editor.file.name.replace(/\.[^.]+$/, '');
      return new File([blob], `${baseName}-scan.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } finally {
      bitmap.close();
    }
  }

  private drawRotatedBitmap(bitmap: ImageBitmap, rotation: ReceiptEditorState['rotation']): HTMLCanvasElement {
    const quarterTurn = rotation === 90 || rotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = quarterTurn ? bitmap.height : bitmap.width;
    canvas.height = quarterTurn ? bitmap.width : bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return canvas;

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return canvas;
  }

  private enhanceReceiptCanvas(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 138));
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    context.putImageData(image, 0, 0);
  }

  private canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not create receipt image.'));
        }
      }, 'image/jpeg', quality);
    });
  }

  private resetReceiptAutoFilledValues(): void {
    const defaults: Record<'amount' | 'date' | 'type' | 'comment', number | string | null> = {
      amount: null,
      date: toLocalDateString(),
      type: '',
      comment: '',
    };

    for (const field of this.receiptAutoFilledFields) {
      switch (field) {
        case 'amount':
          this.form.get('amount')?.setValue(defaults.amount as null);
          break;
        case 'date':
          this.form.get('date')?.setValue(defaults.date as string);
          break;
        case 'type':
          this.form.get('expenseType')?.setValue(defaults.type as string);
          break;
        case 'comment':
          this.form.get('comment')?.setValue(defaults.comment as string);
          break;
      }
    }

    this.receiptAutoFilledFields.clear();
  }

  startSplitBill(): void {
    const total = this.splitBillTotal();
    if (total <= 0) return;

    const defaultType = this.matchAvailableCategory(this.receiptExtraction()?.type)
      ?? this.matchAvailableCategory(this.form.get('expenseType')?.value)
      ?? 'Food & Groceries';
    const half = Number((total / 2).toFixed(2));
    const remainder = Number((total - half).toFixed(2));

    this.splitRows.set([
      { id: crypto.randomUUID(), type: defaultType, amount: half, comment: '' },
      { id: crypto.randomUUID(), type: 'Miscellaneous', amount: remainder, comment: '' },
    ]);
    this.splitBillMode.set(true);
    this.saveDraft();
  }

  startSplitBillFromExtractedItems(): void {
    const extraction = this.receiptExtraction();
    if (!extraction || extraction.lineItems.length === 0) {
      this.startSplitBill();
      return;
    }

    const defaultType = this.matchAvailableCategory(extraction.type)
      ?? this.matchAvailableCategory(this.form.get('expenseType')?.value)
      ?? 'Food & Groceries';
    const rows: SplitBillRow[] = extraction.lineItems.map((item) => ({
      id: crypto.randomUUID(),
      type: this.matchAvailableCategory(item.type) ?? defaultType,
      amount: item.amount,
      comment: item.name,
    }));

    const total = this.splitBillTotal();
    const rowsTotal = Number(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2));
    const adjustment = Number((total - rowsTotal).toFixed(2));
    if (total > 0 && adjustment > 0.01) {
      rows.push({
        id: crypto.randomUUID(),
        type: defaultType,
        amount: adjustment,
        comment: this.i18n.t('daily.receipt.split.adjustmentComment'),
      });
    }

    this.splitRows.set(rows);
    this.splitBillMode.set(true);
    this.saveDraft();
  }

  cancelSplitBill(): void {
    this.splitBillMode.set(false);
    this.splitRows.set([]);
    this.saveDraft();
  }

  addSplitRow(): void {
    this.splitRows.update((rows) => [
      ...rows,
      { id: crypto.randomUUID(), type: 'Miscellaneous', amount: null, comment: '' },
    ]);
    this.saveDraft();
  }

  removeSplitRow(rowId: string): void {
    this.splitRows.update((rows) => rows.length <= 2 ? rows : rows.filter((row) => row.id !== rowId));
    this.saveDraft();
  }

  updateSplitRow(rowId: string, field: 'type' | 'amount' | 'comment', value: string | number | null): void {
    this.splitRows.update((rows) => rows.map((row) => {
      if (row.id !== rowId) return row;
      if (field === 'amount') {
        const amount = value === '' || value === null ? null : Number(value);
        return { ...row, amount: Number.isFinite(amount) ? amount : null };
      }
      return { ...row, [field]: String(value ?? '') };
    }));
    this.saveDraft();
  }

  updateSplitRowFromEvent(rowId: string, field: 'type' | 'amount' | 'comment', event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    this.updateSplitRow(rowId, field, target.value);
  }

  private async extractReceiptFields(file: File): Promise<void> {
    await this.receiptExtractionSession.startExtraction(
      file,
      this.availableCategories().map((category) => category.name)
    );
  }

  private async compressReceiptImage(file: File): Promise<File> {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, RECEIPT_UPLOAD_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not prepare receipt image for compression.');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      const baseName = file.name.replace(/\.[^.]+$/, '');
      const blob = await this.compressCanvasToTargetSize(canvas);

      return new File([blob], `${baseName}-compressed.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } finally {
      bitmap.close();
    }
  }

  private async compressCanvasToTargetSize(source: HTMLCanvasElement): Promise<Blob> {
    let width = source.width;
    let height = source.height;
    let bestBlob: Blob | null = null;

    for (let scaleAttempt = 0; scaleAttempt < 24; scaleAttempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const context = canvas.getContext('2d');
      if (!context) {
        if (bestBlob) return bestBlob;
        throw new Error('Could not prepare compressed receipt image.');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (const quality of RECEIPT_UPLOAD_JPEG_QUALITIES) {
        const blob = await this.canvasToJpegBlob(canvas, quality);
        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
        }
        if (blob.size <= RECEIPT_UPLOAD_TARGET_BYTES) {
          return blob;
        }
      }

      width = Math.max(1, Math.round(width * RECEIPT_UPLOAD_SCALE_STEP));
      height = Math.max(1, Math.round(height * RECEIPT_UPLOAD_SCALE_STEP));
    }

    if (!bestBlob) {
      throw new Error('Could not compress receipt image.');
    }

    if (bestBlob.size <= RECEIPT_UPLOAD_TARGET_BYTES) {
      return bestBlob;
    }

    throw new Error('Could not compress receipt image to the 120 KB limit.');
  }

  private async prepareReceiptForUpload(file: File): Promise<File> {
    if (file.type === 'application/pdf') {
      try {
        return await this.receiptExtractionService.convertPdfToCompressedImage(file);
      } catch (error) {
        if (isDevMode()) { console.warn('[DailyExpense] PDF receipt image conversion failed before upload, keeping original PDF:', error); }
        return file;
      }
    }

    if (!file.type.startsWith('image/')) return file;

    try {
      return await this.compressReceiptImage(file);
    } catch (error) {
      if (isDevMode()) { console.warn('[DailyExpense] Receipt compression failed before upload:', error); }
      throw error;
    }
  }

  // ─── onSubmit ─────────────────────────────────────────────────────────────
  async onSubmit(): Promise<void> {
    const dateControl = this.form.get('date');
    const amountControl = this.form.get('amount');
    const formInvalid = this.splitBillMode()
      ? dateControl?.invalid || !this.splitBillValid()
      : this.form.invalid;

    if (formInvalid) {
      this.form.markAllAsTouched();
      if (this.splitBillMode() && !amountControl?.value) {
        amountControl?.markAsUntouched();
      }
      this.feedback.warning(
        'Review the highlighted fields.',
        this.splitBillMode()
          ? 'Make sure each split row has a category and amount, and the split total matches the bill total.'
          : 'Choose a category, enter an amount greater than 0, and check the date before saving.'
      );
      return;
    }

    this.isSavingExpense.set(true);
    this.receiptError.set(null);

    const editingEntry = this.editingEntry();
    try {
      if (editingEntry) {
        // Update existing entry
        await this.updateEntry(editingEntry);
      } else if (this.splitBillMode()) {
        await this.createSplitEntries();
      } else {
        // Create new entry
        await this.createEntry();
      }
    } catch (error) {
      console.error('[DailyExpense] Failed to save expense:', error);
      this.receiptError.set(this.receiptError() ?? this.i18n.t('daily.receipt.uploadFailed'));
      this.feedback.error(
        'Expense was not saved.',
        error instanceof Error
          ? error.message
          : 'Check your connection and Drive access, then try again.'
      );
    } finally {
      this.isSavingExpense.set(false);
    }
  }

  // ─── Create new entry ─────────────────────────────────────────────────────
  private async createEntry(): Promise<void> {
    const id = crypto.randomUUID();
    const date = this.form.get('date')?.value ?? toLocalDateString();
    const timestamp = new Date().toISOString();
    const type = this.form.get('expenseType')?.value ?? '';
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    const savings = (limit ?? 0) - (amount ?? 0);
    const comment = this.form.get('comment')?.value || undefined;
    const paymentLink = this.selectedPaymentLink();
    const { receipt, failed: receiptFailed } = await this.tryUploadSelectedReceipt(id, date);
    const actor = this.activityActor();

    const entry: ExpenseEntry = {
      id,
      date,
      amount: amount as number,
      type: type as string,
      limit: limit as number,
      savings,
      timestamp,
      comment,
      receipt,
      ...paymentLink,
      createdByEmail: actor.email,
      createdByRole: actor.role,
    };

    await this.expenseStore.addEntry(entry);
    const addSynced = this.syncService.isOnline() && this.expenseStore.syncStatus() === 'idle';
    if (receiptFailed) {
      this.feedback.warning(
        'Expense saved — bill not attached.',
        'Your expense is safe. The bill couldn\'t upload right now; edit this expense to re-attach it when you\'re back online.'
      );
    } else if (addSynced) {
      this.feedback.success(
        'Expense saved.',
        `${this.getCatName(entry.type)} for ${this.currencyService.format(entry.amount, this.i18n.locale())} was saved to your Drive backup.`
      );
    } else {
      this.feedback.warning(
        'Expense saved locally.',
        `${this.getCatName(entry.type)} is stored on this device and will sync to Drive when you\'re back online.`
      );
    }
    if (!this.syncService.isOnline()) {
      this.offlineToast.set(true);
      if (this.offlineToastTimer) {
        clearTimeout(this.offlineToastTimer);
      }
      this.offlineToastTimer = setTimeout(() => {
        this.offlineToast.set(false);
        this.offlineToastTimer = undefined;
      }, 4000);
    }

    this.clearDraftAndReset({ 
      expenseType: '', 
      amount: null, 
      limit: 0, 
      date,
      accountId: this.defaultAccountId(),
      comment: '' 
    });
    this.clearSelectedReceipt();

    // Keep the shared date on the day the user was logging, including past dates.
    this.setActiveDate(date);
    this.draftService.clearDraft();
    this.scrollToTodaysEntries();
  }

  private async createSplitEntries(): Promise<void> {
    if (!this.splitBillValid()) {
      this.receiptError.set(this.i18n.t('daily.receipt.split.totalMismatch'));
      return;
    }

    const date = this.form.get('date')?.value ?? toLocalDateString();
    const timestamp = new Date().toISOString();
    const baseComment = this.form.get('comment')?.value || this.receiptExtraction()?.comment || undefined;
    const rows = this.splitRows();
    const firstId = crypto.randomUUID();
    const { receipt, failed: receiptFailed } = await this.tryUploadSelectedReceipt(firstId, date);
    const actor = this.activityActor();
    const paymentLink = this.selectedPaymentLink();

    const entries = rows.map((row, index): ExpenseEntry => {
      const id = index === 0 ? firstId : crypto.randomUUID();
      const amount = Number(row.amount ?? 0);
      const limit = this.calculateDailyLimit(row.type);
      const rowComment = row.comment.trim();
      const comment = rowComment
        ? rowComment
        : baseComment
          ? `${baseComment} · split ${index + 1}/${rows.length}`
          : `Split bill ${index + 1}/${rows.length}`;

      return {
        id,
        date,
        amount,
        type: row.type,
        limit,
        savings: limit - amount,
        timestamp,
        comment,
        receipt,
        ...paymentLink,
        createdByEmail: actor.email,
        createdByRole: actor.role,
      };
    });

    await this.expenseStore.addEntries(entries);
    const splitSynced = this.expenseStore.syncStatus() === 'idle';
    if (receiptFailed) {
      this.feedback.warning(
        'Split bill saved — bill not attached.',
        `${entries.length} expense entries are safe. The bill couldn\'t upload right now; edit an entry to re-attach it when you\'re back online.`
      );
    } else if (splitSynced) {
      this.feedback.success(
        'Split bill saved.',
        `${entries.length} expense entries were saved to your Drive backup.`
      );
    } else {
      this.feedback.warning(
        'Split bill saved locally.',
        `${entries.length} entries are stored on this device and will sync to Drive when you\'re back online.`
      );
    }
    this.clearDraftAndReset({
      expenseType: '',
      amount: null,
      limit: 0,
      date,
      accountId: this.defaultAccountId(),
      comment: ''
    });
    this.clearSelectedReceipt();
    this.setActiveDate(date);
    this.draftService.clearDraft();
    this.scrollToTodaysEntries();
  }

  // ─── Update existing entry ────────────────────────────────────────────────
  private async updateEntry(originalEntry: ExpenseEntry): Promise<void> {
    const type = this.form.get('expenseType')?.value ?? '';
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    const savings = (limit ?? 0) - (amount ?? 0);
    const comment = this.form.get('comment')?.value || undefined;
    const date = this.form.get('date')?.value ?? originalEntry.date;
    const accountId = this.selectedPaymentAccountId();
    const { receipt: uploadedReceipt, failed: receiptFailed } = await this.tryUploadSelectedReceipt(originalEntry.id, date);
    const actor = this.activityActor();

    const updatedEntry: ExpenseEntry = {
      ...originalEntry,
      date,
      amount: amount as number,
      type: type as string,
      limit: limit as number,
      savings,
      comment,
      receipt: uploadedReceipt ?? originalEntry.receipt,
      accountId,
      timestamp: new Date().toISOString(),
      updatedByEmail: actor.email,
      updatedByRole: actor.role,
    };

    await this.expenseStore.updateEntry(updatedEntry);
    const updateSynced = this.syncService.isOnline() && this.expenseStore.syncStatus() === 'idle';
    if (receiptFailed) {
      this.feedback.warning(
        'Expense updated — new bill not attached.',
        'Your changes are safe. The new bill couldn\'t upload right now; re-attach it when you\'re back online.'
      );
    } else if (updateSynced) {
      this.feedback.success(
        'Expense updated.',
        `${this.getCatName(updatedEntry.type)} was saved to your Drive backup.`
      );
    } else {
      this.feedback.warning(
        'Expense updated locally.',
        `Changes to ${this.getCatName(updatedEntry.type)} are stored on this device and will sync to Drive when you\'re back online.`
      );
    }
    if (!this.syncService.isOnline()) {
      this.offlineToast.set(true);
      if (this.offlineToastTimer) {
        clearTimeout(this.offlineToastTimer);
      }
      this.offlineToastTimer = setTimeout(() => {
        this.offlineToast.set(false);
        this.offlineToastTimer = undefined;
      }, 4000);
    }

    this.clearDraftAndReset({ 
      expenseType: '', 
      amount: null, 
      limit: 0, 
      date, 
      accountId: this.defaultAccountId(),
      comment: '' 
    });
    this.clearSelectedReceipt();
    this.editingEntry.set(null);

    // Keep the shared date on the updated entry's date.
    this.setActiveDate(date);
    this.draftService.clearDraft();
    this.scrollToTodaysEntries();
  }

  // ─── Edit entry ───────────────────────────────────────────────────────────
  canManageEntry(entry: ExpenseEntry): boolean {
    return entry.source !== 'debt-payment' && !entry.debtId;
  }

  editEntry(entry: ExpenseEntry): void {
    if (isDevMode()) { console.log('[DailyExpense] Editing entry:', entry.id); }
    
    // Set editing state
    this.editingEntry.set(entry);
    this.clearSelectedReceipt();
    
    // Populate form with entry data
    this.form.patchValue({
      expenseType: entry.type,
      amount: entry.amount,
      limit: entry.limit,
      date: entry.date,
      accountId: entry.accountId ?? this.defaultAccountId(),
      comment: entry.comment || '',
    });

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Cancel edit ──────────────────────────────────────────────────────────
  cancelEdit(): void {
    this.editingEntry.set(null);
    this.clearSelectedReceipt();
    const date = this.selectedDate();
    this.clearDraftAndReset({ 
      expenseType: '', 
      amount: null, 
      limit: 0, 
      date, 
      accountId: this.defaultAccountId(),
      comment: '' 
    });
  }

  // ─── Set date to today ────────────────────────────────────────────────────
  setToday(): void {
    this.setActiveDate(toLocalDateString());
  }

  // ─── View detail ──────────────────────────────────────────────────────────
  viewDetail(entry: ExpenseEntry): void {
    if (isDevMode()) { console.log('[DailyExpense] Viewing detail for entry:', entry.id); }
    this.viewingEntry.set(entry);
    this.viewingGroupedEntries.set([]);
  }

  // ─── View group detail ────────────────────────────────────────────────────
  viewGroupDetail(group: { type: string; entries: ExpenseEntry[]; totalAmount: number; totalSavings: number; count: number; limit: number }): void {
    if (isDevMode()) { console.log('[DailyExpense] Viewing group detail for type:', group.type, 'with', group.count, 'entries'); }
    
    if (group.count === 1) {
      // Single entry - show single entry view
      this.viewingEntry.set(group.entries[0]);
      this.viewingGroupedEntries.set([]);
    } else {
      // Multiple entries - show grouped view
      // Sort entries by timestamp (most recent first)
      const sortedEntries = [...group.entries].sort((a, b) => 
        b.timestamp.localeCompare(a.timestamp)
      );
      this.viewingEntry.set(null);
      this.viewingGroupedEntries.set(sortedEntries);
    }
  }

  // ─── Close detail ─────────────────────────────────────────────────────────
  closeDetail(): void {
    this.viewingEntry.set(null);
    this.viewingGroupedEntries.set([]);
  }

  // ─── Edit from detail ─────────────────────────────────────────────────────
  editFromDetail(entry: ExpenseEntry): void {
    this.closeDetail();
    this.editEntry(entry);
  }

  // ─── Delete from detail ───────────────────────────────────────────────────
  deleteFromDetail(entry: ExpenseEntry): void {
    this.closeDetail();
    this.deleteEntry(entry);
  }

  // ─── Date navigation ──────────────────────────────────────────────────────
  private setActiveDate(date: string, updateForm = true): void {
    if (!date) return;

    if (this.selectedDate() !== date) {
      this.selectedDate.set(date);
    }

    if (updateForm && this.form.get('date')?.value !== date) {
      this.form.get('date')?.setValue(date);
    }

    const month = date.slice(0, 7);
    if (month !== this.expenseStore.selectedMonth()) {
      this.expenseStore.setSelectedMonth(month);
    }
  }

  onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newDate = input.value; // YYYY-MM-DD format
    if (isDevMode()) { console.log('[DailyExpense] Date changed to:', newDate); }
    this.setActiveDate(newDate);
  }

  goToToday(): void {
    this.setActiveDate(toLocalDateString());
  }

  // ─── Voice recording ──────────────────────────────────────────────────────
  startVoiceExpenseRecording(): void {
    this.startVoiceRecording('expense');
  }

  startCommentRecording(): void {
    this.startVoiceRecording('comment');
  }

  private startVoiceRecording(mode: 'expense' | 'comment'): void {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.feedback.warning(
        this.i18n.t('daily.voiceUnsupportedTitle'),
        this.i18n.t('daily.voice.unsupportedBrowser')
      );
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = this.i18n.speechRecognitionLang();

    this.recognition.onstart = () => {
      this.recordingMode.set(mode);
    };

    this.recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript ?? '').trim();
      if (!transcript) return;

      const currentComment = this.form.get('comment')?.value || '';
      this.form.get('comment')?.setValue(currentComment + (currentComment ? ' ' : '') + transcript);
      if (mode === 'expense') {
        void this.applyVoiceExpenseTranscript(transcript);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.recordingMode.set(null);
    };

    this.recognition.onend = () => {
      this.recordingMode.set(null);
    };

    this.recognition.start();
  }

  stopVoiceRecording(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  private async applyVoiceExpenseTranscript(transcript: string): Promise<void> {
    this.isParsingVoiceExpense.set(true);
    try {
      const attempt = await this.aiVoiceExpenseService.parse({
        transcript,
        locale: this.i18n.locale(),
        currency: this.currencyService.currency(),
        categories: this.availableCategories().map((category) => category.name),
        today: toLocalDateString(),
      });

      if (!attempt.expense) {
        this.feedback.info(
          this.i18n.t('daily.voiceTranscriptSaved'),
          this.i18n.t('daily.voiceAiUnavailable')
        );
        return;
      }

      this.applyVoiceExpenseResult(attempt.expense);
    } catch (error) {
      console.error('[DailyExpense] Failed to parse voice expense:', error);
      this.feedback.info(
        this.i18n.t('daily.voiceTranscriptSaved'),
        this.i18n.t('daily.voiceAiUnavailable')
      );
    } finally {
      this.isParsingVoiceExpense.set(false);
    }
  }

  private applyVoiceExpenseResult(expense: {
    amount: number | null;
    date: string | null;
    type: string | null;
    comment: string | null;
  }): void {
    let applied = false;

    if (expense.amount) {
      this.form.get('amount')?.setValue(expense.amount);
      applied = true;
    }

    if (expense.date) {
      this.form.get('date')?.setValue(expense.date);
      this.setActiveDate(expense.date);
      applied = true;
    }

    const matchedType = this.matchAvailableCategory(expense.type);
    if (matchedType) {
      this.form.get('expenseType')?.setValue(matchedType);
      this.showAllCategories.set(false);
      applied = true;
    }

    if (expense.comment) {
      this.form.get('comment')?.setValue(expense.comment);
      applied = true;
    }

    if (applied) {
      this.feedback.success(
        this.i18n.t('daily.voiceFilledTitle'),
        this.i18n.t('daily.voiceFilledDetail')
      );
    }
  }

  // ─── Delete entry ─────────────────────────────────────────────────────────
  deleteEntry(entry: ExpenseEntry): void {
    this.pendingDeleteEntry.set(entry);
    this.showDeleteModal.set(true);
  }

  onDeleteConfirmed(): void {
    const entry = this.pendingDeleteEntry();
    this.showDeleteModal.set(false);
    this.pendingDeleteEntry.set(null);
    if (entry) void this.#executeDeleteEntry(entry);
  }

  onDeleteCancelled(): void {
    this.showDeleteModal.set(false);
    this.pendingDeleteEntry.set(null);
  }

  async #executeDeleteEntry(entry: ExpenseEntry): Promise<void> {
    if (isDevMode()) { console.log('[DailyExpense] Deleting entry:', entry.id); }

    try {
      await this.expenseStore.deleteEntry(entry.id);
      const deleteSynced = this.syncService.isOnline() && this.expenseStore.syncStatus() === 'idle';
      if (deleteSynced) {
        this.feedback.success(
          'Expense deleted.',
          `${this.getCatName(entry.type)} was removed from your Drive backup.`
        );
      } else {
        this.feedback.warning(
          'Expense deleted locally.',
          `${this.getCatName(entry.type)} is removed on this device and will sync to Drive when you\'re back online.`
        );
      }
    } catch (error) {
      console.error('[DailyExpense] Failed to delete entry:', error);
      this.feedback.error(
        'Expense was not deleted.',
        error instanceof Error
          ? error.message
          : 'Check your connection and Drive access, then try again.'
      );
      return;
    }

    if (!this.syncService.isOnline()) {
      this.offlineToast.set(true);
      if (this.offlineToastTimer) {
        clearTimeout(this.offlineToastTimer);
      }
      this.offlineToastTimer = setTimeout(() => {
        this.offlineToast.set(false);
        this.offlineToastTimer = undefined;
      }, 4000);
    }
  }
}
