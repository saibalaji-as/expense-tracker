import { ExpenseEntry } from './expense-entry.model';

export interface OfflineQueueEntry {
  id: string;
  entry: ExpenseEntry;
  enqueuedAt: string; // ISO 8601 datetime
  retryCount: number;
}
