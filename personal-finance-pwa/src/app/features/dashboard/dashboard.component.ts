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
import { ChartData, ChartOptions } from 'chart.js/auto';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { BudgetRuleSummary } from '../../core/models/budget-rule-summary.model';
import { CATEGORY_DEFS } from '../../core/models/category-definitions';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { StorageService } from '../../core/services/storage.service';
import { ChartBaseComponent, SectionCardComponent } from '../../shared/components';
import { CurrencyFormatPipe, TranslatePipe } from '../../shared/pipes';
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
    TranslatePipe,
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
    <div>
      <!-- Page header row -->
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{{ 'dashboard.title' | translate }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ 'dashboard.description' | translate }}</p>
        </div>
        <!-- Quick-stat chips -->
        <div class="grid grid-cols-3 gap-3">
          <div class="glass-card px-4 py-2.5">
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ 'dashboard.today' | translate }}</p>
            <p class="text-sm font-semibold tabular-nums">{{ todaySpend() | currencyFormat }}</p>
          </div>
          <div class="glass-card px-4 py-2.5">
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ 'dashboard.week' | translate }}</p>
            <p class="text-sm font-semibold tabular-nums">{{ weekSpend() | currencyFormat }}</p>
          </div>
          <div class="glass-card px-4 py-2.5">
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ 'dashboard.avgDay' | translate }}</p>
            <p class="text-sm font-semibold tabular-nums">{{ avgPerDay() | currencyFormat }}</p>
          </div>
        </div>
      </div>

      <!-- 4-chart grid -->
      <div class="mb-4 grid grid-cols-1 gap-6 md:grid-cols-2">

        <!-- Year-to-date Daily Expenses -->
        <app-section-card
          [title]="'dashboard.ytd.title' | translate"
          [description]="'dashboard.ytd.description' | translate"
        >
          @if (hasYtdData()) {
            <div class="h-64 pt-2">
              <app-chart-base type="line" [data]="ytdDailyData()" />
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {{ 'common.noData' | translate }}
            </div>
          }
        </app-section-card>

        <!-- This Month by Type -->
        <app-section-card
          [title]="'dashboard.monthType.title' | translate"
          [description]="'dashboard.monthType.description' | translate"
        >
          @if (hasMonthlyTypeData()) {
            <div class="space-y-4">
              <div class="h-48">
                <app-chart-base type="doughnut" [data]="monthlyTypeData()" [options]="doughnutOptions" />
              </div>
              <!-- Custom Legend -->
              <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                @for (item of monthlyTypeLegend(); track item.label) {
                  <div class="flex items-center gap-2">
                    <span 
                      class="h-2.5 w-2.5 rounded-full shrink-0"
                      [style.background-color]="item.color"
                    ></span>
                    <span class="truncate text-muted-foreground">{{ item.label }}</span>
                    <span class="ml-auto font-semibold tabular-nums">{{ item.value | currencyFormat }}</span>
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {{ 'common.noData' | translate }}
            </div>
          }
        </app-section-card>

        <!-- Last 6 Months -->
        <app-section-card
          [title]="'dashboard.sixMonths.title' | translate"
          [description]="'dashboard.sixMonths.description' | translate"
        >
          @if (hasSixMonthData()) {
            <div class="h-56">
              <app-chart-base type="bar" [data]="sixMonthData()" />
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {{ 'common.noData' | translate }}
            </div>
          }
        </app-section-card>

        <!-- Budget Rule (50/30/20) -->
        <app-section-card
          [title]="'dashboard.budgetRule.title' | translate"
          [description]="'dashboard.budgetRule.description' | translate"
        >
          @if (hasBudgetRuleData()) {
            <div class="space-y-4">
              <div class="h-48">
                <app-chart-base type="doughnut" [data]="budgetRuleData()" [options]="doughnutOptions" />
              </div>
              <!-- Custom Legend -->
              <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                @for (item of budgetRuleLegend(); track item.label) {
                  <div class="flex items-center gap-2">
                    <span 
                      class="h-2.5 w-2.5 rounded-full shrink-0"
                      [style.background-color]="item.color"
                    ></span>
                    <span class="truncate text-muted-foreground">{{ item.label }}</span>
                    <span class="ml-auto font-semibold tabular-nums">{{ item.value }}%</span>
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {{ 'common.noData' | translate }}
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
            <p class="text-sm font-semibold">{{ 'dashboard.logNew' | translate }}</p>
            <p class="text-xs text-muted-foreground">{{ 'dashboard.logNewHint' | translate }}</p>
          </div>
        </div>
        <lucide-icon name="arrow-right" class="h-5 w-5 text-muted-foreground" />
      </a>

    </div>
  `,
})
export class DashboardComponent implements OnInit {
  readonly expenseStore = inject(ExpenseStore);
  private readonly storageService = inject(StorageService);

  // Chart data signals
  readonly ytdDailyData = signal<ChartData>({ datasets: [] });
  readonly monthlyTypeData = signal<ChartData>({ datasets: [] });
  readonly sixMonthData = signal<ChartData>({ datasets: [] });
  readonly budgetRuleData = signal<ChartData>({ datasets: [] });
  
  // Legend data for monthly type chart
  readonly monthlyTypeLegend = signal<Array<{ label: string; value: number; color: string }>>([]);
  
  // Legend data for budget rule chart
  readonly budgetRuleLegend = signal<Array<{ label: string; value: number; color: string }>>([]);

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

  // Doughnut chart options with cutout for donut effect
  readonly doughnutOptions: any = {
    cutout: '65%',
  };

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

      const { chartData: monthly, legend: monthlyLegend } = this.computeMonthlyTypeBreakdown(entries);
      this.monthlyTypeData.set(monthly);
      this.monthlyTypeLegend.set(monthlyLegend);
      this.hasMonthlyTypeData.set(
        ((monthly.datasets[0]?.data as number[])?.length ?? 0) > 0
      );

      const sixMonth = this.computeSixMonthComparison(entries);
      this.sixMonthData.set(sixMonth);
      this.hasSixMonthData.set(
        (sixMonth.datasets[0]?.data as number[])?.some((v) => v > 0) ?? false
      );

      const { chartData: budgetRule, legend: budgetRuleLegend } = this.computeBudgetRuleChartData(summary);
      this.budgetRuleData.set(budgetRule);
      this.budgetRuleLegend.set(budgetRuleLegend);
      this.hasBudgetRuleData.set(
        summary.needsTotal > 0 || summary.wantsTotal > 0 || summary.savingsTotal > 0
      );
    });
  }

  async ngOnInit(): Promise<void> {
    // Data is loaded from Google Drive on app bootstrap — no per-component fetch needed.
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
    // Show last 30 days instead of full year for better readability
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29); // 30 days including today

    const dailyMap = new Map<string, number>();
    for (const entry of entries) {
      const entryDate = new Date(entry.date);
      if (entryDate >= thirtyDaysAgo && entryDate <= today) {
        dailyMap.set(entry.date, (dailyMap.get(entry.date) ?? 0) + entry.amount);
      }
    }

    const labels: string[] = [];
    const data: number[] = [];

    const cursor = new Date(thirtyDaysAgo);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      // Show day of month as label (1, 3, 5, etc.)
      labels.push(cursor.getDate().toString());
      data.push(dailyMap.get(dateStr) ?? 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    // Use a vibrant purple/blue color for the line
    const lineColor = 'rgb(99, 102, 241)'; // Indigo-500
    const gradientFillColor = 'rgba(99, 102, 241, 0.15)';

    return {
      labels,
      datasets: [
        {
          label: 'Daily Expenses',
          data,
          borderColor: lineColor,
          backgroundColor: gradientFillColor,
          fill: true,
          tension: 0.4, // Smoother curves
          borderWidth: 2.5,
          pointRadius: 0, // Hide points for cleaner look
          pointHoverRadius: 6,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        },
      ],
    };
  }

  // Monthly type breakdown doughnut chart
  computeMonthlyTypeBreakdown(entries: ExpenseEntry[]): { 
    chartData: ChartData; 
    legend: Array<{ label: string; value: number; color: string }> 
  } {
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

    // Create legend data
    const legend = displayLabels.map((label, index) => ({
      label,
      value: data[index],
      color: backgroundColor[index],
    }));

    return {
      chartData: {
        labels: displayLabels,
        datasets: [
          {
            label: 'Spending by Type',
            data,
            backgroundColor,
            borderWidth: 3,
            borderColor: 'rgba(255, 255, 255, 1)',
            spacing: 2,
          },
        ],
      },
      legend,
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
  computeBudgetRuleChartData(summary: BudgetRuleSummary): {
    chartData: ChartData;
    legend: Array<{ label: string; value: number; color: string }>;
  } {
    const labels = ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'];
    const data = [
      summary.needsPercentage,
      summary.wantsPercentage,
      summary.savingsPercentage,
      summary.growthPercentage,
      summary.bufferPercentage,
    ];
    const backgroundColor = [
      this.cssVar('--cat-transport'),
      this.cssVar('--cat-dining'),
      this.cssVar('--cat-savings'),
      this.cssVar('--cat-education'),
      this.cssVar('--cat-misc'),
    ];

    // Create legend data
    const legend = labels.map((label, index) => ({
      label,
      value: Math.round(data[index]),
      color: backgroundColor[index],
    }));

    return {
      chartData: {
        labels,
        datasets: [
          {
            label: 'Budget Rule',
            data,
            backgroundColor,
            borderWidth: 3,
            borderColor: 'rgba(255, 255, 255, 1)',
            spacing: 2,
          },
        ],
      },
      legend,
    };
  }
}
