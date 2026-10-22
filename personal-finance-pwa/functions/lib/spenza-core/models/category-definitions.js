"use strict";
// GENERATED from src/app/core/models/category-definitions.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
/**
 * Category definitions for the Spenza PWA.
 * Maps expense category IDs to Lucide icon names (kebab-case), CSS variable names,
 * budget groups, and recommended allocation percentages.
 *
 * Mirrors the React reference implementation at /UI-design/src/lib/categories.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BUDGET_PERCENTAGES = exports.PREDEFINED_EXPENSE_TYPES = exports.FALLBACK_CATEGORY_DEF = exports.CATEGORY_DEFS = void 0;
exports.budgetGroupToBudgetCategory = budgetGroupToBudgetCategory;
exports.getCategoryDef = getCategoryDef;
exports.getCategoryDefByName = getCategoryDefByName;
exports.getCategoryIdByName = getCategoryIdByName;
exports.getCategoryNameById = getCategoryNameById;
exports.CATEGORY_DEFS = [
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
    {
        id: 'debt-payment',
        name: 'Debt Payment',
        icon: 'receipt-indian-rupee',
        colorVar: '--cat-misc',
        group: 'buffer',
        recommendedPct: 0,
    },
];
/**
 * Fallback definition used for unknown or custom category IDs.
 * Uses the generic Tag icon and the misc color variable.
 */
exports.FALLBACK_CATEGORY_DEF = {
    id: 'custom',
    name: 'Custom',
    icon: 'tag',
    colorVar: '--cat-misc',
    group: 'buffer',
    recommendedPct: 0,
};
exports.PREDEFINED_EXPENSE_TYPES = exports.CATEGORY_DEFS.map((category) => category.name);
function budgetGroupToBudgetCategory(group) {
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
exports.DEFAULT_BUDGET_PERCENTAGES = Object.fromEntries(exports.CATEGORY_DEFS.map((category) => [
    category.name,
    {
        category: budgetGroupToBudgetCategory(category.group),
        recommendedPercentage: category.recommendedPct,
    },
]));
/**
 * Looks up a category definition by its ID.
 * Returns FALLBACK_CATEGORY_DEF for any unknown category ID.
 */
function getCategoryDef(id) {
    return exports.CATEGORY_DEFS.find((c) => c.id === id) ?? exports.FALLBACK_CATEGORY_DEF;
}
function getCategoryDefByName(name) {
    return exports.CATEGORY_DEFS.find((category) => category.name === name) ?? exports.FALLBACK_CATEGORY_DEF;
}
function getCategoryIdByName(name) {
    return getCategoryDefByName(name).id;
}
function getCategoryNameById(id) {
    return getCategoryDef(id).name;
}
//# sourceMappingURL=category-definitions.js.map