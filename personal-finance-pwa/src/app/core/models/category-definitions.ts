/**
 * Category definitions for the Spenza PWA.
 * Maps expense category IDs to Lucide icon names (kebab-case), CSS variable names,
 * budget groups, and recommended allocation percentages.
 *
 * Mirrors the React reference implementation at /UI-design/src/lib/categories.ts.
 */

import { BudgetCategory } from './expense-limit.model';

export type BudgetGroup = 'needs' | 'wants' | 'savings' | 'growth' | 'buffer';

export interface CategoryDef {
  id: string;
  name: string;
  /** Lucide icon name in kebab-case (for use with lucide-angular) */
  icon: string;
  /** CSS variable name without var() wrapper, e.g. '--cat-housing' */
  colorVar: string;
  group: BudgetGroup;
  recommendedPct: number;
}

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    id: 'housing',
    name: 'Housing',
    icon: 'home',
    colorVar: '--cat-housing',
    group: 'needs',
    recommendedPct: 30,
  },
  {
    id: 'food',
    name: 'Food & Groceries',
    icon: 'shopping-basket',
    colorVar: '--cat-food',
    group: 'needs',
    recommendedPct: 10,
  },
  {
    id: 'transport',
    name: 'Transportation',
    icon: 'car',
    colorVar: '--cat-transport',
    group: 'needs',
    recommendedPct: 5,
  },
  {
    id: 'utilities',
    name: 'Utilities',
    icon: 'plug',
    colorVar: '--cat-utilities',
    group: 'needs',
    recommendedPct: 3,
  },
  {
    id: 'health',
    name: 'Healthcare',
    icon: 'heart-pulse',
    colorVar: '--cat-health',
    group: 'needs',
    recommendedPct: 2,
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: 'clapperboard',
    colorVar: '--cat-entertainment',
    group: 'wants',
    recommendedPct: 6,
  },
  {
    id: 'dining',
    name: 'Dining Out',
    icon: 'utensils-crossed',
    colorVar: '--cat-dining',
    group: 'wants',
    recommendedPct: 7,
  },
  {
    id: 'shopping',
    name: 'Shopping/Clothing',
    icon: 'shopping-bag',
    colorVar: '--cat-shopping',
    group: 'wants',
    recommendedPct: 7,
  },
  {
    id: 'savings',
    name: 'Savings/Emergency Fund',
    icon: 'piggy-bank',
    colorVar: '--cat-savings',
    group: 'savings',
    recommendedPct: 12,
  },
  {
    id: 'investments',
    name: 'Investments',
    icon: 'trending-up',
    colorVar: '--cat-investments',
    group: 'growth',
    recommendedPct: 6,
  },
  {
    id: 'education',
    name: 'Education',
    icon: 'graduation-cap',
    colorVar: '--cat-education',
    group: 'growth',
    recommendedPct: 2,
  },
  {
    id: 'personal',
    name: 'Personal Care',
    icon: 'sparkles',
    colorVar: '--cat-personal',
    group: 'wants',
    recommendedPct: 5,
  },
  {
    id: 'subscriptions',
    name: 'Subscriptions',
    icon: 'repeat',
    colorVar: '--cat-subscriptions',
    group: 'wants',
    recommendedPct: 5,
  },
  {
    id: 'misc',
    name: 'Miscellaneous',
    icon: 'shapes',
    colorVar: '--cat-misc',
    group: 'buffer',
    recommendedPct: 0,
  },
];

/**
 * Fallback definition used for unknown or custom category IDs.
 * Uses the generic Tag icon and the misc color variable.
 */
export const FALLBACK_CATEGORY_DEF: CategoryDef = {
  id: 'custom',
  name: 'Custom',
  icon: 'tag',
  colorVar: '--cat-misc',
  group: 'buffer',
  recommendedPct: 0,
};

export const PREDEFINED_EXPENSE_TYPES: readonly string[] = CATEGORY_DEFS.map((category) => category.name);

export function budgetGroupToBudgetCategory(group: BudgetGroup): BudgetCategory {
  switch (group) {
    case 'needs':
      return 'Needs';
    case 'wants':
      return 'Wants';
    case 'savings':
      return 'Savings';
    case 'growth':
      return 'Growth';
    case 'buffer':
      return 'Buffer';
  }
}

export const DEFAULT_BUDGET_PERCENTAGES: Record<
  string,
  { category: BudgetCategory; recommendedPercentage: number }
> = Object.fromEntries(
  CATEGORY_DEFS.map((category) => [
    category.name,
    {
      category: budgetGroupToBudgetCategory(category.group),
      recommendedPercentage: category.recommendedPct,
    },
  ])
) as Record<string, { category: BudgetCategory; recommendedPercentage: number }>;

/**
 * Looks up a category definition by its ID.
 * Returns FALLBACK_CATEGORY_DEF for any unknown category ID.
 */
export function getCategoryDef(id: string): CategoryDef {
  return CATEGORY_DEFS.find((c) => c.id === id) ?? FALLBACK_CATEGORY_DEF;
}

export function getCategoryDefByName(name: string): CategoryDef {
  return CATEGORY_DEFS.find((category) => category.name === name) ?? FALLBACK_CATEGORY_DEF;
}

export function getCategoryIdByName(name: string): string {
  return getCategoryDefByName(name).id;
}

export function getCategoryNameById(id: string): string {
  return getCategoryDef(id).name;
}
