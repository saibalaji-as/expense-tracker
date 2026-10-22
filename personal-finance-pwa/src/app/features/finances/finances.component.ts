import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BadgeIndianRupee,
  ChevronDown,
  CloudOff,
  CreditCard,
  Download,
  Landmark,
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Pencil,
  Plus,
  Scale,
  Star,
  Trash2,
  WalletCards,
} from 'lucide-angular';
import {
  AccountBalanceAdjustment,
  AssetAccount,
  AssetAccountType,
  CardStatementSource,
  DebtAccount,
  DebtAccountType,
  DebtAdjustment,
  DebtAdjustmentKind,
  DebtPayment,
  ExpenseEntry,
} from '../../core/models';
import { cashbackEarned, matchRefundCandidates } from '../../core/utils/credit-card-insights';
import { cardCycleState, type CardCycleState } from '../../core/utils/credit-card-cycle';
import type { BalanceDiscrepancy, CardOutstandingDiscrepancy } from '../../core/utils/derived-balance.util';
import { CardStatementPromptService } from '../../core/services/card-statement-prompt.service';
import { CurrencyService } from '../../core/services/currency.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { toLocalDateString } from '../../core/utils/local-date';
import {
  accountExportFileName,
  allAccountsCsv,
  allAccountsFileName,
  assetAccountCsv,
  debtCsv,
  type AccountExportRecords,
} from '../../core/utils/account-export';
import { deliverTextFile, deliveryDetail } from '../../core/utils/file-download';
import { ClearableInputDirective, ModalComponent, SectionCardComponent, ThemedSelectComponent, ThemedSelectOption } from '../../shared/components';
import { CardStatementsComponent } from '../../shared/components/card-statements/card-statements.component';
import { CurrencyFormatPipe, DateFormatPipe, TranslatePipe } from '../../shared/pipes';

type FinanceSection = 'accounts' | 'cards' | 'debts';
type FinanceFilter = 'all' | FinanceSection;

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
    CardStatementsComponent,
    CurrencyFormatPipe,
    DateFormatPipe,
    TranslatePipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ BadgeIndianRupee, ChevronDown, CloudOff, CreditCard, Download, Landmark, Pencil, Plus, Scale, Star, Trash2, WalletCards }),
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
            data-testid="finance-export-all"
            class="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-accent active:scale-[0.98] disabled:opacity-60"
            [disabled]="exporting() || !hasAnythingToExport()"
            (click)="exportAll()"
          >
            <lucide-icon name="download" class="h-4 w-4" />
            {{ 'finances.export.all' | translate }}
          </button>
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

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="glass-card min-w-0 px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.totalAssets' | translate }}</p>
          <p class="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{{ expenseStore.totalAssets() | currencyFormat }}</p>
        </div>
        <div class="glass-card min-w-0 px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.totalLiabilities' | translate }}</p>
          <p class="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl text-destructive">{{ expenseStore.totalLiabilities() | currencyFormat }}</p>
        </div>
        <div class="glass-card min-w-0 px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.accounts' | translate }}</p>
          <p class="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{{ activeAccounts().length }}</p>
        </div>
        <div class="glass-card min-w-0 px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{{ 'finances.summary.activeDebts' | translate }}</p>
          <p class="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{{ activeDebts().length }}</p>
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
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cards.billDay' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <select formControlName="billGenerationDay" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option [value]="0">Select day</option>
              @for (d of dayOptions; track d) {
                <option [value]="d">{{ d }}{{ daySuffix(d) }} of every month</option>
              }
            </select>
            <span class="text-[10px] text-muted-foreground">{{ 'finances.cards.billDayHint' | translate }}</span>
          </label>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cards.dueDay' | translate }}<span class="text-destructive ml-0.5">*</span></span>
            <select formControlName="paymentDueDay" class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option [value]="0">Select day</option>
              @for (d of dayOptions; track d) {
                <option [value]="d">{{ d }}{{ daySuffix(d) }} of every month</option>
              }
            </select>
            <span class="text-[10px] text-muted-foreground">{{ 'finances.cards.dueDayHint' | translate }}</span>
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

      <div class="flex min-w-0 flex-wrap gap-2" role="group" [attr.aria-label]="'finances.filter.label' | translate">
        @for (tab of sectionTabs; track tab.id) {
          <button
            type="button"
            data-testid="finance-filter"
            class="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition active:scale-[0.98]"
            [class.border-primary]="sectionFilter() === tab.id"
            [class.bg-primary]="sectionFilter() === tab.id"
            [class.text-primary-foreground]="sectionFilter() === tab.id"
            [class.border-border]="sectionFilter() !== tab.id"
            [class.text-muted-foreground]="sectionFilter() !== tab.id"
            [class.hover:bg-accent]="sectionFilter() !== tab.id"
            [attr.aria-pressed]="sectionFilter() === tab.id"
            (click)="sectionFilter.set(tab.id)"
          >
            {{ tab.labelKey | translate }}
            <span
              class="rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums"
              [class.bg-primary-foreground/20]="sectionFilter() === tab.id"
              [class.bg-muted]="sectionFilter() !== tab.id"
            >{{ sectionCount(tab.id) }}</span>
          </button>
        }
      </div>

      @if (showSection('accounts')) {
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
            <div class="grid gap-2.5">
              @for (account of activeAccounts(); track account.id) {
                @let accountKey = 'account:' + account.id;
                @let accountOpen = isExpanded(accountKey);
                @let accountIssue = discrepancyFor(account.id);
                <article
                  data-testid="finance-account-item"
                  class="rounded-2xl border bg-background/60 transition-colors"
                  [class.border-border]="!accountOpen"
                  [class.border-primary/40]="accountOpen"
                >
                  <div class="cursor-pointer rounded-2xl px-3 py-3 transition-colors hover:bg-accent/40 sm:px-4" (click)="toggleExpanded(accountKey)">
                    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1 sm:gap-x-3 sm:gap-y-0.5">
                      <span class="col-start-1 row-start-1 grid h-9 w-9 place-items-center rounded-xl sm:row-span-2 sm:row-start-1 sm:h-10 sm:w-10 sm:rounded-2xl bg-primary/10 text-primary">
                        <lucide-icon [name]="accountIcon(account.type)" class="h-4 w-4 sm:h-5 sm:w-5" />
                      </span>
                      <h2 class="col-span-2 col-start-2 row-start-1 line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug sm:col-span-1 sm:col-start-2 sm:self-end sm:text-base">{{ account.name }}</h2>
                      <div class="contents text-xs text-muted-foreground sm:col-start-2 sm:row-start-2 sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-0.5 sm:self-start">
                        <span class="col-start-2 row-start-2 min-w-0">{{ accountTypeLabel(account.type) }}</span>
                        @if (account.isDefault || accountIssue) {
                          <div class="col-span-3 col-start-2 row-start-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 sm:contents">
                            @if (account.isDefault) {
                              <span class="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                <lucide-icon name="star" class="h-3 w-3" />
                                {{ 'finances.accounts.defaultBadge' | translate }}
                              </span>
                            }
                            @if (accountIssue) {
                              <span class="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                                <lucide-icon name="scale" class="h-3 w-3" />
                                {{ 'finances.item.needsReview' | translate }}
                              </span>
                            }
                          </div>
                        }
                      </div>
                      <p class="col-span-2 col-start-3 row-start-2 justify-self-end text-right sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center text-base font-semibold tabular-nums sm:text-lg">{{ account.balance | currencyFormat }}</p>
                      <button
                        type="button"
                        data-testid="finance-item-toggle"
                        class="col-start-4 row-start-1 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent sm:row-span-2 sm:row-start-1 sm:h-8 sm:w-8 sm:rounded-xl"
                        [attr.aria-expanded]="accountOpen"
                        [attr.aria-controls]="'finance-panel-' + account.id"
                        [attr.aria-label]="(accountOpen ? 'finances.item.hideDetails' : 'finances.item.showDetails') | translate"
                      >
                        <lucide-icon name="chevron-down" class="h-4 w-4 transition-transform duration-200" [class.rotate-180]="accountOpen" />
                      </button>
                    </div>
                  </div>

                  @if (accountOpen) {
                    <div [id]="'finance-panel-' + account.id" class="border-t border-border/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
                      @let accountAdjustments = accountAdjustmentsForAccount(account.id);
                      @let accountAdjustmentsKey = 'account-adjustments:' + account.id;

                      <div class="flex flex-wrap items-center gap-2">
                        @if (!account.isDefault) {
                          <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="setDefault(account)">
                            {{ 'finances.accounts.makeDefault' | translate }}
                          </button>
                        }
                        <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startAdjustment(account)">
                          {{ 'finances.adjust.open' | translate }}
                        </button>
                        <button type="button" data-testid="finance-account-export" class="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-60" [disabled]="exporting()" (click)="exportAccount(account)">
                          <lucide-icon name="download" class="h-3.5 w-3.5" />
                          {{ 'finances.export.csv' | translate }}
                        </button>
                        <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startEdit(account)" [attr.aria-label]="'common.edit' | translate">
                          <lucide-icon name="pencil" class="h-4 w-4" />
                        </button>
                        <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestDelete(account)" [attr.aria-label]="'common.delete' | translate">
                          <lucide-icon name="trash-2" class="h-4 w-4" />
                        </button>
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

                      @if (discrepancyFor(account.id); as discrepancy) {
                        <div class="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                          <div class="flex items-start gap-2">
                            <lucide-icon name="scale" class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div class="min-w-0">
                              <p class="text-xs font-semibold">{{ 'finances.reconcile.title' | translate }}</p>
                              <p class="mt-1 text-xs text-muted-foreground">{{ discrepancyDescription(discrepancy) }}</p>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <button type="button" class="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60" [disabled]="saving()" (click)="resolveDiscrepancy(discrepancy, 'accept-derived')">
                                  {{ 'finances.reconcile.acceptDerived' | translate }}
                                </button>
                                <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-60" [disabled]="saving()" (click)="resolveDiscrepancy(discrepancy, 'keep-stored')">
                                  {{ 'finances.reconcile.keepStored' | translate }}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      }

                      @if (accountAdjustments.length > 0) {
                        <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.adjust.history' | translate }}</p>
                          <div class="mt-2 grid gap-2">
                            @for (adjustment of historyPreview(accountAdjustmentsKey, accountAdjustments); track adjustment.id) {
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
                          @if (accountAdjustments.length > historyPreviewCount) {
                            <button
                              type="button"
                              class="mt-2 w-full rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent"
                              [attr.aria-expanded]="isHistoryFull(accountAdjustmentsKey)"
                              (click)="toggleHistory(accountAdjustmentsKey)"
                            >
                              {{ isHistoryFull(accountAdjustmentsKey) ? ('finances.history.showLess' | translate) : i18n.t('finances.history.showAll', { count: accountAdjustments.length }) }}
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                </article>
              }
            </div>
          }
        </app-section-card>
      }

      @if (showSection('cards')) {
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
            <div class="grid gap-2.5">
              @for (card of creditCards(); track card.id) {
                @let cardKey = 'debt:' + card.id;
                @let cardOpen = isExpanded(cardKey);
                @let cycle = cardState(card);
                @let utilization = creditUtilization(card);
                @let cardIssue = !!cardDiscrepancyFor(card.id) || cycle.needsStatement;
                @let cardPayBy = cycle.status !== 'none' && cycle.billDue > 0 && cycle.dueDateStr ? cycle.dueDateStr : null;
                @let cardBillPaid = cycle.status !== 'none' && cycle.billDue <= 0 && cycle.statementAmount > 0;
                <article
                  data-testid="finance-card-item"
                  class="rounded-2xl border bg-background/60 transition-colors"
                  [class.border-border]="!cardOpen"
                  [class.border-primary/40]="cardOpen"
                >
                  <div class="cursor-pointer rounded-2xl px-3 py-3 transition-colors hover:bg-accent/40 sm:px-4" (click)="toggleExpanded(cardKey)">
                    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1 sm:gap-x-3 sm:gap-y-0.5">
                      <span class="col-start-1 row-start-1 grid h-9 w-9 place-items-center rounded-xl sm:row-span-2 sm:row-start-1 sm:h-10 sm:w-10 sm:rounded-2xl bg-primary/10 text-primary">
                        <lucide-icon name="credit-card" class="h-4 w-4 sm:h-5 sm:w-5" />
                      </span>
                      <h2 class="col-span-2 col-start-2 row-start-1 line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug sm:col-span-1 sm:col-start-2 sm:self-end sm:text-base">{{ card.name }}</h2>
                      <div class="contents text-xs text-muted-foreground sm:col-start-2 sm:row-start-2 sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-0.5 sm:self-start">
                        <span class="col-start-2 row-start-2 min-w-0">{{ card.cardNetworkOrBank || debtTypeLabel(card.type) }}@if (card.cardLast4) { · ····{{ card.cardLast4 }}}</span>
                        @if (cardPayBy || cardBillPaid || cardIssue || utilization !== null) {
                          <div class="col-span-3 col-start-2 row-start-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 sm:contents">
                            @if (cardPayBy) {
                              <span class="font-semibold text-amber-600 dark:text-amber-400">{{ 'finances.cycle.payBy' | translate }} {{ shortDateLabel(cardPayBy) }}</span>
                            } @else if (cardBillPaid) {
                              <span class="font-semibold" [style.color]="'var(--success)'">✓ {{ 'finances.statement.paidLabel' | translate }}</span>
                            }
                            @if (cardIssue) {
                              <span class="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                                <lucide-icon name="scale" class="h-3 w-3" />
                                {{ 'finances.item.needsReview' | translate }}
                              </span>
                            }
                            @if (utilization !== null) {
                              <span
                                class="font-medium sm:hidden"
                                [class.text-emerald-600]="utilization < 30"
                                [class.dark:text-emerald-400]="utilization < 30"
                                [class.text-amber-600]="utilization >= 30 && utilization < 70"
                                [class.dark:text-amber-400]="utilization >= 30 && utilization < 70"
                                [class.text-destructive]="utilization >= 70"
                              >{{ i18n.t('finances.cards.utilizationShort', { percent: utilization }) }}</span>
                            }
                          </div>
                        }
                      </div>
                      <div class="col-span-2 col-start-3 row-start-2 justify-self-end text-right sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
                        <p class="text-base font-semibold tabular-nums sm:text-lg" [class.text-destructive]="card.remainingBalance > 0">{{ card.remainingBalance | currencyFormat }}</p>
                        @if (utilization !== null) {
                          <p
                            class="hidden text-[11px] font-medium sm:block"
                            [class.text-emerald-600]="utilization < 30"
                            [class.dark:text-emerald-400]="utilization < 30"
                            [class.text-amber-600]="utilization >= 30 && utilization < 70"
                            [class.dark:text-amber-400]="utilization >= 30 && utilization < 70"
                            [class.text-destructive]="utilization >= 70"
                          >{{ i18n.t('finances.cards.utilizationShort', { percent: utilization }) }}</p>
                        }
                      </div>
                      <button
                        type="button"
                        data-testid="finance-item-toggle"
                        class="col-start-4 row-start-1 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent sm:row-span-2 sm:row-start-1 sm:h-8 sm:w-8 sm:rounded-xl"
                        [attr.aria-expanded]="cardOpen"
                        [attr.aria-controls]="'finance-panel-' + card.id"
                        [attr.aria-label]="(cardOpen ? 'finances.item.hideDetails' : 'finances.item.showDetails') | translate"
                      >
                        <lucide-icon name="chevron-down" class="h-4 w-4 transition-transform duration-200" [class.rotate-180]="cardOpen" />
                      </button>
                    </div>
                    @if (!cardOpen && utilization !== null) {
                      <div class="mt-2.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          class="h-full rounded-full transition-all"
                          [class.bg-emerald-500]="utilization < 30"
                          [class.bg-amber-500]="utilization >= 30 && utilization < 70"
                          [class.bg-destructive]="utilization >= 70"
                          [style.width.%]="utilization > 100 ? 100 : utilization"
                        ></div>
                      </div>
                    }
                  </div>

                  @if (cardOpen) {
                    <div [id]="'finance-panel-' + card.id" class="border-t border-border/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
                      @let cardAdjustments = debtAdjustmentsForCard(card.id);
                      @let cardAdjustmentsKey = 'card-adjustments:' + card.id;
                      @let cardPayments = debtPaymentsForDebt(card.id);
                      @let cardPaymentsKey = 'payments:' + card.id;

                      <div class="flex flex-wrap items-center gap-2">
                        @if (card.remainingBalance > 0) {
                          <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startDebtPayment(card)">
                            {{ 'finances.cards.payBill' | translate }}
                          </button>
                        }
                        <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startCardAdjustment(card)">
                          {{ 'finances.cardAdjust.open' | translate }}
                        </button>
                        @if (card.billGenerationDay) {
                          <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="statementsCard.set(card)">
                            {{ 'finances.statements.open' | translate }}
                          </button>
                        }
                        <button type="button" data-testid="finance-card-export" class="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-60" [disabled]="exporting()" (click)="exportDebt(card)">
                          <lucide-icon name="download" class="h-3.5 w-3.5" />
                          {{ 'finances.export.csv' | translate }}
                        </button>
                        <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startCardEdit(card)" [attr.aria-label]="'common.edit' | translate">
                          <lucide-icon name="pencil" class="h-4 w-4" />
                        </button>
                        <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestDebtDelete(card)" [attr.aria-label]="'common.delete' | translate">
                          <lucide-icon name="trash-2" class="h-4 w-4" />
                        </button>
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

                      @if (cardDiscrepancyFor(card.id); as discrepancy) {
                        <div class="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                          <div class="flex items-start gap-2">
                            <lucide-icon name="scale" class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div class="min-w-0">
                              <p class="text-xs font-semibold">{{ 'finances.cards.reconcile.title' | translate }}</p>
                              <p class="mt-1 text-xs text-muted-foreground">{{ cardDiscrepancyDescription(discrepancy) }}</p>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <button type="button" class="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60" [disabled]="saving()" (click)="resolveCardDiscrepancy(discrepancy, 'accept-derived')">
                                  {{ 'finances.reconcile.acceptDerived' | translate }}
                                </button>
                                <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-60" [disabled]="saving()" (click)="resolveCardDiscrepancy(discrepancy, 'keep-stored')">
                                  {{ 'finances.cards.reconcile.keepStored' | translate }}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      }

                      <div class="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                        <span class="text-xs text-muted-foreground">{{ 'finances.cycle.totalOutstanding' | translate }}</span>
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

                      @if (cycle.status !== 'none') {
                        <div class="mt-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span class="font-semibold uppercase tracking-wider text-[10px]">{{ 'finances.cycle.title' | translate }}</span>
                            <span>{{ shortDateLabel(cycle.billDateStr!) }} → {{ shortDateLabel(cycle.nextBillDateStr!) }}</span>
                          </div>
                          <div class="mt-1.5 grid gap-1 text-xs sm:grid-cols-3">
                            <span class="text-muted-foreground">
                              {{ 'finances.cycle.billDue' | translate }}@if (cycle.status !== 'confirmed') { ({{ 'finances.statement.estimated' | translate }})}:
                              <strong class="tabular-nums" [class.text-destructive]="cycle.billDue > 0">{{ cycle.billDue | currencyFormat }}</strong>
                            </span>
                            <span class="text-muted-foreground">{{ 'finances.cycle.unbilled' | translate }}: <strong class="tabular-nums text-foreground">{{ cycle.unbilledSpend | currencyFormat }}</strong></span>
                            @if (cycle.billDue <= 0 && cycle.statementAmount > 0) {
                              <span class="font-medium" [style.color]="'var(--success)'">✓ {{ 'finances.statement.paidLabel' | translate }}</span>
                            } @else if (cycle.billDue > 0 && cycle.dueDateStr) {
                              <span class="font-medium text-amber-600 dark:text-amber-400">{{ 'finances.cycle.payBy' | translate }} {{ shortDateLabel(cycle.dueDateStr) }}</span>
                            }
                          </div>
                          @if (cycle.needsStatement) {
                            <div class="mt-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-2 text-[11px] leading-relaxed">
                              <p class="text-amber-700 dark:text-amber-400">
                                {{ 'finances.statement.pending' | translate }} {{ shortDateLabel(cycle.billDateStr!) }} ·
                                <strong class="tabular-nums">{{ cycle.statementAmount | currencyFormat }}</strong>
                                ({{ 'finances.statement.estimated' | translate }})
                              </p>
                              <p class="mt-0.5 text-muted-foreground">{{ 'finances.statement.pendingHint' | translate }}</p>
                              <div class="mt-1.5 flex flex-wrap gap-2">
                                <button type="button" class="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90" (click)="openStatement(card)">
                                  {{ 'finances.statement.confirm' | translate }}
                                </button>
                              </div>
                            </div>
                          } @else if (cycle.statement; as statement) {
                            <p class="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                              <span [style.color]="'var(--success)'">
                                ✓ {{ 'finances.statement.confirmedLabel' | translate }} · {{ shortDateLabel(statement.billDateStr) }} ·
                                <strong class="tabular-nums">{{ statement.amount | currencyFormat }}</strong>
                              </span>
                              <span class="text-muted-foreground">{{ statementSourceLabel(statement.source) }}</span>
                              <button type="button" class="font-semibold text-muted-foreground underline-offset-2 hover:underline" (click)="openStatement(card)">
                                {{ 'finances.statement.edit' | translate }}
                              </button>
                            </p>
                            <!-- Monthly ask: verify the logged data against the bank's own PDF. -->
                            <p class="mt-1 text-[11px] text-muted-foreground">
                              @if (statement.pdfCheck; as check) {
                                ✓ {{ 'finances.statement.pdfChecked' | translate }} · {{ check.onlyInBank + check.onlyInApp }} {{ 'finances.statement.pdfDifferences' | translate }}
                              } @else {
                                <button type="button" class="font-semibold text-primary underline-offset-2 hover:underline" (click)="statementsCard.set(card)">
                                  {{ 'finances.statement.checkPdf' | translate }}
                                </button>
                              }
                            </p>
                          } @else {
                            <p class="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                              <span>{{ 'finances.statement.estimatedHint' | translate }}</span>
                              <button type="button" class="font-semibold underline-offset-2 hover:underline" (click)="openStatement(card)">
                                {{ 'finances.statement.enter' | translate }}
                              </button>
                            </p>
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

                      @if (cardAdjustments.length > 0) {
                        <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.cardAdjust.history' | translate }}</p>
                          <div class="mt-2 grid gap-2">
                            @for (adjustment of historyPreview(cardAdjustmentsKey, cardAdjustments); track adjustment.id) {
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
                          @if (cardAdjustments.length > historyPreviewCount) {
                            <button
                              type="button"
                              class="mt-2 w-full rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent"
                              [attr.aria-expanded]="isHistoryFull(cardAdjustmentsKey)"
                              (click)="toggleHistory(cardAdjustmentsKey)"
                            >
                              {{ isHistoryFull(cardAdjustmentsKey) ? ('finances.history.showLess' | translate) : i18n.t('finances.history.showAll', { count: cardAdjustments.length }) }}
                            </button>
                          }
                        </div>
                      }

                      <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.payments.history' | translate }}</p>
                        @if (cardPayments.length === 0) {
                          <p class="mt-2 text-xs text-muted-foreground">{{ 'finances.payments.noHistory' | translate }}</p>
                        } @else {
                          <div class="mt-2 grid gap-2">
                            @for (payment of historyPreview(cardPaymentsKey, cardPayments); track payment.id) {
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
                          @if (cardPayments.length > historyPreviewCount) {
                            <button
                              type="button"
                              class="mt-2 w-full rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent"
                              [attr.aria-expanded]="isHistoryFull(cardPaymentsKey)"
                              (click)="toggleHistory(cardPaymentsKey)"
                            >
                              {{ isHistoryFull(cardPaymentsKey) ? ('finances.history.showLess' | translate) : i18n.t('finances.history.showAll', { count: cardPayments.length }) }}
                            </button>
                          }
                        }
                      </div>
                    </div>
                  }
                </article>
              }
            </div>
          }
        </app-section-card>
      }

      @if (showSection('debts')) {
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
            <div class="grid gap-2.5">
              @for (debt of visibleDebts(); track debt.id) {
                @let debtKey = 'debt:' + debt.id;
                @let debtOpen = isExpanded(debtKey);
                <article
                  data-testid="finance-debt-item"
                  class="rounded-2xl border bg-background/60 transition-colors"
                  [class.border-border]="!debtOpen"
                  [class.border-primary/40]="debtOpen"
                >
                  <div class="cursor-pointer rounded-2xl px-3 py-3 transition-colors hover:bg-accent/40 sm:px-4" (click)="toggleExpanded(debtKey)">
                    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1 sm:gap-x-3 sm:gap-y-0.5">
                      <span class="col-start-1 row-start-1 grid h-9 w-9 place-items-center rounded-xl sm:row-span-2 sm:row-start-1 sm:h-10 sm:w-10 sm:rounded-2xl bg-destructive/10 text-destructive">
                        <lucide-icon name="landmark" class="h-4 w-4 sm:h-5 sm:w-5" />
                      </span>
                      <h2 class="col-span-2 col-start-2 row-start-1 line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug sm:col-span-1 sm:col-start-2 sm:self-end sm:text-base">{{ debt.name }}</h2>
                      <div class="contents text-xs text-muted-foreground sm:col-start-2 sm:row-start-2 sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-0.5 sm:self-start">
                        <span class="col-start-2 row-start-2 min-w-0">{{ debtTypeLabel(debt.type) }} · {{ debtStatusLabel(debt.status) }}</span>
                        @if (debt.monthlyEmi) {
                          <span class="hidden sm:inline">{{ 'finances.debts.monthlyEmi' | translate }}: <strong class="font-semibold tabular-nums text-foreground">{{ debt.monthlyEmi | currencyFormat }}</strong></span>
                        }
                      </div>
                      <div class="col-span-2 col-start-3 row-start-2 justify-self-end text-right sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
                        <p class="text-base font-semibold tabular-nums sm:text-lg">{{ debt.remainingBalance | currencyFormat }}</p>
                        <p class="hidden text-[11px] text-muted-foreground sm:block">{{ 'finances.debts.remaining' | translate }}</p>
                      </div>
                      <button
                        type="button"
                        data-testid="finance-item-toggle"
                        class="col-start-4 row-start-1 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent sm:row-span-2 sm:row-start-1 sm:h-8 sm:w-8 sm:rounded-xl"
                        [attr.aria-expanded]="debtOpen"
                        [attr.aria-controls]="'finance-panel-' + debt.id"
                        [attr.aria-label]="(debtOpen ? 'finances.item.hideDetails' : 'finances.item.showDetails') | translate"
                      >
                        <lucide-icon name="chevron-down" class="h-4 w-4 transition-transform duration-200" [class.rotate-180]="debtOpen" />
                      </button>
                    </div>
                    @if (!debtOpen) {
                      <div class="mt-2.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div class="h-full rounded-full bg-destructive" [style.width.%]="debtProgress(debt)"></div>
                      </div>
                    }
                  </div>

                  @if (debtOpen) {
                    <div [id]="'finance-panel-' + debt.id" class="border-t border-border/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
                      @let loanPayments = debtPaymentsForDebt(debt.id);
                      @let loanPaymentsKey = 'payments:' + debt.id;

                      <div class="flex flex-wrap items-center gap-2">
                        @if (debt.status === 'active') {
                          <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="startDebtPayment(debt)">
                            {{ 'finances.debts.recordPayment' | translate }}
                          </button>
                        }
                        <button type="button" data-testid="finance-debt-export" class="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-60" [disabled]="exporting()" (click)="exportDebt(debt)">
                          <lucide-icon name="download" class="h-3.5 w-3.5" />
                          {{ 'finances.export.csv' | translate }}
                        </button>
                        <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent" (click)="startDebtEdit(debt)" [attr.aria-label]="'common.edit' | translate">
                          <lucide-icon name="pencil" class="h-4 w-4" />
                        </button>
                        <button type="button" class="grid h-8 w-8 place-items-center rounded-xl border border-destructive/20 text-destructive transition hover:bg-destructive/10" (click)="requestDebtDelete(debt)" [attr.aria-label]="'common.delete' | translate">
                          <lucide-icon name="trash-2" class="h-4 w-4" />
                        </button>
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

                      <div class="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.payments.history' | translate }}</p>
                        @if (loanPayments.length === 0) {
                          <p class="mt-2 text-xs text-muted-foreground">{{ 'finances.payments.noHistory' | translate }}</p>
                        } @else {
                          <div class="mt-2 grid gap-2">
                            @for (payment of historyPreview(loanPaymentsKey, loanPayments); track payment.id) {
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
                          @if (loanPayments.length > historyPreviewCount) {
                            <button
                              type="button"
                              class="mt-2 w-full rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent"
                              [attr.aria-expanded]="isHistoryFull(loanPaymentsKey)"
                              (click)="toggleHistory(loanPaymentsKey)"
                            >
                              {{ isHistoryFull(loanPaymentsKey) ? ('finances.history.showLess' | translate) : i18n.t('finances.history.showAll', { count: loanPayments.length }) }}
                            </button>
                          }
                        }
                      </div>
                    </div>
                  }
                </article>
              }
            </div>
          }
        </app-section-card>
      }

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

      @if (statementsCard(); as statementsFor) {
        <app-card-statements [cardId]="statementsFor.id" (closed)="statementsCard.set(null)" />
      }
    </div>
  `,
})
export class FinancesComponent {
  readonly expenseStore = inject(ExpenseStore);
  readonly i18n = inject(I18nService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly currencyService = inject(CurrencyService);
  private readonly statementPrompt = inject(CardStatementPromptService);
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
  /** Card whose statements panel (history, PDF check, export) is open. */
  readonly statementsCard = signal<DebtAccount | null>(null);
  readonly deleteTarget = signal<AssetAccount | null>(null);
  readonly deleteDebtTarget = signal<DebtAccount | null>(null);
  readonly confirmingDeletePayment = signal<DebtPayment | null>(null);
  readonly isDeletingPayment = signal(false);
  readonly saving = signal(false);
  /** True while an export file is being written / handed to the share sheet. */
  readonly exporting = signal(false);
  readonly hasAnythingToExport = computed(
    () => this.activeAccounts().length + this.creditCards().length + this.visibleDebts().length > 0
  );

  /** Filter chips above the lists; 'all' shows every section. */
  readonly sectionTabs: ReadonlyArray<{ id: FinanceFilter; labelKey: string }> = [
    { id: 'all', labelKey: 'finances.filter.all' },
    { id: 'accounts', labelKey: 'finances.accounts.title' },
    { id: 'cards', labelKey: 'finances.cards.title' },
    { id: 'debts', labelKey: 'finances.debts.title' },
  ];
  readonly sectionFilter = signal<FinanceFilter>('all');
  /** History rows shown per list before the "Show all" toggle. */
  readonly historyPreviewCount = 3;
  /**
   * Every account / card / debt renders as a one-row summary and opens on tap.
   * Keys: `account:<id>` for asset accounts, `debt:<id>` for cards and loans.
   * View state only - never persisted.
   */
  private readonly expandedKeys = signal<ReadonlySet<string>>(new Set());
  /** History lists the user asked to see in full (keyed per list). */
  private readonly fullHistoryKeys = signal<ReadonlySet<string>>(new Set());

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
    // Required: without a bill day and a due day a card has no cycle and no reminders.
    billGenerationDay: [0, Validators.min(1)],
    paymentDueDay: [0, Validators.min(1)],
    minimumPaymentAmount: [0, Validators.min(0)],
    cardLast4: ['', Validators.pattern(/^\d{4}$/)],
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

  showSection(section: FinanceSection): boolean {
    const filter = this.sectionFilter();
    return filter === 'all' || filter === section;
  }

  sectionCount(filter: FinanceFilter): number {
    const accounts = this.activeAccounts().length;
    const cards = this.creditCards().length;
    const debts = this.visibleDebts().length;
    switch (filter) {
      case 'accounts':
        return accounts;
      case 'cards':
        return cards;
      case 'debts':
        return debts;
      case 'all':
        return accounts + cards + debts;
    }
  }

  isExpanded(key: string): boolean {
    return this.expandedKeys().has(key);
  }

  toggleExpanded(key: string): void {
    this.expandedKeys.update((keys) => this.toggledKey(keys, key));
  }

  /** Opens an item's details (no-op when already open) so an inline form is never hidden. */
  private expand(key: string): void {
    if (this.expandedKeys().has(key)) return;
    this.expandedKeys.update((keys) => new Set(keys).add(key));
  }

  // ─── CSV export (every account, card and loan) ───────────────────────────────

  private exportRecords(): AccountExportRecords {
    return {
      entries: this.expenseStore.entries(),
      accountAdjustments: this.expenseStore.accountAdjustments(),
      debtPayments: this.expenseStore.debtPayments(),
      debtAdjustments: this.expenseStore.debtAdjustments(),
      accounts: this.expenseStore.accounts(),
      debts: this.expenseStore.debts(),
    };
  }

  exportAccount(account: AssetAccount): Promise<void> {
    return this.runExport(accountExportFileName(account.name), () =>
      assetAccountCsv(account, this.exportRecords(), this.currencyService.currency())
    );
  }

  exportDebt(debt: DebtAccount): Promise<void> {
    return this.runExport(accountExportFileName(debt.name), () =>
      debtCsv(debt, this.exportRecords(), this.currencyService.currency())
    );
  }

  exportAll(): Promise<void> {
    return this.runExport(allAccountsFileName(), () =>
      allAccountsCsv(this.exportRecords(), this.currencyService.currency())
    );
  }

  private async runExport(fileName: string, build: () => string): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const delivery = await deliverTextFile(fileName, build(), 'text/csv');
      // The share sheet is its own confirmation; only toast when a file was written.
      if (delivery.method !== 'shared') {
        this.feedback.success(this.i18n.t('finances.export.done'), deliveryDetail(delivery, (key, params) => this.i18n.t(key, params)));
      }
    } catch (error) {
      console.warn('[Finances] export failed:', error);
      this.feedback.error(this.i18n.t('finances.export.failed'), this.i18n.t('finances.feedback.tryAgain'));
    } finally {
      this.exporting.set(false);
    }
  }

  isHistoryFull(key: string): boolean {
    return this.fullHistoryKeys().has(key);
  }

  toggleHistory(key: string): void {
    this.fullHistoryKeys.update((keys) => this.toggledKey(keys, key));
  }

  /** Newest-first history, capped to a short preview until the user asks for everything. */
  historyPreview<T>(key: string, items: T[]): T[] {
    return this.isHistoryFull(key) ? items : items.slice(0, this.historyPreviewCount);
  }

  private toggledKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
    const next = new Set(keys);
    if (!next.delete(key)) next.add(key);
    return next;
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
        // The native <select> hands back strings — store real day numbers.
        billGenerationDay: Number(value.billGenerationDay) > 0 ? Number(value.billGenerationDay) : undefined,
        paymentDueDay: Number(value.paymentDueDay) > 0 ? Number(value.paymentDueDay) : undefined,
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
    this.expand(`account:${account.id}`);
    this.adjustingAccount.set(account);
    this.adjustmentForm.reset({ kind: 'increase', amount: 0, reason: '' });
  }

  cancelAdjustment(): void {
    this.adjustingAccount.set(null);
  }

  startDebtPayment(debt: DebtAccount, payment?: DebtPayment): void {
    this.expand(`debt:${debt.id}`);
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
    this.expand(`debt:${card.id}`);
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

  // ─── Card cycle (pure engine: core/utils/credit-card-cycle.ts) ────────────

  /** Total outstanding = bill due + unbilled spend, for the card's latest bill. */
  cardState(card: DebtAccount): CardCycleState {
    return cardCycleState(
      card,
      {
        entries: this.expenseStore.entries(),
        adjustments: this.expenseStore.debtAdjustments(),
        payments: this.expenseStore.debtPayments(),
      },
      new Date()
    );
  }

  /** Opens the statement dialog (confirm / correct the bank's bill amount). */
  openStatement(card: DebtAccount): void {
    this.statementPrompt.open(card.id);
  }

  statementSourceLabel(source: CardStatementSource): string {
    return this.i18n.t(
      source === 'sms'
        ? 'finances.statement.sourceMessage'
        : source === 'pdf'
          ? 'finances.statement.sourcePdf'
          : 'finances.statement.sourceUser'
    );
  }

  shortDateLabel(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
    });
  }

  cardCashback(card: DebtAccount): number {
    return cashbackEarned(this.expenseStore.debtAdjustments(), card.id);
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

  discrepancyFor(accountId: string): BalanceDiscrepancy | null {
    return this.expenseStore.balanceDiscrepancies().find((item) => item.accountId === accountId) ?? null;
  }

  discrepancyDescription(discrepancy: BalanceDiscrepancy): string {
    const locale = this.i18n.locale();
    return this.i18n.t('finances.reconcile.description', {
      stored: this.currencyService.format(discrepancy.stored, locale),
      derived: this.currencyService.format(discrepancy.derived, locale),
      drift: this.currencyService.format(Math.abs(discrepancy.drift), locale),
    });
  }

  cardDiscrepancyFor(debtId: string): CardOutstandingDiscrepancy | null {
    return this.expenseStore.cardOutstandingDiscrepancies().find((item) => item.debtId === debtId) ?? null;
  }

  cardDiscrepancyDescription(discrepancy: CardOutstandingDiscrepancy): string {
    const locale = this.i18n.locale();
    return this.i18n.t('finances.cards.reconcile.description', {
      stored: this.currencyService.format(discrepancy.stored, locale),
      derived: this.currencyService.format(discrepancy.derived, locale),
      drift: this.currencyService.format(Math.abs(discrepancy.drift), locale),
    });
  }

  async resolveCardDiscrepancy(discrepancy: CardOutstandingDiscrepancy, mode: 'keep-stored' | 'accept-derived'): Promise<void> {
    this.saving.set(true);
    try {
      await this.expenseStore.reconcileCardOutstanding(discrepancy.debtId, mode);
      this.feedback.success(
        this.i18n.t('finances.reconcile.resolvedTitle'),
        this.i18n.t(mode === 'keep-stored' ? 'finances.cards.reconcile.resolvedKept' : 'finances.reconcile.resolvedAccepted')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.reconcile.failed'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
  }

  async resolveDiscrepancy(discrepancy: BalanceDiscrepancy, mode: 'keep-stored' | 'accept-derived'): Promise<void> {
    this.saving.set(true);
    try {
      await this.expenseStore.reconcileAccountBalance(discrepancy.accountId, mode);
      this.feedback.success(
        this.i18n.t('finances.reconcile.resolvedTitle'),
        this.i18n.t(mode === 'keep-stored' ? 'finances.reconcile.resolvedKept' : 'finances.reconcile.resolvedAccepted')
      );
    } catch (error) {
      this.feedback.error(
        this.i18n.t('finances.reconcile.failed'),
        error instanceof Error ? error.message : this.i18n.t('finances.feedback.tryAgain')
      );
    } finally {
      this.saving.set(false);
    }
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
