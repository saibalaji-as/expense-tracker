export interface BudgetRuleSummary {
  needsTotal: number;
  wantsTotal: number;
  savingsTotal: number;
  needsPercentage: number;
  wantsPercentage: number;
  savingsPercentage: number;
  needsTarget: number;   // 50% of income
  wantsTarget: number;   // 30% of income
  savingsTarget: number; // 20% of income
}
