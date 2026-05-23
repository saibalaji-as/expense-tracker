import { Injectable } from '@angular/core';

export interface DailyExpenseDraft {
  expenseType: string;
  amount: number | null;
  date: string;
  comment: string;
  splitBillMode: boolean;
  splitRows: Array<{
    id: string;
    type: string;
    amount: number | null;
    comment: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class DailyExpenseDraftService {
  private draft: DailyExpenseDraft | null = null;

  getDraft(): DailyExpenseDraft | null {
    return this.draft ? this.clone(this.draft) : null;
  }

  saveDraft(draft: DailyExpenseDraft): void {
    this.draft = this.clone(draft);
  }

  clearDraft(): void {
    this.draft = null;
  }

  private clone(draft: DailyExpenseDraft): DailyExpenseDraft {
    return {
      ...draft,
      splitRows: draft.splitRows.map((row) => ({ ...row })),
    };
  }
}
