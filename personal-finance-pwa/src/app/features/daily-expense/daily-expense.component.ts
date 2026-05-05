import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
} from 'lucide-angular';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { SyncService } from '../../core/services/sync.service';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { PREDEFINED_EXPENSE_TYPES } from '../../core/models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import {
  SectionCardComponent,
  CategoryIconComponent,
  ProgressRingComponent,
} from '../../shared/components';
import {
  CATEGORY_DEFS,
  getCategoryDef,
} from '../../core/models/category-definitions';

/** Maps PREDEFINED_EXPENSE_TYPES names to category IDs used by CategoryIcon */
const TYPE_TO_CAT_ID: Record<string, string> = {
  'Housing':                'housing',
  'Food & Groceries':       'food',
  'Transportation':         'transport',
  'Utilities':              'utilities',
  'Healthcare':             'health',
  'Entertainment':          'entertainment',
  'Dining Out':             'dining',
  'Shopping/Clothing':      'shopping',
  'Savings/Emergency Fund': 'savings',
  'Investments':            'investments',
  'Education':              'education',
  'Personal Care':          'personal',
  'Subscriptions':          'subscriptions',
  'Miscellaneous':          'misc',
};

@Component({
  selector: 'app-daily-expense',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CurrencyFormatPipe,
    SectionCardComponent,
    CategoryIconComponent,
    ProgressRingComponent,
    LucideAngularModule,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ TrendingUp, TrendingDown, Mic, Trash2, Plus }),
    },
  ],
  template: `
    <div class="space-y-6">

      <!-- Offline toast -->
      @if (offlineToast()) {
        <div
          class="rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300"
          role="alert"
          aria-live="polite"
        >
          Entry saved locally — will sync when online
        </div>
      }

      <!-- Hero glass card -->
      <div class="glass-card relative overflow-hidden p-5 md:p-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">Today</p>
            <h1 class="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{{ dateStr }}</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              You've spent
              <span class="font-semibold text-foreground">{{ totalToday() | currencyFormat }}</span>
              of
              <span class="font-semibold text-foreground">{{ dailyBudget() | currencyFormat }}</span>
              today.
            </p>
          </div>
          <app-progress-ring
            [value]="dayPct()"
            [label]="dayPct() + '%'"
            sub="used"
            [size]="88"
          />
        </div>
        <!-- Decorative gradient blob -->
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
          [style.background-image]="'var(--gradient-primary)'"
        ></div>
      </div>

      <!-- Two-column grid: stacks on mobile, 50/50 on tablet, 3/5 + 2/5 on desktop -->
      <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-2">

        <!-- Log Expense SectionCard -->
        <app-section-card
          title="Log Expense"
          description="Pick a type, enter the amount, and tap log."
          className="xl:col-span-3"
        >
          <form [formGroup]="form" (ngSubmit)="onSubmit()">

            <!-- Category chips -->
            <div>
              <p class="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Expense Type</p>
              <div class="flex flex-wrap gap-2">
                @for (cat of categoryDefs; track cat.id) {
                  <button
                    type="button"
                    (click)="selectCategory(cat)"
                    [attr.aria-label]="cat.name"
                    [attr.aria-pressed]="isActiveCat(cat)"
                    class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    [class.border-transparent]="isActiveCat(cat)"
                    [class.text-primary-foreground]="isActiveCat(cat)"
                    [class.shadow-glow]="isActiveCat(cat)"
                    [class.border-border]="!isActiveCat(cat)"
                    [class.bg-card\/40]="!isActiveCat(cat)"
                    [class.text-muted-foreground]="!isActiveCat(cat)"
                    [class.hover\:text-foreground]="!isActiveCat(cat)"
                    [style.background-color]="isActiveCat(cat) ? 'var(' + cat.colorVar + ')' : null"
                  >
                    <app-category-icon [categoryId]="cat.id" size="sm" />
                    {{ cat.name }}
                  </button>
                }
              </div>
            </div>

            <!-- Amount input -->
            <div class="mt-5">
              <label for="amount-input" class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
              <div class="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-3 focus-within:border-primary focus-within:shadow-glow transition-all">
                <span class="text-2xl font-semibold text-muted-foreground">₹</span>
                <input
                  id="amount-input"
                  type="number"
                  inputmode="decimal"
                  formControlName="amount"
                  placeholder="0"
                  class="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            </div>

            <!-- Live pills -->
            <div class="mt-4 grid grid-cols-2 gap-3">
              <!-- Remaining today -->
              <div
                class="rounded-2xl border px-4 py-3 transition-all"
                [class.border-destructive\/40]="overBudget()"
                [class.bg-destructive\/10]="overBudget()"
                [class.text-destructive]="overBudget()"
                [class.border-border]="!overBudget()"
                [class.bg-card\/40]="!overBudget()"
              >
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Remaining today</p>
                <p class="mt-1 text-lg font-semibold" [class.text-destructive]="overBudget()">
                  {{ remainingAfterEntry() | currencyFormat }}
                </p>
              </div>
              <!-- Savings (this entry) -->
              <div class="rounded-2xl border border-border bg-card/40 px-4 py-3">
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Savings (this entry)</p>
                <p
                  class="mt-1 flex items-center gap-1 text-lg font-semibold"
                  [style.color]="'var(--success)'"
                >
                  @if (savings() >= 0) {
                    <lucide-icon name="trending-up" class="h-4 w-4" />
                  } @else {
                    <lucide-icon name="trending-down" class="h-4 w-4" />
                  }
                  {{ savings() | currencyFormat }}
                </p>
              </div>
            </div>

            <!-- Comment + mic -->
            <div class="mt-4">
              <label for="comment-input" class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Comment (optional)</label>
              <div class="mt-2 flex items-center gap-2">
                <input
                  id="comment-input"
                  type="text"
                  formControlName="comment"
                  placeholder="Add a note about this expense..."
                  class="flex-1 rounded-2xl border border-border bg-card/60 px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  aria-label="Record voice note"
                  (click)="isRecording() ? stopVoiceRecording() : startVoiceRecording()"
                  class="grid h-11 w-11 place-items-center rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  [class.border-destructive]="isRecording()"
                  [class.bg-destructive\/10]="isRecording()"
                  [class.text-destructive]="isRecording()"
                  [class.border-border]="!isRecording()"
                  [class.bg-card\/60]="!isRecording()"
                  [class.text-muted-foreground]="!isRecording()"
                  [class.hover\:text-primary]="!isRecording()"
                  [class.hover\:shadow-glow]="!isRecording()"
                >
                  <lucide-icon name="mic" class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- Log button -->
            <button
              type="submit"
              [disabled]="!(form.get('amount')?.value)"
              class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <lucide-icon name="plus" class="h-4 w-4" />
              Log {{ selectedCategoryDef().name }}
            </button>

          </form>
        </app-section-card>

        <!-- Today's Entries SectionCard -->
        <app-section-card
          title="Today's Entries"
          [description]="expenseStore.todayEntries().length + ' logged'"
          className="xl:col-span-2"
        >
          <ul class="space-y-2.5">
            @for (entry of expenseStore.todayEntries(); track entry.id) {
              <li class="group relative flex items-center gap-2 overflow-hidden rounded-2xl border border-border bg-card/40 p-3 transition-all hover:border-primary/30">
                <!-- Left color stripe -->
                <span
                  class="absolute inset-y-0 left-0 w-1"
                  [style.background-color]="'var(' + getCatColorVar(entry.type) + ')'"
                ></span>
                <!-- Category icon — add left margin to clear the stripe -->
                <div class="ml-2 shrink-0">
                  <app-category-icon [categoryId]="getCatId(entry.type)" />
                </div>
                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{{ getCatName(entry.type) }}</p>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ entry.timestamp.slice(11, 16) }}{{ entry.comment ? ' · ' + entry.comment : '' }}
                  </p>
                </div>
                <!-- Amount + savings -->
                <div class="shrink-0 text-right">
                  <p class="text-sm font-semibold">{{ entry.amount | currencyFormat }}</p>
                  <p class="text-[10px] text-muted-foreground">lim {{ entry.limit | currencyFormat }}</p>
                  @if (entry.savings > 0) {
                    <p class="text-[10px] font-medium" [style.color]="'var(--success)'">
                      +{{ entry.savings | currencyFormat }}
                    </p>
                  }
                </div>
                <!-- Delete button: always visible on touch, hover-reveal on pointer devices -->
                <button
                  type="button"
                  (click)="deleteEntry(entry)"
                  aria-label="Delete entry"
                  class="shrink-0 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <lucide-icon name="trash-2" class="h-4 w-4" />
                </button>
              </li>
            } @empty {
              <li class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No entries yet today. Log your first expense above.
              </li>
            }
          </ul>
        </app-section-card>

      </div>
    </div>
  `,
})
export class DailyExpenseComponent implements OnInit, OnDestroy {
  // ─── Injections ───────────────────────────────────────────────────────────
  readonly expenseStore = inject(ExpenseStore);
  readonly syncService = inject(SyncService);
  private readonly fb = inject(FormBuilder);

  // ─── Reactive form ────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    expenseType: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    limit: [{ value: 0, disabled: true }],
    comment: [''],
  });

  readonly expenseTypes = PREDEFINED_EXPENSE_TYPES;

  /** All category definitions for the chip list */
  readonly categoryDefs = CATEGORY_DEFS;

  // ─── Offline toast signal ─────────────────────────────────────────────────
  readonly offlineToast = signal(false);

  // ─── Voice recognition ────────────────────────────────────────────────────
  readonly isRecording = signal(false);
  private recognition: any = null;

  // ─── Date string for hero ─────────────────────────────────────────────────
  readonly dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ─── Reactive form value signal ───────────────────────────────────────────
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.value,
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

  // ─── Total spent today (all categories) ──────────────────────────────────
  readonly totalToday = computed(() =>
    this.expenseStore.todayEntries().reduce((sum, e) => sum + e.amount, 0)
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

  private typeChangeSub?: Subscription;
  private offlineToastTimer?: ReturnType<typeof setTimeout>;

  // ─── Type-selection logic ─────────────────────────────────────────────────
  ngOnInit(): void {
    const expenseTypeControl = this.form.get('expenseType');
    const limitControl = this.form.get('limit');

    if (expenseTypeControl && limitControl) {
      this.typeChangeSub = expenseTypeControl.valueChanges.subscribe((type) => {
        if (type) {
          const limitEntry = this.expenseStore.limitMap()[type];
          const income = this.expenseStore.monthlyIncome();
          const monthlyLimit = limitEntry ? (limitEntry.userPercentage / 100) * income : 0;

          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const dailyLimit = Math.ceil(monthlyLimit / daysInMonth);

          const todayEntries = this.expenseStore.todayEntries();
          const spentToday = todayEntries
            .filter(e => e.type === type)
            .reduce((sum, e) => sum + e.amount, 0);

          const remainingLimit = dailyLimit - spentToday;
          limitControl.setValue(remainingLimit);
        } else {
          limitControl.setValue(0);
        }
      });
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    this.expenseStore.loadMonth(currentMonth).catch(err => {
      console.error('[DailyExpense] Failed to load month:', err);
    });

    const sheetId = typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    if (sheetId && (this.expenseStore.limits().length === 0 || this.expenseStore.monthlyIncome() === 0)) {
      this.expenseStore.loadLimits().catch(err => {
        console.error('Failed to load limits:', err);
      });
    }
  }

  ngOnDestroy(): void {
    this.typeChangeSub?.unsubscribe();
    if (this.offlineToastTimer) {
      clearTimeout(this.offlineToastTimer);
    }
  }

  // ─── Helper: map type name → category ID ─────────────────────────────────
  getCatId(type: string): string {
    return TYPE_TO_CAT_ID[type] ?? 'misc';
  }

  // ─── Helper: map type name → CSS variable name ────────────────────────────
  getCatColorVar(type: string): string {
    return getCategoryDef(this.getCatId(type)).colorVar;
  }

  // ─── Helper: map type name → display name ────────────────────────────────
  getCatName(type: string): string {
    return getCategoryDef(this.getCatId(type)).name;
  }

  // ─── Helper: check if a category chip is active ───────────────────────────
  isActiveCat(cat: { name: string }): boolean {
    return this.form.get('expenseType')?.value === cat.name;
  }

  // ─── Select category from chip ────────────────────────────────────────────
  selectCategory(cat: { name: string }): void {
    this.form.get('expenseType')?.setValue(cat.name);
  }

  // ─── Helper: format ISO timestamp for display ─────────────────────────────
  formatTimestamp(ts: string): string {
    return ts.slice(0, 19).replace('T', ' ');
  }

  // ─── onSubmit ─────────────────────────────────────────────────────────────
  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const id = crypto.randomUUID();
    const date = new Date().toISOString().slice(0, 10);
    const timestamp = new Date().toISOString();
    const type = this.form.get('expenseType')?.value ?? '';
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    const savings = (limit ?? 0) - (amount ?? 0);
    const comment = this.form.get('comment')?.value || undefined;

    const entry: ExpenseEntry = {
      id,
      date,
      amount: amount as number,
      type: type as string,
      limit: limit as number,
      savings,
      timestamp,
      comment,
    };

    this.expenseStore.addEntry(entry);
    this.syncService.enqueue(entry);

    if (this.syncService.isOnline()) {
      this.syncService.flushQueue().catch(err => {
        console.error('[DailyExpense] Failed to sync expense:', err);
      });
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

    this.form.reset({ expenseType: '', amount: null, limit: 0, comment: '' });
  }

  // ─── Voice recording ──────────────────────────────────────────────────────
  startVoiceRecording(): void {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isRecording.set(true);
    };

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const currentComment = this.form.get('comment')?.value || '';
      this.form.get('comment')?.setValue(currentComment + (currentComment ? ' ' : '') + transcript);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.isRecording.set(false);
    };

    this.recognition.onend = () => {
      this.isRecording.set(false);
    };

    this.recognition.start();
  }

  stopVoiceRecording(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  // ─── Delete entry ─────────────────────────────────────────────────────────
  deleteEntry(entry: ExpenseEntry): void {
    if (!confirm(`Delete expense: ${entry.type} - ${entry.amount}?`)) {
      return;
    }
    console.log('[DailyExpense] Delete not fully implemented - needs store method');
    alert('Delete functionality will be implemented in the next update');
  }
}
