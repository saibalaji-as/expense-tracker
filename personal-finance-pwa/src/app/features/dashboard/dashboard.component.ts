import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartData } from 'chart.js/auto';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { BudgetRuleSummary } from '../../core/models/budget-rule-summary.model';
import { CATEGORY_DEFS } from '../../core/models/category-definitions';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { ChartBaseComponent, SectionCardComponent } from '../../shared/components';
import { CurrencyFormatPipe } from '../../shared/pipes';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Sparkles,
  ArrowRight,
} from 'lucide-angular';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    ChartBaseComponent,
    SectionCardComponent,
    LucideAngularModule,
    CurrencyFormatPipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Sparkles, ArrowRight }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">

      <!-- Page header row -->
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
          <p class="mt-1 text-sm text-muted-foreground">A snapshot of your financial health.</p>
        </div>
        <!-- Quick-stat chips -->
        <div class="flex flex-wrap gap-2">
          <div class="glass-card px-4 py-2.5">
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground">Today</p>
            <p class="text-sm font-semibold tabular-nums">{{ todaySpend() | currencyFormat }}</p>
          </div>
          <div class="glass-card px-4 py-2.5">
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground">This week</p>
            <p class="text-sm font-semibold tabular-nums">{{ weekSpend() | currencyFormat }}</p>
          </div>
          <div class="glass-card px-4 py-2.5">
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground">Avg / day</p>
            <p class="text-sm font-semibold tabular-nums">{{ avgPerDay() | currencyFormat }}</p>
          </div>
        </div>
      </div>

      <!-- 4-chart grid -->
      <div class="grid gap-6 md:grid-cols-2">

        <!-- Year-to-date Daily Expenses -->
        <app-section-card
          title="Year-to-date Daily Expenses"
          description="Daily spend across the past 30 days"
        >
          @if (hasYtdData()) {
            <div class="h-56">
              <app-chart-base type="line" [data]="ytdDailyData()" />
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No data available.
            </div>
          }
        </app-section-card>

        <!-- This Month by Type -->
        <app-section-card
          title="This Month by Type"
          description="Where your spend is concentrated"
        >
          @if (hasMonthlyTypeData()) {
            <div class="h-56">
              <app-chart-base type="doughnut" [data]="monthlyTypeData()" />
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No data available.
            </div>
          }
        </app-section-card>

        <!-- Last 6 Months -->
        <app-section-card
          title="Last 6 Months"
          description="Total monthly spend"
        >
          @if (hasSixMonthData()) {
            <div class="h-56">
              <app-chart-base type="bar" [data]="sixMonthData()" />
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No data available.
            </div>
          }
        </app-section-card>

        <!-- Budget Rule (50/30/20) -->
        <app-section-card
          title="Budget Rule (50/30/20)"
          description="Actual split across Needs, Wants, Savings"
        >
          @if (hasBudgetRuleData()) {
            <div class="h-56">
              <app-chart-base type="doughnut" [data]="budgetRuleData()" />
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No data available.
            </div>
          }
        </app-section-card>

      </div>

      <!-- CTA card — always visible -->
      <a
        routerLink="/daily"
        class="glass-card flex items-center justify-between gap-4 p-4 transition-all hover:shadow-glow md:p-5"
      >
        <div class="flex items-center gap-3">
          <span class="grid h-10 w-10 place-items-center rounded-xl gradient-primary text-primary-foreground">
            <lucide-icon name="sparkles" class="h-5 w-5" />
          </span>
          <div>
            <p class="text-sm font-semibold">Log a new expense</p>
            <p class="text-xs text-muted-foreground">Quick-add today's spending in seconds.</p>
          </div>
        </div>
        <lucide-icon name="arrow-right" class="h-5 w-5 text-muted-foreground" />
      </a>

    </div>
  `,
})
export class DashboardComponent implements OnInit {
  readonly expenseStore = inject(ExpenseStore);

  // Chart data signals
  readonly ytdDailyData = signal<ChartData>({ datasets: [] });
  readonly monthlyTypeData = signal<ChartData>({ datasets: [] });
  readonly sixMonthData = signal<ChartData>({ datasets: [] });
  readonly budgetRuleData = signal<ChartData>({ datasets: [] });

  // Empty-state helpers
  readonly hasYtdData = signal(false);
  readonly hasMonthlyTypeData = signal(false);
  readonly hasSixMonthData = signal(false);
  readonly hasBudgetRuleData = signal(false);

  // Quick-stat computed signals
  readonly todaySpend = computed(() =>
    this.expenseStore.todayEntries().reduce((s, e) => s + e.amount, 0)
  );

  readonly weekSpend = computed(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const startStr = sevenDaysAgo.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    return this.expenseStore
      .entries()
      .filter((e) => e.date >= startStr && e.date <= todayStr)
      .reduce((s, e) => s + e.amount, 0);
  });

  readonly avgPerDay = computed(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthEntries = this.expenseStore
      .entries()
      .filter((e) => e.date.startsWith(currentMonth));
    if (monthEntries.length === 0) return 0;
    const total = monthEntries.reduce((s, e) => s + e.amount, 0);
    const today = new Date();
    const dayOfMonth = today.getDate();
    return total / dayOfMonth;
  });

  constructor() {
    // Recompute all chart data when entries or budgetRuleSummary changes
    effect(() => {
      const entries = this.expenseStore.entries();
      const summary = this.expenseStore.budgetRuleSummary();

      const ytd = this.computeYtdDailyData(entries);
      this.ytdDailyData.set(ytd);
      this.hasYtdData.set(
        (ytd.datasets[0]?.data as number[])?.some((v) => v > 0) ?? false
      );

      const monthly = this.computeMonthlyTypeBreakdown(entries);
      this.monthlyTypeData.set(monthly);
      this.hasMonthlyTypeData.set(
        ((monthly.datasets[0]?.data as number[])?.length ?? 0) > 0
      );

      const sixMonth = this.computeSixMonthComparison(entries);
      this.sixMonthData.set(sixMonth);
      this.hasSixMonthData.set(
        (sixMonth.datasets[0]?.data as number[])?.some((v) => v > 0) ?? false
      );

      const budgetRule = this.computeBudgetRuleChartData(summary);
      this.budgetRuleData.set(budgetRule);
      this.hasBudgetRuleData.set(
        summary.needsTotal > 0 || summary.wantsTotal > 0 || summary.savingsTotal > 0
      );
    });
  }

  ngOnInit(): void {
    // Load current month data if not already loaded
    const currentMonth = new Date().toISOString().slice(0, 7);
    this.expenseStore.loadMonth(currentMonth);

    // Load limits if not already loaded and sheet is configured (needed for budget rule summary)
    const sheetId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    if (
      sheetId &&
      (this.expenseStore.limits().length === 0 || this.expenseStore.monthlyIncome() === 0)
    ) {
      this.expenseStore.loadLimits().catch((err) => {
        console.error('Failed to load limits:', err);
      });
    }
  }

  /**
   * Resolves a CSS variable to its computed color value.
   * Chart.js renders on <canvas> and cannot read CSS variables directly,
   * so we must resolve them at runtime via getComputedStyle.
   */
  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Maps PREDEFINED_EXPENSE_TYPES names to category IDs for color lookup */
  private readonly TYPE_TO_CAT_ID: Record<string, string> = {
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

  // YTD daily line chart
  computeYtdDailyData(entries: ExpenseEntry[]): ChartData {
    const currentYear = new Date().getFullYear().toString();
    const yearEntries = entries.filter((e) => e.date.startsWith(currentYear));

    const dailyMap = new Map<string, number>();
    for (const entry of yearEntries) {
      dailyMap.set(entry.date, (dailyMap.get(entry.date) ?? 0) + entry.amount);
    }

    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const labels: string[] = [];
    const data: number[] = [];

    const cursor = new Date(startOfYear);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      labels.push(dateStr);
      data.push(dailyMap.get(dateStr) ?? 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    const primaryColor = this.cssVar('--primary');

    return {
      labels,
      datasets: [
        {
          label: 'Daily Expenses',
          data,
          borderColor: primaryColor,
          backgroundColor: primaryColor.replace(')', ' / 0.15)').replace('oklch(', 'oklch('),
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }

  // Monthly type breakdown doughnut chart
  computeMonthlyTypeBreakdown(entries: ExpenseEntry[]): ChartData {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthEntries = entries.filter((e) => e.date.startsWith(currentMonth));

    const typeMap = new Map<string, number>();
    for (const entry of monthEntries) {
      typeMap.set(entry.type, (typeMap.get(entry.type) ?? 0) + entry.amount);
    }

    const labels = Array.from(typeMap.keys());
    const data = Array.from(typeMap.values());

    // Map type names (e.g. "Housing") → category colorVar → resolved color
    const backgroundColor = labels.map((typeName) => {
      const catId = this.TYPE_TO_CAT_ID[typeName] ?? 'misc';
      const def = CATEGORY_DEFS.find((c) => c.id === catId);
      return def ? this.cssVar(def.colorVar) : this.cssVar('--cat-misc');
    });

    // Use display names from CATEGORY_DEFS where possible
    const displayLabels = labels.map((typeName) => {
      const catId = this.TYPE_TO_CAT_ID[typeName] ?? 'misc';
      const def = CATEGORY_DEFS.find((c) => c.id === catId);
      return def ? def.name : typeName;
    });

    return {
      labels: displayLabels,
      datasets: [
        {
          label: 'Spending by Type',
          data,
          backgroundColor,
        },
      ],
    };
  }

  // 6-month comparison bar chart
  computeSixMonthComparison(entries: ExpenseEntry[]): ChartData {
    const months: string[] = [];
    const labels: string[] = [];

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
      labels.push(d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
    }

    const data = months.map((month) =>
      entries
        .filter((e) => e.date.startsWith(month))
        .reduce((sum, e) => sum + e.amount, 0)
    );

    return {
      labels,
      datasets: [
        {
          label: 'Monthly Total',
          data,
          backgroundColor: this.cssVar('--primary'),
        },
      ],
    };
  }

  // Budget rule doughnut chart
  computeBudgetRuleChartData(summary: BudgetRuleSummary): ChartData {
    return {
      labels: ['Needs', 'Wants', 'Savings'],
      datasets: [
        {
          label: 'Budget Rule',
          data: [
            summary.needsPercentage,
            summary.wantsPercentage,
            summary.savingsPercentage,
          ],
          backgroundColor: [
            this.cssVar('--cat-transport'),
            this.cssVar('--cat-dining'),
            this.cssVar('--cat-savings'),
          ],
        },
      ],
    };
  }
}
