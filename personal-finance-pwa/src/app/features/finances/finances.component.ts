import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BadgeIndianRupee,
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
  DebtAccount,
  DebtAccountType,
  DebtPayment,
} from '../../core/models';
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
      useValue: new LucideIconProvider({ BadgeIndianRupee, CreditCard, Landmark, Pencil, Plus, Star, Trash2, WalletCards }),
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
            <lucide-icon name="credit-card" class="h-4 w-4" />
            {{ 'finances.debts.add' | translate }}
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
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.accounts.name' | translate }}</span>
            <input appClearable
              type="text"
              formControlName="name"
              class="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              [placeholder]="'finances.accounts.namePlaceholder' | translate"
            />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.accounts.type' | translate }}</span>
            <app-themed-select formControlName="type" [options]="accountTypeOptions()" />
          </label>

          @if (!editingAccount()) {
            <label class="space-y-1.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.accounts.initialBalance' | translate }}</span>
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
                <span class="block text-sm font-medium">{{ 'finances.accounts.default' | translate }}</span>
                <span class="text-xs text-muted-foreground">{{ 'finances.accounts.defaultHint' | translate }}</span>
              </span>
              <input type="checkbox" formControlName="isDefault" class="h-5 w-5 accent-primary" />
            </label>

            <label class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3">
              <span>
                <span class="block text-sm font-medium">{{ 'finances.accounts.overdraft' | translate }}</span>
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
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.name' | translate }}</span>
            <input appClearable
              type="text"
              formControlName="name"
              class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              [placeholder]="'finances.debts.namePlaceholder' | translate"
            />
          </label>

          <div class="relative col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.type' | translate }}</span>
            <app-themed-select formControlName="type" [options]="debtTypeOptions()" />
          </div>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.principalAmount' | translate }}</span>
            <input appClearable type="number" min="0.01" step="0.01" formControlName="principalAmount" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.remainingBalance' | translate }}</span>
            <input appClearable type="number" min="0" step="0.01" formControlName="remainingBalance" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.interestRate' | translate }}</span>
            <input appClearable type="number" min="0" step="0.01" formControlName="interestRate" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.monthlyEmi' | translate }}</span>
            <input appClearable type="number" min="0" step="0.01" formControlName="monthlyEmi" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.startDate' | translate }}</span>
            <input appClearable type="date" formControlName="startDate" class="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>

          <label class="col-span-2 space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.debts.nextDueDate' | translate }}</span>
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
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.adjust.kind' | translate }}</span>
                      <app-themed-select formControlName="kind" [options]="adjustmentKindOptions()" size="sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.amount' | translate }}</span>
                      <input appClearable type="number" min="0.01" step="0.01" formControlName="amount" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.adjust.reason' | translate }}</span>
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
                          <span class="rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {{ adjustmentKindLabel(adjustment.kind) }}
                          </span>
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

      <app-section-card [title]="'finances.debts.title' | translate" [description]="'finances.debts.description' | translate">
        @if (expenseStore.debts().length === 0) {
          <div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <lucide-icon name="credit-card" class="h-6 w-6" />
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
                        <lucide-icon name="credit-card" class="h-5 w-5" />
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
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.amount' | translate }}</span>
                      <input appClearable type="number" min="0.01" step="0.01" formControlName="amount" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.date' | translate }}</span>
                      <input appClearable type="date" formControlName="date" class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'daily.paymentSource' | translate }}</span>
                      <app-themed-select formControlName="accountId" [options]="paymentAccountOptions()" size="sm" />
                    </label>
                    <label class="space-y-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'common.comment' | translate }}</span>
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

  readonly accountTypes: AssetAccountType[] = ['bank', 'wallet', 'cash', 'other'];
  readonly debtTypes: DebtAccountType[] = ['credit-card', 'personal-loan', 'vehicle-loan', 'home-loan', 'other'];
  readonly activeAccounts = computed(() => this.expenseStore.activeAccounts());
  readonly activeDebts = computed(() => this.expenseStore.activeDebts());
  readonly visibleDebts = computed(() => [
    ...this.expenseStore.activeDebts(),
    ...this.expenseStore.debts().filter((debt) => debt.status === 'paid'),
  ]);
  readonly showAccountForm = signal(false);
  readonly showDebtForm = signal(false);
  readonly editingAccount = signal<AssetAccount | null>(null);
  readonly editingDebt = signal<DebtAccount | null>(null);
  readonly editingDebtPayment = signal<DebtPayment | null>(null);
  readonly adjustingAccount = signal<AssetAccount | null>(null);
  readonly payingDebt = signal<DebtAccount | null>(null);
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
    type: ['credit-card' as DebtAccountType, Validators.required],
    principalAmount: [0, [Validators.required, Validators.min(0.01)]],
    remainingBalance: [0, [Validators.required, Validators.min(0)]],
    interestRate: [0],
    monthlyEmi: [0],
    startDate: [toLocalDateString(), Validators.required],
    nextDueDate: [''],
  });

  readonly paymentForm = new FormBuilder().nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [toLocalDateString(), Validators.required],
    accountId: [''],
    comment: [''],
  });

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
      type: 'credit-card',
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

  cancelDebtForm(): void {
    this.showDebtForm.set(false);
    this.editingDebt.set(null);
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
      this.feedback.success(
        this.i18n.t('finances.feedback.balanceAdjusted'),
        this.i18n.t('finances.feedback.balanceAdjustedDetail', {
          amount: this.currencyService.format(value.amount, this.i18n.locale()),
        })
      );
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
