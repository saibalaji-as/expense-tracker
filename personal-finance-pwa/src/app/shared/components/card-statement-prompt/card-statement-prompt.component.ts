import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyFormatPipe, TranslatePipe } from '../../pipes';
import { ModalComponent } from '../modal/modal.component';
import { ExpenseStore } from '../../../core/services/expense-store.service';
import { CardStatementPromptService } from '../../../core/services/card-statement-prompt.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { I18nService } from '../../../core/services/i18n.service';
import { UserFeedbackService } from '../../../core/services/user-feedback.service';
import { cardStatementAutoConfirmed$ } from '../../../core/services/budget-events';
import { CardStatementDetection, CardStatementSource, DebtAccount } from '../../../core/models';
import {
  cardCycleState,
  daysBetweenStr,
  planStatementConfirmation,
  type CardRecords,
} from '../../../core/utils/credit-card-cycle';
import { parseStatementMessage } from '../../../core/utils/card-statement-message';
import { toLocalDateString } from '../../../core/utils/local-date';

/** Days after a bill date during which the dialog opens by itself. */
const AUTO_PROMPT_DAYS = 7;

type PromptMode = 'manual' | 'detected' | 'pending';

interface PromptTarget {
  card: DebtAccount;
  detection: CardStatementDetection | null;
  mode: PromptMode;
}

/**
 * The credit-card statement dialog — the one place the bank's statement amount
 * (the truth for a bill) enters the app. Mounted once in the app shell. Opens:
 *  - when the user taps a statement button in Finances,
 *  - when a captured bank message needs review,
 *  - by itself from the day after a bill date until the statement is confirmed
 *    ("Not yet" snoozes it until tomorrow).
 */
@Component({
  selector: 'app-card-statement-prompt',
  standalone: true,
  imports: [ModalComponent, CurrencyFormatPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (target(); as current) {
      <app-modal [isOpen]="true" [showActions]="false" [title]="title()" (cancelled)="dismiss()">
        <div class="space-y-4">
          <p class="text-sm text-muted-foreground">{{ intro() }}</p>

          @if (cycle(); as state) {
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              <span class="text-muted-foreground">
                {{ 'cardStatement.estimate' | translate }}:
                <strong class="tabular-nums text-foreground">{{ estimate() | currencyFormat }}</strong>
              </span>
              <button type="button" class="font-semibold text-primary underline-offset-2 hover:underline" (click)="useEstimate()">
                {{ 'cardStatement.useEstimate' | translate }}
              </button>
            </div>
          }

          <div class="grid gap-3 sm:grid-cols-3">
            <label class="space-y-1.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.statement.amount' | translate }}<span class="ml-0.5 text-destructive">*</span></span>
              <input type="number" min="0" step="0.01" inputmode="decimal" [value]="amountInput()" (input)="onAmountTyped(inputValue($event))"
                class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>
            <label class="space-y-1.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'finances.statement.minDue' | translate }}</span>
              <input type="number" min="0" step="0.01" inputmode="decimal" [value]="minDueInput()" (input)="minDueInput.set(inputValue($event))"
                class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>
            <label class="space-y-1.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'cardStatement.dueDate' | translate }}</span>
              <input type="date" [value]="dueDateInput()" (input)="dueDateInput.set(inputValue($event))"
                class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>
          </div>

          <div>
            <button type="button" class="text-xs font-semibold text-primary underline-offset-2 hover:underline" (click)="showPaste.set(!showPaste())">
              {{ 'cardStatement.pasteToggle' | translate }}
            </button>
            @if (showPaste()) {
              <div class="mt-2 space-y-2">
                <textarea rows="3" [value]="pasteText()" (input)="pasteText.set(inputValue($event))"
                  [attr.placeholder]="'cardStatement.pastePlaceholder' | translate"
                  class="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"></textarea>
                <div class="flex flex-wrap items-center gap-3">
                  <button type="button" class="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent" (click)="readPastedMessage()">
                    {{ 'cardStatement.readMessage' | translate }}
                  </button>
                  @if (pasteError()) {
                    <span class="text-xs text-destructive">{{ 'cardStatement.pasteFailed' | translate }}</span>
                  }
                </div>
              </div>
            }
          </div>

          @if (plan(); as preview) {
            <div class="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
              <div class="grid gap-1.5 sm:grid-cols-3">
                <span class="text-muted-foreground">{{ 'finances.cycle.totalOutstanding' | translate }}: <strong class="tabular-nums text-foreground">{{ totalAfter() | currencyFormat }}</strong></span>
                <span class="text-muted-foreground">{{ 'finances.cycle.billDue' | translate }}: <strong class="tabular-nums text-foreground">{{ preview.billDue | currencyFormat }}</strong></span>
                <span class="text-muted-foreground">{{ 'finances.cycle.unbilled' | translate }}: <strong class="tabular-nums text-foreground">{{ unbilledAfter() | currencyFormat }}</strong></span>
              </div>
              @if (preview.paidTowardsBill > 0) {
                <p class="mt-1.5 text-muted-foreground">{{ paidNote() }}</p>
              }
              @if (preview.shortfall >= 0.01) {
                <p class="mt-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-2 leading-relaxed text-amber-700 dark:text-amber-400">{{ shortfallNote() }}</p>
              }
              @if (preview.unexplainedCarry >= 0.01) {
                <div class="mt-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-2 leading-relaxed">
                  <p class="text-amber-700 dark:text-amber-400">{{ carryNote() }}</p>
                  <label class="mt-1.5 flex items-start gap-2 text-foreground">
                    <input type="checkbox" class="mt-0.5" [checked]="correctTotal()" (change)="correctTotal.set(inputChecked($event))" />
                    <span>{{ correctLabel() }}</span>
                  </label>
                </div>
              }
            </div>
          }

          <div class="flex flex-wrap justify-end gap-2">
            @if (current.mode !== 'manual') {
              <button type="button" class="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent" [disabled]="saving()" (click)="notYet()">
                {{ 'cardStatement.notYet' | translate }}
              </button>
            } @else {
              <button type="button" class="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent" [disabled]="saving()" (click)="dismiss()">
                {{ 'common.cancel' | translate }}
              </button>
            }
            <button type="button" class="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60" [disabled]="saving() || !plan()" (click)="confirm()">
              {{ 'cardStatement.confirm' | translate }}
            </button>
          </div>
        </div>
      </app-modal>
    } @else if (unassignedDetection(); as detection) {
      <app-modal [isOpen]="true" [showActions]="false" [title]="'cardStatement.pickCardTitle' | translate" (cancelled)="skipUnassigned(detection)">
        <div class="space-y-3">
          <p class="text-sm text-muted-foreground">
            {{ 'cardStatement.pickCardIntro' | translate }}
            <strong class="tabular-nums text-foreground">{{ detection.amount | currencyFormat }}</strong>
            @if (detection.cardLast4) { · ····{{ detection.cardLast4 }} }
          </p>
          <div class="grid gap-2 pt-1">
            @for (card of billedCards(); track card.id) {
              <button type="button" class="flex items-center justify-between rounded-2xl border border-border bg-background/60 px-4 py-3 text-left transition hover:bg-accent active:scale-[0.98]" (click)="assignDetection(detection, card)">
                <span>
                  <span class="block text-sm font-semibold">{{ card.name }}</span>
                  @if (card.cardLast4) { <span class="block text-xs text-muted-foreground">····{{ card.cardLast4 }}</span> }
                </span>
                <span class="text-sm font-semibold tabular-nums">{{ card.remainingBalance | currencyFormat }}</span>
              </button>
            }
            <button type="button" class="rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-accent active:scale-[0.98]" (click)="ignoreDetection(detection)">
              {{ 'cardStatement.ignoreDetection' | translate }}
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class CardStatementPromptComponent {
  private readonly store = inject(ExpenseStore);
  private readonly prompt = inject(CardStatementPromptService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly i18n = inject(I18nService);
  private readonly currency = inject(CurrencyService);

  readonly amountInput = signal('');
  readonly minDueInput = signal('');
  readonly dueDateInput = signal('');
  readonly pasteText = signal('');
  readonly showPaste = signal(false);
  readonly pasteError = signal(false);
  readonly correctTotal = signal(false);
  readonly saving = signal(false);
  /** Where the amount in the form came from: typed, a bank message, or a bank PDF. */
  private readonly source = signal<CardStatementSource>('user');
  /** Unassigned detections closed without a choice — not asked again this session. */
  private readonly skippedDetections = signal<ReadonlySet<string>>(new Set());

  private readonly records = computed<CardRecords>(() => ({
    entries: this.store.entries(),
    adjustments: this.store.debtAdjustments(),
    payments: this.store.debtPayments(),
  }));

  readonly billedCards = computed(() =>
    this.store.debts().filter(
      (debt) => debt.type === 'credit-card' && debt.status === 'active' && !!debt.billGenerationDay
    )
  );

  readonly target = computed<PromptTarget | null>(() => {
    const cards = this.billedCards();
    const detections = this.store.cardStatementDetections();
    const detectionFor = (cardId: string): CardStatementDetection | null =>
      detections.find((item) => item.debtId === cardId) ?? null;

    const requested = this.prompt.requestedCardId();
    if (requested) {
      const card = cards.find((item) => item.id === requested);
      if (card) return { card, detection: detectionFor(card.id), mode: 'manual' };
    }

    // Automatic prompts wait for the snooze state and never stack on the
    // multi-card expense picker.
    if (!this.prompt.loaded() || this.store.pendingCcExpenses().length > 0) return null;

    const now = new Date();
    const todayStr = toLocalDateString(now);
    const records = this.records();
    for (const card of cards) {
      const state = cardCycleState(card, records, now);
      if (!state.billDateStr || state.status === 'confirmed') continue;
      if (this.prompt.isSnoozed(card.id, state.billDateStr)) continue;
      const detection = detectionFor(card.id);
      if (detection) return { card, detection, mode: 'detected' };
      const daysSinceBill = daysBetweenStr(state.billDateStr, todayStr);
      if (state.needsStatement && daysSinceBill >= 1 && daysSinceBill <= AUTO_PROMPT_DAYS) {
        return { card, detection: null, mode: 'pending' };
      }
    }
    return null;
  });

  readonly unassignedDetection = computed<CardStatementDetection | null>(() => {
    if (this.target() || this.billedCards().length === 0 || this.store.pendingCcExpenses().length > 0) return null;
    const skipped = this.skippedDetections();
    return this.store.cardStatementDetections().find((item) => !item.debtId && !skipped.has(item.id)) ?? null;
  });

  readonly cycle = computed(() => {
    const current = this.target();
    return current ? cardCycleState(current.card, this.records(), new Date()) : null;
  });

  /** Spenza's own figure for the bill being confirmed (never the stored bank amount). */
  readonly estimate = computed(() => {
    const current = this.target();
    if (!current) return 0;
    return planStatementConfirmation(current.card, this.records(), new Date(), 0)?.estimatedAmount ?? 0;
  });

  private readonly amount = computed<number | null>(() => {
    const raw = this.amountInput().trim();
    if (raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  });

  readonly plan = computed(() => {
    const current = this.target();
    const amount = this.amount();
    if (!current || amount === null) return null;
    return planStatementConfirmation(current.card, this.records(), new Date(), amount);
  });

  readonly totalAfter = computed(() => {
    const plan = this.plan();
    const state = this.cycle();
    if (!plan || !state) return 0;
    if (plan.shortfall >= 0.01) return Number((state.totalOutstanding + plan.shortfall).toFixed(2));
    if (this.correctTotal() && plan.unexplainedCarry >= 0.01) {
      return Number((state.totalOutstanding - plan.unexplainedCarry).toFixed(2));
    }
    return state.totalOutstanding;
  });

  readonly unbilledAfter = computed(() => {
    const plan = this.plan();
    if (!plan) return 0;
    return this.correctTotal() && plan.unexplainedCarry >= 0.01
      ? Number((plan.unbilledSpend - plan.unexplainedCarry).toFixed(2))
      : plan.unbilledSpend;
  });

  readonly title = computed(() => this.i18n.t('cardStatement.title', { name: this.target()?.card.name ?? '' }));

  readonly intro = computed(() => {
    const current = this.target();
    const billDate = this.cycle()?.billDateStr;
    if (!current || !billDate) return '';
    const key =
      current.mode === 'detected' || current.detection
        ? 'cardStatement.introDetected'
        : current.mode === 'pending'
          ? 'cardStatement.introPending'
          : 'cardStatement.introManual';
    return this.i18n.t(key, { date: this.dateLabel(billDate) });
  });

  readonly paidNote = computed(() =>
    this.i18n.t('cardStatement.paidNote', { amount: this.currency.format(this.plan()?.paidTowardsBill ?? 0) })
  );
  readonly shortfallNote = computed(() =>
    this.i18n.t('cardStatement.shortfallNote', { amount: this.currency.format(this.plan()?.shortfall ?? 0) })
  );
  readonly carryNote = computed(() =>
    this.i18n.t('cardStatement.carryNote', { amount: this.currency.format(this.plan()?.unexplainedCarry ?? 0) })
  );
  readonly correctLabel = computed(() =>
    this.i18n.t('cardStatement.correctTotal', { amount: this.currency.format(this.plan()?.unexplainedCarry ?? 0) })
  );

  constructor() {
    // (Re)fill the form whenever the dialog switches to a different card/bill.
    let filledFor = '';
    effect(() => {
      const current = this.target();
      const key = current ? `${current.card.id}|${current.mode}|${current.detection?.id ?? ''}` : '';
      if (key === filledFor) return;
      filledFor = key;
      if (!current) return;
      untracked(() => this.fillForm(current));
    });

    cardStatementAutoConfirmed$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((event) => {
      this.feedback.success(
        this.i18n.t('cardStatement.autoConfirmed', { name: event.cardName }),
        this.i18n.t('cardStatement.autoConfirmedDetail', { amount: this.currency.format(event.amount) })
      );
    });
  }

  /** An amount typed by hand is the user's own figure, whatever was there before. */
  onAmountTyped(value: string): void {
    this.amountInput.set(value);
    this.source.set('user');
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  inputChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  useEstimate(): void {
    this.amountInput.set(String(this.estimate()));
    this.source.set('user');
  }

  readPastedMessage(): void {
    const parsed = parseStatementMessage(this.pasteText());
    if (!parsed) {
      this.pasteError.set(true);
      return;
    }
    this.pasteError.set(false);
    this.amountInput.set(String(parsed.amount));
    if (parsed.minDue !== undefined) this.minDueInput.set(String(parsed.minDue));
    if (parsed.dueDateStr) this.dueDateInput.set(parsed.dueDateStr);
    this.source.set('sms');
  }

  async confirm(): Promise<void> {
    const current = this.target();
    const plan = this.plan();
    const amount = this.amount();
    const state = this.cycle();
    if (!current || !plan || amount === null || !state) return;

    const minDueRaw = this.minDueInput().trim();
    const minDue = minDueRaw === '' ? undefined : Number(minDueRaw);
    // Only a date that differs from the card's usual due day is stored, so a
    // later change of the card's due day still applies to this bill.
    const dueDate = this.dueDateInput().trim();
    const nominalDue = this.nominalDueDate(current.card, plan.billDateStr);
    const dueDateStr = dueDate && dueDate !== nominalDue ? dueDate : undefined;

    this.saving.set(true);
    try {
      await this.store.confirmCardStatement(current.card.id, {
        amount,
        ...(minDue !== undefined && Number.isFinite(minDue) && minDue > 0 ? { minDue } : {}),
        ...(dueDateStr ? { dueDateStr } : {}),
        source: this.source(),
        correctTotal: this.correctTotal(),
      });
      this.prompt.close();
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

  /** "Not yet": ask again tomorrow. */
  async notYet(): Promise<void> {
    const current = this.target();
    const billDate = this.cycle()?.billDateStr;
    this.prompt.close();
    if (current && billDate) await this.prompt.snooze(current.card.id, billDate);
  }

  /** Backdrop / Escape / Cancel. An automatic prompt closed this way is snoozed like "Not yet". */
  dismiss(): void {
    const current = this.target();
    if (current && current.mode !== 'manual') {
      void this.notYet();
      return;
    }
    this.prompt.close();
  }

  async assignDetection(detection: CardStatementDetection, card: DebtAccount): Promise<void> {
    await this.store.resolveCardStatementDetection(detection.id, card.id);
    this.prompt.open(card.id);
  }

  async ignoreDetection(detection: CardStatementDetection): Promise<void> {
    await this.store.resolveCardStatementDetection(detection.id, null);
  }

  skipUnassigned(detection: CardStatementDetection): void {
    this.skippedDetections.update((ids) => new Set([...ids, detection.id]));
  }

  private fillForm(current: PromptTarget): void {
    const state = cardCycleState(current.card, this.records(), new Date());
    const detection = current.detection;
    const statement = state.statement;
    const prefill = current.mode === 'manual' ? this.prompt.requestedPrefill() : null;
    const amount = prefill?.amount ?? detection?.amount ?? statement?.amount;
    const minDue = prefill?.minDue ?? detection?.minDue ?? statement?.minDue ?? current.card.minimumPaymentAmount;
    const offeredDue = prefill?.dueDateStr ?? detection?.dueDateStr;
    const detectedDue = offeredDue && state.billDateStr && offeredDue > state.billDateStr ? offeredDue : undefined;
    this.amountInput.set(amount !== undefined ? String(amount) : '');
    this.minDueInput.set(minDue !== undefined && minDue > 0 ? String(minDue) : '');
    this.dueDateInput.set(detectedDue ?? state.dueDateStr ?? '');
    this.pasteText.set('');
    this.showPaste.set(false);
    this.pasteError.set(false);
    this.correctTotal.set(false);
    this.source.set(prefill?.source ?? (detection ? 'sms' : statement?.source === 'sms' || statement?.source === 'pdf' ? statement.source : 'user'));
  }

  private nominalDueDate(card: DebtAccount, billDateStr: string): string | null {
    const withoutStatement: DebtAccount = { ...card, statement: undefined, statementHistory: undefined };
    const state = cardCycleState(withoutStatement, this.records(), new Date());
    return state.billDateStr === billDateStr ? state.dueDateStr : null;
  }

  private dateLabel(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'short' });
  }
}
