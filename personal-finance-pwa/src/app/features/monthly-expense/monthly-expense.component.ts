import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js/auto';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  ChevronLeft,
  ChevronRight,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-angular';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { StorageService } from '../../core/services/storage.service';
import { ChartBaseComponent, SectionCardComponent, CategoryIconComponent, SparklineComponent } from '../../shared/components';
import { CurrencyFormatPipe } from '../../shared/pipes';
import { CATEGORY_DEFS } from '../../core/models/category-definitions';
import { SparklineDataPoint } from '../../shared/components/sparkline/sparkline.component';

/** Maps category ID (e.g. 'housing') to the expense type name used in entries (e.g. 'Housing') */
const CAT_ID_TO_TYPE: Record<string, string> = {
  housing:       'Housing',
  food:          'Food & Groceries',
  transport:     'Transportation',
  utilities:     'Utilities',
  health:        'Healthcare',
  entertainment: 'Entertainment',
  dining:        'Dining Out',
  shopping:      'Shopping/Clothing',
  savings:       'Savings/Emergency Fund',
  investments:   'Investments',
  education:     'Education',
  personal:      'Personal Care',
  subscriptions: 'Subscriptions',
  misc:          'Miscellaneous',
};

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
      }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <!-- Page Header -->
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Monthly Expenses</h1>
          <p class="mt-1 text-sm text-muted-foreground">A bird's-eye view of how this month is going.</p>
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
            aria-label="Next month"
            class="grid h-8 w-8 place-items-center rounded-full hover:bg-accent transition-all"
          >
            <lucide-icon [img]="chevronRightIcon" class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="mb-4 grid gap-4 sm:grid-cols-3">
        <!-- Total Spent -->
        <div class="glass-card relative overflow-hidden p-5">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Total Spent</p>
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
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Total Limit</p>
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
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Net Savings</p>
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
          title="Budget Rule Breakdown"
          description="Spending by Needs / Wants / Savings / Growth / Buffer"
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
                  <span class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Total</span>
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
          title="Category Breakdown"
          description="How each category compares to its limit"
        >
          <ul class="space-y-3">
            @for (cat of categoryDefs; track cat.id) {
              <li class="flex items-center gap-3">
                <app-category-icon [categoryId]="cat.id" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2 text-sm">
                    <span class="truncate font-medium">{{ cat.name }}</span>
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
                  </div>
                </div>
              </li>
            }
          </ul>
        </app-section-card>
      </div>
    </div>
  `,
})
export class MonthlyExpenseComponent implements OnInit {
  readonly expenseStore = inject(ExpenseStore);
  private readonly storageService = inject(StorageService);

  /** Expose CATEGORY_DEFS for template iteration */
  readonly categoryDefs = CATEGORY_DEFS;

  /** Icon references */
  readonly chevronLeftIcon = ChevronLeft;
  readonly chevronRightIcon = ChevronRight;
  readonly arrowDownRightIcon = ArrowDownRight;
  readonly arrowUpRightIcon = ArrowUpRight;

  /** Month offset from current month (0 = current, -1 = previous, etc.) */
  readonly monthOffset = signal(0);

  /** Derived YYYY-MM string for the selected month */
  readonly selectedMonth = computed(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + this.monthOffset());
    return d.toISOString().slice(0, 7);
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
    console.log('[MonthlyExpense] totalSpent computed - entries:', entries.length, '| total:', total, '| store.selectedMonth:', this.expenseStore.selectedMonth());
    return total;
  });

  readonly totalLimit = computed(() =>
    this.expenseStore.limits().reduce(
      (sum, l) => sum + (l.userPercentage * this.expenseStore.monthlyIncome()) / 100,
      0
    )
  );

  readonly netSavings = computed(() => this.totalLimit() - this.totalSpent());

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
      labels: ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'],
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
            return `${label}: ₹${value.toFixed(2)}`;
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
      { name: 'Needs',   value: summary.needsTotal,   color: this.cssVar('--cat-transport') },
      { name: 'Wants',   value: summary.wantsTotal,   color: this.cssVar('--cat-dining') },
      { name: 'Savings', value: summary.savingsTotal, color: this.cssVar('--cat-savings') },
      { name: 'Growth',  value: summary.growthTotal,  color: this.cssVar('--cat-education') },
      { name: 'Buffer',  value: summary.bufferTotal,  color: this.cssVar('--cat-misc') },
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
  }

  prevMonth(): void {
    this.monthOffset.update(o => o - 1);
  }

  nextMonth(): void {
    this.monthOffset.update(o => o + 1);
  }

  /** Sum of all entries for a given category ID */
  getSpentForCat(catId: string): number {
    const typeName = CAT_ID_TO_TYPE[catId];
    if (!typeName) return 0;
    return this.expenseStore
      .selectedMonthEntries()
      .filter(e => e.type === typeName)
      .reduce((sum, e) => sum + e.amount, 0);
  }

  /** Monthly limit for a given category ID */
  getLimitForCat(catId: string): number {
    const typeName = CAT_ID_TO_TYPE[catId];
    if (!typeName) return 0;
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
    const typeName = CAT_ID_TO_TYPE[catId];
    if (!typeName) return [];

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
