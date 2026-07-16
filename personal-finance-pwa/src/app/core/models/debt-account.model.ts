export type DebtAccountType = 'credit-card' | 'personal-loan' | 'vehicle-loan' | 'home-loan' | 'other';
export type DebtAccountStatus = 'active' | 'paid' | 'archived';

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
 */
export type DebtAdjustmentKind = 'refund' | 'cash-withdrawal' | 'charge';

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
