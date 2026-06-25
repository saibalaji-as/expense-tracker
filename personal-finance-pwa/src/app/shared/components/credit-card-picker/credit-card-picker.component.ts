import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyFormatPipe } from '../../pipes';
import { ModalComponent } from '../modal/modal.component';
import { ExpenseStore } from '../../../core/services/expense-store.service';
import { PendingCcExpense, DebtAccount } from '../../../core/models';

@Component({
  selector: 'app-credit-card-picker',
  standalone: true,
  imports: [ModalComponent, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pendingExpense()) {
      <app-modal
        [isOpen]="true"
        [showActions]="false"
        title="Which credit card was used?"
        (cancelled)="dismiss()"
      >
        <div class="space-y-3">
          <p class="text-sm text-muted-foreground">
            A credit card expense of <strong>{{ pendingExpense()!.amount | currencyFormat }}</strong>
            was detected{{ pendingExpense()!.comment ? ' — "' + pendingExpense()!.comment + '"' : '' }}.
            Choose the card to charge, or save from your default account.
          </p>

          <div class="grid gap-2 pt-1">
            @for (card of activeCreditCards(); track card.id) {
              <button
                type="button"
                class="flex items-center justify-between rounded-2xl border border-border bg-background/60 px-4 py-3 text-left transition hover:bg-accent active:scale-[0.98]"
                (click)="assignToCard(card)"
              >
                <div>
                  <p class="text-sm font-semibold">{{ card.name }}</p>
                  @if (card.cardNetworkOrBank) {
                    <p class="text-xs text-muted-foreground">{{ card.cardNetworkOrBank }}</p>
                  }
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold tabular-nums text-destructive">{{ card.remainingBalance | currencyFormat }}</p>
                  <p class="text-[10px] text-muted-foreground">outstanding</p>
                </div>
              </button>
            }

            <button
              type="button"
              class="rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-accent active:scale-[0.98]"
              (click)="saveFromDefault()"
            >
              Save from default account instead
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class CreditCardPickerComponent {
  private readonly expenseStore = inject(ExpenseStore);
  private readonly router = inject(Router);

  readonly pendingExpense = (): PendingCcExpense | undefined => this.expenseStore.pendingCcExpenses()[0];
  readonly activeCreditCards = (): DebtAccount[] =>
    this.expenseStore.debts().filter((d) => d.type === 'credit-card' && d.status === 'active');

  async assignToCard(card: DebtAccount): Promise<void> {
    const expense = this.pendingExpense();
    if (!expense) return;
    await this.expenseStore.resolvePendingCcExpense(expense.id, card.id);
  }

  async saveFromDefault(): Promise<void> {
    const expense = this.pendingExpense();
    if (!expense) return;
    await this.expenseStore.resolvePendingCcExpense(expense.id, null);
  }

  dismiss(): void {
    // Tap outside / cancel — keep item pending until user makes a choice
  }
}
