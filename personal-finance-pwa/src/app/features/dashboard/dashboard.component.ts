import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ChartData } from 'chart.js/auto';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { BudgetRuleSummary } from '../../core/models/budget-rule-summary.model';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { CardComponent, ChartBaseComponent } from '../../shared/components';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CardComponent, ChartBaseComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <h1 class="mb-4 text-xl font-semibold text-gray-900">Dashboard</h1>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">

        <!-- YTD Daily Line Chart -->
        <app-card>
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Year-to-Date Daily Expenses</h2>
          @if (hasYtdData()) {
            <app-chart-base type="line" [data]="ytdDailyData()" />
          } @else {
            <p class="py-8 text-center text-sm text-gray-500">
              No expense data available for this year.
            </p>
          }
        </app-card>

        <!-- Monthly Type Breakdown Pie Chart -->
        <app-card>
          <h2 class="mb-3 text-sm font-semibold text-gray-700">This Month by Type</h2>
          @if (hasMonthlyTypeData()) {
            <app-chart-base type="pie" [data]="monthlyTypeData()" />
          } @else {
            <p class="py-8 text-center text-sm text-gray-500">
              No expense data for the current month.
            </p>
          }
        </app-card>

        <!-- 6-Month Comparison Bar Chart -->
        <app-card>
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Last 6 Months</h2>
          @if (hasSixMonthData()) {
            <app-chart-base type="bar" [data]="sixMonthData()" />
          } @else {
            <p class="py-8 text-center text-sm text-gray-500">
              No expense data for the last 6 months.
            </p>
          }
        </app-card>

        <!-- Budget Rule Donut Chart -->
        <app-card>
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Budget Rule (50/30/20)</h2>
          @if (hasBudgetRuleData()) {
            <app-chart-base type="doughnut" [data]="budgetRuleData()" />
          } @else {
            <p class="py-8 text-center text-sm text-gray-500">
              No expense data to display budget breakdown.
            </p>
          }
        </app-card>

      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  readonly expenseStore = inject(ExpenseStore);

  // Task 11.1: Four ChartData signals
  readonly ytdDailyData = signal<ChartData>({ datasets: [] });
  readonly monthlyTypeData = signal<ChartData>({ datasets: [] });
  readonly sixMonthData = signal<ChartData>({ datasets: [] });
  readonly budgetRuleData = signal<ChartData>({ datasets: [] });

  // Empty-state helpers
  readonly hasYtdData = signal(false);
  readonly hasMonthlyTypeData = signal(false);
  readonly hasSixMonthData = signal(false);
  readonly hasBudgetRuleData = signal(false);

  constructor() {
    // Task 11.1: effect() recomputes all chart data when entries or selectedMonth changes
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
    const sheetId = typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    if (sheetId && (this.expenseStore.limits().length === 0 || this.expenseStore.monthlyIncome() === 0)) {
      this.expenseStore.loadLimits().catch(err => {
        console.error('Failed to load limits:', err);
      });
    }
  }

  // Task 11.2: YTD daily line chart
  computeYtdDailyData(entries: ExpenseEntry[]): ChartData {
    const currentYear = new Date().getFullYear().toString();
    const yearEntries = entries.filter((e) => e.date.startsWith(currentYear));

    // Build a map of date → total
    const dailyMap = new Map<string, number>();
    for (const entry of yearEntries) {
      dailyMap.set(entry.date, (dailyMap.get(entry.date) ?? 0) + entry.amount);
    }

    // Generate all days from Jan 1 to today
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

    return {
      labels,
      datasets: [
        {
          label: 'Daily Expenses',
          data,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }

  // Task 11.3: Monthly type breakdown pie chart
  computeMonthlyTypeBreakdown(entries: ExpenseEntry[]): ChartData {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthEntries = entries.filter((e) => e.date.startsWith(currentMonth));

    const typeMap = new Map<string, number>();
    for (const entry of monthEntries) {
      typeMap.set(entry.type, (typeMap.get(entry.type) ?? 0) + entry.amount);
    }

    const labels = Array.from(typeMap.keys());
    const data = Array.from(typeMap.values());

    return {
      labels,
      datasets: [
        {
          label: 'Spending by Type',
          data,
          backgroundColor: [
            '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
            '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
            '#14b8a6', '#f43f5e', '#a855f7', '#22c55e',
          ],
        },
      ],
    };
  }

  // Task 11.4: 6-month comparison bar chart
  computeSixMonthComparison(entries: ExpenseEntry[]): ChartData {
    const months: string[] = [];
    const labels: string[] = [];

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toISOString().slice(0, 7); // YYYY-MM
      months.push(monthKey);
      labels.push(
        d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      );
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
          backgroundColor: '#3b82f6',
        },
      ],
    };
  }

  // Task 11.5: Budget rule donut chart
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
          backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'],
        },
      ],
    };
  }
}
