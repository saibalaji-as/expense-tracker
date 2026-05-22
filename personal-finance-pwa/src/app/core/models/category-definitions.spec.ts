import { describe, expect, it } from 'vitest';
import {
  CATEGORY_DEFS,
  DEFAULT_BUDGET_PERCENTAGES,
  PREDEFINED_EXPENSE_TYPES,
  budgetGroupToBudgetCategory,
  getCategoryIdByName,
} from './category-definitions';
import { BudgetCategory } from './expense-limit.model';

describe('category definitions', () => {
  it('derives predefined expense types from category definitions', () => {
    expect(PREDEFINED_EXPENSE_TYPES).toEqual(CATEGORY_DEFS.map((category) => category.name));
  });

  it('derives default budget percentages from category definitions', () => {
    for (const category of CATEGORY_DEFS) {
      expect(DEFAULT_BUDGET_PERCENTAGES[category.name]?.recommendedPercentage).toBe(category.recommendedPct);
    }
  });

  it('keeps predefined recommendations balanced at 100 percent', () => {
    const total = CATEGORY_DEFS.reduce((sum, category) => sum + category.recommendedPct, 0);
    expect(total).toBe(100);
  });

  it('keeps default allocation aligned to the 50/30/20 rule', () => {
    const groupTotals = CATEGORY_DEFS.reduce(
      (totals, category) => {
        const group = budgetGroupToBudgetCategory(category.group);
        totals[group] += category.recommendedPct;
        return totals;
      },
      { Needs: 0, Wants: 0, Savings: 0, Growth: 0, Buffer: 0 } as Record<BudgetCategory, number>
    );

    expect(groupTotals.Needs).toBe(50);
    expect(groupTotals.Wants).toBe(30);
    expect(groupTotals.Savings + groupTotals.Growth).toBe(20);
    expect(groupTotals.Buffer).toBe(0);
  });

  it('maps expense type names back to category ids', () => {
    expect(getCategoryIdByName('Housing')).toBe('housing');
    expect(getCategoryIdByName('Savings/Emergency Fund')).toBe('savings');
  });
});
