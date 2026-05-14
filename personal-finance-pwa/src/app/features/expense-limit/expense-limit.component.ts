import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { BudgetCategory, ExpenseLimit } from '../../core/models/expense-limit.model';
import {
  DEFAULT_BUDGET_PERCENTAGES,
  PREDEFINED_EXPENSE_TYPES,
} from '../../core/models/expense-type.constants';
import { METADATA_MONTHLY_INCOME } from '../../core/models/app-metadata.model';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { StorageService } from '../../core/services/storage.service';
import { I18nService } from '../../core/services/i18n.service';
import { CurrencyService } from '../../core/services/currency.service';
import { ModalComponent } from '../../shared/components';
import { CurrencyFormatPipe, TranslatePipe } from '../../shared/pipes';
import { SectionCardComponent } from '../../shared/components/section-card/section-card.component';
import { CategoryIconComponent } from '../../shared/components/category-icon/category-icon.component';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Plus,
  Save,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-angular';
import { CATEGORY_DEFS } from '../../core/models/category-definitions';

const BUDGET_CATEGORIES: BudgetCategory[] = ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'];

/** Maps predefined type names to CATEGORY_DEFS IDs */
const TYPE_TO_CAT_ID: Record<string, string> = {
  'Housing':               'housing',
  'Food & Groceries':      'food',
  'Transportation':        'transport',
  'Utilities':             'utilities',
  'Healthcare':            'health',
  'Entertainment':         'entertainment',
  'Dining Out':            'dining',
  'Shopping/Clothing':     'shopping',
  'Savings/Emergency Fund':'savings',
  'Investments':           'investments',
  'Education':             'education',
  'Personal Care':         'personal',
  'Subscriptions':         'subscriptions',
  'Miscellaneous':         'misc',
};

/** Maps BudgetCategory (capitalized) to group color CSS variable */
const GROUP_COLOR_VARS: Record<BudgetCategory, string> = {
  Needs:   '--cat-transport',
  Wants:   '--cat-dining',
  Savings: '--cat-savings',
  Growth:  '--cat-education',
  Buffer:  '--cat-misc',
};

const BUDGET_GROUPS: BudgetCategory[] = ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'];

@Component({
  selector: 'app-expense-limit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    CurrencyFormatPipe,
    TranslatePipe,
    SectionCardComponent,
    CategoryIconComponent,
    LucideAngularModule,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Plus, Save, AlertTriangle, CheckCircle2 }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <!-- Page header -->
      <div class="mb-4">
        <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{{ 'limits.title' | translate }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'limits.description' | translate }}
        </p>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSave()" novalidate>

        <!-- Monthly Income -->
        <app-section-card
          [title]="'limits.income.title' | translate"
          [description]="'limits.income.description' | translate"
          class="mb-6 block"
        >
          <div class="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 focus-within:border-primary focus-within:shadow-glow transition-all">
            <span class="text-2xl font-semibold text-muted-foreground">{{ currencyService.symbol() }}</span>
            <label for="monthlyIncome" class="sr-only">{{ 'limits.income.title' | translate }}</label>
            <input
              type="number"
              id="monthlyIncome"
              formControlName="monthlyIncome"
              min="0.01"
              step="0.01"
              placeholder="0"
              class="w-full bg-transparent text-2xl font-semibold outline-none"
            />
            <span class="hidden text-xs text-muted-foreground md:inline">{{ 'limits.perMonth' | translate }}</span>
          </div>
          @if (isIncomeInvalid()) {
            <p class="mt-2 text-xs text-destructive">
              {{ 'limits.incomeError' | translate }}
            </p>
          }
        </app-section-card>

        <!-- Spending Limits -->
        <app-section-card
          [title]="'limits.spending.title' | translate"
          [description]="'limits.spending.description' | translate"
          class="mb-6 block"
        >
          <!-- Desktop table -->
          <div class="hidden md:block" formArrayName="limits">
            <div class="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.7fr_0.9fr] gap-3 border-b border-border px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{{ 'limits.category' | translate }}</span>
              <span>{{ 'limits.group' | translate }}</span>
              <span class="text-right">{{ 'limits.recommended' | translate }}</span>
              <span class="text-right">{{ 'limits.yourPercent' | translate }}</span>
              <span class="text-right">{{ 'common.amount' | translate }}</span>
            </div>
            <ul class="mt-1">
              @for (group of limitsArray.controls; track $index; let i = $index) {
                <li
                  class="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.7fr_0.9fr] items-center gap-3 border-b border-border/60 px-2 py-2.5 last:border-0"
                  [formGroupName]="i"
                >
                  <!-- Category -->
                  <div class="flex items-center gap-2.5 min-w-0">
                    <app-category-icon [categoryId]="getCatId(i)" size="sm" />
                    <span class="truncate text-sm font-medium">{{ getDisplayType(i) }}</span>
                  </div>
                  <!-- Group -->
                  <span
                    class="text-xs font-medium"
                    [style.color]="'var(' + getCatColorVar(i) + ')'"
                  >{{ getGroupName(group.get('category')?.value) }}</span>
                  <!-- Rec % -->
                  <span class="text-right text-xs text-muted-foreground">
                    {{ group.get('recommendedPercentage')?.value }}%
                  </span>
                  <!-- Your % input -->
                  <div class="flex justify-end">
                    <label [for]="'pct-desktop-' + i" class="sr-only">{{ getDisplayType(i) }} percentage</label>
                    <input
                      [id]="'pct-desktop-' + i"
                      type="number"
                      formControlName="userPercentage"
                      min="0"
                      max="100"
                      step="0.1"
                      class="w-16 rounded-lg border border-border bg-card/60 px-2 py-1 text-right text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <!-- Amount -->
                  <span class="text-right text-sm font-semibold tabular-nums">
                    {{ group.get('calculatedAmount')?.value | currencyFormat }}
                  </span>
                </li>
              }
            </ul>
          </div>

          <!-- Mobile cards -->
          <ul class="space-y-2.5 md:hidden" formArrayName="limits">
            @for (group of limitsArray.controls; track $index; let i = $index) {
              <li class="rounded-2xl border border-border bg-card/40 p-3" [formGroupName]="i">
                <div class="flex items-center gap-3">
                  <app-category-icon [categoryId]="getCatId(i)" size="md" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">{{ getDisplayType(i) }}</p>
                    <p
                      class="text-[11px]"
                      [style.color]="'var(' + getCatColorVar(i) + ')'"
                    >{{ getGroupName(group.get('category')?.value) }} · rec. {{ group.get('recommendedPercentage')?.value }}%</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <label [for]="'pct-mobile-' + i" class="sr-only">{{ getDisplayType(i) }} percentage</label>
                    <input
                      [id]="'pct-mobile-' + i"
                      type="number"
                      formControlName="userPercentage"
                      min="0"
                      max="100"
                      step="0.1"
                      class="w-14 rounded-lg border border-border bg-card/60 px-2 py-1 text-right text-sm text-foreground outline-none focus:border-primary"
                    />
                    <span class="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div class="mt-2 flex items-center justify-between text-xs">
                  <span class="text-muted-foreground">{{ 'daily.monthlyLimit' | translate }}</span>
                  <span class="font-semibold tabular-nums">
                    {{ group.get('calculatedAmount')?.value | currencyFormat }}
                  </span>
                </div>
              </li>
            }
          </ul>

          <!-- Add Custom Type -->
          <button
            type="button"
            (click)="addCustomType()"
            class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-all hover:border-primary hover:text-primary"
          >
            <lucide-icon [img]="plusIcon" class="h-4 w-4" /> {{ 'limits.addCustom' | translate }}
          </button>
        </app-section-card>

        <!-- Running Total -->
        <app-section-card
          [title]="'limits.running.title' | translate"
          [description]="runningTotal() === 100 ? ('limits.runningBalanced' | translate) : ('limits.runningAdjust' | translate)"
          class="mb-6 block"
        >
          <span action>
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              [class]="runningTotal() === 100 ? 'bg-success/15' : 'bg-destructive/15 animate-pulse'"
              [style.color]="runningTotal() === 100 ? 'var(--success)' : 'var(--destructive)'"
            >
              @if (runningTotal() === 100) {
                <lucide-icon [img]="checkCircle2Icon" class="h-3.5 w-3.5" />
              } @else {
                <lucide-icon [img]="alertTriangleIcon" class="h-3.5 w-3.5" />
              }
              {{ runningTotal() }}%
            </span>
          </span>

          <!-- Stacked bar -->
          <div class="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            @for (group of budgetGroups; track group) {
              <div
                [style.width.%]="getGroupPct(group)"
                [style.background-color]="groupColor(group)"
                [title]="getGroupName(group) + ': ' + getGroupPct(group) + '%'"
              ></div>
            }
          </div>

          <!-- Legend -->
          <ul class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-2">
            @for (group of budgetGroups; track group) {
              <li class="flex items-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2 text-xs">
                <span class="h-2.5 w-2.5 rounded-full" [style.background-color]="groupColor(group)"></span>
                <span class="font-medium">{{ getGroupName(group) }}</span>
                <span class="ml-auto text-muted-foreground">{{ getGroupPct(group) }}%</span>
              </li>
            }
          </ul>
        </app-section-card>

        <!-- Save button -->
        <div class="sticky z-30 md:static md:bottom-auto">
          <button
            type="submit"
            [disabled]="runningTotal() !== 100"
            class="gradient-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-8"
          >
	            <lucide-icon [img]="saveIcon" class="h-4 w-4" /> {{ 'limits.save' | translate }}
          </button>
        </div>

      </form>
    </div>

    <!-- Savings Warning Modal -->
    <app-modal
	      [title]="'limits.lowSavings.title' | translate"
      [isOpen]="showSavingsWarning()"
      (confirmed)="onSavingsWarningConfirmed()"
      (cancelled)="showSavingsWarning.set(false)"
    >
      <p class="text-sm text-muted-foreground">
	        {{ 'limits.lowSavings.description' | translate }}
      </p>
    </app-modal>
  `,
})
export class ExpenseLimitComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly sheetsService = inject(GoogleSheetsService);
  readonly expenseStore = inject(ExpenseStore);
  private readonly storageService = inject(StorageService);
  private readonly i18n = inject(I18nService);
  readonly currencyService = inject(CurrencyService);

  readonly budgetCategories = BUDGET_CATEGORIES;
  readonly budgetGroups = BUDGET_GROUPS;

  getDisplayType(index: number): string {
    const type = this.limitsArray.at(index)?.get('type')?.value as string | null;
    if (!type) return '';
    const categoryId = TYPE_TO_CAT_ID[type];
    if (!categoryId) return type;
    return this.i18n.t(`category.${categoryId}`);
  }

  getGroupName(group: unknown): string {
    const key = String(group ?? '').toLowerCase();
    const translated = this.i18n.t(`budgetGroup.${key}`);
    return translated.startsWith('budgetGroup.') ? String(group ?? '') : translated;
  }

  // Lucide icon references for template use
  readonly plusIcon = Plus;
  readonly saveIcon = Save;
  readonly alertTriangleIcon = AlertTriangle;
  readonly checkCircle2Icon = CheckCircle2;

  // Task 10.3: running total signal
  readonly runningTotal = signal(0);

  // Task 10.5: modal and save state
  readonly showSavingsWarning = signal(false);
  readonly saveSuccess = signal(false);

  private subscription?: Subscription;
  private pendingSave = false;

  // Task 10.1: Reactive form
  readonly form = this.fb.group({
    monthlyIncome: [null as number | null, [Validators.required, Validators.min(0.01)]],
    limits: this.fb.array(
      PREDEFINED_EXPENSE_TYPES.map((type) =>
        this.createPredefinedGroup(type)
      )
    ),
  });

  get limitsArray(): FormArray {
    return this.form.get('limits') as FormArray;
  }

  constructor() {
    // Re-populate the form whenever the store's limits or income change.
    // This handles both the immediate case (data already in store) and the
    // async case (data arrives after App.ngOnInit() finishes loading).
    effect(() => {
      // Track these signals so the effect re-runs when they change
      const income = this.expenseStore.monthlyIncome();
      const limits = this.expenseStore.limits();

      // Use untracked to avoid tracking form signals inside the effect
      untracked(() => {
        if (income > 0 || limits.length > 0) {
          this.#populateFromStore();
        }
      });
    });
  }

  async ngOnInit(): Promise<void> {
    // Task 10.2: Subscribe to form value changes to recalculate amounts
    this.subscription = this.form.valueChanges.subscribe(() => {
      this.recalculateAmounts();
      this.updateRunningTotal();
    });

    // Populate immediately in case data is already in the store
    this.#populateFromStore();

    // Data is loaded from Google Drive on app bootstrap — no per-component fetch needed.
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  isPredefined(index: number): boolean {
    return index < PREDEFINED_EXPENSE_TYPES.length;
  }

  isIncomeInvalid(): boolean {
    const ctrl = this.form.get('monthlyIncome');
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  isCustomTypeInvalid(group: AbstractControl): boolean {
    const ctrl = group.get('type');
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  /** Returns the CATEGORY_DEFS id for the limit at the given index */
  getCatId(index: number): string {
    const typeName = this.limitsArray.controls[index]?.get('type')?.value as string;
    return TYPE_TO_CAT_ID[typeName] ?? 'misc';
  }

  /** Returns the CSS variable name (without var()) for the category color at the given index */
  getCatColorVar(index: number): string {
    const catId = this.getCatId(index);
    const def = CATEGORY_DEFS.find((c) => c.id === catId);
    return def?.colorVar ?? '--cat-misc';
  }

  /** Sums userPercentage for all limits in the given budget group */
  getGroupPct(group: BudgetCategory): number {
    let total = 0;
    for (const ctrl of this.limitsArray.controls) {
      const category = ctrl.get('category')?.value as BudgetCategory;
      if (category === group) {
        total += Number(ctrl.get('userPercentage')?.value) || 0;
      }
    }
    return Math.round(total * 10) / 10;
  }

  /** Returns the CSS color value for the given budget group */
  groupColor(group: BudgetCategory): string {
    return `var(${GROUP_COLOR_VARS[group] ?? '--cat-misc'})`;
  }

  // Task 10.3: Needs+Wants > 80% check
  isNeedsWantsOver80 = computed(() => {
    const controls = this.limitsArray.controls;
    let needsWantsTotal = 0;
    for (const ctrl of controls) {
      const category = ctrl.get('category')?.value as BudgetCategory;
      const pct = ctrl.get('userPercentage')?.value ?? 0;
      if (category === 'Needs' || category === 'Wants') {
        needsWantsTotal += Number(pct) || 0;
      }
    }
    return needsWantsTotal > 80;
  });

  // Task 10.4: Add custom type
  addCustomType(): void {
    const group = this.fb.group({
      type: ['', [Validators.required]],
      category: ['Wants' as BudgetCategory],
      recommendedPercentage: [{ value: 0, disabled: true }],
      userPercentage: [0, [Validators.min(0), Validators.max(100)]],
      calculatedAmount: [{ value: 0, disabled: true }],
    });
    this.limitsArray.push(group);
  }

  // Remove custom type
  removeCustomType(index: number): void {
    if (this.isPredefined(index)) {
      return; // Safety check - should never happen
    }
    if (confirm('Remove this custom expense type?')) {
      this.limitsArray.removeAt(index);
    }
  }

  // Task 10.5: Save handler
  onSave(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const savingsPct = this.getSavingsPercentage();
    if (savingsPct < 20) {
      this.pendingSave = true;
      this.showSavingsWarning.set(true);
    } else {
      this.executeSave();
    }
  }

  onSavingsWarningConfirmed(): void {
    this.showSavingsWarning.set(false);
    if (this.pendingSave) {
      this.pendingSave = false;
      this.executeSave();
    }
  }

  /** Fills the form with whatever is already in the store (income + percentages). */
  #populateFromStore(): void {
    const income = this.expenseStore.monthlyIncome();
    const storeLimits = this.expenseStore.limits();

    if (income > 0) {
      this.form.get('monthlyIncome')?.setValue(income, { emitEvent: false });
    }

    if (storeLimits.length > 0) {
      const limitMap = new Map(storeLimits.map((l) => [l.type, l]));

      for (const group of this.limitsArray.controls) {
        const type = group.get('type')?.value as string;
        const stored = limitMap.get(type);
        if (stored) {
          group.get('userPercentage')?.setValue(stored.userPercentage, { emitEvent: false });
        }
      }
    }

    // Recalculate amounts and running total with the restored values
    this.recalculateAmounts();
    this.updateRunningTotal();
  }

  private createPredefinedGroup(type: string): FormGroup {
    const defaults = DEFAULT_BUDGET_PERCENTAGES[type];
    return this.fb.group({
      type: [{ value: type, disabled: true }],
      category: [{ value: defaults.category, disabled: true }],
      recommendedPercentage: [{ value: defaults.recommendedPercentage, disabled: true }],
      userPercentage: [
        defaults.recommendedPercentage,
        [Validators.min(0), Validators.max(100)],
      ],
      calculatedAmount: [{ value: 0, disabled: true }],
    });
  }

  private recalculateAmounts(): void {
    const income = Number(this.form.get('monthlyIncome')?.value) || 0;
    for (const group of this.limitsArray.controls) {
      const pct = Number(group.get('userPercentage')?.value) || 0;
      const amount = income * (pct / 100);
      group.get('calculatedAmount')?.setValue(amount, { emitEvent: false });
    }
  }

  private updateRunningTotal(): void {
    let total = 0;
    for (const ctrl of this.limitsArray.controls) {
      total += Number(ctrl.get('userPercentage')?.value) || 0;
    }
    this.runningTotal.set(Math.round(total * 10) / 10);
  }

  private getSavingsPercentage(): number {
    let savingsPct = 0;
    for (const ctrl of this.limitsArray.controls) {
      const category = ctrl.get('category')?.value as BudgetCategory;
      const pct = Number(ctrl.get('userPercentage')?.value) || 0;
      if (category === 'Savings' || category === 'Growth') {
        savingsPct += pct;
      }
    }
    return savingsPct;
  }

  private async executeSave(): Promise<void> {
    const income = Number(this.form.get('monthlyIncome')?.value) || 0;

    const limits: ExpenseLimit[] = this.limitsArray.controls.map((ctrl) => ({
      type: ctrl.get('type')?.value as string,
      category: ctrl.get('category')?.value as BudgetCategory,
      recommendedPercentage: Number(ctrl.get('recommendedPercentage')?.value) || 0,
      userPercentage: Number(ctrl.get('userPercentage')?.value) || 0,
    }));

    // setLimitsAndIncome automatically persists to Google Drive
    this.expenseStore.setLimitsAndIncome(limits, income);
    this.saveSuccess.set(true);
    setTimeout(() => this.saveSuccess.set(false), 3000);
  }
}
