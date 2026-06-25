export interface PendingCcExpense {
  id: string;
  amount: number;
  comment?: string;
  timestamp: string;
  type: string;
  date: string;
  createdByEmail?: string;
  createdByRole?: 'owner' | 'partner' | 'single';
}
