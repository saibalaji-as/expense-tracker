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
  Pencil,
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-angular';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { SyncService } from '../../core/services/sync.service';
import { StorageService } from '../../core/services/storage.service';
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
      useValue: new LucideIconProvider({ TrendingUp, TrendingDown, Mic, Trash2, Plus, Pencil, X, Calendar, ChevronDown, ChevronUp, AlertTriangle }),
    },
  ],
  template: `
    <div>

      <!-- Offline toast -->
      @if (offlineToast()) {
        <div
          class="mb-4 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300"
          role="alert"
          aria-live="polite"
        >
          Entry saved locally — will sync when online
        </div>
      }

      <!-- Overspending warning -->
      @if (lastMonthOverspend(); as warning) {
        <div
          class="mb-4 rounded-2xl border border-orange-400/40 bg-orange-400/10 p-4"
          role="alert"
          aria-live="assertive"
        >
          <div class="flex items-start gap-3">
            <div class="shrink-0 mt-0.5">
              <lucide-icon name="alert-triangle" class="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-semibold text-orange-900 dark:text-orange-200 mb-1">
                ⚠️ Budget Alert: {{ getCatName(warning.type) }}
              </h3>
              <p class="text-sm text-orange-800 dark:text-orange-300 mb-2">
                You overspent on <strong>{{ getCatName(warning.type) }}</strong> last month by 
                <strong>{{ warning.overspentAmount | currencyFormat }}</strong>.
              </p>
              <div class="flex items-center gap-4 text-xs text-orange-700 dark:text-orange-400 mb-3">
                <span>Last Month Spent: <strong>{{ warning.lastMonthSpent | currencyFormat }}</strong></span>
                <span>•</span>
                <span>Monthly Limit: <strong>{{ warning.lastMonthLimit | currencyFormat }}</strong></span>
              </div>
              <p class="text-xs text-orange-700 dark:text-orange-400 italic">
                💡 Consider if this expense is necessary to avoid overspending again this month.
              </p>
            </div>
            <button
              type="button"
              (click)="dismissOverspendWarning(warning.type)"
              aria-label="Dismiss warning"
              class="shrink-0 grid h-6 w-6 place-items-center rounded-lg text-orange-600 dark:text-orange-400 transition-all hover:bg-orange-400/20"
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
              {{ isToday() ? 'Today' : selectedDateLabel() }}
            </p>
            <h1 class="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{{ dateStr() }}</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              You've spent
              <span class="font-semibold text-foreground">{{ totalToday() | currencyFormat }}</span>
              of
              <span class="font-semibold text-foreground">{{ dailyBudget() | currencyFormat }}</span>
              {{ isToday() ? 'today' : 'on this day' }}.
            </p>
          </div>
          <app-progress-ring
            [value]="dayPct()"
            [label]="dayPct() + '%'"
            sub="used"
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
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-2">

        <!-- Log Expense SectionCard -->
        <app-section-card
          title="Log Expense"
          description="Pick a type, enter the amount, and tap log."
          className="xl:col-span-3"
        >
          <!-- Edit mode banner -->
          @if (isEditMode()) {
            <div class="mb-4 flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3">
              <div class="flex items-center gap-2">
                <lucide-icon name="pencil" class="h-4 w-4 text-primary" />
                <span class="text-sm font-medium text-primary">Editing expense</span>
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

            <!-- Category chips -->
            <div>
              <p class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Expense Type</p>
              <div class="flex flex-wrap gap-1.5">
                @for (cat of visibleCategories(); track cat.id) {
                  <button
                    type="button"
                    (click)="selectCategory(cat)"
                    [attr.aria-label]="cat.name"
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
                        [style.background-color]="'var(' + cat.colorVar + ')'"
                      ></span>
                    }
                    <span class="relative z-10 flex items-center gap-1.5">
                      <app-category-icon [categoryId]="cat.id" size="xs" />
                      {{ cat.name }}
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
                      <span>Show less</span>
                    } @else {
                      <lucide-icon name="chevron-down" class="h-3 w-3" />
                      <span>Show more</span>
                    }
                  </button>
                }
              </div>
            </div>

            <!-- Amount + Date — same row -->
            <div class="mt-4 flex gap-2">
              <!-- Amount -->
              <div class="flex-1 min-w-0">
                <label for="amount-input" class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
                <div class="mt-1 flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-3 py-2 focus-within:border-primary focus-within:shadow-glow transition-all">
                  <span class="text-base font-semibold text-muted-foreground shrink-0">₹</span>
                  <input
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
                <label for="date-input" class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date</label>
                <div class="mt-1 flex items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-card/60 px-2.5 py-2 focus-within:border-primary focus-within:shadow-glow transition-all">
                  <lucide-icon name="calendar" class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
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
                      Today
                    </button>
                  }
                </div>
              </div>
            </div>

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
                <p class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">Remaining</p>
                <p class="mt-1 text-sm font-semibold leading-none" [class.text-destructive]="overBudget()">
                  {{ remainingAfterEntry() | currencyFormat }}
                </p>
              </div>
              <!-- Savings (this entry) -->
              <div class="rounded-xl border border-border bg-card/40 px-3 py-2">
                <p class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">Savings</p>
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

            <!-- Comment + mic -->
            <div class="mt-2.5">
              <label for="comment-input" class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Comment (optional)</label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  id="comment-input"
                  type="text"
                  formControlName="comment"
                  placeholder="Add a note about this expense..."
                  class="flex-1 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
                <button
                  type="button"
                  aria-label="Record voice note"
                  (click)="isRecording() ? stopVoiceRecording() : startVoiceRecording()"
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              @if (isEditMode()) {
                <lucide-icon name="pencil" class="h-4 w-4" />
                Update {{ selectedCategoryDef().name }}
              } @else {
                <lucide-icon name="plus" class="h-4 w-4" />
                Log {{ selectedCategoryDef().name }}
              }
            </button>

          </form>
        </app-section-card>

        <!-- Today's Entries SectionCard -->
        <app-section-card
          id="todays-entries"
          [title]="entriesSectionTitle()"
          [description]="selectedDateEntries().length + ' logged · ' + groupedEntries().length + ' categories'"
          className="xl:col-span-2"
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
                  Go to today
                </button>
              }
            </div>
            <input
              type="date"
              [value]="selectedDate()"
              (change)="onDateChange($event)"
              [max]="maxDate"
              class="rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-all"
            />
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
                        {{ group.entries[0].timestamp.slice(11, 16) }}@if (group.entries[0].comment) {<span> · {{ group.entries[0].comment }}</span>}
                      } @else {
                        {{ group.count }} entries · Tap to view details
                      }
                    </p>
                  </div>
                  <!-- Amount + savings -->
                  <div class="shrink-0 text-right">
                    <p class="text-sm font-semibold">{{ group.totalAmount | currencyFormat }}</p>
                    <p class="text-[10px] text-muted-foreground">lim {{ group.limit | currencyFormat }}</p>
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
                @if (group.count === 1) {
                  <div class="shrink-0 flex flex-col gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                    <!-- Edit button -->
                    <button
                      type="button"
                      (click)="editEntry(group.entries[0]); $event.stopPropagation()"
                      aria-label="Edit entry"
                      class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <lucide-icon name="pencil" class="h-4 w-4" />
                    </button>
                    <!-- Delete button -->
                    <button
                      type="button"
                      (click)="deleteEntry(group.entries[0]); $event.stopPropagation()"
                      aria-label="Delete entry"
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
                  No entries yet today. Log your first expense above.
                } @else {
                  No entries for {{ selectedDateLabel() }}.
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
                  aria-label="Close details"
                  class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
                >
                  <lucide-icon name="x" class="h-4 w-4" />
                </button>
              </div>
              
              <!-- Metadata grid -->
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p class="text-[10px] text-muted-foreground">Amount</p>
                  <p class="font-semibold">{{ entry.amount | currencyFormat }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted-foreground">Limit</p>
                  <p class="font-semibold">{{ entry.limit | currencyFormat }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted-foreground">Savings</p>
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
                {{ entry.date }} at {{ entry.timestamp.slice(11, 16) }}
              </div>
            </div>

            <!-- Comment Section (scrollable, takes maximum space) -->
            <div class="flex-1 overflow-y-auto p-4">
              <p class="text-xs font-medium text-muted-foreground mb-2">Comment</p>
              @if (entry.comment) {
                <p class="text-sm leading-relaxed break-words">{{ entry.comment }}</p>
              } @else {
                <div class="flex items-center justify-center h-32 rounded-2xl border border-dashed border-border bg-card/20">
                  <p class="text-xs text-muted-foreground">No comment added</p>
                </div>
              }
            </div>

            <!-- Action Buttons (fixed at bottom) -->
            <div class="shrink-0 flex gap-2 p-4 border-t border-border">
              <button
                type="button"
                (click)="editFromDetail(entry)"
                class="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-primary bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20"
              >
                <lucide-icon name="pencil" class="h-4 w-4" />
                Edit
              </button>
              <button
                type="button"
                (click)="deleteFromDetail(entry)"
                class="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-destructive/20"
              >
                <lucide-icon name="trash-2" class="h-4 w-4" />
                Delete
              </button>
            </div>
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
                  aria-label="Close details"
                  class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
                >
                  <lucide-icon name="x" class="h-4 w-4" />
                </button>
              </div>
              
              <!-- Aggregated Metadata grid -->
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p class="text-[10px] text-muted-foreground">Total Amount</p>
                  <p class="font-semibold">{{ totalAmount | currencyFormat }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted-foreground">Daily Limit</p>
                  <p class="font-semibold">{{ actualDailyLimit | currencyFormat }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted-foreground">Total Savings</p>
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
              <p class="text-xs font-medium text-muted-foreground mb-3">Individual Entries</p>
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
                          {{ entry.timestamp.slice(11, 16) }}
                        </p>
                      </div>
                      <!-- Action buttons -->
                      <div class="flex gap-1">
                        <button
                          type="button"
                          (click)="editFromDetail(entry)"
                          aria-label="Edit entry"
                          class="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
                        >
                          <lucide-icon name="pencil" class="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          (click)="deleteFromDetail(entry)"
                          aria-label="Delete entry"
                          class="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                        >
                          <lucide-icon name="trash-2" class="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <!-- Comment -->
                    @if (entry.comment) {
                      <div class="mt-2 pt-2 border-t border-border/50">
                        <p class="text-xs text-muted-foreground mb-1">Comment:</p>
                        <p class="text-xs leading-relaxed break-words">{{ entry.comment }}</p>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class DailyExpenseComponent implements OnInit, OnDestroy {
  // ─── Injections ───────────────────────────────────────────────────────────
  readonly expenseStore = inject(ExpenseStore);
  readonly syncService = inject(SyncService);
  private readonly fb = inject(FormBuilder);
  private readonly storageService = inject(StorageService);

  // ─── Reactive form ────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    expenseType: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    limit: [{ value: 0, disabled: true }],
    date: [new Date().toISOString().slice(0, 10), Validators.required], // Default to today
    comment: [''],
  });

  readonly expenseTypes = PREDEFINED_EXPENSE_TYPES;

  /** All category definitions for the chip list */
  readonly categoryDefs = CATEGORY_DEFS;

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

  // ─── Selected date state ──────────────────────────────────────────────────
  readonly selectedDate = signal<string>(new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  readonly isToday = computed(() => this.selectedDate() === new Date().toISOString().slice(0, 10));
  
  // ─── Entries for selected date ───────────────────────────────────────────
  readonly selectedDateEntries = computed(() => {
    const date = this.selectedDate();
    return this.expenseStore.entries().filter((e) => e.date === date);
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
    if (this.isToday()) return 'Today';
    const date = new Date(this.selectedDate());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (this.selectedDate() === yesterday.toISOString().slice(0, 10)) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined 
    });
  });

  // ─── Max date for date picker (today) ─────────────────────────────────────
  readonly maxDate = new Date().toISOString().slice(0, 10);

  // ─── Section card title for entries ──────────────────────────────────────
  readonly entriesSectionTitle = computed(() =>
    this.isToday() ? "Today's Entries" : `${this.selectedDateLabel()}'s Entries`
  );

  // ─── Category expansion state ─────────────────────────────────────────────
  readonly showAllCategories = signal(false);
  readonly visibleCategories = computed(() => {
    const selected = this.form.get('expenseType')?.value;
    const allCats = [...this.categoryDefs];
    
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
  
  readonly hasMoreCategories = computed(() => this.categoryDefs.length > 4);

  // ─── Voice recognition ────────────────────────────────────────────────────
  readonly isRecording = signal(false);
  private recognition: any = null;

  // ─── Date string for hero — reactive to selectedDate ─────────────────────
  readonly dateStr = computed(() => {
    const date = new Date(this.selectedDate() + 'T00:00:00'); // local time
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
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

  private typeChangeSub?: Subscription;
  private offlineToastTimer?: ReturnType<typeof setTimeout>;

  // ─── Type-selection logic ─────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
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

    // Data is loaded from Google Drive on app bootstrap — no per-component fetch needed.
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
    return getCategoryDef(this.getCatId(type)).name;
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
  isActiveCat(cat: { name: string }): boolean {
    return this.form.get('expenseType')?.value === cat.name;
  }

  // ─── Select category from chip ────────────────────────────────────────────
  selectCategory(cat: { name: string }): void {
    this.form.get('expenseType')?.setValue(cat.name);
    // Auto-collapse categories after selection
    this.showAllCategories.set(false);
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

    const editingEntry = this.editingEntry();
    
    if (editingEntry) {
      // Update existing entry
      this.updateEntry(editingEntry);
    } else {
      // Create new entry
      this.createEntry();
    }
  }

  // ─── Create new entry ─────────────────────────────────────────────────────
  private createEntry(): void {
    const id = crypto.randomUUID();
    const date = this.form.get('date')?.value ?? new Date().toISOString().slice(0, 10);
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

    this.form.reset({ 
      expenseType: '', 
      amount: null, 
      limit: 0, 
      date: new Date().toISOString().slice(0, 10), // Reset to today
      comment: '' 
    });

    // Switch the entries list to the date the entry was logged on,
    // then scroll down so the user sees it immediately
    this.selectedDate.set(date);
    this.scrollToTodaysEntries();
  }

  // ─── Update existing entry ────────────────────────────────────────────────
  private updateEntry(originalEntry: ExpenseEntry): void {
    const type = this.form.get('expenseType')?.value ?? '';
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    const savings = (limit ?? 0) - (amount ?? 0);
    const comment = this.form.get('comment')?.value || undefined;
    const date = this.form.get('date')?.value ?? originalEntry.date;

    const updatedEntry: ExpenseEntry = {
      ...originalEntry,
      date,
      amount: amount as number,
      type: type as string,
      limit: limit as number,
      savings,
      comment,
      timestamp: new Date().toISOString(),
    };

    this.expenseStore.updateEntry(updatedEntry);
    this.syncService.enqueueUpdate(updatedEntry);

    if (this.syncService.isOnline()) {
      this.syncService.flushQueue().catch(err => {
        console.error('[DailyExpense] Failed to sync update:', err);
      });
    } else {
      this.offlineToast.set(true);
      if (this.offlineToastTimer) {
        clearTimeout(this.offlineToastTimer);
      }
      this.offlineToastTimer = setTimeout(() => {
        this.offlineToast.set(false);
        this.offlineToastTimer = undefined;
      }, 4000);
    }

    this.form.reset({ 
      expenseType: '', 
      amount: null, 
      limit: 0, 
      date: new Date().toISOString().slice(0, 10), 
      comment: '' 
    });
    this.editingEntry.set(null);

    // Switch entries list to the entry's date and scroll to it
    this.selectedDate.set(date);
    this.scrollToTodaysEntries();
  }

  // ─── Edit entry ───────────────────────────────────────────────────────────
  editEntry(entry: ExpenseEntry): void {
    console.log('[DailyExpense] Editing entry:', entry.id);
    
    // Set editing state
    this.editingEntry.set(entry);
    
    // Populate form with entry data
    this.form.patchValue({
      expenseType: entry.type,
      amount: entry.amount,
      limit: entry.limit,
      date: entry.date,
      comment: entry.comment || '',
    });

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Cancel edit ──────────────────────────────────────────────────────────
  cancelEdit(): void {
    this.editingEntry.set(null);
    this.form.reset({ 
      expenseType: '', 
      amount: null, 
      limit: 0, 
      date: new Date().toISOString().slice(0, 10), 
      comment: '' 
    });
  }

  // ─── Set date to today ────────────────────────────────────────────────────
  setToday(): void {
    this.form.get('date')?.setValue(new Date().toISOString().slice(0, 10));
  }

  // ─── View detail ──────────────────────────────────────────────────────────
  viewDetail(entry: ExpenseEntry): void {
    console.log('[DailyExpense] Viewing detail for entry:', entry.id);
    this.viewingEntry.set(entry);
    this.viewingGroupedEntries.set([]);
  }

  // ─── View group detail ────────────────────────────────────────────────────
  viewGroupDetail(group: { type: string; entries: ExpenseEntry[]; totalAmount: number; totalSavings: number; count: number; limit: number }): void {
    console.log('[DailyExpense] Viewing group detail for type:', group.type, 'with', group.count, 'entries');
    
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
  onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newDate = input.value; // YYYY-MM-DD format
    console.log('[DailyExpense] Date changed to:', newDate);
    this.selectedDate.set(newDate);
    
    // Load the month if not already loaded
    const month = newDate.slice(0, 7); // YYYY-MM
    if (month !== this.expenseStore.selectedMonth()) {
      // Data is already in the store from Drive bootstrap; just update the selected month filter
      this.expenseStore.setSelectedMonth(month);
    }
  }

  goToToday(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.selectedDate.set(today);
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
    if (!confirm(`Delete expense: ${entry.type} - ₹${entry.amount}?`)) {
      return;
    }

    console.log('[DailyExpense] Deleting entry:', entry.id);

    // Remove from local store immediately
    this.expenseStore.deleteEntry(entry.id);

    // Queue the delete operation for sync
    this.syncService.enqueueDelete(entry.id);

    // If online, attempt to sync immediately
    if (this.syncService.isOnline()) {
      this.syncService.flushQueue().catch(err => {
        console.error('[DailyExpense] Failed to sync delete:', err);
      });
    } else {
      // Show offline toast
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
