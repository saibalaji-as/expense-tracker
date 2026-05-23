import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js/auto';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { BudgetRuleSummary } from '../../core/models/budget-rule-summary.model';
import { getCategoryDefByName } from '../../core/models/category-definitions';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { StorageService } from '../../core/services/storage.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { I18nService } from '../../core/services/i18n.service';
import { CurrencyService } from '../../core/services/currency.service';
import { AiInsightPayload, AiInsightSection, AiInsightService } from '../../core/services/ai-insight.service';
import { ChartBaseComponent, SectionCardComponent } from '../../shared/components';
import { CurrencyFormatPipe, TranslatePipe } from '../../shared/pipes';
import { parseLocalDate, toLocalDateString } from '../../core/utils/local-date';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Sparkles,
  ArrowRight,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Users,
} from 'lucide-angular';

interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  amount: number;
  type: string;
  time: string;
  comment?: string;
}

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
      useValue: new LucideIconProvider({ Sparkles, ArrowRight, Activity, AlertTriangle, CheckCircle2, Clock3, Lightbulb, Users }),
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

      <!-- Phase 1 deterministic insights -->
      <div class="mb-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section class="glass-card overflow-hidden p-0">
          <div class="border-b border-border/60 bg-primary/5 px-5 py-4 md:px-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
                    <lucide-icon name="sparkles" class="h-4 w-4" />
                  </span>
                  <div>
                    <h2 class="text-base font-semibold tracking-tight md:text-lg">{{ 'dashboard.insights.title' | translate }}</h2>
                    <p class="mt-0.5 text-xs text-muted-foreground md:text-sm">{{ 'dashboard.insights.description' | translate }}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                class="group relative inline-flex shrink-0 touch-manipulation select-none items-center gap-2 overflow-hidden rounded-2xl border border-primary/25 bg-background/80 px-3.5 py-2 text-xs font-semibold text-primary shadow-sm transition-all duration-150 active:scale-[0.98] active:border-primary/40 active:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 min-[887px]:hover:-translate-y-0.5 min-[887px]:hover:border-primary/50 min-[887px]:hover:shadow-glow"
                [disabled]="aiInsightLoading() || !aiInsightPayload()"
                (click)="onGenerateAiInsights($event)"
                (pointerdown)="releaseAiButton($event)"
                (pointerup)="releaseAiButton($event)"
                (pointercancel)="releaseAiButton($event)"
                (pointerleave)="releaseAiButton($event)"
              >
                <span class="absolute inset-0 bg-gradient-to-r from-primary/15 via-accent/15 to-primary/10 opacity-80 transition-opacity min-[887px]:group-hover:opacity-100"></span>
                <span class="relative grid h-7 w-7 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
                  <lucide-icon name="sparkles" class="h-3.5 w-3.5" />
                </span>
                <span class="relative whitespace-nowrap">
                  @if (aiInsightLoading()) {
                    {{ 'dashboard.insights.aiButtonLoading' | translate }}
                  } @else if (geminiInsightSections()?.length) {
                    {{ 'dashboard.insights.aiButtonReview' | translate }}
                  } @else {
                    {{ 'dashboard.insights.aiButton' | translate }}
                  }
                </span>
              </button>
            </div>
          </div>
          @if (displayInsightSections().length > 0) {
            <div class="space-y-4 p-5 md:p-6">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div class="rounded-2xl border border-border/80 bg-background/55 px-3 py-2.5">
                  <p class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ 'dashboard.insights.weekTotal' | translate }}</p>
                  <p class="mt-1 text-base font-semibold tabular-nums">{{ weeklyInsightSummary().total | currencyFormat }}</p>
                </div>
                <div class="rounded-2xl border border-border/80 bg-background/55 px-3 py-2.5">
                  <p class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ 'dashboard.insights.vsLastWeek' | translate }}</p>
                  <p class="mt-1 text-base font-semibold tabular-nums" [class.text-destructive]="weeklyInsightSummary().delta > 0" [style.color]="weeklyInsightSummary().delta < 0 ? 'var(--success)' : null">
                    {{ weeklyInsightSummary().delta > 0 ? '+' : '' }}{{ weeklyInsightSummary().delta | currencyFormat }}
                  </p>
                </div>
                <div class="rounded-2xl border border-border/80 bg-background/55 px-3 py-2.5">
                  <p class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ 'dashboard.insights.monthForecast' | translate }}</p>
                  <p class="mt-1 text-base font-semibold tabular-nums">{{ monthlyForecast() | currencyFormat }}</p>
                </div>
              </div>

              <div class="grid gap-3">
                @for (insight of displayInsightSections(); track insight.label) {
                  <div
                    class="rounded-2xl border px-3.5 py-3"
                    [class.border-emerald-400\/30]="insight.tone === 'good'"
                    [class.bg-emerald-400\/10]="insight.tone === 'good'"
                    [class.border-amber-400\/30]="insight.tone === 'warn'"
                    [class.bg-amber-400\/10]="insight.tone === 'warn'"
                    [class.border-primary\/25]="insight.tone === 'info'"
                    [class.bg-primary\/10]="insight.tone === 'info'"
                  >
                    <div class="flex items-start gap-2">
                      <span
                        class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                        [class.bg-emerald-400\/15]="insight.tone === 'good'"
                        [class.text-emerald-600]="insight.tone === 'good'"
                        [class.bg-amber-400\/15]="insight.tone === 'warn'"
                        [class.text-amber-600]="insight.tone === 'warn'"
                        [class.bg-primary\/15]="insight.tone === 'info'"
                        [class.text-primary]="insight.tone === 'info'"
                      >
                        <lucide-icon [name]="insight.icon" class="h-4 w-4" />
                      </span>
                      <div class="min-w-0">
                        <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{{ insight.label }}</p>
                        <p class="text-sm font-semibold text-foreground">{{ insight.title }}</p>
                        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ insight.detail }}</p>
                      </div>
                    </div>
                  </div>
                }
              </div>

              @if (geminiInsightSections()?.length || aiInsightLoading() || aiInsightStatusTitle()) {
                <div id="gemini-insights-block" #geminiInsightsBlock class="scroll-mt-24 border-t border-border/60 pt-4">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 class="text-sm font-semibold tracking-tight">{{ 'dashboard.insights.geminiDeepDiveTitle' | translate }}</h3>
                      <p class="mt-0.5 text-xs text-muted-foreground">{{ 'dashboard.insights.geminiDeepDiveDescription' | translate }}</p>
                    </div>
                    <span class="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                      {{ 'dashboard.insights.geminiBadge' | translate }}
                    </span>
                  </div>

                  @if (aiInsightLoading() && !geminiInsightSections()?.length) {
                    <div class="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
                      {{ 'dashboard.insights.geminiLoading' | translate }}
                    </div>
                  } @else if (!geminiInsightSections()?.length && aiInsightStatusTitle()) {
                    <div
                      class="rounded-2xl border p-4"
                      [class.border-amber-400\/30]="aiInsightNeedsKey()"
                      [class.bg-amber-400\/10]="aiInsightNeedsKey()"
                      [class.border-primary\/25]="!aiInsightNeedsKey()"
                      [class.bg-primary\/10]="!aiInsightNeedsKey()"
                    >
                      <div class="flex items-start gap-3">
                        <span
                          class="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                          [class.bg-amber-400\/15]="aiInsightNeedsKey()"
                          [class.text-amber-600]="aiInsightNeedsKey()"
                          [class.bg-primary\/15]="!aiInsightNeedsKey()"
                          [class.text-primary]="!aiInsightNeedsKey()"
                        >
                          <lucide-icon [name]="aiInsightNeedsKey() ? 'alert-triangle' : 'lightbulb'" class="h-4 w-4" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="text-sm font-semibold text-foreground">{{ aiInsightStatusTitle() }}</p>
                          <p class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ aiInsightStatusDetail() }}</p>
                          @if (aiInsightNeedsKey()) {
                            <a
                              routerLink="/settings"
                              class="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-background/80 px-3 py-2 text-xs font-semibold text-primary shadow-sm transition-all hover:border-primary/50 hover:shadow-glow"
                            >
                              {{ 'dashboard.insights.openAiSettings' | translate }}
                              <lucide-icon name="arrow-right" class="h-3.5 w-3.5" />
                            </a>
                          }
                        </div>
                      </div>
                    </div>
                  } @else {
                    <div class="grid gap-3">
                      @for (insight of geminiInsightSections(); track insight.label) {
                        <div
                          class="rounded-2xl border px-3.5 py-3"
                          [class.border-emerald-400\/30]="insight.tone === 'good'"
                          [class.bg-emerald-400\/10]="insight.tone === 'good'"
                          [class.border-amber-400\/30]="insight.tone === 'warn'"
                          [class.bg-amber-400\/10]="insight.tone === 'warn'"
                          [class.border-primary\/25]="insight.tone === 'info'"
                          [class.bg-primary\/10]="insight.tone === 'info'"
                        >
                          <div class="flex items-start gap-2">
                            <span
                              class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                              [class.bg-emerald-400\/15]="insight.tone === 'good'"
                              [class.text-emerald-600]="insight.tone === 'good'"
                              [class.bg-amber-400\/15]="insight.tone === 'warn'"
                              [class.text-amber-600]="insight.tone === 'warn'"
                              [class.bg-primary\/15]="insight.tone === 'info'"
                              [class.text-primary]="insight.tone === 'info'"
                            >
                              <lucide-icon [name]="insight.icon" class="h-4 w-4" />
                            </span>
                            <div class="min-w-0">
                              <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{{ insight.label }}</p>
                              <p class="text-sm font-semibold text-foreground">{{ insight.title }}</p>
                              <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ insight.detail }}</p>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  }
                  @if (geminiInsightSections()?.length && aiInsightStatusDetail()) {
                    <p class="mt-3 text-xs text-muted-foreground">{{ aiInsightStatusDetail() }}</p>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="m-5 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground md:m-6">
              {{ 'dashboard.insights.empty' | translate }}
            </div>
          }
        </section>

        <section class="glass-card overflow-hidden p-0">
          <div class="border-b border-border/60 px-5 py-4 md:px-6">
            <div class="flex items-center gap-2">
              <span class="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="activity" class="h-4 w-4" />
              </span>
              <div>
                <h2 class="text-base font-semibold tracking-tight md:text-lg">{{ 'dashboard.activity.title' | translate }}</h2>
                <p class="mt-0.5 text-xs text-muted-foreground md:text-sm">{{ activityDescription() }}</p>
              </div>
            </div>
          </div>
          @if (activityTimeline().length > 0) {
            <div class="max-h-[372px] space-y-2 overflow-y-auto p-5 pr-3 md:p-6 md:pr-4">
              @for (item of activityTimeline(); track item.id) {
                <div class="flex gap-3 rounded-2xl border border-border/80 bg-background/55 p-3 transition-all hover:border-primary/30">
                  <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <lucide-icon name="users" class="h-4 w-4" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold">{{ item.actor }}</p>
                        <p class="text-xs text-muted-foreground">{{ item.action }} · {{ item.type }}</p>
                      </div>
                      <div class="shrink-0 text-right">
                        <p class="text-sm font-semibold">{{ item.amount | currencyFormat }}</p>
                        <p class="text-[10px] text-muted-foreground">{{ item.time }}</p>
                      </div>
                    </div>
                    @if (item.comment) {
                      <p class="mt-1 truncate text-xs text-muted-foreground">{{ item.comment }}</p>
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="m-5 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground md:m-6">
              {{ 'dashboard.activity.empty' | translate }}
            </div>
          }
        </section>
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
  private readonly backupModeService = inject(BackupModeService);
  private readonly i18n = inject(I18nService);
  private readonly currencyService = inject(CurrencyService);
  private readonly aiInsightService = inject(AiInsightService);
  @ViewChild('geminiInsightsBlock') private geminiInsightsBlock?: ElementRef<HTMLElement>;

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
  readonly geminiInsightSections = signal<AiInsightSection[] | null>(null);
  readonly aiInsightProvider = signal<'local' | 'gemini'>('local');
  readonly aiInsightLoading = signal(false);
  readonly aiInsightStatusTitle = signal('');
  readonly aiInsightStatusDetail = signal('');
  readonly aiInsightNeedsKey = signal(false);
  private aiInsightRequestId = 0;
  private aiInsightHydrateRequestId = 0;
  private displayedAiPayloadKey = '';
  private hydratedAiPayloadKey = '';

  // Quick-stat computed signals
  readonly todaySpend = computed(() =>
    this.expenseStore.todayEntries().reduce((s, e) => s + e.amount, 0)
  );

  readonly weekSpend = computed(() => {
    const now = parseLocalDate(toLocalDateString());
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const startStr = toLocalDateString(sevenDaysAgo);
    const todayStr = toLocalDateString(now);
    return this.expenseStore
      .entries()
      .filter((e) => e.date >= startStr && e.date <= todayStr)
      .reduce((s, e) => s + e.amount, 0);
  });

  readonly avgPerDay = computed(() => {
    const currentMonth = toLocalDateString().slice(0, 7);
    const monthEntries = this.expenseStore
      .entries()
      .filter((e) => e.date.startsWith(currentMonth));
    if (monthEntries.length === 0) return 0;
    const total = monthEntries.reduce((s, e) => s + e.amount, 0);
    const today = new Date();
    const dayOfMonth = today.getDate();
    return total / dayOfMonth;
  });

  readonly weeklyInsightSummary = computed(() => {
    const entries = this.expenseStore.entries();
    const current = this.entriesBetween(entries, 6, 0);
    const previous = this.entriesBetween(entries, 13, 7);
    const total = this.sumEntries(current);
    const previousTotal = this.sumEntries(previous);
    return {
      total,
      previousTotal,
      delta: Number((total - previousTotal).toFixed(2)),
      topCategory: this.topCategory(current),
    };
  });

  readonly monthlyForecast = computed(() => {
    const today = parseLocalDate(toLocalDateString());
    const month = toLocalDateString().slice(0, 7);
    const monthEntries = this.expenseStore.entries().filter((entry) => entry.date.startsWith(month));
    const spent = this.sumEntries(monthEntries);
    const daysElapsed = Math.max(1, today.getDate());
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return Math.round((spent / daysElapsed) * daysInMonth);
  });

  readonly displayInsightSections = computed<AiInsightSection[]>(() =>
    this.localInsightSections()
  );

  readonly localInsightSections = computed<AiInsightSection[]>(() => {
    const entries = this.expenseStore.entries();
    const current = this.entriesBetween(entries, 6, 0);
    if (current.length === 0) return [];

    const summary = this.weeklyInsightSummary();
    const warnings = this.categoryLimitWarnings();
    const topCategory = summary.topCategory;
    const sections: AiInsightSection[] = [];

    sections.push({
      label: this.i18n.t('dashboard.insights.weeklySummary'),
      tone: 'info',
      icon: 'sparkles',
      title: this.i18n.t('dashboard.insights.weeklySummaryTitle', { amount: this.formatMoney(summary.total) }),
      detail: this.i18n.t('dashboard.insights.weeklySummaryDetail', {
        count: current.length,
        comparison: this.formatMoney(Math.abs(summary.delta)),
        direction: summary.delta > 0
          ? this.i18n.t('dashboard.insights.moreThanLastWeek')
          : summary.delta < 0
            ? this.i18n.t('dashboard.insights.lessThanLastWeek')
            : this.i18n.t('dashboard.insights.sameAsLastWeek'),
      }),
    });

    sections.push({
      label: this.i18n.t('dashboard.insights.wins'),
      tone: summary.delta <= 0 ? 'good' : 'info',
      icon: 'check-circle-2',
      title: summary.delta <= 0
        ? this.i18n.t('dashboard.insights.spendDownTitle')
        : this.i18n.t('dashboard.insights.loggingWinTitle'),
      detail: summary.delta <= 0
        ? this.i18n.t('dashboard.insights.spendDownDetail', { amount: this.formatMoney(Math.abs(summary.delta)) })
        : this.i18n.t('dashboard.insights.loggingWinDetail', { count: current.length }),
    });

    if (warnings.length > 0) {
      const warning = warnings[0];
      sections.push({
        label: this.i18n.t('dashboard.insights.warnings'),
        tone: 'warn',
        icon: 'alert-triangle',
        title: this.i18n.t('dashboard.insights.limitRiskTitle'),
        detail: this.i18n.t('dashboard.insights.limitRiskDetail', {
          category: warning.type,
          percent: warning.percent,
        }),
      });
    } else {
      sections.push({
        label: this.i18n.t('dashboard.insights.warnings'),
        tone: 'good',
        icon: 'check-circle-2',
        title: this.i18n.t('dashboard.insights.noWarningTitle'),
        detail: this.i18n.t('dashboard.insights.noWarningDetail'),
      });
    }

    if (topCategory) {
      sections.push({
        label: this.i18n.t('dashboard.insights.suggestions'),
        tone: 'info',
        icon: 'lightbulb',
        title: this.i18n.t('dashboard.insights.topCategoryTitle'),
        detail: this.i18n.t('dashboard.insights.topCategoryDetail', {
          category: topCategory.type,
          amount: this.formatMoney(topCategory.amount),
        }),
      });
    } else {
      sections.push({
        label: this.i18n.t('dashboard.insights.suggestions'),
        tone: 'info',
        icon: 'lightbulb',
        title: this.i18n.t('dashboard.insights.keepTrackingTitle'),
        detail: this.i18n.t('dashboard.insights.keepTrackingDetail'),
      });
    }

    sections.push({
      label: this.i18n.t('dashboard.insights.forecast'),
      tone: 'info',
      icon: 'clock-3',
      title: this.i18n.t('dashboard.insights.forecastTitle'),
      detail: this.i18n.t('dashboard.insights.forecastDetail', { amount: this.formatMoney(this.monthlyForecast()) }),
    });

    return sections;
  });

  readonly aiInsightPayload = computed<AiInsightPayload | null>(() => {
    const entries = this.expenseStore.entries();
    const current = this.entriesBetween(entries, 6, 0);
    if (current.length === 0) return null;

    const previous = this.entriesBetween(entries, 13, 7);
    const summary = this.weeklyInsightSummary();
    const categoryTotals = this.categoryTotals(current);
    const previousCategoryTotals = this.categoryTotals(previous);
    const month = toLocalDateString().slice(0, 7);
    const monthEntries = entries.filter((entry) => entry.date.startsWith(month));

    return {
      period: 'week',
      mode: 'hybrid-deep-dive',
      locale: this.i18n.locale(),
      currency: this.currencyService.currency(),
      monthlyIncome: this.expenseStore.monthlyIncome(),
      totalSpent: summary.total,
      previousPeriodTotal: this.sumEntries(previous),
      delta: summary.delta,
      entryCount: current.length,
      monthForecast: this.monthlyForecast(),
      categoryTotals,
      budgetUsage: this.budgetUsage(monthEntries),
      topExpenses: [...current]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map((entry) => ({
          date: entry.date,
          amount: entry.amount,
          type: entry.type,
        })),
      dailyTrend: this.dailyTrend(current, 6),
      recentDailyTrend: this.categoryDailyTrend(entries, 89),
      categoryBaselines: this.categoryBaselines(entries),
      categoryChanges: this.categoryChanges(categoryTotals, previousCategoryTotals),
      repeatedExpenses: this.repeatedExpenses(current),
      spendingPattern: this.spendingPattern(current),
      partnerActivity: this.partnerActivity(current),
      budgetIntent: this.budgetIntent(monthEntries),
      monthlySeasonality: this.monthlySeasonality(entries),
      whatIfCuts: this.whatIfCuts(monthEntries),
    };
  });

  readonly activityTimeline = computed<ActivityItem[]>(() => {
    return [...this.expenseStore.entries()]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 8)
      .map((entry) => {
        const isUpdated = !!entry.updatedByRole || !!entry.updatedByEmail;
        return {
          id: entry.id,
          actor: this.actorLabel(entry),
          action: this.i18n.t(isUpdated ? 'dashboard.activity.updated' : 'dashboard.activity.added'),
          amount: entry.amount,
          type: entry.type,
          time: this.relativeTime(entry.timestamp),
          comment: entry.comment,
        };
      });
  });

  readonly activityDescription = computed(() => {
    if (this.backupModeService.getMode() === 'family') {
      return this.i18n.t('dashboard.activity.familyDescription');
    }
    return this.i18n.t('dashboard.activity.singleDescription');
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
    effect(() => {
      const payload = this.aiInsightPayload();
      const payloadKey = payload ? JSON.stringify(payload) : '';
      if (payloadKey !== this.displayedAiPayloadKey) {
        this.geminiInsightSections.set(null);
        this.aiInsightProvider.set('local');
        this.clearAiStatus();
      }

      if (!payload) {
        this.hydratedAiPayloadKey = '';
        return;
      }

      if (payloadKey !== this.hydratedAiPayloadKey) {
        this.hydratedAiPayloadKey = payloadKey;
        void this.hydrateCachedAiInsights(payload, payloadKey);
      }
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

  private formatMoney(amount: number): string {
    return this.currencyService.format(Math.round(amount), this.i18n.locale());
  }

  private entriesBetween(entries: ExpenseEntry[], daysAgoStart: number, daysAgoEnd: number): ExpenseEntry[] {
    const today = parseLocalDate(toLocalDateString());
    const start = new Date(today);
    start.setDate(today.getDate() - daysAgoStart);
    const end = new Date(today);
    end.setDate(today.getDate() - daysAgoEnd);
    const startStr = toLocalDateString(start);
    const endStr = toLocalDateString(end);
    return entries.filter((entry) => entry.date >= startStr && entry.date <= endStr);
  }

  private sumEntries(entries: ExpenseEntry[]): number {
    return entries.reduce((sum, entry) => sum + entry.amount, 0);
  }

  private topCategory(entries: ExpenseEntry[]): { type: string; amount: number } | null {
    const totals = new Map<string, number>();
    for (const entry of entries) {
      totals.set(entry.type, (totals.get(entry.type) ?? 0) + entry.amount);
    }
    const [top] = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return top ? { type: top[0], amount: top[1] } : null;
  }

  private categoryTotals(entries: ExpenseEntry[]): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const entry of entries) {
      totals[entry.type] = Number(((totals[entry.type] ?? 0) + entry.amount).toFixed(2));
    }
    return totals;
  }

  private budgetUsage(entries: ExpenseEntry[]): AiInsightPayload['budgetUsage'] {
    const income = this.expenseStore.monthlyIncome();
    const totals = this.categoryTotals(entries);

    return Object.entries(totals)
      .map(([category, spent]) => {
        const limit = this.expenseStore.limitMap()[category];
        const limitAmount = limit && income > 0 ? (limit.userPercentage * income) / 100 : 0;
        return {
          category,
          spent,
          limit: Number(limitAmount.toFixed(2)),
          percent: limitAmount > 0 ? Math.round((spent / limitAmount) * 100) : 0,
        };
      })
      .sort((a, b) => b.percent - a.percent || b.spent - a.spent)
      .slice(0, 8);
  }

  private dailyTrend(entries: ExpenseEntry[], days: number): AiInsightPayload['dailyTrend'] {
    const today = parseLocalDate(toLocalDateString());
    const byDate = new Map<string, { amount: number; entryCount: number }>();
    for (const entry of entries) {
      const current = byDate.get(entry.date) ?? { amount: 0, entryCount: 0 };
      current.amount = Number((current.amount + entry.amount).toFixed(2));
      current.entryCount += 1;
      byDate.set(entry.date, current);
    }

    return Array.from({ length: days + 1 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (days - index));
      const dateStr = toLocalDateString(date);
      const item = byDate.get(dateStr);
      return {
        date: dateStr,
        amount: item?.amount ?? 0,
        entryCount: item?.entryCount ?? 0,
      };
    });
  }

  private categoryChanges(
    currentTotals: Record<string, number>,
    previousTotals: Record<string, number>
  ): AiInsightPayload['categoryChanges'] {
    const categories = new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)]);
    return [...categories]
      .map((category) => {
        const current = currentTotals[category] ?? 0;
        const previous = previousTotals[category] ?? 0;
        const delta = Number((current - previous).toFixed(2));
        return {
          category,
          current,
          previous,
          delta,
          percentChange: previous > 0 ? Math.round((delta / previous) * 100) : null,
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
  }

  private repeatedExpenses(entries: ExpenseEntry[]): AiInsightPayload['repeatedExpenses'] {
    const groups = new Map<string, { type: string; amount: number; count: number; total: number }>();
    for (const entry of entries) {
      const roundedAmount = Math.round(entry.amount);
      const key = `${entry.type}::${roundedAmount}`;
      const group = groups.get(key) ?? { type: entry.type, amount: roundedAmount, count: 0, total: 0 };
      group.count += 1;
      group.total = Number((group.total + entry.amount).toFixed(2));
      groups.set(key, group);
    }

    return [...groups.values()]
      .filter((group) => group.count >= 2)
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 6);
  }

  private spendingPattern(entries: ExpenseEntry[]): AiInsightPayload['spendingPattern'] {
    const trend = this.dailyTrend(entries, 6);
    const highest = [...trend].sort((a, b) => b.amount - a.amount)[0];
    const sortedAmounts = entries.map((entry) => entry.amount).sort((a, b) => a - b);
    const median = sortedAmounts.length
      ? sortedAmounts[Math.floor(sortedAmounts.length / 2)]
      : 0;
    const largePurchaseThreshold = Math.max(1000, Math.round(median * 3));

    let weekendTotal = 0;
    let weekdayTotal = 0;
    for (const entry of entries) {
      const day = parseLocalDate(entry.date).getDay();
      if (day === 0 || day === 6) {
        weekendTotal += entry.amount;
      } else {
        weekdayTotal += entry.amount;
      }
    }

    return {
      highestDay: highest && highest.amount > 0 ? { date: highest.date, amount: highest.amount } : null,
      weekendTotal: Number(weekendTotal.toFixed(2)),
      weekdayTotal: Number(weekdayTotal.toFixed(2)),
      smallPurchaseCount: entries.filter((entry) => entry.amount <= 100).length,
      largePurchaseThreshold,
      largePurchaseCount: entries.filter((entry) => entry.amount >= largePurchaseThreshold).length,
    };
  }

  private partnerActivity(entries: ExpenseEntry[]): AiInsightPayload['partnerActivity'] {
    const byActor = new Map<string, { actor: string; total: number; count: number }>();
    for (const entry of entries) {
      const actor = this.actorLabel(entry);
      const item = byActor.get(actor) ?? { actor, total: 0, count: 0 };
      item.total = Number((item.total + entry.amount).toFixed(2));
      item.count += 1;
      byActor.set(actor, item);
    }

    return [...byActor.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }

  private categoryDailyTrend(entries: ExpenseEntry[], daysAgo: number): NonNullable<AiInsightPayload['recentDailyTrend']> {
    const today = parseLocalDate(toLocalDateString());
    const start = new Date(today);
    start.setDate(today.getDate() - daysAgo);
    const startStr = toLocalDateString(start);
    const endStr = toLocalDateString(today);
    const byDate = new Map<string, { totals: Record<string, number>; total: number; entryCount: number }>();

    for (const entry of entries.filter((item) => item.date >= startStr && item.date <= endStr)) {
      const item = byDate.get(entry.date) ?? { totals: {}, total: 0, entryCount: 0 };
      item.totals[entry.type] = Number(((item.totals[entry.type] ?? 0) + entry.amount).toFixed(2));
      item.total = Number((item.total + entry.amount).toFixed(2));
      item.entryCount += 1;
      byDate.set(entry.date, item);
    }

    return Array.from({ length: daysAgo + 1 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateStr = toLocalDateString(date);
      return {
        date: dateStr,
        totals: byDate.get(dateStr)?.totals ?? {},
        total: byDate.get(dateStr)?.total ?? 0,
        entryCount: byDate.get(dateStr)?.entryCount ?? 0,
      };
    });
  }

  private categoryBaselines(entries: ExpenseEntry[]): NonNullable<AiInsightPayload['categoryBaselines']> {
    const weeklyTotals = Array.from({ length: 13 }, (_, weekIndex) => {
      const weekEntries = this.entriesBetween(entries, (weekIndex * 7) + 6, weekIndex * 7);
      return this.categoryTotals(weekEntries);
    });
    const [currentTotals, ...baselineWeeks] = weeklyTotals;
    const categories = new Set([
      ...Object.keys(currentTotals ?? {}),
      ...baselineWeeks.flatMap((week) => Object.keys(week)),
    ]);

    return [...categories].map((category) => {
      const samples = baselineWeeks.map((week) => week[category] ?? 0);
      const average = samples.length ? samples.reduce((sum, amount) => sum + amount, 0) / samples.length : 0;
      const variance = samples.length
        ? samples.reduce((sum, amount) => sum + ((amount - average) ** 2), 0) / samples.length
        : 0;
      const stdDev = Math.sqrt(variance);
      const current = currentTotals?.[category] ?? 0;

      return {
        category,
        current: Number(current.toFixed(2)),
        average: Number(average.toFixed(2)),
        zScore: stdDev > 0 ? Number(((current - average) / stdDev).toFixed(2)) : null,
        sampleWeeks: samples.length,
      };
    }).sort((a, b) => Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0)).slice(0, 10);
  }

  private budgetIntent(entries: ExpenseEntry[]): NonNullable<AiInsightPayload['budgetIntent']> {
    const income = this.expenseStore.monthlyIncome();
    const totals = this.categoryTotals(entries);

    return this.expenseStore.limits()
      .map((limit) => {
        const monthlyLimit = income > 0 ? (limit.userPercentage * income) / 100 : 0;
        const monthlySpent = totals[limit.type] ?? 0;
        return {
          category: limit.type,
          group: limit.category,
          targetPercent: limit.userPercentage,
          actualPercent: income > 0 ? Number(((monthlySpent / income) * 100).toFixed(2)) : 0,
          monthlySpent,
          monthlyLimit: Number(monthlyLimit.toFixed(2)),
        };
      })
      .sort((a, b) => Math.abs(b.actualPercent - b.targetPercent) - Math.abs(a.actualPercent - a.targetPercent))
      .slice(0, 12);
  }

  private monthlySeasonality(entries: ExpenseEntry[]): NonNullable<AiInsightPayload['monthlySeasonality']> {
    const byMonth = new Map<string, ExpenseEntry[]>();
    for (const entry of entries) {
      const month = entry.date.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), entry]);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .map(([month, monthEntries]) => ({
        month,
        total: Number(this.sumEntries(monthEntries).toFixed(2)),
        categories: this.categoryTotals(monthEntries),
      }));
  }

  private whatIfCuts(entries: ExpenseEntry[]): NonNullable<AiInsightPayload['whatIfCuts']> {
    const totals = this.categoryTotals(entries);
    const limits = this.expenseStore.limitMap();
    const forecast = this.monthlyForecast();

    return Object.entries(totals)
      .map(([category, monthlySpent]) => {
        const group = limits[category]?.category ?? 'Buffer';
        const cutPercent = group === 'Needs' ? 25 : 50;
        const monthlySavings = Number((monthlySpent * (cutPercent / 100)).toFixed(2));
        return {
          category,
          group,
          monthlySpent,
          cutPercent,
          monthlySavings,
          revisedMonthForecast: Math.max(0, Math.round(forecast - monthlySavings)),
        };
      })
      .filter((item) => item.monthlySavings > 0)
      .sort((a, b) => {
        const aPriority = a.group === 'Wants' || a.group === 'Buffer' ? 1 : 0;
        const bPriority = b.group === 'Wants' || b.group === 'Buffer' ? 1 : 0;
        return bPriority - aPriority || b.monthlySavings - a.monthlySavings;
      })
      .slice(0, 8);
  }

  async onGenerateAiInsights(event?: Event): Promise<void> {
    this.releaseAiButton(event);
    const payload = this.aiInsightPayload();
    const payloadKey = payload ? JSON.stringify(payload) : '';
    if (this.aiInsightLoading()) return;
    if (payload && this.geminiInsightSections()?.length && payloadKey === this.displayedAiPayloadKey) {
      this.scrollToGeminiInsights();
      return;
    }

    await this.refreshAiInsights(payload);
  }

  private async hydrateCachedAiInsights(payload: AiInsightPayload, payloadKey: string): Promise<void> {
    const requestId = ++this.aiInsightHydrateRequestId;
    const cachedResult = await this.aiInsightService.getReusableCachedWeeklyInsights(payload);
    if (requestId !== this.aiInsightHydrateRequestId) return;

    const currentPayload = this.aiInsightPayload();
    if (!currentPayload || JSON.stringify(currentPayload) !== payloadKey) return;
    if (!cachedResult?.sections.length) return;

    this.geminiInsightSections.set(cachedResult.sections);
    this.aiInsightProvider.set(cachedResult.provider);
    this.displayedAiPayloadKey = payloadKey;
    this.aiInsightNeedsKey.set(false);
    this.aiInsightStatusTitle.set('');
    this.aiInsightStatusDetail.set(this.i18n.t('dashboard.insights.cachedStatus'));
  }

  private async refreshAiInsights(payload: AiInsightPayload | null): Promise<void> {
    if (!payload) {
      this.geminiInsightSections.set(null);
      this.aiInsightProvider.set('local');
      this.aiInsightLoading.set(false);
      this.clearAiStatus();
      this.displayedAiPayloadKey = '';
      this.hydratedAiPayloadKey = '';
      return;
    }

    const payloadKey = JSON.stringify(payload);
    const requestId = ++this.aiInsightRequestId;
    this.aiInsightLoading.set(true);
    this.clearAiStatus();
    const availability = await this.aiInsightService.getAvailability();
    if (requestId !== this.aiInsightRequestId) return;

    if (availability === 'missing-key') {
      this.geminiInsightSections.set(null);
      this.aiInsightProvider.set('local');
      this.aiInsightLoading.set(false);
      this.displayedAiPayloadKey = '';
      this.aiInsightNeedsKey.set(true);
      this.aiInsightStatusTitle.set(this.i18n.t('dashboard.insights.apiKeyRequiredTitle'));
      this.aiInsightStatusDetail.set(this.i18n.t('dashboard.insights.apiKeyRequiredDetail'));
      this.scrollToGeminiInsights();
      return;
    }

    const cachedResult = await this.aiInsightService.getReusableCachedWeeklyInsights(payload);
    if (requestId !== this.aiInsightRequestId) return;

    if (cachedResult?.sections.length) {
      this.geminiInsightSections.set(cachedResult.sections);
      this.aiInsightProvider.set(cachedResult.provider);
      this.aiInsightLoading.set(false);
      this.displayedAiPayloadKey = payloadKey;
      this.aiInsightNeedsKey.set(false);
      this.aiInsightStatusTitle.set('');
      this.aiInsightStatusDetail.set(this.i18n.t('dashboard.insights.cachedStatus'));
      this.scrollToGeminiInsights();
      return;
    }

    this.scrollToGeminiInsights();
    const { result, source, retryAfter } = await this.aiInsightService.generateWeeklyInsightsWithSource(payload);
    if (requestId !== this.aiInsightRequestId) return;

    if (result?.sections.length) {
      this.geminiInsightSections.set(result.sections);
      this.aiInsightProvider.set(result.provider);
      this.displayedAiPayloadKey = payloadKey;
      this.aiInsightNeedsKey.set(false);
      this.aiInsightStatusTitle.set('');
      this.aiInsightStatusDetail.set(
        source === 'cache'
          ? this.i18n.t('dashboard.insights.savedFallbackStatus')
          : this.i18n.t('dashboard.insights.freshStatus')
      );
    } else if (source === 'rate-limit') {
      this.geminiInsightSections.set(null);
      this.aiInsightProvider.set('local');
      this.displayedAiPayloadKey = '';
      this.aiInsightNeedsKey.set(false);
      this.aiInsightStatusTitle.set(this.i18n.t('dashboard.insights.rateLimitTitle'));
      this.aiInsightStatusDetail.set(this.i18n.t('dashboard.insights.rateLimitStatus', {
        time: retryAfter ?? 'the reset time',
      }));
    } else {
      this.geminiInsightSections.set(null);
      this.aiInsightProvider.set('local');
      this.displayedAiPayloadKey = '';
      this.aiInsightNeedsKey.set(false);
      this.aiInsightStatusTitle.set(this.i18n.t('dashboard.insights.unavailableTitle'));
      this.aiInsightStatusDetail.set(this.i18n.t('dashboard.insights.unavailableStatus'));
    }
    this.aiInsightLoading.set(false);
    this.scrollToGeminiInsights();
  }

  private clearAiStatus(): void {
    this.aiInsightNeedsKey.set(false);
    this.aiInsightStatusTitle.set('');
    this.aiInsightStatusDetail.set('');
  }

  private scrollToGeminiInsights(): void {
    const scroll = (attempt = 0) => {
      const element = this.geminiInsightsBlock?.nativeElement
        ?? document.getElementById('gemini-insights-block');

      if (!element && attempt < 12) {
        window.setTimeout(() => {
          requestAnimationFrame(() => scroll(attempt + 1));
        }, attempt < 4 ? 16 : 50);
        return;
      }

      if (!element) return;

      const top = Math.max(0, element.getBoundingClientRect().top + this.currentScrollTop());
      this.scrollDocumentTo(top, attempt === 0 ? 'smooth' : 'auto');
      window.setTimeout(() => this.correctGeminiInsightScrollTop(element), 450);
      window.setTimeout(() => this.correctGeminiInsightScrollTop(element), 900);
    };

    window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(scroll);
      });
    }, 0);
  }

  private correctGeminiInsightScrollTop(element: HTMLElement): void {
    const top = Math.max(0, element.getBoundingClientRect().top + this.currentScrollTop());
    if (Math.abs(this.currentScrollTop() - top) <= 2) return;

    this.scrollDocumentTo(top, 'auto');
  }

  private currentScrollTop(): number {
    return window.scrollY
      || document.documentElement.scrollTop
      || document.body.scrollTop
      || 0;
  }

  private scrollDocumentTo(top: number, behavior: ScrollBehavior): void {
    window.scrollTo({
      top,
      behavior,
    });
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  }

  releaseAiButton(event?: Event): void {
    const target = event?.currentTarget;
    if (target instanceof HTMLElement) {
      target.blur();
      window.setTimeout(() => target.blur(), 0);
    }
  }

  private categoryLimitWarnings(): Array<{ type: string; percent: number }> {
    const month = toLocalDateString().slice(0, 7);
    const income = this.expenseStore.monthlyIncome();
    if (income <= 0) return [];

    const totals = new Map<string, number>();
    for (const entry of this.expenseStore.entries().filter((item) => item.date.startsWith(month))) {
      totals.set(entry.type, (totals.get(entry.type) ?? 0) + entry.amount);
    }

    return [...totals.entries()]
      .map(([type, spent]) => {
        const limit = this.expenseStore.limitMap()[type];
        const limitAmount = limit ? (limit.userPercentage * income) / 100 : 0;
        return {
          type,
          percent: limitAmount > 0 ? Math.round((spent / limitAmount) * 100) : 0,
        };
      })
      .filter((item) => item.percent >= 80)
      .sort((a, b) => b.percent - a.percent);
  }

  private actorLabel(entry: ExpenseEntry): string {
    const role = entry.updatedByRole ?? entry.createdByRole;
    const email = entry.updatedByEmail ?? entry.createdByEmail;
    if (email) return this.nameFromEmail(email);
    if (role === 'owner') return this.i18n.t('dashboard.activity.owner');
    if (role === 'partner') return this.i18n.t('dashboard.activity.partner');
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

  private relativeTime(timestamp: string): string {
    const then = new Date(timestamp).getTime();
    if (!Number.isFinite(then)) return '';
    const diffMinutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
    if (diffMinutes < 1) return this.i18n.t('dashboard.activity.now');
    if (diffMinutes < 60) return this.i18n.t('dashboard.activity.minutesAgo', { count: diffMinutes });
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return this.i18n.t('dashboard.activity.hoursAgo', { count: diffHours });
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return this.i18n.t('dashboard.activity.daysAgo', { count: diffDays });
    return new Date(timestamp).toLocaleDateString(this.i18n.locale(), { month: 'short', day: 'numeric' });
  }

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
      const def = getCategoryDefByName(typeName);
      return this.cssVar(def.colorVar);
    });

    // Use display names from CATEGORY_DEFS where possible
    const displayLabels = labels.map((typeName) => {
      const def = getCategoryDefByName(typeName);
      return def.id === 'custom' ? typeName : def.name;
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
