export interface ExpenseEntry {
  id: string;        // UUID v4
  date: string;      // ISO 8601 'YYYY-MM-DD'
  amount: number;    // positive decimal
  type: string;      // expense type name
  limit: number;     // snapshot of limit at time of entry
  savings: number;   // limit - amount (can be negative)
  timestamp: string; // ISO 8601 datetime 'YYYY-MM-DDTHH:mm:ssZ'
  comment?: string;  // optional comment for the expense
}
