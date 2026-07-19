export type DebtAccountType = 'credit-card' | 'personal-loan' | 'vehicle-loan' | 'home-loan' | 'other';
export type DebtAccountStatus = 'active' | 'paid' | 'archived';

/**
 * Snapshot of the latest generated credit-card statement (one per card,
 * replaced each cycle). `source: 'derived'` = auto-reconstructed by Spenza at
 * bill generation; `source: 'user'` = confirmed/corrected by the user against
 * the actual bank statement. Reminders show `amount` minus payments recorded
 * after `billDateStr`, and label derived amounts as estimates.
 */
export interface CardStatement {
  /** Bill-generation date this snapshot covers, local 'YYYY-MM-DD'. */
  billDateStr: string;
  /** Payable statement amount for that bill. */
  amount: number;
  /** Statement-specific minimum due (overrides the card's static minimum). */
  minDue?: number;
  source: 'derived' | 'user';
  updatedAt: string;
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
  /** Latest statement snapshot — credit cards only. See CardStatement. */
  statement?: CardStatement;
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
