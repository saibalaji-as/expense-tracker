// GENERATED from src/app/core/utils/budget-summary.util.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
/**
 * Pure budget maths shared by the app (ExpenseStore, Daily screen) and the
 * read-only MCP server (functions/src/spenza-core is a generated copy).
 *
 * Keep this file dependency-free apart from models: no Angular, no services.
 */
import { BudgetRuleSummary } from '../models/budget-rule-summary.model';
import { ExpenseEntry } from '../models/expense-entry.model';
import { BudgetCategory, ExpenseLimit } from '../models/expense-limit.model';

export const BUDGET_BUCKETS: readonly BudgetCategory[] = ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'];

/** Monthly amount a type's limit allows: userPercentage % of monthly income. */
export function monthlyLimitAmount(limit: ExpenseLimit | undefined, income: number): number {
  return limit ? (limit.userPercentage / 100) * income : 0;
}

/** Daily budget shown on the Daily screen: monthly income / 30, rounded. */
export function dailyBudgetAmount(income: number): number {
  return income > 0 ? Math.round(income / 30) : 0;
}

/** Per-type daily limit: the type's monthly limit spread over the days of `now`'s month, rounded up. */
export function dailyTypeLimit(limit: ExpenseLimit | undefined, income: number, now: Date = new Date()): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.ceil(monthlyLimitAmount(limit, income) / daysInMonth);
}

/**
 * Needs/Wants/Savings/Growth/Buffer totals, % of income and targets.
 * `monthEntries` must already be expense-only (see `expenseOnlyEntries`) and
 * limited to one month. Types without a limit count as Buffer.
 */
export function computeBudgetRuleSummary(
  monthEntries: readonly ExpenseEntry[],
  limits: readonly ExpenseLimit[],
  income: number,
): BudgetRuleSummary {
  const limitMap: Record<string, ExpenseLimit> = {};
  for (const limit of limits) {
    limitMap[limit.type] = limit;
  }

  const totals: Record<BudgetCategory, number> = { Needs: 0, Wants: 0, Savings: 0, Growth: 0, Buffer: 0 };
  const targets: Record<BudgetCategory, number> = { Needs: 0, Wants: 0, Savings: 0, Growth: 0, Buffer: 0 };

  // Target allocations from configured limits
  for (const limit of limits) {
    if (limit.category in targets) {
      targets[limit.category] += (limit.userPercentage * income) / 100;
    }
  }

  // Actual spending by bucket
  for (const entry of monthEntries) {
    const category = limitMap[entry.type]?.category ?? 'Buffer';
    if (category in totals) {
      totals[category] += entry.amount;
    }
  }

  const pct = (amount: number): number => (income > 0 ? (amount / income) * 100 : 0);

  return {
    needsTotal: totals.Needs,
    wantsTotal: totals.Wants,
    savingsTotal: totals.Savings,
    growthTotal: totals.Growth,
    bufferTotal: totals.Buffer,
    needsPercentage: pct(totals.Needs),
    wantsPercentage: pct(totals.Wants),
    savingsPercentage: pct(totals.Savings),
    growthPercentage: pct(totals.Growth),
    bufferPercentage: pct(totals.Buffer),
    needsTarget: targets.Needs,
    wantsTarget: targets.Wants,
    savingsTarget: targets.Savings,
    growthTarget: targets.Growth,
    bufferTarget: targets.Buffer,
  };
}
