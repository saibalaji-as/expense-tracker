import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ChartData } from 'chart.js/auto';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { CardComponent, ChartBaseComponent } from '../../shared/components';
import { CurrencyFormatPipe } from '../../shared/pipes';

@Component({
  selector: 'app-monthly-expense',
  standalone: true,
  imports: [CardComponent, ChartBaseComponent, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <h1 class="mb-4 text-xl font-semibold text-gray-900">Monthly Expenses</h1>

      <!-- Month Picker -->
      <div class="mb-6">
        <label for="monthPicker" class="mb-1 block text-sm font-medium text-gray-700">
          Month
        </label>
        <input
          type="month"
          id="monthPicker"
          [value]="selectedMonth()"
          (change)="onMonthChange($event)"
          class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <!-- Summary Cards -->
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <app-card>
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Total Spent</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">
            {{ totalSpent() | currencyFormat }}
          </p>
        </app-card>

        <app-card>
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Total Limit</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">
            {{ totalLimit() | currencyFormat }}
          </p>
        </app-card>

        <app-card>
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Net Savings</p>
          <p
            class="mt-1 text-2xl font-bold"
            [class.text-green-600]="netSavings() >= 0"
            [class.text-red-600]="netSavings() < 0"
          >
            {{ netSavings() | currencyFormat }}
          </p>
        </app-card>
      </div>

      @if (expenseStore.selectedMonthEntries().length === 0) {
        <!-- Empty State -->
        <app-card>
          <p class="py-8 text-center text-gray-500">No expense data for this month</p>
        </app-card>
      } @else {
        <!-- Donut Chart -->
        <app-card class="mb-6 block">
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Budget Rule Breakdown</h2>
          <app-chart-base
            type="doughnut"
            [data]="donutChartData()"
          />
        </app-card>

        <!-- Expense Table -->
        <app-card>
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Expense Breakdown by Type</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th class="pb-2 pr-4">Type</th>
                  <th class="pb-2 pr-4 text-right">Total Spent</th>
                  <th class="pb-2 pr-4 text-right">Configured Limit</th>
                  <th class="pb-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                @for (row of tableRows(); track row.type) {
                  <tr class="border-b border-gray-100 last:border-0">
                    <td class="py-2 pr-4 font-medium text-gray-900">{{ row.type }}</td>
                    <td class="py-2 pr-4 text-right text-gray-700">
                      {{ row.totalSpent | currencyFormat }}
                    </td>
                    <td class="py-2 pr-4 text-right text-gray-700">
                      {{ row.configuredLimit | currencyFormat }}
                    </td>
                    <td
                      class="py-2 text-right font-medium"
                      [class.text-green-600]="row.variance >= 0"
                      [class.text-red-600]="row.variance < 0"
                    >
                      {{ row.variance | currencyFormat }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-card>
      }
    </div>
  `,
})
export class MonthlyExpenseComponent implements OnInit {
  readonly expenseStore = inject(ExpenseStore);

  // Task 9.1: selectedMonth signal defaults to current month
  readonly selectedMonth = signal(new Date().toISOString().slice(0, 7));

  // Task 9.3: Summary computed values
  readonly totalSpent = computed(() =>
    this.expenseStore.selectedMonthEntries().reduce((sum, e) => sum + e.amount, 0)
  );

  readonly totalLimit = computed(() =>
    this.expenseStore.limits().reduce(
      (sum, l) => sum + (l.userPercentage * this.expenseStore.monthlyIncome()) / 100,
      0
    )
  );

  readonly netSavings = computed(() => this.totalLimit() - this.totalSpent());

  // Task 9.4: Donut chart data from budgetRuleSummary
  readonly donutChartData = computed((): ChartData => {
    const summary = this.expenseStore.budgetRuleSummary();
    return {
      labels: ['Needs', 'Wants', 'Savings'],
      datasets: [
        {
          data: [summary.needsTotal, summary.wantsTotal, summary.savingsTotal],
          backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'],
        },
      ],
    };
  });

  // Task 9.5: Table rows grouped by type
  readonly tableRows = computed(() => {
    const entries = this.expenseStore.selectedMonthEntries();
    const limitMap = this.expenseStore.limitMap();
    const income = this.expenseStore.monthlyIncome();

    // Group entries by type and sum amounts
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

  // Task 9.1: call loadMonth on init
  ngOnInit(): void {
    this.expenseStore.loadMonth(this.selectedMonth());
    
    // Load limits if not already loaded and sheet is configured (needed for limit calculations and budget rule summary)
    const sheetId = typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    if (sheetId && (this.expenseStore.limits().length === 0 || this.expenseStore.monthlyIncome() === 0)) {
      this.expenseStore.loadLimits().catch(err => {
        console.error('Failed to load limits:', err);
      });
    }
  }

  // Task 9.2: update selectedMonth and reload
  onMonthChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.selectedMonth.set(value);
      this.expenseStore.loadMonth(value);
    }
  }
}
