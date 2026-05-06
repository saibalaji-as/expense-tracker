export interface BudgetRuleSummary {
  needsTotal: number;
  wantsTotal: number;
  savingsTotal: number;
  growthTotal: number;
  bufferTotal: number;
  needsPercentage: number;
  wantsPercentage: number;
  savingsPercentage: number;
  growthPercentage: number;
  bufferPercentage: number;
  needsTarget: number;   // Target allocation from income
  wantsTarget: number;   // Target allocation from income
  savingsTarget: number; // Target allocation from income
  growthTarget: number;  // Target allocation from income
  bufferTarget: number;  // Target allocation from income
}
