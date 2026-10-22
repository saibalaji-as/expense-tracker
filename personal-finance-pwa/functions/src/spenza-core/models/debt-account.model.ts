// GENERATED from src/app/core/models/debt-account.model.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
export type DebtAccountType = 'credit-card' | 'personal-loan' | 'vehicle-loan' | 'home-loan' | 'other';
export type DebtAccountStatus = 'active' | 'paid' | 'archived';

/**
 * A credit-card statement for one bill-generation date (2026-10-02 model).
 *
 * The bank's statement amount is the TRUTH for a bill: it arrives from a bank
 * message (`source: 'sms'`), a statement PDF (`'pdf'`) or the user (`'user'`).
 * Until it arrives the cycle is "statement pending" and Spenza only shows a
 * live estimate — it never freezes a guess. `source: 'derived'` is the legacy
 * auto-snapshot written by older builds; it is treated as NOT confirmed.
 *
 * Bill due = `amount` − payments dated on/after `paymentsFromStr`.
 * Unbilled spend = total outstanding − bill due. See credit-card-cycle.ts.
 */
export type CardStatementSource = 'derived' | 'user' | 'sms' | 'pdf';

/** Summary of the last bank-PDF check run against a statement. */
export interface CardStatementPdfCheck {
  checkedAt: string;
  /** Total amount due printed on the bank PDF, when found. */
  bankTotalDue?: number;
  matched: number;
  /** Transactions on the bank statement that are not logged in Spenza. */
  onlyInBank: number;
  /** Transactions logged in Spenza that are not on the bank statement. */
  onlyInApp: number;
}

export interface CardStatement {
  /** Bill-generation date this statement covers, local 'YYYY-MM-DD'. */
  billDateStr: string;
  /** Statement amount billed by the bank for that bill. */
  amount: number;
  /** Statement-specific minimum due (overrides the card's static minimum). */
  minDue?: number;
  /** Exact payment due date from the bank, local 'YYYY-MM-DD' (overrides the card's due day). */
  dueDateStr?: string;
  /**
   * First payment date (inclusive) counted against this statement. Defaults to
   * the day after `billDateStr`; equals `billDateStr` when a bill-day payment
   * was made after the bank generated the bill.
   */
  paymentsFromStr?: string;
  source: CardStatementSource;
  updatedAt: string;
  pdfCheck?: CardStatementPdfCheck;
}

export interface DebtAccount {
  id: string;
  name: string;
  type: DebtAccountType;
  principalAmount: number;
  remainingBalance: number;
  interestRate?: number;
  monthlyEmi?: number;
  startDate: string;
  nextDueDate?: string;
  status: DebtAccountStatus;
  // Credit card specific fields
  billGenerationDay?: number;
  paymentDueDay?: number;
  minimumPaymentAmount?: number;
  cardNetworkOrBank?: string;
  /** Last 4 digits of the card number — auto-matches detected SMS spends to this card. */
  cardLast4?: string;
  /** Total credit limit — enables utilization display. */
  creditLimit?: number;
  /** Latest statement — credit cards only. Kept in sync with `statementHistory[0]` for older builds. */
  statement?: CardStatement;
  /** Confirmed statements, newest first, one per bill date (capped — see credit-card-cycle.ts). */
  statementHistory?: CardStatement[];
  /**
   * Credit cards only: outstanding at the moment tracking started. Anchor for
   * the record-derived outstanding (derived-balance.util.ts) — set from the
   * creation form; back-solved once for pre-migration cards.
   */
  openingOutstanding?: number;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
  createdByRole?: 'owner' | 'partner' | 'single';
  updatedByEmail?: string;
  updatedByRole?: 'owner' | 'partner' | 'single';
}

export interface DebtPayment {
  id: string;
  debtId: string;
  expenseId: string;
  accountId: string;
  amount: number;
  date: string;
  createdAt: string;
  createdByEmail?: string;
  createdByRole?: 'owner' | 'partner' | 'single';
}

export interface CreateDebtAccountInput {
  name: string;
  type: DebtAccountType;
  principalAmount: number;
  remainingBalance?: number;
  interestRate?: number;
  monthlyEmi?: number;
  startDate: string;
  nextDueDate?: string;
  billGenerationDay?: number;
  paymentDueDay?: number;
  minimumPaymentAmount?: number;
  cardNetworkOrBank?: string;
  cardLast4?: string;
  creditLimit?: number;
}

export interface UpdateDebtAccountInput {
  name?: string;
  type?: DebtAccountType;
  principalAmount?: number;
  remainingBalance?: number;
  interestRate?: number;
  monthlyEmi?: number;
  startDate?: string;
  nextDueDate?: string;
  status?: DebtAccountStatus;
  billGenerationDay?: number;
  paymentDueDay?: number;
  minimumPaymentAmount?: number;
  cardNetworkOrBank?: string;
  cardLast4?: string;
  creditLimit?: number;
}

/**
 * Non-purchase movement on a credit card's outstanding balance.
 * - 'refund': merchant refund / reversal credited to the card → outstanding ↓.
 *   NOT an expense (the original purchase remains one); never touches accounts.
 * - 'cash-withdrawal': cash advance from the card → outstanding ↑ AND the
 *   receiving asset account ↑ atomically. NOT an expense — the money was
 *   moved, not spent; spending the cash later is logged normally (avoids
 *   double counting).
 * - 'charge': card fee / interest / other non-purchase debit → outstanding ↑.
 * - 'cashback': rewards credited to the card → outstanding ↓; tracked
 *   separately so total cashback earned per card can be shown.
 */
export type DebtAdjustmentKind = 'refund' | 'cash-withdrawal' | 'charge' | 'cashback';

export interface DebtAdjustment {
  id: string;
  debtId: string;
  kind: DebtAdjustmentKind;
  amount: number;      // positive; direction is derived from kind
  date: string;        // ISO 'YYYY-MM-DD'
  /** cash-withdrawal only: the asset account that received the cash. */
  linkedAccountId?: string;
  /** refund only (optional): the original purchase entry, for traceability. */
  linkedExpenseId?: string;
  reason?: string;
  createdAt: string;
  createdByEmail?: string;
  createdByRole?: 'owner' | 'partner' | 'single';
}

export interface RecordDebtAdjustmentInput {
  debtId: string;
  kind: DebtAdjustmentKind;
  amount: number;
  date: string;
  linkedAccountId?: string;
  linkedExpenseId?: string;
  reason?: string;
}

export interface RecordDebtPaymentInput {
  debtId: string;
  accountId: string;
  amount: number;
  date: string;
  comment?: string;
}

export interface UpdateDebtPaymentInput {
  accountId: string;
  amount: number;
  date: string;
  comment?: string;
}

export const DEBT_PAYMENT_EXPENSE_TYPE = 'Debt Payment';
