export interface ExpenseEntry {
  id: string;        // UUID v4
  date: string;      // ISO 8601 'YYYY-MM-DD'
  amount: number;    // positive decimal
  type: string;      // expense type name
  limit: number;     // snapshot of limit at time of entry
  savings: number;   // limit - amount (can be negative)
  timestamp: string; // ISO 8601 datetime 'YYYY-MM-DDTHH:mm:ssZ'
  comment?: string;  // optional comment for the expense
  receipt?: ExpenseReceipt; // optional uploaded bill/receipt attachment
  accountId?: string;
  debtId?: string;
  // 'circle-settle' = per-head share auto-logged when a Circle Splits circle
  //                   is settled (comment carries the share summary + [circleId]).
  source?: 'manual' | 'widget' | 'notification-prompt' | 'debt-payment' | 'circle-settle';
  createdByEmail?: string;
  createdByRole?: 'owner' | 'partner' | 'single';
  updatedByEmail?: string;
  updatedByRole?: 'owner' | 'partner' | 'single';
}

export interface ExpenseReceipt {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  viewUrl: string;
  uploadedAt: string;
}
