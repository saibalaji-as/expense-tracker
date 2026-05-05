export type BudgetCategory = 'Needs' | 'Wants' | 'Savings' | 'Growth' | 'Buffer';

export interface ExpenseLimit {
  type: string;
  recommendedPercentage: number;
  userPercentage: number;
  category: BudgetCategory;
}
