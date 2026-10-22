import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject, input, signal } from '@angular/core';
import { CurrencyFormatPipe, TranslatePipe } from '../../pipes';
import { ModalComponent } from '../modal/modal.component';
import { ExpenseStore } from '../../../core/services/expense-store.service';
import { CardStatementPdfService, StatementPdfPasswordError } from '../../../core/services/card-statement-pdf.service';
import { CardStatementPromptService } from '../../../core/services/card-statement-prompt.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { I18nService } from '../../../core/services/i18n.service';
import { UserFeedbackService } from '../../../core/services/user-feedback.service';
import {
  addDaysStr,
  cardCycleActivity,
  cardCycleState,
  cardCycleWindows,
  daysBetweenStr,
  type CardCycleWindow,
  type CardRecords,
} from '../../../core/utils/credit-card-cycle';
import {
  compareStatementWithLedger,
  parseBankStatementLines,
  STATEMENT_MATCH_DATE_TOLERANCE_DAYS,
  type ParsedBankStatement,
  type StatementComparison,
} from '../../../core/utils/card-statement-pdf';
import { cardStatementCsv, cardStatementFileName } from '../../../core/utils/card-statement-export';
import { deliverTextFile, deliveryDetail } from '../../../core/utils/file-download';

interface PdfCheckResult {
  /** Bill date of the window the PDF was checked against. */
  billDateStr: string;
  parsed: ParsedBankStatement;
  comparison: StatementComparison;
}

/**
 * A card's statements, one window per bill: what Spenza recorded, the bank's
 * statement amount, a check against the bank's PDF, and a CSV export.
 */
@Component({
  selector: 'app-card-statements',
  standalone: true,
  imports: [ModalComponent, CurrencyFormatPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (card(); as current) {
      <app-modal [isOpen]="true" [showActions]="false" [title]="title()" (cancelled)="closed.emit()">
        <div class="space-y-4">
          <!-- Statement picker: one chip per bill, newest first -->
          <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            @for (window of windows(); track window.toStr; let index = $index) {
              <button
                type="button"
                class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                [class.border-primary]="index === selectedIndex()"
                [class.bg-primary]="index === selectedIndex()"
                [class.text-primary-foreground]="index === selectedIndex()"
                [class.border-border]="index !== selectedIndex()"
                [class.text-muted-foreground]="index !== selectedIndex()"
                (click)="select(index)"
              >
                {{ windowLabel(window) }}
              </button>
            }
          </div>

          @if (activity(); as view) {
            <p class="text-xs text-muted-foreground">{{ dateLabel(view.window.fromStr) }} → {{ dateLabel(view.window.toStr) }}</p>

            <div class="grid gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-3 text-xs sm:grid-cols-2">
              <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.opening' | translate }}</span><strong class="tabular-nums">{{ view.openingBalance | currencyFormat }}</strong></span>
              <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.purchases' | translate }}</span><strong class="tabular-nums">{{ view.totalPurchases | currencyFormat }}</strong></span>
              <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.otherDebits' | translate }}</span><strong class="tabular-nums">{{ view.totalOtherDebits | currencyFormat }}</strong></span>
              <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.credits' | translate }}</span><strong class="tabular-nums">{{ view.totalCredits | currencyFormat }}</strong></span>
              <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.payments' | translate }}</span><strong class="tabular-nums">{{ view.totalPayments | currencyFormat }}</strong></span>
              <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.closing' | translate }}</span><strong class="tabular-nums">{{ view.closingBalance | currencyFormat }}</strong></span>
              @if (view.statement; as statement) {
                <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.bankAmount' | translate }}</span><strong class="tabular-nums">{{ statement.amount | currencyFormat }}</strong></span>
                <span class="flex justify-between gap-2">
                  <span class="text-muted-foreground">{{ 'finances.statements.difference' | translate }}</span>
                  <strong class="tabular-nums" [class.text-destructive]="hasDifference(statement.amount, view.closingBalance)">{{ statement.amount - view.closingBalance | currencyFormat }}</strong>
                </span>
              }
            </div>

            <div class="flex flex-wrap gap-2">
              <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="exportCsv()">
                {{ 'finances.statements.export' | translate }}
              </button>
              @if (view.window.billDateStr) {
                <label class="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" [class.opacity-60]="checking()">
                  {{ (checking() ? 'common.loading' : 'finances.statements.checkPdf') | translate }}
                  <input type="file" accept="application/pdf,.pdf" class="hidden" [disabled]="checking()" (change)="onPdfSelected($event)" />
                </label>
              }
            </div>

            @if (needsPassword()) {
              <div class="rounded-xl border border-amber-300/60 bg-amber-500/10 p-3 text-xs">
                <p class="text-amber-700 dark:text-amber-400">
                  {{ (wrongPassword() ? 'finances.statements.pdfWrongPassword' : 'finances.statements.pdfPassword') | translate }}
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <input type="password" autocomplete="off" [value]="password()" (input)="password.set(inputValue($event))"
                    class="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary" />
                  <button type="button" class="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60" [disabled]="checking() || !password()" (click)="retryWithPassword()">
                    {{ 'finances.statements.pdfOpen' | translate }}
                  </button>
                </div>
              </div>
            }
            @if (pdfError(); as message) {
              <p class="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{{ message }}</p>
            }

            @if (pdfCheck(); as check) {
              <div class="space-y-3 rounded-xl border border-border/60 p-3 text-xs">
                <p class="font-semibold">{{ 'finances.statements.pdfResult' | translate }}</p>
                <div class="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  @if (check.parsed.totalDue !== undefined) {
                    <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.pdfTotalDue' | translate }}</span><strong class="tabular-nums">{{ check.parsed.totalDue | currencyFormat }}</strong></span>
                  }
                  <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.pdfMatched' | translate }}</span><strong class="tabular-nums">{{ check.comparison.matched.length }}</strong></span>
                  <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.pdfBankSpend' | translate }}</span><strong class="tabular-nums">{{ check.comparison.bankDebits | currencyFormat }}</strong></span>
                  <span class="flex justify-between gap-2"><span class="text-muted-foreground">{{ 'finances.statements.pdfAppSpend' | translate }}</span><strong class="tabular-nums">{{ check.comparison.appDebits | currencyFormat }}</strong></span>
                </div>

                @if (canConfirmFromPdf(check)) {
                  <div class="rounded-lg border border-amber-300/60 bg-amber-500/10 p-2">
                    <p class="text-amber-700 dark:text-amber-400">{{ 'finances.statements.pdfConfirmHint' | translate }}</p>
                    <button type="button" class="mt-1.5 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground" (click)="confirmFromPdf(check)">
                      {{ 'finances.statement.confirm' | translate }}
                    </button>
                  </div>
                }

                @if (check.comparison.onlyInBank.length === 0 && check.comparison.onlyInApp.length === 0) {
                  <p [style.color]="'var(--success)'">✓ {{ 'finances.statements.pdfAllMatched' | translate }}</p>
                }
                @if (check.comparison.onlyInBank.length > 0) {
                  <div>
                    <p class="font-semibold text-destructive">{{ 'finances.statements.pdfOnlyInBank' | translate }} ({{ check.comparison.onlyInBank.length }})</p>
                    <ul class="mt-1 divide-y divide-border/60">
                      @for (item of check.comparison.onlyInBank; track $index) {
                        <li class="flex items-baseline justify-between gap-2 py-1">
                          <span class="min-w-0 truncate"><span class="text-muted-foreground">{{ dateLabel(item.dateStr) }}</span> · {{ item.description }}</span>
                          <strong class="shrink-0 tabular-nums">{{ item.direction === 'credit' ? '−' : '' }}{{ item.amount | currencyFormat }}</strong>
                        </li>
                      }
                    </ul>
                  </div>
                }
                @if (check.comparison.onlyInApp.length > 0) {
                  <div>
                    <p class="font-semibold text-amber-600 dark:text-amber-400">{{ 'finances.statements.pdfOnlyInApp' | translate }} ({{ check.comparison.onlyInApp.length }})</p>
                    <ul class="mt-1 divide-y divide-border/60">
                      @for (item of check.comparison.onlyInApp; track item.id) {
                        <li class="flex items-baseline justify-between gap-2 py-1">
                          <span class="min-w-0 truncate"><span class="text-muted-foreground">{{ dateLabel(item.date) }}</span> · {{ item.description }}</span>
                          <strong class="shrink-0 tabular-nums">{{ item.direction === 'credit' ? '−' : '' }}{{ item.amount | currencyFormat }}</strong>
                        </li>
                      }
                    </ul>
                  </div>
                }
                <p class="text-[11px] text-muted-foreground">{{ 'finances.statements.pdfNote' | translate }}</p>
              </div>
            } @else if (view.statement?.pdfCheck; as saved) {
              <p class="text-[11px] text-muted-foreground">{{ savedCheckLabel(saved.checkedAt, saved.matched, saved.onlyInBank, saved.onlyInApp) }}</p>
            }

            <div>
              <p class="text-xs font-semibold">{{ 'finances.statements.transactions' | translate }} ({{ view.lines.length }})</p>
              @if (view.lines.length === 0) {
                <p class="mt-1 text-xs text-muted-foreground">{{ 'finances.statements.empty' | translate }}</p>
              } @else {
                <ul class="mt-1 max-h-64 divide-y divide-border/60 overflow-y-auto text-xs">
                  @for (line of view.lines; track line.id) {
                    <li class="flex items-baseline justify-between gap-2 py-1.5">
                      <span class="min-w-0 truncate"><span class="text-muted-foreground">{{ dateLabel(line.date) }}</span> · {{ line.description }}</span>
                      <strong class="shrink-0 tabular-nums" [style.color]="line.direction === 'credit' ? 'var(--success)' : null">{{ line.direction === 'credit' ? '−' : '' }}{{ line.amount | currencyFormat }}</strong>
                    </li>
                  }
                </ul>
              }
            </div>
          } @else {
            <p class="text-sm text-muted-foreground">{{ 'finances.statements.none' | translate }}</p>
          }

          <div class="flex justify-end">
            <button type="button" class="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="closed.emit()">
              {{ 'common.close' | translate }}
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class CardStatementsComponent {
  readonly cardId = input.required<string>();
  @Output() readonly closed = new EventEmitter<void>();

  private readonly store = inject(ExpenseStore);
  private readonly pdfService = inject(CardStatementPdfService);
  private readonly prompt = inject(CardStatementPromptService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly i18n = inject(I18nService);
  private readonly currency = inject(CurrencyService);

  /** null = follow the default (latest closed statement). */
  private readonly chosenIndex = signal<number | null>(null);
  readonly checking = signal(false);
  readonly needsPassword = signal(false);
  readonly wrongPassword = signal(false);
  readonly password = signal('');
  readonly pdfError = signal<string | null>(null);
  private readonly pdfResult = signal<PdfCheckResult | null>(null);
  private pendingFile: File | null = null;

  readonly card = computed(() =>
    this.store.debts().find((debt) => debt.id === this.cardId() && debt.type === 'credit-card') ?? null
  );

  private readonly records = computed<CardRecords>(() => ({
    entries: this.store.entries(),
    adjustments: this.store.debtAdjustments(),
    payments: this.store.debtPayments(),
  }));

  readonly windows = computed<CardCycleWindow[]>(() => {
    const card = this.card();
    return card ? cardCycleWindows(card, new Date(), 12) : [];
  });

  readonly selectedIndex = computed(() => {
    const windows = this.windows();
    const chosen = this.chosenIndex();
    if (chosen !== null && chosen < windows.length) return chosen;
    const firstClosed = windows.findIndex((window) => window.billDateStr !== null);
    return firstClosed >= 0 ? firstClosed : 0;
  });

  readonly activity = computed(() => {
    const card = this.card();
    const window = this.windows()[this.selectedIndex()];
    return card && window ? cardCycleActivity(card, this.records(), window) : null;
  });

  /** The PDF result, shown only while its statement window is the selected one. */
  readonly pdfCheck = computed(() => {
    const result = this.pdfResult();
    return result && result.billDateStr === this.activity()?.window.billDateStr ? result : null;
  });

  readonly title = computed(() => this.i18n.t('finances.statements.title', { name: this.card()?.name ?? '' }));

  select(index: number): void {
    this.chosenIndex.set(index);
    this.needsPassword.set(false);
    this.pdfError.set(null);
  }

  windowLabel(window: CardCycleWindow): string {
    return window.billDateStr
      ? this.i18n.t('finances.statements.billOf', { date: this.dateLabel(window.billDateStr, true) })
      : this.i18n.t('finances.statements.unbilled');
  }

  dateLabel(dateStr: string, withYear = false): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: '2-digit' } : {}),
    });
  }

  hasDifference(bankAmount: number, closingBalance: number): boolean {
    return Math.abs(bankAmount - closingBalance) >= 0.01;
  }

  savedCheckLabel(checkedAt: string, matched: number, onlyInBank: number, onlyInApp: number): string {
    return this.i18n.t('finances.statements.pdfSaved', {
      date: new Date(checkedAt).toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'short' }),
      matched,
      differences: onlyInBank + onlyInApp,
    });
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async exportCsv(): Promise<void> {
    const card = this.card();
    const activity = this.activity();
    if (!card || !activity) return;
    try {
      const delivered = await deliverTextFile(
        cardStatementFileName(card, activity),
        cardStatementCsv(card, activity, this.currency.currency()),
        'text/csv'
      );
      // The share sheet is its own confirmation; only toast when a file was written.
      if (delivered.method !== 'shared') {
        this.feedback.success(
          this.i18n.t('finances.statements.exported'),
          deliveryDetail(delivered, (key, params) => this.i18n.t(key, params))
        );
      }
    } catch (error) {
      console.warn('[CardStatements] CSV export failed:', error);
      this.feedback.error(this.i18n.t('finances.statements.exportFailed'), this.i18n.t('finances.feedback.tryAgain'));
    }
  }

  async onPdfSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.pendingFile = file;
    this.password.set('');
    this.wrongPassword.set(false);
    await this.checkPdf(file);
  }

  async retryWithPassword(): Promise<void> {
    if (this.pendingFile) await this.checkPdf(this.pendingFile, this.password());
  }

  /** The latest bill has no confirmed statement yet and the PDF printed its total due. */
  canConfirmFromPdf(check: PdfCheckResult): boolean {
    const card = this.card();
    if (!card || check.parsed.totalDue === undefined) return false;
    const state = cardCycleState(card, this.records(), new Date());
    return state.billDateStr === check.billDateStr && state.status !== 'confirmed';
  }

  confirmFromPdf(check: PdfCheckResult): void {
    const card = this.card();
    if (!card || check.parsed.totalDue === undefined) return;
    this.closed.emit();
    this.prompt.open(card.id, {
      amount: check.parsed.totalDue,
      ...(check.parsed.minDue !== undefined ? { minDue: check.parsed.minDue } : {}),
      ...(check.parsed.dueDateStr ? { dueDateStr: check.parsed.dueDateStr } : {}),
      source: 'pdf',
    });
  }

  private async checkPdf(file: File, password?: string): Promise<void> {
    const card = this.card();
    if (!card) return;
    this.checking.set(true);
    this.pdfError.set(null);
    this.pdfResult.set(null);
    try {
      const lines = await this.pdfService.readLines(file, password);
      const parsed = parseBankStatementLines(lines);
      this.needsPassword.set(false);
      this.pendingFile = null;
      if (parsed.transactions.length === 0 && parsed.totalDue === undefined) {
        this.pdfError.set(this.i18n.t('finances.statements.pdfUnreadable'));
        return;
      }

      // Jump to the statement the PDF belongs to when its own date says so.
      const windows = this.windows();
      let window = windows[this.selectedIndex()];
      if (parsed.statementDateStr) {
        const index = windows.findIndex(
          (item) => item.billDateStr !== null && Math.abs(daysBetweenStr(item.billDateStr, parsed.statementDateStr!)) <= 5
        );
        if (index >= 0) {
          this.chosenIndex.set(index);
          window = windows[index];
        }
      }
      if (!window?.billDateStr) {
        this.pdfError.set(this.i18n.t('finances.statements.pdfPickStatement'));
        return;
      }

      // A few days either side so transactions near the boundary still pair up.
      const padded: CardCycleWindow = {
        billDateStr: null,
        fromStr: addDaysStr(window.fromStr, -STATEMENT_MATCH_DATE_TOLERANCE_DAYS),
        toStr: addDaysStr(window.toStr, STATEMENT_MATCH_DATE_TOLERANCE_DAYS),
      };
      const comparison = compareStatementWithLedger(
        parsed.transactions,
        cardCycleActivity(card, this.records(), padded).lines,
        window.fromStr,
        window.toStr
      );
      this.pdfResult.set({ billDateStr: window.billDateStr, parsed, comparison });

      await this.store.saveStatementPdfCheck(card.id, window.billDateStr, {
        checkedAt: new Date().toISOString(),
        ...(parsed.totalDue !== undefined ? { bankTotalDue: parsed.totalDue } : {}),
        matched: comparison.matched.length,
        onlyInBank: comparison.onlyInBank.length,
        onlyInApp: comparison.onlyInApp.length,
      });
    } catch (error) {
      if (error instanceof StatementPdfPasswordError) {
        this.needsPassword.set(true);
        this.wrongPassword.set(error.incorrect);
        return;
      }
      this.pendingFile = null;
      this.pdfError.set(this.i18n.t('finances.statements.pdfFailed'));
    } finally {
      this.checking.set(false);
    }
  }
}
