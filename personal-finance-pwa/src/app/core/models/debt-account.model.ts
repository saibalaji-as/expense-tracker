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
