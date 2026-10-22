"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUDGET_BUCKETS = void 0;
exports.monthlyLimitAmount = monthlyLimitAmount;
exports.dailyBudgetAmount = dailyBudgetAmount;
exports.dailyTypeLimit = dailyTypeLimit;
exports.computeBudgetRuleSummary = computeBudgetRuleSummary;
exports.BUDGET_BUCKETS = ['Needs', 'Wants', 'Savings', 'Growth', 'Buffer'];
/** Monthly amount a type's limit allows: userPercentage % of monthly income. */
function monthlyLimitAmount(limit, income) {
    return limit ? (limit.userPercentage / 100) * income : 0;
}
/** Daily budget shown on the Daily screen: monthly income / 30, rounded. */
function dailyBudgetAmount(income) {
    return income > 0 ? Math.round(income / 30) : 0;
}
/** Per-type daily limit: the type's monthly limit spread over the days of `now`'s month, rounded up. */
function dailyTypeLimit(limit, income, now = new Date()) {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.ceil(monthlyLimitAmount(limit, income) / daysInMonth);
}
/**
 * Needs/Wants/Savings/Growth/Buffer totals, % of income and targets.
 * `monthEntries` must already be expense-only (see `expenseOnlyEntries`) and
 * limited to one month. Types without a limit count as Buffer.
 */
function computeBudgetRuleSummary(monthEntries, limits, income) {
    const limitMap = {};
    for (const limit of limits) {
        limitMap[limit.type] = limit;
    }
    const totals = { Needs: 0, Wants: 0, Savings: 0, Growth: 0, Buffer: 0 };
    const targets = { Needs: 0, Wants: 0, Savings: 0, Growth: 0, Buffer: 0 };
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
    const pct = (amount) => (income > 0 ? (amount / income) * 100 : 0);
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
//# sourceMappingURL=budget-summary.util.js.map