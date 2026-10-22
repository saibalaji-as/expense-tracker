// GENERATED from src/app/core/models/expense-limit.model.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
export type BudgetCategory = 'Needs' | 'Wants' | 'Savings' | 'Growth' | 'Buffer';

export interface ExpenseLimit {
  type: string;
  recommendedPercentage: number;
  userPercentage: number;
  category: BudgetCategory;
}
