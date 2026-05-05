import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ChartData } from 'chart.js/auto';
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
import { ChartBaseComponent, SectionCardComponent, CategoryIconComponent } from '../../shared/components';
import { CurrencyFormatPipe } from '../../shared/pipes';
import { CATEGORY_DEFS } from '../../core/models/category-definitions';

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
    <div class="space-y-6">
      <!-- Page Header -->
      <div class="flex flex-wrap items-start justify-between gap-3">
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
      <div class="grid gap-4 sm:grid-cols-3">
        <!-- Total Spent -->
        <div class="glass-card relative overflow-hidden p-5">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Total Spent</p>
          <p class="mt-2 text-xl font-semibold tracking-tight md:text-2xl lg:text-3xl break-all">
            {{ totalSpent() | currencyFormat }}
          </p>
          <div class="mt-3">
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15"
              style="color: var(--destructive)"
            >
              <lucide-icon [img]="arrowDownRightIcon" class="h-3 w-3" />
              This month
            </span>
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
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success/15"
              style="color: var(--success)"
            >
              <lucide-icon [img]="arrowUpRightIcon" class="h-3 w-3" />
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
          <div class="mt-3">
            @if (netSavings() >= 0) {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success/15"
                style="color: var(--success)"
              >
                <lucide-icon [img]="arrowUpRightIcon" class="h-3 w-3" />
                Positive
              </span>
            } @else {
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15"
                style="color: var(--destructive)"
              >
                <lucide-icon [img]="arrowDownRightIcon" class="h-3 w-3" />
                Over budget
              </span>
            }
          </div>
        </div>
      </div>

      <!-- Two-column grid: stacks on mobile, 50/50 on tablet, 2/5 + 3/5 on desktop -->
      <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-2">
        <!-- Budget Rule Breakdown -->
        <app-section-card
          title="Budget Rule Breakdown"
          description="Spending by Needs / Wants / Savings / Growth / Buffer"
          className="xl:col-span-2"
        >
          <div class="relative h-56 w-full">
            <app-chart-base type="doughnut" [data]="donutChartData()" />
            <!-- Center overlay -->
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-xs uppercase tracking-widest text-muted-foreground">Total</span>
              <span class="text-base font-semibold">{{ totalSpent() | currencyFormat }}</span>
            </div>
          </div>
          <!-- Legend -->
          <ul class="mt-4 grid grid-cols-1 gap-2">
            @for (item of donutLegend(); track item.name) {
              <li class="flex items-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background-color]="item.color"></span>
                <span class="text-xs font-medium">{{ item.name }}</span>
                <span class="ml-auto text-xs text-muted-foreground tabular-nums">{{ item.value | currencyFormat }}</span>
              </li>
            }
          </ul>
        </app-section-card>

        <!-- Category Breakdown -->
        <app-section-card
          title="Category Breakdown"
          description="How each category compares to its limit"
          className="xl:col-span-3"
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
      labels: ['Needs', 'Wants', 'Savings'],
      datasets: [
        {
          data: [summary.needsTotal, summary.wantsTotal, summary.savingsTotal],
          backgroundColor: [
            this.cssVar('--cat-transport'),
            this.cssVar('--cat-dining'),
            this.cssVar('--cat-savings'),
          ],
        },
      ],
    };
  });

  /** Legend items for the donut chart */
  readonly donutLegend = computed(() => {
    const summary = this.expenseStore.budgetRuleSummary();
    return [
      { name: 'Needs',   value: summary.needsTotal,   color: this.cssVar('--cat-transport') },
      { name: 'Wants',   value: summary.wantsTotal,   color: this.cssVar('--cat-dining') },
      { name: 'Savings', value: summary.savingsTotal, color: this.cssVar('--cat-savings') },
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

  ngOnInit(): void {
    this.expenseStore.loadMonth(this.selectedMonth());

    const sheetId = typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    if (sheetId && (this.expenseStore.limits().length === 0 || this.expenseStore.monthlyIncome() === 0)) {
      this.expenseStore.loadLimits().catch(err => {
        console.error('Failed to load limits:', err);
      });
    }
  }

  prevMonth(): void {
    this.monthOffset.update(o => o - 1);
    this.expenseStore.loadMonth(this.selectedMonth());
  }

  nextMonth(): void {
    this.monthOffset.update(o => o + 1);
    this.expenseStore.loadMonth(this.selectedMonth());
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
}
