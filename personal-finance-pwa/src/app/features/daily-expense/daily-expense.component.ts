import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { SyncService } from '../../core/services/sync.service';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { PREDEFINED_EXPENSE_TYPES } from '../../core/models';
import { CardComponent } from '../../shared/components/card/card.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';

@Component({
  selector: 'app-daily-expense',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CardComponent, CurrencyFormatPipe],
  template: `
    <div class="min-h-screen bg-gray-50 pb-20 p-4">
      <h1 class="text-xl font-semibold mb-4">Log Expense</h1>

      <!-- Offline toast -->
      @if (offlineToast()) {
        <div
          class="mb-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-lg p-3 text-sm"
          role="alert"
          aria-live="polite"
        >
          Entry saved locally — will sync when online
        </div>
      }

      <!-- Form -->
      <app-card>
        <form [formGroup]="form" (ngSubmit)="onSubmit()" [class]="borderClass()">
          <!-- Expense Type -->
          <div class="mb-4">
            <label for="expenseType" class="block text-sm font-medium text-gray-700 mb-1">
              Expense Type
            </label>
            <select
              id="expenseType"
              formControlName="expenseType"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            >
              <option value="">Select a type...</option>
              @for (type of expenseTypes; track type) {
                <option [value]="type">{{ type }}</option>
              }
            </select>
            @if (form.get('expenseType')?.hasError('required') && form.get('expenseType')?.touched) {
              <p class="mt-1 text-sm text-red-600" role="alert">Expense type is required</p>
            }
          </div>

          <!-- Amount -->
          <div class="mb-4">
            <label for="amount" class="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              id="amount"
              type="number"
              formControlName="amount"
              placeholder="0.00"
              step="0.01"
              min="0.01"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            />
            @if (form.get('amount')?.hasError('min') && form.get('amount')?.touched) {
              <p class="mt-1 text-sm text-red-600" role="alert">Amount must be greater than 0</p>
            }
            @if (form.get('amount')?.hasError('required') && form.get('amount')?.touched) {
              <p class="mt-1 text-sm text-red-600" role="alert">Amount is required</p>
            }
          </div>

          <!-- Remaining Limit (shows remaining balance for today) -->
          <div class="mb-4">
            <label for="limit" class="block text-sm font-medium text-gray-700 mb-1">
              Remaining Limit (Today)
            </label>
            <input
              id="limit"
              type="number"
              formControlName="limit"
              readonly
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-semibold min-h-[44px]"
              [class.text-green-600]="form.get('limit')?.value ?? 0 >= 0"
              [class.text-red-600]="(form.get('limit')?.value ?? 0) < 0"
            />
            <p class="mt-1 text-xs text-gray-500">
              This shows how much you have left to spend today for this expense type
            </p>
          </div>

          <!-- Savings (computed, read-only) -->
          <div class="mb-4">
            <label for="savings" class="block text-sm font-medium text-gray-700 mb-1">
              Savings (This Entry)
            </label>
            <input
              id="savings"
              type="number"
              [value]="savings()"
              readonly
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 min-h-[44px]"
              [class.text-green-600]="savings() >= 0"
              [class.text-red-600]="savings() < 0"
            />
          </div>

          <!-- Comment with Voice Input -->
          <div class="mb-6">
            <label for="comment" class="block text-sm font-medium text-gray-700 mb-1">
              Comment (Optional)
            </label>
            <div class="flex gap-2">
              <input
                id="comment"
                type="text"
                formControlName="comment"
                placeholder="Add a note about this expense..."
                class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
              />
              <button
                type="button"
                (click)="isRecording() ? stopVoiceRecording() : startVoiceRecording()"
                class="px-4 py-2 rounded-lg border min-h-[44px] transition-colors"
                [class.bg-red-500]="isRecording()"
                [class.text-white]="isRecording()"
                [class.border-red-500]="isRecording()"
                [class.bg-white]="!isRecording()"
                [class.border-gray-300]="!isRecording()"
                [class.hover:bg-gray-50]="!isRecording()"
                title="Voice to text"
              >
                @if (isRecording()) {
                  <span class="text-sm">🎤 Stop</span>
                } @else {
                  <span class="text-sm">🎤</span>
                }
              </button>
            </div>
            <p class="mt-1 text-xs text-gray-500">
              Click the microphone to add a voice note
            </p>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-3 text-sm transition-colors min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Log Expense
          </button>
        </form>
      </app-card>

      <!-- Today's entries -->
      <h2 class="text-lg font-medium mt-6 mb-3">Today's Entries</h2>
      @for (entry of expenseStore.todayEntries(); track entry.id) {
        <app-card class="mb-3">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <p class="font-medium text-gray-900 text-sm">{{ entry.type }}</p>
              <p class="text-xs text-gray-500 mt-1">{{ formatTimestamp(entry.timestamp) }}</p>
              @if (entry.comment) {
                <p class="text-xs text-gray-600 mt-2 italic">💬 {{ entry.comment }}</p>
              }
            </div>
            <div class="text-right">
              <p class="font-semibold text-gray-900 text-sm">{{ entry.amount | currencyFormat }}</p>
              <p class="text-xs text-gray-500 mt-1">Limit: {{ entry.limit | currencyFormat }}</p>
              <p
                class="text-xs mt-1"
                [class.text-green-600]="entry.savings >= 0"
                [class.text-red-600]="entry.savings < 0"
              >
                Savings: {{ entry.savings | currencyFormat }}
              </p>
              <button
                (click)="deleteEntry(entry)"
                class="mt-2 text-xs text-red-600 hover:text-red-800 underline"
                title="Delete this entry"
              >
                Delete
              </button>
            </div>
          </div>
        </app-card>
      } @empty {
        <p class="text-gray-500 text-sm text-center py-8">No entries today yet.</p>
      }
    </div>
  `,
})
export class DailyExpenseComponent implements OnInit, OnDestroy {
  // ─── Task 8.1: Injections ─────────────────────────────────────────────────
  readonly expenseStore = inject(ExpenseStore);
  readonly syncService = inject(SyncService);
  private readonly fb = inject(FormBuilder);

  // ─── Task 8.1: Reactive form ──────────────────────────────────────────────
  readonly form = this.fb.group({
    expenseType: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    limit: [{ value: 0, disabled: true }],
    comment: [''],  // Add comment field
  });

  readonly expenseTypes = PREDEFINED_EXPENSE_TYPES;

  // ─── Task 8.8: Offline toast signal ──────────────────────────────────────
  readonly offlineToast = signal(false);

  // Voice recognition support
  readonly isRecording = signal(false);
  private recognition: any = null;

  // ─── Task 8.3: Reactive form value signal for savings computation ─────────
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.value,
  });

  // ─── Task 8.3: Savings computed signal ───────────────────────────────────
  readonly savings = computed(() => {
    this.formValue(); // subscribe to form changes
    const limitVal = this.form.get('limit')?.value ?? 0;
    const amountVal = this.form.get('amount')?.value ?? 0;
    return (limitVal ?? 0) - (amountVal ?? 0);
  });

  // ─── Task 8.4: Border class computed signal ───────────────────────────────
  readonly borderClass = computed(() => {
    this.formValue(); // subscribe to form changes
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    if (amount > 0 && amount > limit) {
      return 'border-2 border-red-500 rounded-xl p-4';
    }
    if (amount > 0 && amount <= limit) {
      return 'border-2 border-green-500 rounded-xl p-4';
    }
    return 'p-4';
  });

  private typeChangeSub?: Subscription;
  private offlineToastTimer?: ReturnType<typeof setTimeout>;

  // ─── Task 8.2: Type-selection logic ──────────────────────────────────────
  ngOnInit(): void {
    const expenseTypeControl = this.form.get('expenseType');
    const limitControl = this.form.get('limit');

    if (expenseTypeControl && limitControl) {
      this.typeChangeSub = expenseTypeControl.valueChanges.subscribe((type) => {
        if (type) {
          const limitEntry = this.expenseStore.limitMap()[type];
          const income = this.expenseStore.monthlyIncome();
          const monthlyLimit = limitEntry ? (limitEntry.userPercentage / 100) * income : 0;

          // Divide monthly limit by days in the current month
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const dailyLimit = Math.ceil(monthlyLimit / daysInMonth);

          // Calculate total spent today for this expense type
          const todayEntries = this.expenseStore.todayEntries();
          const spentToday = todayEntries
            .filter(e => e.type === type)
            .reduce((sum, e) => sum + e.amount, 0);

          // Set limit to remaining balance (dailyLimit - spentToday)
          const remainingLimit = dailyLimit - spentToday;
          limitControl.setValue(remainingLimit);
          
          console.log('[DailyExpense] Type selected:', type, '| Daily limit:', dailyLimit, '| Spent today:', spentToday, '| Remaining:', remainingLimit);
        } else {
          limitControl.setValue(0);
        }
      });
    }

    // Load current month's expenses to show today's entries
    const currentMonth = new Date().toISOString().slice(0, 7);
    this.expenseStore.loadMonth(currentMonth).catch(err => {
      console.error('[DailyExpense] Failed to load month:', err);
    });

    // Load limits if not already loaded and sheet is configured (needed for limit calculations)
    const sheetId = typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    if (sheetId && (this.expenseStore.limits().length === 0 || this.expenseStore.monthlyIncome() === 0)) {
      this.expenseStore.loadLimits().catch(err => {
        console.error('Failed to load limits:', err);
      });
    }
  }

  ngOnDestroy(): void {
    this.typeChangeSub?.unsubscribe();
    if (this.offlineToastTimer) {
      clearTimeout(this.offlineToastTimer);
    }
  }

  // ─── Helper: format ISO timestamp for display ────────────────────────────
  formatTimestamp(ts: string): string {
    return ts.slice(0, 19).replace('T', ' ');
  }

  // ─── Task 8.5: onSubmit ───────────────────────────────────────────────────
  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const id = crypto.randomUUID();
    const date = new Date().toISOString().slice(0, 10);
    const timestamp = new Date().toISOString();
    const type = this.form.get('expenseType')?.value ?? '';
    const amount = this.form.get('amount')?.value ?? 0;
    const limit = this.form.get('limit')?.value ?? 0;
    const savings = (limit ?? 0) - (amount ?? 0);
    const comment = this.form.get('comment')?.value || undefined;

    const entry: ExpenseEntry = {
      id,
      date,
      amount: amount as number,
      type: type as string,
      limit: limit as number,
      savings,
      timestamp,
      comment,  // Include comment
    };

    this.expenseStore.addEntry(entry);
    this.syncService.enqueue(entry);

    // ─── Flush queue immediately if online ────────────────────────────────
    if (this.syncService.isOnline()) {
      this.syncService.flushQueue().catch(err => {
        console.error('[DailyExpense] Failed to sync expense:', err);
      });
    }

    // ─── Task 8.8: Show offline toast if not online ───────────────────────
    if (!this.syncService.isOnline()) {
      this.offlineToast.set(true);
      if (this.offlineToastTimer) {
        clearTimeout(this.offlineToastTimer);
      }
      this.offlineToastTimer = setTimeout(() => {
        this.offlineToast.set(false);
        this.offlineToastTimer = undefined;
      }, 4000);
    }

    this.form.reset({ expenseType: '', amount: null, limit: 0, comment: '' });
  }

  // Voice-to-text for comments
  startVoiceRecording(): void {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isRecording.set(true);
    };

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const currentComment = this.form.get('comment')?.value || '';
      this.form.get('comment')?.setValue(currentComment + (currentComment ? ' ' : '') + transcript);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.isRecording.set(false);
    };

    this.recognition.onend = () => {
      this.isRecording.set(false);
    };

    this.recognition.start();
  }

  stopVoiceRecording(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  // Delete an expense entry
  deleteEntry(entry: ExpenseEntry): void {
    if (!confirm(`Delete expense: ${entry.type} - ${entry.amount}?`)) {
      return;
    }

    // Remove from store
    const updatedEntries = this.expenseStore.entries().filter(e => e.id !== entry.id);
    // Note: We need to add a method to update entries in the store
    // For now, we'll just reload the month
    console.log('[DailyExpense] Delete not fully implemented - needs store method');
    alert('Delete functionality will be implemented in the next update');
  }
}
