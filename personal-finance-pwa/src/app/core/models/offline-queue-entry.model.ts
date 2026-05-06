import { ExpenseEntry } from './expense-entry.model';

export interface OfflineQueueEntry {
  id: string;
  operation: 'create' | 'delete' | 'update'; // Type of operation
  entry?: ExpenseEntry; // Optional for delete operations
  entryId?: string; // ID of entry to delete (for delete operations)
  enqueuedAt: string; // ISO 8601 datetime
  retryCount: number;
}
