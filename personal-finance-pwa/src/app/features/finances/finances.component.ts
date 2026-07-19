import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BadgeIndianRupee,
  CloudOff,
  CreditCard,
  Landmark,
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Pencil,
  Plus,
  Star,
  Trash2,
  WalletCards,
} from 'lucide-angular';
import {
  AccountBalanceAdjustment,
  AssetAccount,
  AssetAccountType,
  CardStatement,
  DebtAccount,
  DebtAccountType,
  DebtAdjustment,
  DebtAdjustmentKind,
  DebtPayment,
  ExpenseEntry,
} from '../../core/models';
import {
  cashbackEarned,
  currentCycleWindow,
  cycleSpend,
  matchRefundCandidates,
  statementDueWithAdjustments,
  type CycleWindow,
} from '../../core/utils/credit-card-insights';
import { statementIsCurrent, statementRemainingDue } from '../../core/utils/credit-card-statement';
import { CurrencyService } from '../../core/services/currency.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { toLocalDateString } from '../../core/utils/local-date';
import { ClearableInputDirective, ModalComponent, SectionCardComponent, ThemedSelectComponent, ThemedSelectOption } from '../../shared/components';
import { CurrencyFormatPipe, DateFormatPipe, TranslatePipe } from '../../shared/pipes';

@Component({
  selector: 'app-finances',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LucideAngularModule,
    SectionCardComponent,
    ModalComponent,
    ThemedSelectComponent,
    ClearableInputDirective,
    CurrencyFormatPipe,
    DateFormatPipe,
    TranslatePipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ BadgeIndianRupee, CloudOff, CreditCard, Landmark, Pencil, Plus, Star, Trash2, WalletCards }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid gap-6 pb-24 md:pb-0">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{{ 'finances.title' | translate }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ 'finances.description' | translate }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-accent active:scale-[0.98]"
            (click)="startDebtCreate()"
          >
            <lucide-icon name="landmark" class="h-4 w-4" />
            {{ 'finances.debts.add' | translate }}
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-accent active:scale-[0.98]"
            (click)="startCardCreate()"
          >
            <lucide-icon name="credit-card" class="h-4 w-4" />
            {{ 'finances.cards.add' | translate }}
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
            (click)="startCreate()"
          >
            <lucide-icon name="plus" class="h-4 w-4" />
            {{ 'finances.accounts.add' | translate }}
          </button>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-4">
        <div class="glass-card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.totalAssets' | translate }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ expenseStore.totalAssets() | currencyFormat }}</p>
        </div>
        <div class="glass-card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.totalLiabilities' | translate }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums text-destructive">{{ expenseStore.totalLiabilities() | currencyFormat }}</p>
        </div>
        <div class="glass-card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.accounts' | translate }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ activeAccounts().length }}</p>
        </div>
        <div class="glass-card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.activeDebts' | translate }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ activeDebts().length }}</p>
        </div>
      </div>

      <app-modal
        class="contents"
        [isOpen]="showAccountForm()"
        [showActions]="false"
        [title]="editingAccount() ? ('finances.accounts.editTitle' | translate) : ('finances.accounts.addTitle' | translate)"
        (cancelled)="cancelAccountForm()"
      >
        <p class="-mt-2 mb-4 text-sm text-muted-foreground">{{ 'finances.accounts.formDescription' | translate }}</p>
        <form [formGroup]="accountForm" (ngSubmit)="saveAccount()" class="grid gap-4 md:grid-cols-2">
          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.accounts.name' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <input appClearable
              type="text"
              formControlName="name"
              class="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              [placeholder]="'finances.accounts.namePlaceholder' | translate"
            />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.accounts.type' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <app-themed-select formControlName="type" [options]="accountTypeOptions()" />
          </label>

          @if (!editingAccount()) {
            <label class="space-y-1.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.accounts.initialBalance' | translate }}<span class="text-destructive ml-0.5">*</span></span>
              <input appClearable
                type="number"
                min="0"
                step="0.01"
                formControlName="balance"
                class="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          }

          <div class="grid gap-3 md:col-span-2 sm:grid-cols-2">
            <label class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3">
              <span>
                <span class="block text-sm font-medium">{{ 'finances.accounts.default' | translate }} <span class="text-muted-foreground text-[10px] font-normal">{{ 'common.optional' | translate }}</span></span>
                <span class="text-xs text-muted-foreground">{{ 'finances.accounts.defaultHint' | translate }}</span>
              </span>
              <input type="checkbox" formControlName="isDefault" class="h-5 w-5 accent-primary" />
            </label>

            <label class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3">
              <span>
                <span class="block text-sm font-medium">{{ 'finances.accounts.overdraft' | translate }} <span class="text-muted-foreground text-[10px] font-normal">{{ 'common.optional' | translate }}</span></span>
                <span class="text-xs text-muted-foreground">{{ 'finances.accounts.overdraftHint' | translate }}</span>
              </span>
              <input type="checkbox" formControlName="allowOverdraft" class="h-5 w-5 accent-primary" />
            </label>
          </div>

          <div class="flex flex-wrap justify-end gap-3 md:col-span-2">
            <button
              type="button"
              class="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent"
              (click)="cancelAccountForm()"
            >
              {{ 'common.cancel' | translate }}
            </button>
            <button
              type="submit"
              class="rounded-2xl gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              [disabled]="saving()"
            >
              {{ editingAccount() ? ('finances.accounts.saveChanges' | translate) : ('finances.accounts.create' | translate) }}
            </button>
          </div>
        </form>
      </app-modal>

      <app-modal
        class="contents"
        [isOpen]="showDebtForm()"
        [showActions]="false"
        [title]="editingDebt() ? ('finances.debts.editTitle' | translate) : ('finances.debts.addTitle' | translate)"
        (cancelled)="cancelDebtForm()"
      >
        <p class="-mt-2 mb-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">{{ 'finances.debts.formDescription' | translate }}</p>
        <form [formGroup]="debtForm" (ngSubmit)="saveDebt()" class="grid grid-cols-2 gap-3">
          <label class="col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.name' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <input appClearable
              type="text"
              formControlName="name"
              class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              [placeholder]="'finances.debts.namePlaceholder' | translate"
            />
          </label>

          <div class="relative col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.type' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <app-themed-select formControlName="type" [options]="debtTypeOptions()" />
          </div>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.principalAmount' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <input appClearable type="number" min="0.01" step="0.01" formControlName="principalAmount" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.remainingBalance' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <input appClearable type="number" min="0" step="0.01" formControlName="remainingBalance" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.interestRate' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="number" min="0" step="0.01" formControlName="interestRate" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.monthlyEmi' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="number" min="0" step="0.01" formControlName="monthlyEmi" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.startDate' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <input appClearable type="date" formControlName="startDate" class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label class="col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.nextDueDate' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="date" formControlName="nextDueDate" class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <div class="col-span-2 flex flex-wrap justify-end gap-3 pt-1">
            <button type="button" class="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent" (click)="cancelDebtForm()">
              {{ 'common.cancel' | translate }}
            </button>
            <button type="submit" class="rounded-2xl gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60" [disabled]="saving()">
              {{ editingDebt() ? ('finances.debts.saveChanges' | translate) : ('finances.debts.create' | translate) }}
            </button>
          </div>
        </form>
      </app-modal>

      <app-modal
        class="contents"
        [isOpen]="showCardForm()"
        [showActions]="false"
        [title]="editingCard() ? ('finances.cards.editTitle' | translate) : ('finances.cards.addTitle' | translate)"
        (cancelled)="cancelCardForm()"
      >
        <p class="-mt-2 mb-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">{{ 'finances.cards.formDescription' | translate }}</p>
        <form [formGroup]="cardForm" (ngSubmit)="saveCreditCard()" class="grid grid-cols-2 gap-3">
          <label class="col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cards.name' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <input appClearable
              type="text"
              formControlName="name"
              class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              [placeholder]="'finances.cards.namePlaceholder' | translate"
            />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cards.limit' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="number" min="0" step="0.01" formControlName="creditLimit"
              class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
            <span class="text-[10px] text-muted-foreground">{{ 'finances.cards.limitHint' | translate }}</span>
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cards.outstanding' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="number" min="0" step="0.01" formControlName="currentOutstanding"
              class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
            <span class="text-[10px] text-muted-foreground">{{ 'finances.cards.outstandingHint' | translate }}</span>
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bill Generation Date<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <select formControlName="billGenerationDay" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option [value]="0">Select day</option>
              @for (d of dayOptions; track d) {
                <option [value]="d">{{ d }}{{ daySuffix(d) }} of every month</option>
              }
            </select>
            <span class="text-[10px] text-muted-foreground">Day statement is generated</span>
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Due Date<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <select formControlName="paymentDueDay" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option [value]="0">Select day</option>
              @for (d of dayOptions; track d) {
                <option [value]="d">{{ d }}{{ daySuffix(d) }} of every month</option>
              }
            </select>
            <span class="text-[10px] text-muted-foreground">Reminder fires 3 days before this</span>
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Minimum Payment Amount<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="number" min="0" step="0.01" formControlName="minimumPaymentAmount"
              class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bank / Card Network<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="text" formControlName="cardNetworkOrBank"
              class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. HDFC Visa" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Card Last 4 Digits<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
            <input appClearable type="text" inputmode="numeric" maxlength="4" formControlName="cardLast4"
              class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. 4321" />
            <span class="text-[10px] text-muted-foreground">Auto-matches detected SMS spends to this card</span>
          </label>

          <div class="col-span-2 flex flex-wrap justify-end gap-3 pt-1">
            <button type="button" class="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent" (click)="cancelCardForm()">
              {{ 'common.cancel' | translate }}
            </button>
            <button type="submit" class="rounded-2xl gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60" [disabled]="saving()">
              {{ editingCard() ? ('finances.cards.saveChanges' | translate) : ('finances.cards.create' | translate) }}
            </button>
          </div>
        </form>
      </app-modal>

      <app-section-card [title]="'finances.accounts.title' | translate" [description]="'finances.accounts.description' | translate">
        @if (activeAccounts().length === 0) {
          <div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <lucide-icon name="wallet-cards" class="h-6 w-6" />
            </div>
            <p class="mt-3 text-sm font-semibold">{{ 'finances.accounts.emptyTitle' | translate }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ 'finances.accounts.emptyDescription' | translate }}</p>
          </div>
        } @else {
          <div class="grid gap-3">
            @for (account of activeAccounts(); track account.id) {
              <article class="rounded-2xl border border-border bg-background/60 p-4">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <lucide-icon [name]="accountIcon(account.type)" class="h-5 w-5" />
                    </span>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h2 class="truncate text-base font-semibold">{{ account.name }}</h2>
                        @if (account.isDefault) {
                          <span class="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <lucide-icon name="star" class="h-3 w-3" />
                            {{ 'finances.accounts.defaultBadge' | translate }}
                          </span>
                        }
                      </div>
                      <p class="mt-0.5 text-xs text-muted-foreground">{{ accountTypeLabel(account.type) }}</p>
                    </div>
                  </div>

                  <div class="flex flex-col gap-3 sm:items-end">
                    <p class="text-xl font-semibold tabular-nums">{{ account.balance | currencyFormat }}</p>
                    <div class="flex flex-wrap gap-2">
                      @if (!account.isDefault) {
                        <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="setDefault(account)">
                          {{ 'finances.accounts.makeDefault' | translate }}
                        </button>
                      }
                      <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startAdjustment(account)">
                        {{ 'finances.adjust.open' | translate }}
                      </button>
                      <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startEdit(account)" [attr.aria-label]="'common.edit' | translate">
                        <lucide-icon name="pencil" class="h-4 w-4" />
                      </button>
                      <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestDelete(account)" [attr.aria-label]="'common.delete' | translate">
                        <lucide-icon name="trash-2" class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                @if (adjustingAccount()?.id === account.id) {
                  <form [formGroup]="adjustmentForm" (ngSubmit)="saveAdjustment()" class="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/30 p-3 sm:grid-cols-[160px_1fr_minmax(160px,1fr)_auto] sm:items-end">
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.adjust.kind' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <app-themed-select formControlName="kind" [options]="adjustmentKindOptions()" size="sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.amount' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <input appClearable type="number" min="0.01" step="0.01" formControlName="amount" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.adjust.reason' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
                      <input appClearable type="text" formControlName="reason" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" [placeholder]="'finances.adjust.reasonPlaceholder' | translate" />
                    </label>
                    <div class="flex gap-2">
                      <button type="button" class="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground" (click)="cancelAdjustment()">{{ 'common.cancel' | translate }}</button>
                      <button type="submit" class="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60" [disabled]="saving()">{{ 'finances.adjust.save' | translate }}</button>
                    </div>
                  </form>
                }

                @if (accountAdjustmentsForAccount(account.id).length > 0) {
                  <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.adjust.history' | translate }}</p>
                    <div class="mt-2 grid gap-2">
                      @for (adjustment of accountAdjustmentsForAccount(account.id); track adjustment.id) {
                        <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/70 px-3 py-2 text-xs">
                          <div class="min-w-0">
                            <p
                              class="font-semibold tabular-nums"
                              [class.text-destructive]="adjustment.kind === 'decrease'"
                              [class.text-primary]="adjustment.kind === 'increase'"
                            >
                              {{ adjustment.kind === 'increase' ? '+' : '-' }}{{ adjustment.amount | currencyFormat }}
                            </p>
                            <p class="text-muted-foreground">{{ adjustment.createdAt | dateFormat }}</p>
                            <p class="mt-1 break-words text-foreground">{{ adjustment.reason || ('finances.adjust.noReason' | translate) }}</p>
                          </div>
                          <div class="flex flex-wrap items-center gap-1.5">
                            @if (expenseStore.pendingSyncIds().includes(adjustment.id)) {
                              <span class="flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                                <lucide-icon name="cloud-off" class="h-3 w-3" />
                                {{ 'finances.adjust.localOnly' | translate }}
                              </span>
                            }
                            <span class="rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {{ adjustmentKindLabel(adjustment.kind) }}
                            </span>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
              </article>
            }
          </div>
        }
      </app-section-card>

      <app-section-card [title]="'finances.cards.title' | translate" [description]="'finances.cards.description' | translate">
        @if (creditCards().length === 0) {
          <div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <lucide-icon name="credit-card" class="h-6 w-6" />
            </div>
            <p class="mt-3 text-sm font-semibold">{{ 'finances.cards.emptyTitle' | translate }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ 'finances.cards.emptyDescription' | translate }}</p>
          </div>
        } @else {
          <div class="grid gap-3">
            @for (card of creditCards(); track card.id) {
              <article class="rounded-2xl border border-border bg-background/60 p-4">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                        <lucide-icon name="credit-card" class="h-5 w-5" />
                      </span>
                      <div class="min-w-0">
                        <h2 class="truncate text-base font-semibold">{{ card.name }}</h2>
                        <p class="text-xs text-muted-foreground">
                          {{ card.cardNetworkOrBank || debtTypeLabel(card.type) }}@if (card.cardLast4) { · ····{{ card.cardLast4 }}}
                        </p>
                      </div>
                    </div>

                    <div class="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                      <span class="text-xs text-muted-foreground">{{ 'finances.cards.outstanding' | translate }}</span>
                      <strong class="text-lg tabular-nums" [class.text-destructive]="card.remainingBalance > 0">{{ card.remainingBalance | currencyFormat }}</strong>
                    </div>

                    @if (creditUtilization(card) !== null) {
                      <div class="mt-2">
                        <div class="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Credit utilization</span>
                          <span
                            class="font-semibold"
                            [class.text-emerald-600]="creditUtilization(card)! < 30"
                            [class.dark:text-emerald-400]="creditUtilization(card)! < 30"
                            [class.text-amber-600]="creditUtilization(card)! >= 30 && creditUtilization(card)! < 70"
                            [class.dark:text-amber-400]="creditUtilization(card)! >= 30 && creditUtilization(card)! < 70"
                            [class.text-destructive]="creditUtilization(card)! >= 70"
                          >{{ creditUtilization(card) }}%</span>
                        </div>
                        <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            class="h-full rounded-full transition-all"
                            [class.bg-emerald-500]="creditUtilization(card)! < 30"
                            [class.bg-amber-500]="creditUtilization(card)! >= 30 && creditUtilization(card)! < 70"
                            [class.bg-destructive]="creditUtilization(card)! >= 70"
                            [style.width.%]="creditUtilization(card)! > 100 ? 100 : creditUtilization(card)"
                          ></div>
                        </div>
                        <p class="mt-1 text-[10px] text-muted-foreground">{{ card.remainingBalance | currencyFormat }} of {{ card.creditLimit | currencyFormat }} limit · keeping this under 30% is healthy</p>
                      </div>
                    }

                    @if (cardCycle(card); as cycle) {
                      <div class="mt-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span class="font-semibold uppercase tracking-wider text-[10px]">{{ 'finances.cycle.title' | translate }}</span>
                          <span>{{ cycleDateLabel(cycle.billDate) }} → {{ cycleDateLabel(cycle.nextBillDate) }}</span>
                        </div>
                        <div class="mt-1.5 grid gap-1 text-xs sm:grid-cols-3">
                          <span class="text-muted-foreground">{{ 'finances.cycle.spent' | translate }}: <strong class="tabular-nums text-foreground">{{ cardCycleSpend(card, cycle) | currencyFormat }}</strong></span>
                          <span class="text-muted-foreground">{{ 'finances.cycle.statementDue' | translate }}: <strong class="tabular-nums" [class.text-destructive]="cardStatementDue(card, cycle) > 0">{{ cardStatementDue(card, cycle) | currencyFormat }}</strong></span>
                          @if (cycle.dueDate) {
                            <span class="font-medium text-amber-600 dark:text-amber-400">{{ 'finances.cycle.payBy' | translate }} {{ cycleDateLabel(cycle.dueDate) }}</span>
                          }
                        </div>
                        @if (cardStatement(card); as statement) {
                          @if (statement.source === 'derived') {
                            <div class="mt-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-2 text-[11px] leading-relaxed">
                              <p class="text-amber-700 dark:text-amber-400">
                                {{ 'finances.statement.generated' | translate }} {{ statementDateLabel(statement) }} ·
                                <strong class="tabular-nums">{{ statement.amount | currencyFormat }}</strong>
                                ({{ 'finances.statement.estimated' | translate }})
                              </p>
                              <p class="mt-0.5 text-muted-foreground">{{ 'finances.statement.confirmHint' | translate }}</p>
                              <div class="mt-1.5 flex flex-wrap gap-2">
                                <button type="button" class="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90" [disabled]="saving()" (click)="acceptStatement(card)">
                                  {{ 'finances.statement.confirm' | translate }}
                                </button>
                                <button type="button" class="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-accent" (click)="startStatementEdit(card)">
                                  {{ 'finances.statement.edit' | translate }}
                                </button>
                              </div>
                            </div>
                          } @else {
                            <p class="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                              <span [style.color]="'var(--success)'">
                                ✓ {{ 'finances.statement.confirmedLabel' | translate }} · {{ statementDateLabel(statement) }} ·
                                <strong class="tabular-nums">{{ statement.amount | currencyFormat }}</strong>
                              </span>
                              <button type="button" class="font-semibold text-muted-foreground underline-offset-2 hover:underline" (click)="startStatementEdit(card)">
                                {{ 'finances.statement.edit' | translate }}
                              </button>
                            </p>
                          }
                          @if (editingStatementCard()?.id === card.id) {
                            <form [formGroup]="statementForm" (ngSubmit)="saveStatement()" class="mt-2 grid gap-2 rounded-lg border border-border bg-background/60 p-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                              <label class="space-y-1">
                                <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.statement.amount' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                                <input appClearable type="number" min="0" step="0.01" formControlName="amount" class="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs" />
                              </label>
                              <label class="space-y-1">
                                <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.statement.minDue' | translate }}</span>
                                <input appClearable type="number" min="0" step="0.01" formControlName="minDue" class="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs" />
                              </label>
                              <button type="submit" class="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90" [disabled]="saving()">
                                {{ 'finances.statement.save' | translate }}
                              </button>
                              <button type="button" class="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-accent" (click)="cancelStatementEdit()">
                                {{ 'common.cancel' | translate }}
                              </button>
                            </form>
                          }
                        }
                        @if (cardCashback(card) > 0) {
                          <p class="mt-1.5 text-[11px]" [style.color]="'var(--success)'">
                            <lucide-icon name="star" class="inline h-3 w-3 align-[-2px]" />
                            {{ 'finances.cycle.cashbackEarned' | translate }}: <strong class="tabular-nums">{{ cardCashback(card) | currencyFormat }}</strong>
                          </p>
                        }
                      </div>
                    } @else if (cardCashback(card) > 0) {
                      <p class="mt-2 text-[11px]" [style.color]="'var(--success)'">
                        <lucide-icon name="star" class="inline h-3 w-3 align-[-2px]" />
                        {{ 'finances.cycle.cashbackEarned' | translate }}: <strong class="tabular-nums">{{ cardCashback(card) | currencyFormat }}</strong>
                      </p>
                    }

                    <div class="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      @if (card.paymentDueDay) {
                        <span class="font-medium text-amber-600 dark:text-amber-400">Due: {{ card.paymentDueDay }}{{ daySuffix(card.paymentDueDay) }} every month</span>
                      }
                      @if (card.billGenerationDay) {
                        <span>Bill Date: {{ card.billGenerationDay }}{{ daySuffix(card.billGenerationDay) }} every month</span>
                      }
                      @if (card.minimumPaymentAmount) {
                        <span>Min. Payment: {{ card.minimumPaymentAmount | currencyFormat }}</span>
                      }
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2 lg:justify-end">
                    @if (card.remainingBalance > 0) {
                      <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startDebtPayment(card)">
                        {{ 'finances.cards.payBill' | translate }}
                      </button>
                    }
                    <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startCardAdjustment(card)">
                      {{ 'finances.cardAdjust.open' | translate }}
                    </button>
                    <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startCardEdit(card)" [attr.aria-label]="'common.edit' | translate">
                      <lucide-icon name="pencil" class="h-4 w-4" />
                    </button>
                    <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestDebtDelete(card)" [attr.aria-label]="'common.delete' | translate">
                      <lucide-icon name="trash-2" class="h-4 w-4" />
                    </button>
                  </div>
                </div>

                @if (payingDebt()?.id === card.id) {
                  <form [formGroup]="paymentForm" (ngSubmit)="saveDebtPayment()" class="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_minmax(160px,1fr)_auto] sm:items-end">
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.amount' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <input appClearable type="number" min="0.01" step="0.01" formControlName="amount" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.date' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <input appClearable type="date" formControlName="date" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'daily.paymentSource' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
                      <app-themed-select formControlName="accountId" [options]="paymentAccountOptions()" size="sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.comment' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
                      <input appClearable type="text" formControlName="comment" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" [placeholder]="'finances.debts.paymentCommentPlaceholder' | translate" />
                    </label>
                    <div class="flex gap-2">
                      <button type="button" class="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground" (click)="cancelDebtPayment()">{{ 'common.cancel' | translate }}</button>
                      <button type="submit" class="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60" [disabled]="saving() || activeAccounts().length === 0">
                        {{ editingDebtPayment() ? ('finances.debts.updatePayment' | translate) : ('finances.debts.savePayment' | translate) }}
                      </button>
                    </div>
                  </form>
                }

                @if (adjustingCard()?.id === card.id) {
                  <form [formGroup]="cardAdjustmentForm" (ngSubmit)="saveCardAdjustment()" class="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/30 p-3 sm:grid-cols-[170px_1fr_1fr_minmax(160px,1fr)_auto] sm:items-end">
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cardAdjust.kind' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <app-themed-select formControlName="kind" [options]="cardAdjustmentKindOptions()" size="sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.amount' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <input appClearable type="number" min="0.01" step="0.01" formControlName="amount" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.date' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <input appClearable type="date" formControlName="date" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    @if (cardAdjustKind() === 'cash-withdrawal') {
                      <label class="space-y-1">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cardAdjust.cashAccount' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                        <app-themed-select formControlName="accountId" [options]="paymentAccountOptions()" size="sm" />
                      </label>
                    } @else {
                      <label class="space-y-1">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cardAdjust.reason' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
                        <input appClearable type="text" formControlName="reason" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" [placeholder]="'finances.cardAdjust.reasonPlaceholder' | translate" />
                      </label>
                    }
                    <div class="flex gap-2">
                      <button type="button" class="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground" (click)="cancelCardAdjustment()">{{ 'common.cancel' | translate }}</button>
                      <button type="submit" class="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60" [disabled]="saving() || (cardAdjustKind() === 'cash-withdrawal' && activeAccounts().length === 0)">
                        {{ 'finances.cardAdjust.save' | translate }}
                      </button>
                    </div>
                    <p class="text-[10px] leading-relaxed text-muted-foreground sm:col-span-full">{{ ('finances.cardAdjust.hint.' + cardAdjustKind()) | translate }}</p>
                    @if (cardAdjustKind() === 'refund' && refundMatchCandidates().length > 0) {
                      <div class="sm:col-span-full">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cardAdjust.matchTitle' | translate }}</p>
                        <div class="mt-1.5 flex flex-wrap gap-1.5">
                          @for (candidate of refundMatchCandidates(); track candidate.id) {
                            <button
                              type="button"
                              (click)="toggleRefundMatch(candidate.id)"
                              class="rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition"
                              [class.border-primary]="selectedRefundMatchId() === candidate.id"
                              [class.bg-primary/10]="selectedRefundMatchId() === candidate.id"
                              [class.text-primary]="selectedRefundMatchId() === candidate.id"
                              [class.border-border]="selectedRefundMatchId() !== candidate.id"
                              [class.text-muted-foreground]="selectedRefundMatchId() !== candidate.id"
                            >
                              <span class="block font-semibold">{{ refundMatchLabel(candidate) }}</span>
                              <span class="block tabular-nums">{{ candidate.amount | currencyFormat }} · {{ candidate.date | dateFormat }}</span>
                            </button>
                          }
                        </div>
                        <p class="mt-1 text-[10px] text-muted-foreground">{{ 'finances.cardAdjust.matchHint' | translate }}</p>
                      </div>
                    }
                  </form>
                }

                @if (debtAdjustmentsForCard(card.id).length > 0) {
                  <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cardAdjust.history' | translate }}</p>
                    <div class="mt-2 grid gap-2">
                      @for (adjustment of debtAdjustmentsForCard(card.id); track adjustment.id) {
                        <div class="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-background/70 px-3 py-2 text-xs">
                          <div class="min-w-0">
                            <p
                              class="font-semibold tabular-nums"
                              [class.text-destructive]="!isCardCredit(adjustment.kind)"
                              [style.color]="isCardCredit(adjustment.kind) ? 'var(--success)' : null"
                            >
                              {{ isCardCredit(adjustment.kind) ? '−' : '+' }}{{ adjustment.amount | currencyFormat }}
                            </p>
                            <p class="text-muted-foreground">
                              {{ adjustment.date | dateFormat }}@if (adjustment.linkedAccountId) {<span> · {{ accountName(adjustment.linkedAccountId) }}</span>}
                            </p>
                            @if (linkedExpenseLabel(adjustment)) {
                              <p class="mt-0.5 text-[10px] text-muted-foreground">↩ {{ linkedExpenseLabel(adjustment) }}</p>
                            }
                            @if (adjustment.reason) {
                              <p class="mt-0.5 break-words text-foreground">{{ adjustment.reason }}</p>
                            }
                          </div>
                          <div class="flex shrink-0 items-center gap-2">
                            @if (expenseStore.pendingSyncIds().includes(adjustment.id)) {
                              <span class="flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                                <lucide-icon name="cloud-off" class="h-2.5 w-2.5" />
                                {{ 'finances.adjust.localOnly' | translate }}
                              </span>
                            }
                            <span class="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {{ cardAdjustmentKindLabel(adjustment.kind) }}
                            </span>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }

                <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.payments.history' | translate }}</p>
                  @if (debtPaymentsForDebt(card.id).length === 0) {
                    <p class="mt-2 text-xs text-muted-foreground">{{ 'finances.payments.noHistory' | translate }}</p>
                  } @else {
                    <div class="mt-2 grid gap-2">
                      @for (payment of debtPaymentsForDebt(card.id); track payment.id) {
                        <div class="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-background/70 px-3 py-2 text-xs">
                          <div class="min-w-0">
                            <p class="font-semibold tabular-nums">{{ payment.amount | currencyFormat }}</p>
                            <p class="text-muted-foreground">{{ payment.date | dateFormat }} · {{ accountName(payment.accountId) }}</p>
                            @if (paymentComment(payment)) {
                              <p class="mt-0.5 break-words text-foreground">{{ paymentComment(payment) }}</p>
                            }
                          </div>
                          <div class="flex shrink-0 gap-2">
                            <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startDebtPayment(card, payment)" [attr.aria-label]="'common.edit' | translate">
                              <lucide-icon name="pencil" class="h-4 w-4" />
                            </button>
                            <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestPaymentDelete(payment)" [attr.aria-label]="'common.delete' | translate">
                              <lucide-icon name="trash-2" class="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </article>
            }
          </div>
        }
      </app-section-card>

      <app-section-card [title]="'finances.debts.title' | translate" [description]="'finances.debts.description' | translate">
        @if (visibleDebts().length === 0) {
          <div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <lucide-icon name="landmark" class="h-6 w-6" />
            </div>
            <p class="mt-3 text-sm font-semibold">{{ 'finances.debts.emptyTitle' | translate }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ 'finances.debts.emptyDescription' | translate }}</p>
          </div>
        } @else {
          <div class="grid gap-3">
            @for (debt of visibleDebts(); track debt.id) {
              <article class="rounded-2xl border border-border bg-background/60 p-4">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="grid h-10 w-10 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                        <lucide-icon name="landmark" class="h-5 w-5" />
                      </span>
                      <div class="min-w-0">
                        <h2 class="truncate text-base font-semibold">{{ debt.name }}</h2>
                        <p class="text-xs text-muted-foreground">{{ debtTypeLabel(debt.type) }} · {{ debtStatusLabel(debt.status) }}</p>
                      </div>
                    </div>

                    <div class="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div class="h-full rounded-full bg-destructive" [style.width.%]="debtProgress(debt)"></div>
                    </div>
                    <div class="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <span>{{ 'finances.debts.remaining' | translate }}: <strong class="text-foreground">{{ debt.remainingBalance | currencyFormat }}</strong></span>
                      <span>{{ 'finances.debts.paid' | translate }}: {{ debtPaidAmount(debt) | currencyFormat }}</span>
                    </div>

                    <div class="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>{{ 'finances.debts.principalAmount' | translate }}: {{ debt.principalAmount | currencyFormat }}</span>
                      @if (debt.monthlyEmi !== undefined) {
                        <span>{{ 'finances.debts.monthlyEmi' | translate }}: {{ debt.monthlyEmi | currencyFormat }}</span>
                      }
                      @if (debt.nextDueDate) {
                        <span>{{ 'finances.debts.nextDueDate' | translate }}: {{ debt.nextDueDate }}</span>
                      }
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2 lg:justify-end">
                    @if (debt.status === 'active') {
                      <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startDebtPayment(debt)">
                        {{ 'finances.debts.recordPayment' | translate }}
                      </button>
                    }
                    <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startDebtEdit(debt)" [attr.aria-label]="'common.edit' | translate">
                      <lucide-icon name="pencil" class="h-4 w-4" />
                    </button>
                    <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestDebtDelete(debt)" [attr.aria-label]="'common.delete' | translate">
                      <lucide-icon name="trash-2" class="h-4 w-4" />
                    </button>
                  </div>
                </div>

                @if (payingDebt()?.id === debt.id) {
                  <form [formGroup]="paymentForm" (ngSubmit)="saveDebtPayment()" class="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_minmax(160px,1fr)_auto] sm:items-end">
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.amount' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <input appClearable type="number" min="0.01" step="0.01" formControlName="amount" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.date' | translate }}<span class="text-destructive ml-0.5">*</span></span>
                      <input appClearable type="date" formControlName="date" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'daily.paymentSource' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
                      <app-themed-select formControlName="accountId" [options]="paymentAccountOptions()" size="sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.comment' | translate }}<span class="text-muted-foreground ml-0.5">{{ 'common.optional' | translate }}</span></span>
                      <input appClearable type="text" formControlName="comment" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" [placeholder]="'finances.debts.paymentCommentPlaceholder' | translate" />
                    </label>
                    <div class="flex gap-2">
                      <button type="button" class="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground" (click)="cancelDebtPayment()">{{ 'common.cancel' | translate }}</button>
                      <button type="submit" class="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60" [disabled]="saving() || activeAccounts().length === 0">
                        {{ editingDebtPayment() ? ('finances.debts.updatePayment' | translate) : ('finances.debts.savePayment' | translate) }}
                      </button>
                    </div>
                  </form>
                }

                <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.payments.history' | translate }}</p>
                  @if (debtPaymentsForDebt(debt.id).length === 0) {
                    <p class="mt-2 text-xs text-muted-foreground">{{ 'finances.payments.noHistory' | translate }}</p>
                  } @else {
                    <div class="mt-2 grid gap-2">
                      @for (payment of debtPaymentsForDebt(debt.id); track payment.id) {
                        <div class="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-background/70 px-3 py-2 text-xs">
                          <div class="min-w-0">
                            <p class="font-semibold tabular-nums">{{ payment.amount | currencyFormat }}</p>
                            <p class="text-muted-foreground">{{ payment.date | dateFormat }} · {{ accountName(payment.accountId) }}</p>
                            @if (paymentComment(payment)) {
                              <p class="mt-0.5 break-words text-foreground">{{ paymentComment(payment) }}</p>
                            }
                          </div>
                          <div class="flex shrink-0 gap-2">
                            <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startDebtPayment(debt, payment)" [attr.aria-label]="'common.edit' | translate">
                              <lucide-icon name="pencil" class="h-4 w-4" />
                            </button>
                            <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestPaymentDelete(payment)" [attr.aria-label]="'common.delete' | translate">
                              <lucide-icon name="trash-2" class="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </article>
            }
          </div>
        }
      </app-section-card>

      <app-modal
        class="contents"
        [isOpen]="!!deleteTarget()"
        [title]="'finances.accounts.deleteTitle' | translate"
        (cancelled)="deleteTarget.set(null)"
        (confirmed)="confirmDelete()"
      >
        <p class="text-sm text-muted-foreground">
          {{ i18n.t('finances.accounts.deleteDescription', { name: deleteTarget()?.name ?? '' }) }}
        </p>
      </app-modal>

      <app-modal
        class="contents"
        [isOpen]="!!deleteDebtTarget()"
        [title]="'finances.debts.deleteTitle' | translate"
        (cancelled)="deleteDebtTarget.set(null)"
        (confirmed)="confirmDebtDelete()"
      >
        <p class="text-sm text-muted-foreground">
          {{ i18n.t('finances.debts.deleteDescription', { name: deleteDebtTarget()?.name ?? '' }) }}
        </p>
      </app-modal>

      <app-modal
        class="contents"
        [isOpen]="!!confirmingDeletePayment()"
        [title]="'finances.payments.deleteConfirmTitle' | translate"
        [showActions]="false"
        (cancelled)="cancelPaymentDelete()"
      >
        <p class="text-sm text-muted-foreground">
          {{ 'finances.payments.deleteConfirmMessage' | translate }}
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            (click)="cancelPaymentDelete()"
            class="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
          >
            {{ 'common.cancel' | translate }}
          </button>
          <button
            type="button"
            (click)="confirmPaymentDelete()"
            [disabled]="isDeletingPayment()"
            class="rounded-xl border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (isDeletingPayment()) {
              <span class="inline-flex items-center gap-2">
                <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                {{ 'common.loading' | translate }}
              </span>
            } @else {
              {{ 'common.delete' | translate }}
            }
          </button>
        </div>
      </app-modal>
    </div>
  `,
})
export class FinancesComponent {
  readonly expenseStore = inject(ExpenseStore);
  readonly i18n = inject(I18nService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly currencyService = inject(CurrencyService);
  // CC bill notification scheduling now lives in ExpenseStore (runs on app
  // data load and every debt-affecting mutation, not just Finances visits).

  readonly accountTypes: AssetAccountType[] = ['bank', 'wallet', 'cash', 'other'];
  // Credit cards have their own dedicated creation flow — they are not "borrowed money".
  readonly debtTypes: DebtAccountType[] = ['personal-loan', 'vehicle-loan', 'home-loan', 'other'];
  readonly dayOptions = Array.from({ length: 28 }, (_, i) => i + 1);

  daySuffix(d: number): string {
    if (d >= 11 && d <= 13) return 'th';
    switch (d % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }
  readonly activeAccounts = computed(() => this.expenseStore.activeAccounts());
  readonly activeDebts = computed(() => this.expenseStore.activeDebts());
  readonly visibleDebts = computed(() => [
    ...this.expenseStore.activeDebts().filter((debt) => debt.type !== 'credit-card'),
    ...this.expenseStore.debts().filter((debt) => debt.status === 'paid' && debt.type !== 'credit-card'),
  ]);
  readonly creditCards = computed(() =>
    this.expenseStore.debts().filter((debt) => debt.type === 'credit-card' && debt.status !== 'archived')
  );
  readonly showAccountForm = signal(false);
  readonly showDebtForm = signal(false);
  readonly showCardForm = signal(false);
  readonly editingAccount = signal<AssetAccount | null>(null);
  readonly editingCard = signal<DebtAccount | null>(null);
  readonly editingDebt = signal<DebtAccount | null>(null);
  readonly editingDebtPayment = signal<DebtPayment | null>(null);
  readonly adjustingAccount = signal<AssetAccount | null>(null);
  readonly adjustingCard = signal<DebtAccount | null>(null);
  /** Mirror signals for cardAdjustmentForm controls (OnPush template reactivity). */
  readonly cardAdjustKind = signal<DebtAdjustmentKind>('refund');
  readonly cardAdjustAmount = signal(0);
  readonly cardAdjustDate = signal(toLocalDateString());
  /** Refund auto-match: the original purchase the user chose to link. */
  readonly selectedRefundMatchId = signal<string | null>(null);
  /** Suggested original purchases for the refund being entered (same card, same amount, ≤90 days). */
  readonly refundMatchCandidates = computed<ExpenseEntry[]>(() => {
    const card = this.adjustingCard();
    if (!card || this.cardAdjustKind() !== 'refund') return [];
    return matchRefundCandidates(
      this.expenseStore.entries(),
      this.expenseStore.debtAdjustments(),
      card.id,
      this.cardAdjustAmount(),
      this.cardAdjustDate()
    );
  });
  readonly payingDebt = signal<DebtAccount | null>(null);
  /** Card whose statement amount is being edited inline (discrepancy fix). */
  readonly editingStatementCard = signal<DebtAccount | null>(null);
  readonly deleteTarget = signal<AssetAccount | null>(null);
  readonly deleteDebtTarget = signal<DebtAccount | null>(null);
  readonly confirmingDeletePayment = signal<DebtPayment | null>(null);
  readonly isDeletingPayment = signal(false);
  readonly saving = signal(false);

  readonly accountForm = new FormBuilder().nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    type: ['bank' as AssetAccountType, Validators.required],
    balance: [0, Validators.required],
    allowOverdraft: [false],
    isDefault: [false],
  });

  readonly adjustmentForm = new FormBuilder().nonNullable.group({
    kind: ['increase' as 'increase' | 'decrease', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    reason: [''],
  });

  readonly debtForm = new FormBuilder().nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    type: ['personal-loan' as DebtAccountType, Validators.required],
    principalAmount: [0, [Validators.required, Validators.min(0.01)]],
    remainingBalance: [0, [Validators.required, Validators.min(0)]],
    interestRate: [0],
    monthlyEmi: [0],
    startDate: [toLocalDateString(), Validators.required],
    nextDueDate: [''],
  });

  /**
   * Credit-card model: there is a limit, spends grow the outstanding, paying
   * the bill brings it back down. No "borrowed amount"/"remaining balance"
   * loan semantics. Stored as a DebtAccount(type 'credit-card') under the
   * hood so payments, reminders, widget and Daily flows keep working.
   */
  readonly cardForm = new FormBuilder().nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    cardNetworkOrBank: [''],
    creditLimit: [0, Validators.min(0)],
    currentOutstanding: [0, Validators.min(0)],
    billGenerationDay: [0],
    paymentDueDay: [0],
    minimumPaymentAmount: [0, Validators.min(0)],
    cardLast4: ['', Validators.pattern(/^\d{4}$/)],
  });

  /**
   * Statement confirmation/correction: the derived snapshot is an estimate —
   * the bank's real bill can differ (interest, fees, EMI conversions Spenza
   * never sees). The user overrides it here; reminders then use this amount.
   */
  readonly statementForm = new FormBuilder().nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0)]],
    minDue: [0, Validators.min(0)],
  });

  readonly paymentForm = new FormBuilder().nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [toLocalDateString(), Validators.required],
    accountId: [''],
    comment: [''],
  });

  /**
   * Non-purchase card movements: refund (outstanding ↓), cash withdrawal
   * (outstanding ↑ + receiving account ↑), fee/charge (outstanding ↑).
   * None of these are expenses — see ExpenseStore.recordDebtAdjustment.
   */
  readonly cardAdjustmentForm = new FormBuilder().nonNullable.group({
    kind: ['refund' as DebtAdjustmentKind, Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [toLocalDateString(), Validators.required],
    accountId: [''],
    reason: [''],
  });

  constructor() {
    this.cardAdjustmentForm.get('kind')!.valueChanges.subscribe((kind) => this.cardAdjustKind.set(kind));
    this.cardAdjustmentForm.get('amount')!.valueChanges.subscribe((amount) => this.cardAdjustAmount.set(Number(amount) || 0));
    this.cardAdjustmentForm.get('date')!.valueChanges.subscribe((date) => this.cardAdjustDate.set(date || toLocalDateString()));
  }

  startCreate(): void {
    this.editingAccount.set(null);
    this.accountForm.reset({
      name: '',
      type: 'bank',
      balance: 0,
      allowOverdraft: false,
      isDefault: this.activeAccounts().length === 0,
    });
    this.showAccountForm.set(true);
  }

  startEdit(account: AssetAccount): void {
    this.editingAccount.set(account);
    this.accountForm.reset({
      name: account.name,
      type: account.type,
      balance: account.balance,
      allowOverdraft: account.allowOverdraft,
      isDefault: account.isDefault,
    });
    this.showAccountForm.set(true);
  }

  cancelAccountForm(): void {
    this.showAccountForm.set(false);
    this.editingAccount.set(null);
  }

  startDebtCreate(): void {
    this.editingDebt.set(null);
    this.debtForm.reset({
      name: '',
      type: 'personal-loan',
      principalAmount: 0,
      remainingBalance: 0,
      interestRate: 0,
      monthlyEmi: 0,
      startDate: toLocalDateString(),
      nextDueDate: '',
    });
    this.showDebtForm.set(true);
  }

  startDebtEdit(debt: DebtAccount): void {
    if (debt.type === 'credit-card') {
      this.startCardEdit(debt);
      return;
    }
    this.editingDebt.set(debt);
    this.debtForm.reset({
      name: debt.name,
      type: debt.type,
      principalAmount: debt.principalAmount,
      remainingBalance: debt.remainingBalance,
      interestRate: debt.interestRate ?? 0,
      monthlyEmi: debt.monthlyEmi ?? 0,
      startDate: debt.startDate,
      nextDueDate: debt.nextDueDate ?? '',
    });
    this.showDebtForm.set(true);
  }

  startCardCreate(): void {
    this.editingCard.set(null);
    this.cardForm.reset({
      name: '',
      cardNetworkOrBank: '',
      creditLimit: 0,
      currentOutstanding: 0,
      billGenerationDay: 0,
      paymentDueDay: 0,
      minimumPaymentAmount: 0,
      cardLast4: '',
    });
    this.showCardForm.set(true);
  }

  startCardEdit(card: DebtAccount): void {
    this.editingCard.set(card);
    this.cardForm.reset({
      name: card.name,
      cardNetworkOrBank: card.cardNetworkOrBank ?? '',
      creditLimit: card.creditLimit ?? 0,
      currentOutstanding: card.remainingBalance,
      billGenerationDay: card.billGenerationDay ?? 0,
      paymentDueDay: card.paymentDueDay ?? 0,
      minimumPaymentAmount: card.minimumPaymentAmount ?? 0,
      cardLast4: card.cardLast4 ?? '',
    });
    this.showCardForm.set(true);
  }

  cancelCardForm(): void {
    this.showCardForm.set(false);
    this.editingCard.set(null);
  }

  async saveCreditCard(): Promise<void> {
    if (this.cardForm.invalid) {
      this.cardForm.markAllAsTouched();
      this.feedback.warning(
        this.i18n.t('finances.cards.reviewCard'),
        this.i18n.t('finances.cards.reviewCardDetail')
      );
      return;
    }

    this.saving.set(true);
    try {
      const value = this.cardForm.getRawValue();
      const outstanding = Math.max(0, Number(value.currentOutstanding) || 0);
      const creditLimit = value.creditLimit > 0 ? value.creditLimit : undefined;
      const input = {
        name: value.name,
        type: 'credit-card' as DebtAccountType,
        // Schema compatibility: principal mirrors the limit (or outstanding)
        // so older builds reading this backup keep a sensible value.
        principalAmount: creditLimit ?? Math.max(outstanding, 1),
        remainingBalance: outstanding,
        startDate: this.editingCard()?.startDate ?? toLocalDateString(),
        billGenerationDay: value.billGenerationDay > 0 ? value.billGenerationDay : undefined,
        paymentDueDay: value.paymentDueDay > 0 ? value.paymentDueDay : undefined,
        minimumPaymentAmount: value.minimumPaymentAmount > 0 ? value.minimumPaymentAmount : undefined,
        cardNetworkOrBank: value.cardNetworkOrBank || undefined,
        cardLast4: /^\d{4}$/.test(value.cardLast4) ? value.cardLast4 : undefined,
        creditLimit,
      };
      const editing = this.editingCard();
      if (editing) {
        await this.expenseStore.updateDebt(editing.id, input);
        this.feedback.success(
          this.i18n.t('finances.cards.updated'),
          this.i18n.t('finances.feedback.savedToDrive')
        );
      } else {
        await this.expenseStore.addDebt(input);
        this.feedback.success(
          this.i18n.t('finances.cards.created'),
          this.i18n.t('finances.feedback.savedToDrive')
        );
      }
      this.cancelCardForm();
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.cards.notSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  cancelDebtForm(): void {
    this.showDebtForm.set(false);
    this.editingDebt.set(null);
  }

  /** Utilization percent (rounded) when a credit limit is configured, else null. */
  creditUtilization(debt: DebtAccount): number | null {
    if (!debt.creditLimit || debt.creditLimit <= 0) return null;
    return Math.round((debt.remainingBalance / debt.creditLimit) * 100);
  }

  async saveDebt(): Promise<void> {
    if (this.debtForm.invalid) {
      this.debtForm.markAllAsTouched();
      this.feedback.warning(
        this.i18n.t('finances.feedback.reviewDebt'),
        this.i18n.t('finances.feedback.reviewDebtDetail')
      );
      return;
    }

    this.saving.set(true);
    try {
      const value = this.debtForm.getRawValue();
      const input = {
        name: value.name,
        type: value.type,
        principalAmount: value.principalAmount,
        remainingBalance: value.remainingBalance,
        interestRate: value.interestRate > 0 ? value.interestRate : undefined,
        monthlyEmi: value.monthlyEmi > 0 ? value.monthlyEmi : undefined,
        startDate: value.startDate,
        nextDueDate: value.nextDueDate || undefined,
      };
      const editing = this.editingDebt();
      if (editing) {
        await this.expenseStore.updateDebt(editing.id, input);
        this.feedback.success(
          this.i18n.t('finances.feedback.debtUpdated'),
          this.i18n.t('finances.feedback.savedToDrive')
        );
      } else {
        await this.expenseStore.addDebt(input);
        this.feedback.success(
          this.i18n.t('finances.feedback.debtCreated'),
          this.i18n.t('finances.feedback.savedToDrive')
        );
      }
      this.cancelDebtForm();
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.debtNotSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      this.feedback.warning(
        this.i18n.t('finances.feedback.reviewAccount'),
        this.i18n.t('finances.feedback.reviewAccountDetail')
      );
      return;
    }

    this.saving.set(true);
    try {
      const value = this.accountForm.getRawValue();
      const editing = this.editingAccount();
      if (editing) {
        await this.expenseStore.updateAccount(editing.id, {
          name: value.name,
          type: value.type,
          allowOverdraft: value.allowOverdraft,
          isDefault: value.isDefault,
        });
        this.feedback.success(
          this.i18n.t('finances.feedback.accountUpdated'),
          this.i18n.t('finances.feedback.savedToDrive')
        );
      } else {
        await this.expenseStore.addAccount(value);
        this.feedback.success(
          this.i18n.t('finances.feedback.accountCreated'),
          this.i18n.t('finances.feedback.savedToDrive')
        );
      }
      this.cancelAccountForm();
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.accountNotSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  async setDefault(account: AssetAccount): Promise<void> {
    this.saving.set(true);
    try {
      await this.expenseStore.setDefaultAccount(account.id);
      this.feedback.success(
        this.i18n.t('finances.feedback.defaultUpdated'),
        this.i18n.t('finances.feedback.savedToDrive')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.accountNotSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  startAdjustment(account: AssetAccount): void {
    this.adjustingAccount.set(account);
    this.adjustmentForm.reset({ kind: 'increase', amount: 0, reason: '' });
  }

  cancelAdjustment(): void {
    this.adjustingAccount.set(null);
  }

  startDebtPayment(debt: DebtAccount, payment?: DebtPayment): void {
    this.payingDebt.set(debt);
    this.editingDebtPayment.set(payment ?? null);
    this.paymentForm.reset({
      amount: payment?.amount ?? Math.min(debt.monthlyEmi ?? debt.remainingBalance, debt.remainingBalance),
      date: payment?.date ?? toLocalDateString(),
      accountId: payment?.accountId ?? this.expenseStore.defaultAccount()?.id ?? this.activeAccounts()[0]?.id ?? '',
      comment: payment ? this.expenseStore.entries().find((entry) => entry.id === payment.expenseId)?.comment ?? '' : '',
    });
  }

  cancelDebtPayment(): void {
    this.payingDebt.set(null);
    this.editingDebtPayment.set(null);
  }

  async saveDebtPayment(): Promise<void> {
    const debt = this.payingDebt();
    if (!debt) return;
    if (this.paymentForm.invalid || !this.paymentForm.getRawValue().accountId) {
      this.paymentForm.markAllAsTouched();
      this.feedback.warning(
        this.i18n.t('finances.feedback.reviewDebtPayment'),
        this.i18n.t('finances.feedback.reviewDebtPaymentDetail')
      );
      return;
    }

    this.saving.set(true);
    try {
      const value = this.paymentForm.getRawValue();
      const editingPayment = this.editingDebtPayment();
      if (editingPayment) {
        await this.expenseStore.updateDebtPayment(editingPayment.id, {
          accountId: value.accountId,
          amount: value.amount,
          date: value.date,
          comment: value.comment,
        });
      } else {
        await this.expenseStore.recordDebtPayment({
          debtId: debt.id,
          accountId: value.accountId,
          amount: value.amount,
          date: value.date,
          comment: value.comment,
        });
      }
      this.feedback.success(
        this.i18n.t(editingPayment ? 'finances.feedback.debtPaymentUpdated' : 'finances.feedback.debtPaymentSaved'),
        this.i18n.t('finances.feedback.savedToDrive')
      );
      this.cancelDebtPayment();
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.debtPaymentNotSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  async saveAdjustment(): Promise<void> {
    const account = this.adjustingAccount();
    if (!account) return;
    if (this.adjustmentForm.invalid) {
      this.adjustmentForm.markAllAsTouched();
      this.feedback.warning(
        this.i18n.t('finances.feedback.reviewAdjustment'),
        this.i18n.t('finances.feedback.reviewAdjustmentDetail')
      );
      return;
    }

    this.saving.set(true);
    try {
      const value = this.adjustmentForm.getRawValue();
      await this.expenseStore.adjustAccountBalance({
        accountId: account.id,
        amount: value.amount,
        kind: value.kind,
        reason: value.reason,
      });
      const formattedAmount = this.currencyService.format(value.amount, this.i18n.locale());
      if (this.expenseStore.syncStatus() === 'idle') {
        this.feedback.success(
          this.i18n.t('finances.feedback.balanceAdjusted'),
          this.i18n.t('finances.feedback.balanceAdjustedDetail', { amount: formattedAmount })
        );
      } else {
        this.feedback.warning(
          this.i18n.t('finances.feedback.balanceAdjustedSyncing'),
          this.i18n.t('finances.feedback.balanceAdjustedSyncingDetail', { amount: formattedAmount })
        );
      }
      this.cancelAdjustment();
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.adjustmentNotSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  requestDelete(account: AssetAccount): void {
    this.deleteTarget.set(account);
  }

  requestDebtDelete(debt: DebtAccount): void {
    this.deleteDebtTarget.set(debt);
  }

  requestPaymentDelete(payment: DebtPayment): void {
    this.confirmingDeletePayment.set(payment);
  }

  cancelPaymentDelete(): void {
    this.confirmingDeletePayment.set(null);
  }

  async confirmDelete(): Promise<void> {
    const account = this.deleteTarget();
    if (!account) return;
    this.deleteTarget.set(null);
    this.saving.set(true);
    try {
      await this.expenseStore.deleteAccount(account.id);
      this.feedback.success(
        this.i18n.t('finances.feedback.accountDeleted'),
        this.i18n.t('finances.feedback.savedToDrive')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.accountNotDeleted'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDebtDelete(): Promise<void> {
    const debt = this.deleteDebtTarget();
    if (!debt) return;
    this.deleteDebtTarget.set(null);
    this.saving.set(true);
    try {
      await this.expenseStore.deleteDebt(debt.id);
      this.feedback.success(
        this.i18n.t('finances.feedback.debtDeleted'),
        this.i18n.t('finances.feedback.savedToDrive')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.debtNotDeleted'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  async confirmPaymentDelete(): Promise<void> {
    const payment = this.confirmingDeletePayment();
    if (!payment) return;
    this.confirmingDeletePayment.set(null);
    this.isDeletingPayment.set(true);
    try {
      await this.expenseStore.deleteDebtPayment(payment.id);
      this.feedback.success(
        this.i18n.t('finances.feedback.debtPaymentDeleted'),
        this.i18n.t('finances.feedback.savedToDrive')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.debtPaymentDeleteFailed'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.isDeletingPayment.set(false);
    }
  }

  accountTypeLabel(type: AssetAccountType): string {
    return this.i18n.t(`finances.accountTypes.${type}`);
  }

  accountTypeOptions(): ThemedSelectOption[] {
    return this.accountTypes.map((type) => ({
      value: type,
      label: this.accountTypeLabel(type),
      icon: this.accountIcon(type),
    }));
  }

  debtTypeLabel(type: DebtAccountType): string {
    return this.i18n.t(`finances.debtTypes.${type}`);
  }

  debtTypeOptions(): ThemedSelectOption[] {
    return this.debtTypes.map((type) => ({
      value: type,
      label: this.debtTypeLabel(type),
      icon: this.debtTypeIcon(type),
    }));
  }

  adjustmentKindOptions(): ThemedSelectOption[] {
    return [
      { value: 'increase', label: this.i18n.t('finances.adjust.increase'), icon: 'badge-indian-rupee' },
      { value: 'decrease', label: this.i18n.t('finances.adjust.decrease'), icon: 'badge-indian-rupee' },
    ];
  }

  adjustmentKindLabel(kind: AccountBalanceAdjustment['kind']): string {
    return this.i18n.t(`finances.adjust.${kind}`);
  }

  startCardAdjustment(card: DebtAccount): void {
    this.adjustingCard.set(card);
    this.selectedRefundMatchId.set(null);
    this.cardAdjustmentForm.reset({
      kind: 'refund',
      amount: 0,
      date: toLocalDateString(),
      accountId: this.expenseStore.defaultAccount()?.id ?? this.activeAccounts()[0]?.id ?? '',
      reason: '',
    });
  }

  cancelCardAdjustment(): void {
    this.adjustingCard.set(null);
    this.selectedRefundMatchId.set(null);
  }

  cardAdjustmentKindOptions(): ThemedSelectOption[] {
    return [
      { value: 'refund', label: this.i18n.t('finances.cardAdjust.refund'), icon: 'credit-card' },
      { value: 'cash-withdrawal', label: this.i18n.t('finances.cardAdjust.cashWithdrawal'), icon: 'wallet-cards' },
      { value: 'charge', label: this.i18n.t('finances.cardAdjust.charge'), icon: 'badge-indian-rupee' },
      { value: 'cashback', label: this.i18n.t('finances.cardAdjust.cashback'), icon: 'star' },
    ];
  }

  cardAdjustmentKindLabel(kind: DebtAdjustmentKind): string {
    return this.i18n.t(kind === 'cash-withdrawal' ? 'finances.cardAdjust.cashWithdrawal' : `finances.cardAdjust.${kind}`);
  }

  /** Refund reduces the outstanding — shown green with a − sign; cashback too. */
  isCardCredit(kind: DebtAdjustmentKind): boolean {
    return kind === 'refund' || kind === 'cashback';
  }

  toggleRefundMatch(entryId: string): void {
    this.selectedRefundMatchId.set(this.selectedRefundMatchId() === entryId ? null : entryId);
  }

  refundMatchLabel(entry: ExpenseEntry): string {
    return entry.comment?.trim() || entry.type;
  }

  linkedExpenseLabel(adjustment: DebtAdjustment): string {
    if (!adjustment.linkedExpenseId) return '';
    const entry = this.expenseStore.entries().find((e) => e.id === adjustment.linkedExpenseId);
    return entry ? `${entry.comment?.trim() || entry.type} · ${entry.date}` : '';
  }

  // ─── Statement cycle & cashback (pure helpers from credit-card-insights) ──

  cardCycle(card: DebtAccount): CycleWindow | null {
    return currentCycleWindow(card, new Date());
  }

  cardCycleSpend(card: DebtAccount, cycle: CycleWindow): number {
    return cycleSpend(card, this.expenseStore.entries(), this.expenseStore.debtAdjustments(), cycle);
  }

  cardStatementDue(card: DebtAccount, cycle: CycleWindow): number {
    // Prefer the statement snapshot (user-confirmed bank amount, or the
    // frozen derived estimate) minus payments since the bill; live derivation
    // is only the fallback for cards without a snapshot yet.
    const statement = this.cardStatement(card);
    if (statement) {
      return statementRemainingDue(statement, this.expenseStore.debtPayments(), card.id);
    }
    return statementDueWithAdjustments(card, this.expenseStore.entries(), this.expenseStore.debtAdjustments(), cycle);
  }

  // ─── Statement snapshot confirm/override (discrepancy fix) ────────────────

  /** The card's snapshot when it covers the latest generated bill, else null. */
  cardStatement(card: DebtAccount): CardStatement | null {
    return statementIsCurrent(card, card.statement, new Date()) ? card.statement! : null;
  }

  statementDateLabel(statement: CardStatement): string {
    return new Date(`${statement.billDateStr}T00:00:00`).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
    });
  }

  /** One-tap confirm: the derived estimate matches the bank's bill. */
  async acceptStatement(card: DebtAccount): Promise<void> {
    const statement = this.cardStatement(card);
    if (!statement) return;
    this.saving.set(true);
    try {
      await this.expenseStore.confirmCardStatement(card.id, {
        amount: statement.amount,
        ...(statement.minDue !== undefined ? { minDue: statement.minDue } : {}),
      });
      this.feedback.success(
        this.i18n.t('finances.statement.confirmedToast'),
        this.i18n.t('finances.statement.confirmedToastDetail')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.statement.notSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  startStatementEdit(card: DebtAccount): void {
    const statement = this.cardStatement(card);
    if (!statement) return;
    this.editingStatementCard.set(card);
    this.statementForm.reset({
      amount: statement.amount,
      minDue: statement.minDue ?? card.minimumPaymentAmount ?? 0,
    });
  }

  cancelStatementEdit(): void {
    this.editingStatementCard.set(null);
  }

  async saveStatement(): Promise<void> {
    const card = this.editingStatementCard();
    if (!card) return;
    if (this.statementForm.invalid) {
      this.statementForm.markAllAsTouched();
      return;
    }
    const value = this.statementForm.getRawValue();
    this.saving.set(true);
    try {
      await this.expenseStore.confirmCardStatement(card.id, {
        amount: Number(value.amount),
        ...(Number(value.minDue) > 0 ? { minDue: Number(value.minDue) } : {}),
      });
      this.editingStatementCard.set(null);
      this.feedback.success(
        this.i18n.t('finances.statement.confirmedToast'),
        this.i18n.t('finances.statement.confirmedToastDetail')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.statement.notSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  cardCashback(card: DebtAccount): number {
    return cashbackEarned(this.expenseStore.debtAdjustments(), card.id);
  }

  cycleDateLabel(date: Date): string {
    return date.toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'short' });
  }

  debtAdjustmentsForCard(debtId: string): DebtAdjustment[] {
    return this.expenseStore.debtAdjustments()
      .filter((adjustment) => adjustment.debtId === debtId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  async saveCardAdjustment(): Promise<void> {
    const card = this.adjustingCard();
    if (!card) return;
    const value = this.cardAdjustmentForm.getRawValue();
    const needsAccount = value.kind === 'cash-withdrawal';
    if (this.cardAdjustmentForm.invalid || (needsAccount && !value.accountId)) {
      this.cardAdjustmentForm.markAllAsTouched();
      this.feedback.warning(
        this.i18n.t('finances.feedback.reviewCardAdjustment'),
        this.i18n.t('finances.feedback.reviewCardAdjustmentDetail')
      );
      return;
    }

    this.saving.set(true);
    try {
      // Refund auto-match: only pass the link when the chosen purchase is
      // still among the current candidates (amount/date edits invalidate it).
      const matchId = this.selectedRefundMatchId();
      const linkedExpenseId =
        value.kind === 'refund' && matchId && this.refundMatchCandidates().some((entry) => entry.id === matchId)
          ? matchId
          : undefined;
      await this.expenseStore.recordDebtAdjustment({
        debtId: card.id,
        kind: value.kind,
        amount: value.amount,
        date: value.date,
        ...(needsAccount ? { linkedAccountId: value.accountId } : {}),
        ...(linkedExpenseId ? { linkedExpenseId } : {}),
        reason: value.reason,
      });
      const formattedAmount = this.currencyService.format(value.amount, this.i18n.locale());
      this.feedback.success(
        this.i18n.t('finances.feedback.cardAdjustmentSaved'),
        this.i18n.t('finances.feedback.cardAdjustmentSavedDetail', { amount: formattedAmount, kind: this.cardAdjustmentKindLabel(value.kind) })
      );
      this.cancelCardAdjustment();
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.feedback.cardAdjustmentNotSaved'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  accountAdjustmentsForAccount(accountId: string): AccountBalanceAdjustment[] {
    return this.expenseStore.accountAdjustments()
      .filter((adjustment) => adjustment.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  paymentAccountOptions(): ThemedSelectOption[] {
    return this.activeAccounts().map((account) => ({
      value: account.id,
      label: account.name,
      icon: this.accountIcon(account.type),
    }));
  }

  debtPaymentsForDebt(debtId: string): DebtPayment[] {
    return this.expenseStore.debtPayments()
      .filter((payment) => payment.debtId === debtId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  accountName(accountId: string): string {
    return this.expenseStore.accounts().find((account) => account.id === accountId)?.name ?? this.i18n.t('finances.summary.none');
  }

  paymentComment(payment: DebtPayment): string {
    return this.expenseStore.entries().find((e) => e.id === payment.expenseId)?.comment ?? '';
  }

  debtTypeIcon(type: DebtAccountType): string {
    switch (type) {
      case 'credit-card':
        return 'credit-card';
      case 'personal-loan':
      case 'other':
        return 'badge-indian-rupee';
      case 'vehicle-loan':
        return 'wallet-cards';
      case 'home-loan':
        return 'landmark';
    }
  }

  debtStatusLabel(status: DebtAccount['status']): string {
    return this.i18n.t(`finances.debtStatus.${status}`);
  }

  debtPaidAmount(debt: DebtAccount): number {
    return Math.max(0, debt.principalAmount - debt.remainingBalance);
  }

  debtProgress(debt: DebtAccount): number {
    if (debt.principalAmount <= 0) return 0;
    return Math.min(100, Math.max(0, (this.debtPaidAmount(debt) / debt.principalAmount) * 100));
  }

  defaultAccountName(): string {
    return this.expenseStore.defaultAccount()?.name ?? this.i18n.t('finances.summary.none');
  }

  accountIcon(type: AssetAccountType): string {
    switch (type) {
      case 'bank':
        return 'landmark';
      case 'wallet':
      case 'cash':
        return 'wallet-cards';
      case 'other':
        return 'badge-indian-rupee';
    }
  }

}
