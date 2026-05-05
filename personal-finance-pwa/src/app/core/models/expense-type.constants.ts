import { BudgetCategory } from './expense-limit.model';

export const PREDEFINED_EXPENSE_TYPES: readonly string[] = [
  'Housing',
  'Food & Groceries',
  'Transportation',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Dining Out',
  'Shopping/Clothing',
  'Savings/Emergency Fund',
  'Investments',
  'Education',
  'Personal Care',
  'Subscriptions',
  'Miscellaneous',
] as const;

export const DEFAULT_BUDGET_PERCENTAGES: Record<
  string,
  { category: BudgetCategory; recommendedPercentage: number }
> = {
  Housing: { category: 'Needs', recommendedPercentage: 25 },
  'Food & Groceries': { category: 'Needs', recommendedPercentage: 10 },
  Transportation: { category: 'Needs', recommendedPercentage: 8 },
  Utilities: { category: 'Needs', recommendedPercentage: 5 },
  Healthcare: { category: 'Needs', recommendedPercentage: 5 },
  Entertainment: { category: 'Wants', recommendedPercentage: 5 },
  'Dining Out': { category: 'Wants', recommendedPercentage: 5 },
  'Shopping/Clothing': { category: 'Wants', recommendedPercentage: 8 },
  'Savings/Emergency Fund': { category: 'Savings', recommendedPercentage: 10 },
  Investments: { category: 'Savings', recommendedPercentage: 10 },
  Education: { category: 'Growth', recommendedPercentage: 5 },
  'Personal Care': { category: 'Wants', recommendedPercentage: 3 },
  Subscriptions: { category: 'Wants', recommendedPercentage: 4 },
  Miscellaneous: { category: 'Buffer', recommendedPercentage: 2 },
};
