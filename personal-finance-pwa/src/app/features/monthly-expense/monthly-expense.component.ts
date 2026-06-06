import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal, isDevMode } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js/auto';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  ChevronLeft,
  ChevronRight,
  ArrowDownRight,
  ArrowUpRight,
  X,
} from 'lucide-angular';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { StorageService } from '../../core/services/storage.service';
import { I18nService } from '../../core/services/i18n.service';
import { CurrencyService } from '../../core/services/currency.service';
import { ExpenseEntry } from '../../core/models';
import { ChartBaseComponent, SectionCardComponent, CategoryIconComponent, SparklineComponent } from '../../shared/components';
import { CurrencyFormatPipe, TranslatePipe } from '../../shared/pipes';
import { CATEGORY_DEFS, getCategoryDef } from '../../core/models/category-definitions';
import { SparklineDataPoint } from '../../shared/components/sparkline/sparkline.component';
import { formatLocalTime, parseLocalDate, toLocalDateString } from '../../core/utils/local-date';

@Component({
  selector: 'app-monthly-expense',
  standalone: true,
  imports: [
    ChartBaseComponent,
    SectionCardComponent,
    CategoryIconComponent,
    SparklineComponent,
    LucideAngularModule,
    CurrencyFormatPipe,
    TranslatePipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        ChevronLeft,
        ChevronRight,
        ArrowDownRight,
        ArrowUpRight,
        X,
      }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      @if (monthPickerToast()) {
        <div
          class="fixed bottom-20 left-0 right-0 z-50 mx-4 rounded-2xl border border-amber-400/40 bg-amber-500 px-4 py-3 text-sm font-medium text-white shadow-2xl"
          role="alert"
          aria-live="polite"
        >
          {{ monthPickerToast() }}
        </div>
      }

      <!-- Page Header -->
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{{ 'monthly.title' | translate }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ 'monthly.description' | translate }}</p>
        </div>
        <!-- Month Picker Pill -->
        <div class="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1 backdrop-blur shrink-0">
          <button
            (click)="prevMonth()"
            aria-label="Previous month"
            class="grid h-8 w-8 place-items-center rounded-full hover:bg-accent transition-all"
          >
            <lucide-icon [img]="chevronLeftIcon" class="h-4 w-4" />
          </button>
          <span class="px-3 text-sm font-medium whitespace-nowrap">{{ selectedMonthLabel() }}</span>
          <button
            (click)="nextMonth()"
            [disabled]="isCurrentMonth()"
            [attr.aria-label]="'monthly.nextMonth' | translate"
            class="grid h-8 w-8 place-items-center rounded-full transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <lucide-icon [img]="chevronRightIcon" class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="mb-4 grid gap-4 sm:grid-cols-3">
        <!-- Total Spent -->
        <div class="glass-card relative overflow-hidden p-5">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'monthly.totalSpent' | translate }}</p>
          <p class="mt-2 text-xl font-semibold tracking-tight md:text-2xl lg:text-3xl break-all">
            {{ totalSpent() | currencyFormat }}
          </p>
          <div class="mt-3 flex items-center gap-3">
            @if (spentTrend().direction === 'up') {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15"
                style="color: var(--destructive)"
              >
                <lucide-icon [img]="arrowUpRightIcon" class="h-3 w-3" />
                {{ spentTrend().percent }}% vs last
              </span>
            } @else if (spentTrend().direction === 'down') {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success/15"
                style="color: var(--success)"
              >
                <lucide-icon [img]="arrowDownRightIcon" class="h-3 w-3" />
                {{ spentTrend().percent }}% vs last
              </span>
            } @else {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-muted/50"
                style="color: var(--muted-foreground)"
              >
                Stable
              </span>
            }
          </div>
          <!-- Sparkline -->
          <div class="mt-4">
            <app-sparkline
              [data]="getTotalSpendingSparklineData()"
              width="100%"
              height="32px"
              [strokeWidth]="2"
              [showTrend]="true"
            />
          </div>
        </div>

        <!-- Total Limit -->
        <div class="glass-card relative overflow-hidden p-5">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'monthly.totalLimit' | translate }}</p>
          <p class="mt-2 text-xl font-semibold tracking-tight md:text-2xl lg:text-3xl break-all">
            {{ totalLimit() | currencyFormat }}
          </p>
          <div class="mt-3">
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-muted/50"
              style="color: var(--muted-foreground)"
            >
              Configured
            </span>
          </div>
        </div>

        <!-- Net Savings -->
        <div class="glass-card relative overflow-hidden p-5">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'monthly.netSavings' | translate }}</p>
          <p class="mt-2 text-xl font-semibold tracking-tight md:text-2xl lg:text-3xl break-all">
            {{ netSavings() | currencyFormat }}
          </p>
          <div class="mt-3 flex items-center gap-3">
            @if (netSavings() < 0) {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15"
                style="color: var(--destructive)"
              >
                <lucide-icon [img]="arrowDownRightIcon" class="h-3 w-3" />
                Over budget
              </span>
            } @else if (savingsTrend().direction === 'up') {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success/15"
                style="color: var(--success)"
              >
                <lucide-icon [img]="arrowUpRightIcon" class="h-3 w-3" />
                {{ savingsTrend().percent }}% better
              </span>
            } @else if (savingsTrend().direction === 'down') {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15"
                style="color: var(--destructive)"
              >
                <lucide-icon [img]="arrowDownRightIcon" class="h-3 w-3" />
                {{ savingsTrend().percent }}% worse
              </span>
            } @else {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success/15"
                style="color: var(--success)"
              >
                Stable
              </span>
            }
          </div>
          <!-- Sparkline showing cumulative savings -->
          <div class="mt-4">
            <app-sparkline
              [data]="getSavingsSparklineData()"
              width="100%"
              height="32px"
              [strokeWidth]="2"
              [showTrend]="false"
              lineColor="rgb(34, 197, 94)"
              fillColor="rgba(34, 197, 94, 0.1)"
            />
          </div>
        </div>
      </div>

      <!-- Budget Rule Breakdown -->
      <div class="mb-4 grid grid-cols-1 gap-6">
        <app-section-card
          [title]="'monthly.budgetBreakdown.title' | translate"
          [description]="'monthly.budgetBreakdown.description' | translate"
        >
          <div class="space-y-6">
            <!-- Chart Container -->
            <div class="flex justify-center">
              <div class="relative h-72 w-72">
                <app-chart-base 
                  type="doughnut" 
                  [data]="donutChartData()" 
                  [options]="donutChartOptions"
                />
                <!-- Center overlay with total -->
                <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'common.amount' | translate }}</span>
                  <span class="mt-1 text-2xl font-bold tracking-tight">{{ totalSpent() | currencyFormat }}</span>
                </div>
              </div>
            </div>
            
            <!-- Legend Grid -->
            <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              @for (item of donutLegend(); track item.name) {
                <div class="flex flex-col gap-1.5 rounded-2xl border border-border bg-card/60 px-4 py-3 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-sm">
                  <div class="flex items-center gap-2">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background-color]="item.color"></span>
                    <span class="text-xs font-semibold text-foreground">{{ item.name }}</span>
                  </div>
                  <span class="text-sm font-bold tabular-nums">{{ item.value | currencyFormat }}</span>
                </div>
              }
            </div>
          </div>
        </app-section-card>
      </div>

      <!-- Category Breakdown -->
      <div class="grid grid-cols-1 gap-6">
        <app-section-card
          [title]="'monthly.categoryBreakdown.title' | translate"
          [description]="'monthly.categoryBreakdown.description' | translate"
        >
          <ul class="space-y-3">
            @for (cat of categoryDefs; track cat.id) {
              <li>
                <button
                  type="button"
                  (click)="viewCategoryDetails(cat.id)"
                  [disabled]="getCategoryEntries(cat.id).length === 0"
                  class="flex w-full items-center gap-3 rounded-2xl border border-transparent p-2 text-left transition-all hover:border-primary/25 hover:bg-card/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
                >
                  <app-category-icon [categoryId]="cat.id" size="sm" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2 text-sm">
                      <span class="truncate font-medium">{{ getCategoryName(cat.id) }}</span>
                      <span
                        class="shrink-0 tabular-nums text-xs"
                        [style.color]="isOver(cat.id) ? 'var(--destructive)' : ''"
                      >
                        {{ getSpentForCat(cat.id) | currencyFormat }}
                        <span class="text-muted-foreground">/ {{ getLimitForCat(cat.id) | currencyFormat }}</span>
                      </span>
                    </div>
                    <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        class="h-full rounded-full transition-all"
                        [style.width.%]="getPct(cat.id)"
                        [style.background-color]="isOver(cat.id) ? 'var(--destructive)' : 'var(' + cat.colorVar + ')'"
                      ></div>
                    </div>
                    <!-- Sparkline showing last 30 days trend -->
                    <div class="mt-2 flex items-center gap-2">
                      <app-sparkline
                        [data]="getSparklineData(cat.id)"
                        width="120px"
                        height="24px"
                        [strokeWidth]="1.5"
                        [showTrend]="true"
                      />
                      <span class="text-[10px] text-muted-foreground">Last 30 days</span>
                      @if (getCategoryEntries(cat.id).length > 0) {
                        <span class="ml-auto text-[10px] font-medium text-primary">
                          {{ i18n.t('monthly.categoryBreakdown.viewEntries', { count: getCategoryEntries(cat.id).length }) }}
                        </span>
                      }
                    </div>
                  </div>
                </button>
              </li>
            }
          </ul>
        </app-section-card>
      </div>

      @if (selectedCategoryId(); as catId) {
        <div
          class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          (click)="closeCategoryDetails()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="monthly-category-detail-title"
        >
          <div
            class="relative flex max-h-[84vh] w-full max-w-md flex-col rounded-3xl border border-border bg-card shadow-2xl"
            (click)="$event.stopPropagation()"
          >
            <div class="shrink-0 border-b border-border p-4">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <app-category-icon [categoryId]="catId" size="sm" />
                  <div class="min-w-0">
                    <h2 id="monthly-category-detail-title" class="truncate text-base font-semibold">
                      {{ getCategoryName(catId) }}
                    </h2>
                    <p class="text-xs text-muted-foreground">
                      {{ selectedMonthLabel() }} · {{ i18n.t('monthly.categoryDetails.entryCount', { count: selectedCategoryEntries().length }) }}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  (click)="closeCategoryDetails()"
                  [attr.aria-label]="'common.closeDetails' | translate"
                  class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
                >
                  <lucide-icon [img]="xIcon" class="h-4 w-4" />
                </button>
              </div>

              <div class="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p class="text-[10px] text-muted-foreground">{{ 'monthly.categoryDetails.spent' | translate }}</p>
                  <p class="font-semibold">{{ getSpentForCat(catId) | currencyFormat }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted-foreground">{{ 'common.limit' | translate }}</p>
                  <p class="font-semibold">{{ getLimitForCat(catId) | currencyFormat }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted-foreground">{{ 'common.savings' | translate }}</p>
                  <p
                    class="font-semibold"
                    [style.color]="getLimitForCat(catId) - getSpentForCat(catId) >= 0 ? 'var(--success)' : 'var(--destructive)'"
                  >
                    {{ getLimitForCat(catId) - getSpentForCat(catId) | currencyFormat }}
                  </p>
                </div>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              <div class="space-y-2">
                @for (entry of selectedCategoryEntries(); track entry.id) {
                  <div class="rounded-2xl border border-border bg-card/40 p-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-semibold">{{ entry.amount | currencyFormat }}</p>
                        <p class="mt-0.5 text-[10px] text-muted-foreground">
                          {{ formatEntryDate(entry.date) }} · {{ formatEntryTime(entry.timestamp) }}
                        </p>
                      </div>
                      <span
                        class="shrink-0 text-[10px] font-medium"
                        [style.color]="entry.savings >= 0 ? 'var(--success)' : 'var(--destructive)'"
                      >
                        {{ entry.savings >= 0 ? '+' : '' }}{{ entry.savings | currencyFormat }}
                      </span>
                    </div>
                    @if (entry.comment) {
                      <div class="mt-2 border-t border-border/50 pt-2">
                        <p class="text-[10px] text-muted-foreground">{{ 'common.comment' | translate }}</p>
                        <p class="mt-0.5 break-words text-xs leading-relaxed">{{ entry.comment }}</p>
                      </div>
                    }
                  </div>
                } @empty {
                  <div class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {{ 'monthly.categoryDetails.empty' | translate }}
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class MonthlyExpenseComponent implements OnInit, OnDestroy {
  readonly expenseStore = inject(ExpenseStore);
  private readonly storageService = inject(StorageService);
  readonly i18n = inject(I18nService);
  private readonly currencyService = inject(CurrencyService);

  /** Expose CATEGORY_DEFS for template iteration */
  readonly categoryDefs = CATEGORY_DEFS;

  /** Icon references */
  readonly chevronLeftIcon = ChevronLeft;
  readonly chevronRightIcon = ChevronRight;
  readonly arrowDownRightIcon = ArrowDownRight;
  readonly arrowUpRightIcon = ArrowUpRight;
  readonly xIcon = X;

  /** Month offset from current month (0 = current, -1 = previous, etc.) */
  readonly monthOffset = signal(0);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly monthPickerToast = signal<string | null>(null);
  private monthPickerToastTimer?: ReturnType<typeof setTimeout>;

  /** Derived YYYY-MM string for the selected month */
  readonly selectedMonth = computed(() => {
    return this.getMonthForOffset(this.monthOffset());
  });

  /** Human-readable month/year label */
  readonly selectedMonthLabel = computed(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + this.monthOffset());
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });

  /** Summary computed values */
  readonly totalSpent = computed(() => {
    const entries = this.expenseStore.selectedMonthEntries();
    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    if (isDevMode()) { console.log('[MonthlyExpense] totalSpent computed - entries:', entries.length, '| total:', total, '| store.selectedMonth:', this.expenseStore.selectedMonth()); }
    return total;
  });

  readonly totalLimit = computed(() =>
    this.expenseStore.limits().reduce(
      (sum, l) => sum + (l.userPercentage * this.expenseStore.monthlyIncome()) / 100,
      0
    )
  );

  readonly netSavings = computed(() => this.totalLimit() - this.totalSpent());

  readonly selectedCategoryEntries = computed(() => {
    const catId = this.selectedCategoryId();
    return catId ? this.getCategoryEntries(catId) : [];
  });

  // ─── Previous month data for trend calculation ────────────────────────────
  readonly previousMonth = computed(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + this.monthOffset() - 1);
    return d.toISOString().slice(0, 7);
  });

  readonly previousMonthEntries = computed(() => {
    const prevMonth = this.previousMonth();
    return this.expenseStore.entries().filter((e) => e.date.startsWith(prevMonth));
  });

  readonly previousMonthSpent = computed(() =>
    this.previousMonthEntries().reduce((sum, e) => sum + e.amount, 0)
  );

  readonly previousMonthSavings = computed(() => 
    this.totalLimit() - this.previousMonthSpent()
  );

  // ─── Trend calculations ───────────────────────────────────────────────────
  readonly spentTrend = computed(() => {
    const current = this.totalSpent();
    const previous = this.previousMonthSpent();
    if (previous === 0) return { percent: 0, direction: 'stable' as const };
    const change = ((current - previous) / previous) * 100;
    return {
      percent: Math.abs(Math.round(change)),
      direction: change > 5 ? 'up' as const : change < -5 ? 'down' as const : 'stable' as const
    };
  });

  readonly savingsTrend = computed(() => {
    const current = this.netSavings();
    const previous = this.previousMonthSavings();
    if (previous === 0) return { percent: 0, direction: 'stable' as const };
    const change = ((current - previous) / previous) * 100;
    return {
      percent: Math.abs(Math.round(change)),
      direction: change > 5 ? 'up' as const : change < -5 ? 'down' as const : 'stable' as const
    };
  });

  /**
   * Resolves a CSS variable to its computed color value.
   * Chart.js renders on <canvas> and cannot read CSS variables directly.
   */
  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Donut chart data from budgetRuleSummary — colors resolved at compute time */
  readonly donutChartData = computed((): ChartData => {
    const summary = this.expenseStore.budgetRuleSummary();
    return {
      labels: [
        this.i18n.t('budgetGroup.needs'),
        this.i18n.t('budgetGroup.wants'),
        this.i18n.t('budgetGroup.savings'),
        this.i18n.t('budgetGroup.growth'),
        this.i18n.t('budgetGroup.buffer'),
      ],
      datasets: [
        {
          data: [
            summary.needsTotal, 
            summary.wantsTotal, 
            summary.savingsTotal,
            summary.growthTotal,
            summary.bufferTotal
          ],
          backgroundColor: [
            this.cssVar('--cat-transport'),
            this.cssVar('--cat-dining'),
            this.cssVar('--cat-savings'),
            this.cssVar('--cat-education'),
            this.cssVar('--cat-misc'),
          ],
          borderWidth: 0,
          spacing: 2,
        },
      ],
    };
  });

  /** Chart options for the doughnut chart */
  readonly donutChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false, // Hide default legend
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            return `${label}: ${this.currencyService.format(value, this.i18n.locale())}`;
          }
        }
      }
    },
    cutout: '70%', // Makes it a donut (not a pie)
  } as const;

  /** Legend items for the donut chart */
  readonly donutLegend = computed(() => {
    const summary = this.expenseStore.budgetRuleSummary();
    return [
      { name: this.i18n.t('budgetGroup.needs'),   value: summary.needsTotal,   color: this.cssVar('--cat-transport') },
      { name: this.i18n.t('budgetGroup.wants'),   value: summary.wantsTotal,   color: this.cssVar('--cat-dining') },
      { name: this.i18n.t('budgetGroup.savings'), value: summary.savingsTotal, color: this.cssVar('--cat-savings') },
      { name: this.i18n.t('budgetGroup.growth'),  value: summary.growthTotal,  color: this.cssVar('--cat-education') },
      { name: this.i18n.t('budgetGroup.buffer'),  value: summary.bufferTotal,  color: this.cssVar('--cat-misc') },
    ].filter(item => item.value > 0);
  });

  /** Table rows grouped by type (kept for backward compatibility) */
  readonly tableRows = computed(() => {
    const entries = this.expenseStore.selectedMonthEntries();
    const limitMap = this.expenseStore.limitMap();
    const income = this.expenseStore.monthlyIncome();

    const spentByType = new Map<string, number>();
    for (const entry of entries) {
      spentByType.set(entry.type, (spentByType.get(entry.type) ?? 0) + entry.amount);
    }

    return Array.from(spentByType.entries()).map(([type, totalSpent]) => {
      const limit = limitMap[type];
      const configuredLimit = limit
        ? (limit.userPercentage * income) / 100
        : 0;
      return {
        type,
        totalSpent,
        configuredLimit,
        variance: configuredLimit - totalSpent,
      };
    });
  });

  async ngOnInit(): Promise<void> {
    // Data is loaded from Google Drive on app bootstrap — no per-component fetch needed.
    this.expenseStore.setSelectedMonth(this.selectedMonth());
  }

  ngOnDestroy(): void {
    if (this.monthPickerToastTimer) {
      clearTimeout(this.monthPickerToastTimer);
    }
  }

  getCategoryName(catId: string): string {
    const translated = this.i18n.t(`category.${catId}`);
    return translated.startsWith('category.') ? getCategoryDef(catId).name : translated;
  }

  prevMonth(): void {
    this.navigateToMonthOffset(this.monthOffset() - 1);
  }

  nextMonth(): void {
    const targetOffset = this.monthOffset() + 1;
    const targetMonth = this.getMonthForOffset(targetOffset);
    if (this.isFutureMonth(targetMonth)) {
      this.showMonthPickerToast(this.i18n.t('monthly.monthPicker.futureBlocked'));
      return;
    }

    this.navigateToMonthOffset(targetOffset);
  }

  isCurrentMonth(): boolean {
    return this.selectedMonth() >= this.currentMonth();
  }

  private navigateToMonthOffset(targetOffset: number): void {
    const targetMonth = this.getMonthForOffset(targetOffset);

    if (this.isFutureMonth(targetMonth)) {
      this.showMonthPickerToast(this.i18n.t('monthly.monthPicker.futureBlocked'));
      return;
    }

    if (targetMonth < this.currentMonth() && !this.hasEntriesForMonth(targetMonth)) {
      this.showMonthPickerToast(this.i18n.t('monthly.monthPicker.noEntries'));
      return;
    }

    this.monthOffset.set(targetOffset);
    this.expenseStore.setSelectedMonth(targetMonth);
    this.closeCategoryDetails();
  }

  private getMonthForOffset(offset: number): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return toLocalDateString(d).slice(0, 7);
  }

  private currentMonth(): string {
    return toLocalDateString().slice(0, 7);
  }

  private isFutureMonth(month: string): boolean {
    return month > this.currentMonth();
  }

  private hasEntriesForMonth(month: string): boolean {
    return this.expenseStore.entries().some((entry) => entry.date.startsWith(month));
  }

  private showMonthPickerToast(message: string): void {
    this.monthPickerToast.set(message);
    if (this.monthPickerToastTimer) {
      clearTimeout(this.monthPickerToastTimer);
    }
    this.monthPickerToastTimer = setTimeout(() => {
      this.monthPickerToast.set(null);
      this.monthPickerToastTimer = undefined;
    }, 3500);
  }

  viewCategoryDetails(catId: string): void {
    if (this.getCategoryEntries(catId).length === 0) return;
    this.selectedCategoryId.set(catId);
  }

  closeCategoryDetails(): void {
    this.selectedCategoryId.set(null);
  }

  getCategoryEntries(catId: string): ExpenseEntry[] {
    const typeName = getCategoryDef(catId).name;
    if (typeName === 'Custom') return [];

    return this.expenseStore
      .selectedMonthEntries()
      .filter((entry) => entry.type === typeName)
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        return dateCompare !== 0 ? dateCompare : b.timestamp.localeCompare(a.timestamp);
      });
  }

  formatEntryTime(timestamp: string): string {
    return formatLocalTime(timestamp, this.i18n.locale());
  }

  formatEntryDate(date: string): string {
    return parseLocalDate(date).toLocaleDateString(this.i18n.locale(), {
      month: 'short',
      day: 'numeric',
    });
  }

  /** Sum of all entries for a given category ID */
  getSpentForCat(catId: string): number {
    const typeName = getCategoryDef(catId).name;
    if (typeName === 'Custom') return 0;
    return this.expenseStore
      .selectedMonthEntries()
      .filter(e => e.type === typeName)
      .reduce((sum, e) => sum + e.amount, 0);
  }

  /** Monthly limit for a given category ID */
  getLimitForCat(catId: string): number {
    const typeName = getCategoryDef(catId).name;
    if (typeName === 'Custom') return 0;
    const limit = this.expenseStore.limitMap()[typeName];
    if (!limit) return 0;
    return (limit.userPercentage * this.expenseStore.monthlyIncome()) / 100;
  }

  /** Percentage of limit spent (clamped to 100) */
  getPct(catId: string): number {
    const spent = this.getSpentForCat(catId);
    const limit = this.getLimitForCat(catId);
    if (limit <= 0) return spent > 0 ? 100 : 0;
    return Math.min(100, Math.round((spent / limit) * 100));
  }

  /** Whether spending exceeds the limit for a category */
  isOver(catId: string): boolean {
    return this.getSpentForCat(catId) > this.getLimitForCat(catId);
  }

  /**
   * Get sparkline data for a category showing daily spending over the last 30 days
   */
  getSparklineData(catId: string): SparklineDataPoint[] {
    const typeName = getCategoryDef(catId).name;
    if (typeName === 'Custom') return [];

    const entries = this.expenseStore.selectedMonthEntries();
    const categoryEntries = entries.filter(e => e.type === typeName);

    // Get the date range for the current month
    const selectedMonth = this.selectedMonth();
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    // Create a map of date -> total spending
    const dailySpending = new Map<string, number>();
    
    for (const entry of categoryEntries) {
      const date = entry.date.slice(0, 10); // YYYY-MM-DD
      dailySpending.set(date, (dailySpending.get(date) || 0) + entry.amount);
    }

    // Generate sparkline data for all days in the month (or last 30 days)
    const dataPoints: SparklineDataPoint[] = [];
    const maxDays = Math.min(30, daysInMonth);
    
    for (let day = 1; day <= maxDays; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      dataPoints.push({
        date: dateStr,
        value: dailySpending.get(dateStr) || 0,
      });
    }

    return dataPoints;
  }

  /**
   * Get sparkline data for total spending across all categories
   */
  getTotalSpendingSparklineData(): SparklineDataPoint[] {
    const entries = this.expenseStore.selectedMonthEntries();
    const selectedMonth = this.selectedMonth();
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    // Create a map of date -> total spending
    const dailySpending = new Map<string, number>();
    
    for (const entry of entries) {
      const date = entry.date.slice(0, 10); // YYYY-MM-DD
      dailySpending.set(date, (dailySpending.get(date) || 0) + entry.amount);
    }

    // Generate sparkline data for all days in the month (or last 30 days)
    const dataPoints: SparklineDataPoint[] = [];
    const maxDays = Math.min(30, daysInMonth);
    
    for (let day = 1; day <= maxDays; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      dataPoints.push({
        date: dateStr,
        value: dailySpending.get(dateStr) || 0,
      });
    }

    return dataPoints;
  }

  /**
   * Get sparkline data for net savings over time (cumulative)
   */
  getSavingsSparklineData(): SparklineDataPoint[] {
    const entries = this.expenseStore.selectedMonthEntries();
    const selectedMonth = this.selectedMonth();
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalLimit = this.totalLimit();

    // Create a map of date -> total spending
    const dailySpending = new Map<string, number>();
    
    for (const entry of entries) {
      const date = entry.date.slice(0, 10); // YYYY-MM-DD
      dailySpending.set(date, (dailySpending.get(date) || 0) + entry.amount);
    }

    // Generate sparkline data showing cumulative savings
    const dataPoints: SparklineDataPoint[] = [];
    const maxDays = Math.min(30, daysInMonth);
    let cumulativeSpent = 0;
    
    for (let day = 1; day <= maxDays; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      cumulativeSpent += dailySpending.get(dateStr) || 0;
      const savingsAtDay = totalLimit - cumulativeSpent;
      dataPoints.push({
        date: dateStr,
        value: Math.max(0, savingsAtDay), // Don't show negative values
      });
    }

    return dataPoints;
  }
}
