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
  getCategoryDef,
  getCategoryIdByName,
} from '../../core/models/category-definitions';
import { METADATA_MONTHLY_INCOME } from '../../core/models/app-metadata.model';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { StorageService } from '../../core/services/storage.service';
import { I18nService } from '../../core/services/i18n.service';
import { CurrencyService } from '../../core/services/currency.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { ModalComponent, ThemedSelectComponent, ThemedSelectOption } from '../../shared/components';
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
  Trash2,
} from 'lucide-angular';

const BUDGET_CATEGORIES: BudgetCategory[] = ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'];

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
    ThemedSelectComponent,
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
      useValue: new LucideIconProvider({ Plus, Save, AlertTriangle, CheckCircle2, Trash2 }),
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

      @if (requiresIncomeSetup()) {
        <div class="mb-6 flex gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-primary shadow-sm">
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/15">
            <lucide-icon [img]="alertTriangleIcon" class="h-5 w-5" />
          </div>
          <div class="min-w-0">
            <p class="font-semibold">{{ 'limits.onboarding.title' | translate }}</p>
            <p class="mt-1 text-sm text-foreground/80">
              {{ 'limits.onboarding.description' | translate }}
            </p>
          </div>
        </div>
      }

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
            <div class="grid grid-cols-[1.6fr_1fr_0.6fr_0.7fr_0.9fr_0.25fr] gap-3 border-b border-border px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{{ 'limits.category' | translate }}</span>
              <span>{{ 'limits.group' | translate }}</span>
              <span class="text-right">{{ 'limits.recommended' | translate }}</span>
              <span class="text-right">{{ 'limits.yourPercent' | translate }}</span>
              <span class="text-right">{{ 'common.amount' | translate }}</span>
              <span></span>
            </div>
            <ul class="mt-1">
              @for (group of limitsArray.controls; track $index; let i = $index) {
                <li
                  class="grid grid-cols-[1.6fr_1fr_0.6fr_0.7fr_0.9fr_0.25fr] items-center gap-3 border-b border-border/60 px-2 py-2.5 last:border-0"
                  [formGroupName]="i"
                >
                  <!-- Category -->
                  <div class="flex items-center gap-2.5 min-w-0">
                    <app-category-icon [categoryId]="getCatId(i)" size="sm" />
                    @if (isPredefined(i)) {
                      <span class="truncate text-sm font-medium">{{ getDisplayType(i) }}</span>
                    } @else {
                      <div class="min-w-0 flex-1">
                        <input
                          type="text"
                          formControlName="type"
                          [placeholder]="'limits.custom.namePlaceholder' | translate"
                          class="w-full rounded-lg border border-border bg-card/60 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                        />
                        @if (isCustomTypeInvalid(group)) {
                          <p class="mt-1 text-[10px] text-destructive">{{ 'limits.custom.nameRequired' | translate }}</p>
                        }
                      </div>
                    }
                  </div>
                  <!-- Group -->
                  @if (isPredefined(i)) {
                    <span
                      class="text-xs font-medium"
                      [style.color]="'var(' + getCatColorVar(i) + ')'"
                    >{{ getGroupName(group.get('category')?.value) }}</span>
                  } @else {
                    <app-themed-select formControlName="category" [options]="budgetGroupOptions()" size="xs" />
                  }
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
                  <button
                    type="button"
                    (click)="removeCustomType(i)"
                    [disabled]="isPredefined(i)"
                    [attr.aria-label]="'limits.custom.delete' | translate"
                    class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive disabled:invisible"
                  >
                    <lucide-icon [img]="trashIcon" class="h-4 w-4" />
                  </button>
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
                    @if (isPredefined(i)) {
                      <p class="truncate text-sm font-medium">{{ getDisplayType(i) }}</p>
                      <p
                        class="text-[11px]"
                        [style.color]="'var(' + getCatColorVar(i) + ')'"
                      >{{ getGroupName(group.get('category')?.value) }} · rec. {{ group.get('recommendedPercentage')?.value }}%</p>
                    } @else {
                      <input
                        type="text"
                        formControlName="type"
                        [placeholder]="'limits.custom.namePlaceholder' | translate"
                        class="w-full rounded-lg border border-border bg-card/60 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                      />
                      <div class="mt-1.5">
                        <app-themed-select formControlName="category" [options]="budgetGroupOptions()" size="xs" />
                      </div>
                      @if (isCustomTypeInvalid(group)) {
                        <p class="mt-1 text-[10px] text-destructive">{{ 'limits.custom.nameRequired' | translate }}</p>
                      }
                    }
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
                  @if (!isPredefined(i)) {
                    <button
                      type="button"
                      (click)="removeCustomType(i)"
                      [attr.aria-label]="'limits.custom.delete' | translate"
                      class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                    >
                      <lucide-icon [img]="trashIcon" class="h-4 w-4" />
                    </button>
                  }
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
          [description]="isAllocationBalanced() ? ('limits.runningBalanced' | translate) : ('limits.runningAdjust' | translate)"
          class="mb-6 block"
        >
          <span action>
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              [class]="isAllocationBalanced() ? 'bg-success/15' : 'bg-destructive/15 animate-pulse'"
              [style.color]="isAllocationBalanced() ? 'var(--success)' : 'var(--destructive)'"
            >
              @if (isAllocationBalanced()) {
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
            [disabled]="!isAllocationBalanced() || form.invalid"
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
  private readonly feedback = inject(UserFeedbackService);

  readonly budgetCategories = BUDGET_CATEGORIES;
  readonly budgetGroups = BUDGET_GROUPS;

  getDisplayType(index: number): string {
    const type = this.limitsArray.at(index)?.get('type')?.value as string | null;
    if (!type) return '';
    const categoryId = getCategoryIdByName(type);
    if (categoryId === 'custom') return type;
    return this.i18n.t(`category.${categoryId}`);
  }

  getGroupName(group: unknown): string {
    const key = String(group ?? '').toLowerCase();
    const translated = this.i18n.t(`budgetGroup.${key}`);
    return translated.startsWith('budgetGroup.') ? String(group ?? '') : translated;
  }

  budgetGroupOptions(): ThemedSelectOption[] {
    return this.budgetGroups.map((group) => ({
      value: group,
      label: this.getGroupName(group),
    }));
  }

  // Lucide icon references for template use
  readonly plusIcon = Plus;
  readonly saveIcon = Save;
  readonly alertTriangleIcon = AlertTriangle;
  readonly checkCircle2Icon = CheckCircle2;
  readonly trashIcon = Trash2;

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
    const type = this.limitsArray.at(index)?.get('type')?.value as string | null;
    return !!type && PREDEFINED_EXPENSE_TYPES.includes(type);
  }

  isIncomeInvalid(): boolean {
    const ctrl = this.form.get('monthlyIncome');
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  requiresIncomeSetup(): boolean {
    return this.expenseStore.monthlyIncome() <= 0;
  }

  isAllocationBalanced(): boolean {
    return Math.abs(this.runningTotal() - 100) < 0.05;
  }

  isCustomTypeInvalid(group: AbstractControl): boolean {
    const ctrl = group.get('type');
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  /** Returns the CATEGORY_DEFS id for the limit at the given index */
  getCatId(index: number): string {
    const typeName = this.limitsArray.controls[index]?.get('type')?.value as string;
    const categoryId = getCategoryIdByName(typeName);
    return categoryId === 'custom' ? 'misc' : categoryId;
  }

  /** Returns the CSS variable name (without var()) for the category color at the given index */
  getCatColorVar(index: number): string {
    return getCategoryDef(this.getCatId(index)).colorVar;
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
    this.limitsArray.push(this.createCustomGroup());
    this.recalculateAmounts();
    this.updateRunningTotal();
  }

  // Remove custom type
  removeCustomType(index: number): void {
    if (this.isPredefined(index)) {
      return; // Safety check - should never happen
    }
    if (confirm(this.i18n.t('limits.custom.deleteConfirm'))) {
      this.limitsArray.removeAt(index);
      this.recalculateAmounts();
      this.updateRunningTotal();
    }
  }

  // Task 10.5: Save handler
  onSave(): void {
    this.form.markAllAsTouched();
    this.normalizeCustomTypeNames();
    if (this.form.invalid) {
      this.feedback.warning(
        'Budget limits were not saved.',
        'Enter a monthly income greater than 0 and fill any custom category names before saving.'
      );
      return;
    }

    if (!this.isAllocationBalanced()) {
      this.feedback.warning(
        'Budget limits were not saved.',
        `Your allocation is ${this.runningTotal()}%. Adjust the percentages until the total is exactly 100%.`
      );
      return;
    }

    const savingsPct = this.getSavingsPercentage();
    if (savingsPct < 20) {
      this.pendingSave = true;
      this.showSavingsWarning.set(true);
    } else {
      void this.executeSave();
    }
  }

  onSavingsWarningConfirmed(): void {
    this.showSavingsWarning.set(false);
    if (this.pendingSave) {
      this.pendingSave = false;
      void this.executeSave();
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
      const customLimits = storeLimits.filter((limit) => !PREDEFINED_EXPENSE_TYPES.includes(limit.type));

      for (const group of this.limitsArray.controls) {
        const type = group.get('type')?.value as string;
        const stored = limitMap.get(type);
        if (stored) {
          group.get('userPercentage')?.setValue(stored.userPercentage, { emitEvent: false });
          group.get('category')?.setValue(stored.category, { emitEvent: false });
        }
      }

      const existingCustomTypes = new Set(
        this.limitsArray.controls
          .map((group) => group.get('type')?.value as string)
          .filter((type) => type && !PREDEFINED_EXPENSE_TYPES.includes(type))
      );

      for (const customLimit of customLimits) {
        if (!existingCustomTypes.has(customLimit.type)) {
          this.limitsArray.push(this.createCustomGroup(customLimit), { emitEvent: false });
          existingCustomTypes.add(customLimit.type);
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

  private createCustomGroup(limit?: ExpenseLimit): FormGroup {
    return this.fb.group({
      type: [limit?.type ?? '', [Validators.required]],
      category: [limit?.category ?? 'Wants' as BudgetCategory, [Validators.required]],
      recommendedPercentage: [{ value: limit?.recommendedPercentage ?? 0, disabled: true }],
      userPercentage: [limit?.userPercentage ?? 0, [Validators.min(0), Validators.max(100)]],
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
      type: String(ctrl.get('type')?.value ?? '').trim(),
      category: ctrl.get('category')?.value as BudgetCategory,
      recommendedPercentage: Number(ctrl.get('recommendedPercentage')?.value) || 0,
      userPercentage: Number(ctrl.get('userPercentage')?.value) || 0,
    }));

    // setLimitsAndIncome automatically persists to Google Drive
    try {
      await this.expenseStore.setLimitsAndIncome(limits, income);
      this.feedback.success(
        'Budget limits saved.',
        'Your monthly income and category limits were saved to your Drive backup.'
      );
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch (error) {
      this.feedback.error(
        'Budget limits were not saved.',
        error instanceof Error
          ? error.message
          : 'Check your connection and Drive access, then try again.'
      );
    }
  }

  private normalizeCustomTypeNames(): void {
    for (let i = 0; i < this.limitsArray.length; i += 1) {
      if (this.isPredefined(i)) continue;
      const typeControl = this.limitsArray.at(i).get('type');
      const normalized = String(typeControl?.value ?? '').trim();
      typeControl?.setValue(normalized, { emitEvent: false });
    }
  }
}
