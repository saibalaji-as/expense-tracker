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
import { ButtonComponent, CardComponent, ModalComponent } from '../../shared/components';
import { CurrencyFormatPipe } from '../../shared/pipes';

const BUDGET_CATEGORIES: BudgetCategory[] = ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'];

@Component({
  selector: 'app-expense-limit',
  standalone: true,
  imports: [ReactiveFormsModule, CardComponent, ButtonComponent, ModalComponent, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <h1 class="mb-4 text-xl font-semibold text-gray-900">Expense Limits</h1>

      <form [formGroup]="form" (ngSubmit)="onSave()" novalidate>
        <!-- Monthly Income -->
        <app-card class="mb-6 block">
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Monthly Income</h2>
          <div>
            <label for="monthlyIncome" class="mb-1 block text-sm font-medium text-gray-700">
              Monthly Income (₹)
            </label>
            <input
              type="number"
              id="monthlyIncome"
              formControlName="monthlyIncome"
              min="0.01"
              step="0.01"
              placeholder="Enter your monthly income"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              [class.border-red-500]="isIncomeInvalid()"
            />
            @if (isIncomeInvalid()) {
              <p class="mt-1 text-xs text-red-600">
                Monthly income is required and must be greater than 0.
              </p>
            }
          </div>
        </app-card>

        <!-- Limits Table -->
        <app-card class="mb-4 block">
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Spending Limits</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th class="pb-2 pr-3">Type</th>
                  <th class="pb-2 pr-3">Category</th>
                  <th class="pb-2 pr-3 text-right">Rec. %</th>
                  <th class="pb-2 pr-3 text-right">Your %</th>
                  <th class="pb-2 pr-3 text-right">Amount</th>
                  <th class="pb-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody formArrayName="limits">
                @for (group of limitsArray.controls; track $index; let i = $index) {
                  <tr class="border-b border-gray-100 last:border-0" [formGroupName]="i">
                    <td class="py-2 pr-3">
                      @if (isPredefined(i)) {
                        <span class="font-medium text-gray-900">
                          {{ group.get('type')?.value }}
                        </span>
                      } @else {
                        <input
                          type="text"
                          formControlName="type"
                          placeholder="Type name"
                          class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          [class.border-red-500]="isCustomTypeInvalid(group)"
                        />
                      }
                    </td>
                    <td class="py-2 pr-3">
                      @if (isPredefined(i)) {
                        <span class="text-gray-600">{{ group.get('category')?.value }}</span>
                      } @else {
                        <select
                          formControlName="category"
                          class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          @for (cat of budgetCategories; track cat) {
                            <option [value]="cat">{{ cat }}</option>
                          }
                        </select>
                      }
                    </td>
                    <td class="py-2 pr-3 text-right text-gray-500">
                      {{ group.get('recommendedPercentage')?.value }}%
                    </td>
                    <td class="py-2 pr-3">
                      <input
                        type="number"
                        formControlName="userPercentage"
                        min="0"
                        max="100"
                        step="0.1"
                        class="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td class="py-2 text-right font-medium text-gray-900">
                      {{ group.get('calculatedAmount')?.value | currencyFormat }}
                    </td>
                    <td class="py-2 text-center">
                      @if (!isPredefined(i)) {
                        <button
                          type="button"
                          (click)="removeCustomType(i)"
                          class="text-red-600 hover:text-red-800 text-xs underline"
                          title="Remove this custom type"
                        >
                          Delete
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-card>

        <!-- Running Total -->
        <app-card class="mb-4 block">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Running Total (all %)</span>
            <span
              class="text-lg font-bold"
              [class.text-red-600]="isNeedsWantsOver80()"
              [class.text-gray-900]="!isNeedsWantsOver80()"
            >
              {{ runningTotal() }}%
            </span>
          </div>
          @if (isNeedsWantsOver80()) {
            <p class="mt-1 text-xs text-red-600">
              ⚠ Needs + Wants exceeds 80% of income. Consider reducing discretionary spending.
            </p>
          }
        </app-card>

        <!-- Add Custom Type -->
        <div class="mb-4">
          <app-button type="button" variant="ghost" (click)="addCustomType()">
            + Add Custom Type
          </app-button>
        </div>

        <!-- Save Button -->
        <app-button type="submit" variant="primary" class="w-full">
          Save Limits
        </app-button>

        @if (saveSuccess()) {
          <p class="mt-3 text-center text-sm text-green-600">✓ Limits saved successfully</p>
        }
      </form>
    </div>

    <!-- Savings Warning Modal -->
    <app-modal
      title="Low Savings Warning"
      [isOpen]="showSavingsWarning()"
      (confirmed)="onSavingsWarningConfirmed()"
      (cancelled)="showSavingsWarning.set(false)"
    >
      <p class="text-sm text-gray-700">
        Your configured savings percentage is below 20%. Financial advisors recommend saving at
        least 20% of your income. Are you sure you want to save this configuration?
      </p>
    </app-modal>
  `,
})
export class ExpenseLimitComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly sheetsService = inject(GoogleSheetsService);
  readonly expenseStore = inject(ExpenseStore);

  readonly budgetCategories = BUDGET_CATEGORIES;

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

  ngOnInit(): void {
    // Task 10.2: Subscribe to form value changes to recalculate amounts
    this.subscription = this.form.valueChanges.subscribe(() => {
      this.recalculateAmounts();
      this.updateRunningTotal();
    });

    // Populate immediately in case data is already in the store
    this.#populateFromStore();

    // Load limits if not already loaded and sheet is configured
    const sheetId = typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    console.log('[ExpenseLimitComponent] ngOnInit - sheetId:', sheetId, '| limits:', this.expenseStore.limits().length, '| income:', this.expenseStore.monthlyIncome());
    if (sheetId && (this.expenseStore.limits().length === 0 || this.expenseStore.monthlyIncome() === 0)) {
      console.log('[ExpenseLimitComponent] Loading limits...');
      this.expenseStore.loadLimits().catch(err => {
        console.error('Failed to load limits:', err);
      });
    }
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
    const sheetId =
      (typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null) ?? '';

    if (!sheetId) {
      // No sheet configured — update store only (no remote write)
      const limits: ExpenseLimit[] = this.limitsArray.controls.map((ctrl) => ({
        type: ctrl.get('type')?.value as string,
        category: ctrl.get('category')?.value as BudgetCategory,
        recommendedPercentage: Number(ctrl.get('recommendedPercentage')?.value) || 0,
        userPercentage: Number(ctrl.get('userPercentage')?.value) || 0,
      }));
      this.expenseStore.setLimitsAndIncome(limits, income);
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
      return;
    }

    const limits: ExpenseLimit[] = this.limitsArray.controls.map((ctrl) => ({
      type: ctrl.get('type')?.value as string,
      category: ctrl.get('category')?.value as BudgetCategory,
      recommendedPercentage: Number(ctrl.get('recommendedPercentage')?.value) || 0,
      userPercentage: Number(ctrl.get('userPercentage')?.value) || 0,
    }));

    try {
      await this.sheetsService.writeLimits(sheetId, limits);
      await this.sheetsService.writeMetadata(sheetId, METADATA_MONTHLY_INCOME, income.toString());
      this.expenseStore.setLimitsAndIncome(limits, income);
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch {
      // Error is emitted on apiError$ and handled globally
    }
  }
}
