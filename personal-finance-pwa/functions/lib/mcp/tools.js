"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_BY_NAME = exports.TOOLS = void 0;
const budget_summary_util_1 = require("../spenza-core/utils/budget-summary.util");
const circle_settlement_1 = require("../spenza-core/utils/circle-settlement");
const credit_card_cycle_1 = require("../spenza-core/utils/credit-card-cycle");
const local_date_1 = require("../spenza-core/utils/local-date");
const errors_1 = require("./errors");
// ─── Argument helpers ────────────────────────────────────────────────────────
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const bad = (message) => new errors_1.McpToolError('INVALID_ARGUMENT', message);
function optString(args, key) {
    const v = args[key];
    if (v === undefined || v === null || v === '')
        return undefined;
    if (typeof v !== 'string')
        throw bad(`${key} must be a string`);
    return v.trim();
}
function optNumber(args, key, min, max) {
    const v = args[key];
    if (v === undefined || v === null || v === '')
        return undefined;
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n))
        throw bad(`${key} must be a number`);
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
        throw bad(`${key} must be between ${min ?? '-∞'} and ${max ?? '∞'}`);
    }
    return n;
}
function optMonth(args, key = 'month') {
    const m = optString(args, key);
    if (m !== undefined && !MONTH_RE.test(m))
        throw bad(`${key} must look like 2026-10`);
    return m;
}
function optDate(args, key) {
    const d = optString(args, key);
    if (d !== undefined && !DATE_RE.test(d))
        throw bad(`${key} must look like 2026-10-21`);
    return d;
}
const monthOf = (now) => (0, local_date_1.toLocalDateString)(now).slice(0, 7);
function monthRange(month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
function previousMonth(month) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** `month`, or `from`/`to`, or the current month. */
function resolvePeriod(args, now) {
    const month = optMonth(args);
    const from = optDate(args, 'from');
    const to = optDate(args, 'to');
    if (month && (from || to))
        throw bad('Use either month or from/to, not both');
    if (month)
        return { ...monthRange(month), month };
    if (from || to) {
        const today = (0, local_date_1.toLocalDateString)(now);
        const range = { from: from ?? `${(to ?? today).slice(0, 7)}-01`, to: to ?? today };
        if (range.from > range.to)
            throw bad('from must be on or before to');
        return { ...range, month: null };
    }
    const current = monthOf(now);
    return { ...monthRange(current), month: current };
}
const inRange = (e, from, to) => e.date >= from && e.date <= to;
const round2 = (n) => Math.round(n * 100) / 100;
const sum = (entries) => round2(entries.reduce((s, e) => s + e.amount, 0));
function bucketOf(type, limits) {
    return limits.find((l) => l.type === type)?.category ?? 'Buffer';
}
function meta(data, ctx) {
    return {
        currency: data.currency,
        dataAsOf: data.dataAsOf,
        source: data.source === 'family-ledger' ? 'family (shared ledger)' : 'personal backup (Google Drive)',
        timezone: ctx.timezone,
    };
}
// ─── get_spending_summary ────────────────────────────────────────────────────
async function spendingSummary(args, ctx) {
    const data = await ctx.data();
    const period = resolvePeriod(args, ctx.now);
    const groupBy = optString(args, 'groupBy') ?? 'type';
    if (groupBy !== 'type' && groupBy !== 'member')
        throw bad("groupBy must be 'type' or 'member'");
    if (groupBy === 'member' && !data.family)
        throw bad("groupBy 'member' needs family mode; this user is in single mode");
    const expenses = (0, credit_card_cycle_1.expenseOnlyEntries)(data.expenses, data.debts);
    const current = expenses.filter((e) => inRange(e, period.from, period.to));
    const total = sum(current);
    let prev;
    if (period.month) {
        prev = monthRange(previousMonth(period.month));
    }
    else {
        const days = (0, credit_card_cycle_1.daysBetweenStr)(period.from, period.to) + 1;
        prev = { from: (0, credit_card_cycle_1.addDaysStr)(period.from, -days), to: (0, credit_card_cycle_1.addDaysStr)(period.from, -1) };
    }
    const previousTotal = sum(expenses.filter((e) => inRange(e, prev.from, prev.to)));
    const byType = new Map();
    for (const e of current)
        byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
    const types = [...byType.entries()]
        .map(([type, list]) => ({
        type,
        bucket: bucketOf(type, data.limits),
        total: sum(list),
        count: list.length,
        shareOfTotalPct: total > 0 ? round2((sum(list) / total) * 100) : 0,
    }))
        .sort((a, b) => b.total - a.total);
    const byBucket = Object.fromEntries(budget_summary_util_1.BUDGET_BUCKETS.map((b) => [b, 0]));
    for (const t of types)
        byBucket[t.bucket] = round2((byBucket[t.bucket] ?? 0) + t.total);
    const result = {
        period: { from: period.from, to: period.to },
        total,
        count: current.length,
        byType: types,
        byBucket,
        previousPeriod: { ...prev, total: previousTotal },
        changeVsPrevious: {
            amount: round2(total - previousTotal),
            percent: previousTotal > 0 ? round2(((total - previousTotal) / previousTotal) * 100) : null,
        },
    };
    if (groupBy === 'member') {
        const byMember = new Map();
        for (const e of current) {
            const key = e.createdByEmail ?? 'unknown';
            const row = byMember.get(key) ?? { member: key, role: e.createdByRole ?? 'unknown', total: 0, count: 0 };
            row.total = round2(row.total + e.amount);
            row.count += 1;
            byMember.set(key, row);
        }
        result['byMember'] = [...byMember.values()].sort((a, b) => b.total - a.total);
    }
    return { ...result, ...meta(data, ctx) };
}
// ─── list_expenses ───────────────────────────────────────────────────────────
async function listExpenses(args, ctx) {
    const data = await ctx.data();
    const period = resolvePeriod(args, ctx.now);
    const type = optString(args, 'type')?.toLowerCase();
    const search = optString(args, 'search')?.toLowerCase();
    const minAmount = optNumber(args, 'minAmount', 0);
    const maxAmount = optNumber(args, 'maxAmount', 0);
    const accountId = optString(args, 'accountId');
    const limit = Math.floor(optNumber(args, 'limit', 1, 100) ?? 50);
    const offset = Math.floor(optNumber(args, 'cursor', 0) ?? 0);
    const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
    const debtName = new Map(data.debts.map((d) => [d.id, d.name]));
    const matches = (0, credit_card_cycle_1.expenseOnlyEntries)(data.expenses, data.debts).filter((e) => inRange(e, period.from, period.to) &&
        (!type || e.type.toLowerCase() === type) &&
        (!search || (e.comment ?? '').toLowerCase().includes(search) || e.type.toLowerCase().includes(search)) &&
        (minAmount === undefined || e.amount >= minAmount) &&
        (maxAmount === undefined || e.amount <= maxAmount) &&
        (!accountId || e.accountId === accountId));
    const page = matches.slice(offset, offset + limit);
    return {
        period: { from: period.from, to: period.to },
        totalMatches: matches.length,
        totalAmount: sum(matches),
        expenses: page.map((e) => ({
            id: e.id,
            date: e.date,
            amount: e.amount,
            type: e.type,
            ...(e.comment ? { comment: e.comment } : {}),
            ...(e.accountId ? { account: accountName.get(e.accountId) ?? e.accountId } : {}),
            ...(e.debtId ? { card: debtName.get(e.debtId) ?? e.debtId } : {}),
            ...(e.source && e.source !== 'manual' ? { source: e.source } : {}),
            ...(data.family && e.createdByEmail ? { addedBy: e.createdByEmail } : {}),
        })),
        nextCursor: offset + limit < matches.length ? String(offset + limit) : null,
        ...meta(data, ctx),
    };
}
// ─── get_budget_status ───────────────────────────────────────────────────────
async function budgetStatus(args, ctx) {
    const data = await ctx.data();
    const month = optMonth(args) ?? monthOf(ctx.now);
    const { from, to } = monthRange(month);
    const income = data.monthlyIncome;
    const expenses = (0, credit_card_cycle_1.expenseOnlyEntries)(data.expenses, data.debts);
    const monthEntries = expenses.filter((e) => inRange(e, from, to));
    const spentByType = new Map();
    for (const e of monthEntries)
        spentByType.set(e.type, round2((spentByType.get(e.type) ?? 0) + e.amount));
    const types = data.limits.map((l) => {
        const limit = round2((0, budget_summary_util_1.monthlyLimitAmount)(l, income));
        const spent = spentByType.get(l.type) ?? 0;
        const pct = limit > 0 ? round2((spent / limit) * 100) : null;
        return {
            type: l.type,
            bucket: l.category,
            limitPctOfIncome: l.userPercentage,
            limit,
            spent,
            remaining: round2(limit - spent),
            percentUsed: pct,
            status: limit <= 0 ? (spent > 0 ? 'over' : 'ok') : spent > limit ? 'over' : spent >= limit * 0.8 ? 'near' : 'ok',
        };
    }).sort((a, b) => (b.percentUsed ?? 0) - (a.percentUsed ?? 0));
    const limited = new Set(data.limits.map((l) => l.type));
    const unbudgeted = [...spentByType.entries()]
        .filter(([type]) => !limited.has(type))
        .map(([type, spent]) => ({ type, spent }))
        .sort((a, b) => b.spent - a.spent);
    const s = (0, budget_summary_util_1.computeBudgetRuleSummary)(monthEntries, data.limits, income);
    const buckets = [
        { bucket: 'Needs', spent: s.needsTotal, target: s.needsTarget, percentOfIncome: s.needsPercentage },
        { bucket: 'Wants', spent: s.wantsTotal, target: s.wantsTarget, percentOfIncome: s.wantsPercentage },
        { bucket: 'Savings', spent: s.savingsTotal, target: s.savingsTarget, percentOfIncome: s.savingsPercentage },
        { bucket: 'Growth', spent: s.growthTotal, target: s.growthTarget, percentOfIncome: s.growthPercentage },
        { bucket: 'Buffer', spent: s.bufferTotal, target: s.bufferTarget, percentOfIncome: s.bufferPercentage },
    ].map((b) => ({ bucket: b.bucket, spent: round2(b.spent), target: round2(b.target), percentOfIncome: round2(b.percentOfIncome) }));
    const result = {
        month,
        monthlyIncome: income,
        totalSpent: sum(monthEntries),
        types,
        unbudgetedSpending: unbudgeted,
        buckets,
    };
    if (month === monthOf(ctx.now)) {
        const today = (0, local_date_1.toLocalDateString)(ctx.now);
        const dailyBudget = (0, budget_summary_util_1.dailyBudgetAmount)(income);
        const spentToday = sum(expenses.filter((e) => e.date === today));
        result['today'] = { date: today, dailyBudget, spentToday, remainingToday: round2(dailyBudget - spentToday) };
    }
    if (income <= 0)
        result['note'] = 'Monthly income is not set in Spenza, so limits are 0.';
    return { ...result, ...meta(data, ctx) };
}
// ─── get_debts_and_dues ──────────────────────────────────────────────────────
async function debtsAndDues(args, ctx) {
    const data = await ctx.data();
    const days = Math.floor(optNumber(args, 'days', 1, 365) ?? 30);
    const today = (0, local_date_1.toLocalDateString)(ctx.now);
    const windowEnd = (0, credit_card_cycle_1.addDaysStr)(today, days);
    const records = { entries: data.expenses, adjustments: data.debtAdjustments, payments: data.debtPayments };
    const active = data.debts.filter((d) => d.status === 'active');
    const cards = active.filter((d) => d.type === 'credit-card').map((card) => {
        const s = (0, credit_card_cycle_1.cardCycleState)(card, records, ctx.now);
        return {
            name: card.name,
            ...(card.cardLast4 ? { last4: card.cardLast4 } : {}),
            outstanding: s.totalOutstanding,
            statementAmount: s.statementAmount,
            billDue: s.billDue,
            ...(s.minDue !== undefined ? { minDue: s.minDue } : {}),
            unbilledSpend: s.unbilledSpend,
            dueDate: s.dueDateStr,
            daysUntilDue: s.dueDateStr ? (0, credit_card_cycle_1.daysBetweenStr)(today, s.dueDateStr) : null,
            statementStatus: s.status,
            nextBillDate: s.nextBillDateStr,
            ...(card.creditLimit ? { utilizationPct: round2((s.totalOutstanding / card.creditLimit) * 100) } : {}),
        };
    });
    const loans = active.filter((d) => d.type !== 'credit-card').map((loan) => ({
        name: loan.name,
        type: loan.type,
        remainingBalance: round2(loan.remainingBalance),
        ...(loan.monthlyEmi ? { monthlyEmi: loan.monthlyEmi } : {}),
        ...(loan.interestRate !== undefined ? { interestRatePct: loan.interestRate } : {}),
        nextDueDate: loan.nextDueDate ?? null,
        daysUntilDue: loan.nextDueDate ? (0, credit_card_cycle_1.daysBetweenStr)(today, loan.nextDueDate) : null,
    }));
    const dueSoon = [
        ...cards
            .filter((c) => c.dueDate && c.billDue > 0)
            .map((c) => ({ name: c.name, kind: 'credit-card', amount: c.billDue, dueDate: c.dueDate })),
        ...loans
            .filter((l) => l.nextDueDate)
            .map((l) => ({ name: l.name, kind: l.type, amount: l.monthlyEmi ?? null, dueDate: l.nextDueDate })),
    ]
        .filter((d) => d.dueDate <= windowEnd)
        .map((d) => ({ ...d, daysUntilDue: (0, credit_card_cycle_1.daysBetweenStr)(today, d.dueDate), overdue: d.dueDate < today }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return {
        today,
        windowDays: days,
        dueSoon,
        creditCards: cards,
        loans,
        totals: {
            cardOutstanding: round2(cards.reduce((s, c) => s + c.outstanding, 0)),
            loanOutstanding: round2(loans.reduce((s, l) => s + l.remainingBalance, 0)),
        },
        ...meta(data, ctx),
    };
}
// ─── get_circle_balances ─────────────────────────────────────────────────────
async function circleBalances(args, ctx) {
    const circleId = optString(args, 'circleId');
    const includeSettled = args['includeSettled'] === true || args['includeSettled'] === 'true';
    const snapshots = await ctx.circles(circleId);
    const circles = snapshots
        .filter((s) => circleId || includeSettled || s.circle.status === 'active')
        .map(({ circle, expenses }) => {
        const members = Object.values(circle.members ?? {});
        const nameOf = (id) => circle.members?.[id]?.name ?? id;
        const me = members.find((m) => m.uid && m.uid === ctx.uid);
        const balances = (0, circle_settlement_1.computeMemberBalances)(members, expenses);
        const transfers = (0, circle_settlement_1.circleHasFamilies)(members)
            ? (0, circle_settlement_1.computeFamilySettlementTransfers)(members, expenses)
            : (0, circle_settlement_1.computeSettlementTransfers)(balances);
        const myNet = me ? balances.find((b) => b.memberId === me.memberId)?.net ?? 0 : null;
        return {
            circleId: circle.circleId,
            name: circle.name,
            currency: circle.currency,
            status: circle.status,
            totalSpent: round2(expenses.reduce((s, e) => s + e.amount, 0)),
            expenseCount: expenses.length,
            you: me
                ? {
                    name: me.name,
                    net: myNet,
                    summary: myNet > 0.005 ? 'you are owed' : myNet < -0.005 ? 'you owe' : 'settled up',
                }
                : null,
            members: balances.map((b) => ({
                name: nameOf(b.memberId),
                isYou: !!me && b.memberId === me.memberId,
                paid: b.paid,
                share: b.share,
                net: b.net,
            })),
            settlement: transfers.map((t) => ({
                from: nameOf(t.fromMemberId),
                to: nameOf(t.toMemberId),
                amount: t.amount,
                involvesYou: !!me && (t.fromMemberId === me.memberId || t.toMemberId === me.memberId),
            })),
        };
    });
    return {
        circles,
        note: circles.length === 0 ? 'No matching circles.' : 'net > 0 means that person is owed money; net < 0 means they owe.',
        timezone: ctx.timezone,
    };
}
// ─── Definitions ─────────────────────────────────────────────────────────────
const periodProps = {
    month: { type: 'string', description: 'Calendar month as YYYY-MM. Default: the current month.' },
    from: { type: 'string', description: 'Start date YYYY-MM-DD (instead of month).' },
    to: { type: 'string', description: 'End date YYYY-MM-DD, inclusive (instead of month).' },
};
const READ_ONLY = 'Read-only. Amounts are in the user\'s Spenza currency (see `currency` in the result). Card bill repayments are excluded so spending is not counted twice. Data can be a few minutes behind the phone; `dataAsOf` says how fresh it is.';
exports.TOOLS = [
    {
        name: 'get_spending_summary',
        title: 'Spending summary',
        description: `Total spending for a period with a breakdown by expense type and budget bucket (Needs/Wants/Savings/Growth/Buffer), and the change vs the previous period. In family mode, groupBy "member" adds who spent what. ${READ_ONLY}`,
        inputSchema: {
            type: 'object',
            properties: {
                ...periodProps,
                groupBy: { type: 'string', enum: ['type', 'member'], description: 'Add a per-member breakdown (family mode only). Default: type.' },
            },
            additionalProperties: false,
        },
        run: spendingSummary,
    },
    {
        name: 'list_expenses',
        title: 'List expenses',
        description: `Individual expense entries, newest first, with filters. Use the summary tool for totals; use this to find specific entries. ${READ_ONLY}`,
        inputSchema: {
            type: 'object',
            properties: {
                ...periodProps,
                type: { type: 'string', description: 'Exact expense type name, e.g. "Food & Groceries".' },
                search: { type: 'string', description: 'Text to find in the comment or type.' },
                minAmount: { type: 'number', minimum: 0 },
                maxAmount: { type: 'number', minimum: 0 },
                accountId: { type: 'string', description: 'Only entries paid from this account id.' },
                limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Page size. Default 50.' },
                cursor: { type: 'string', description: 'nextCursor from the previous page.' },
            },
            additionalProperties: false,
        },
        run: listExpenses,
    },
    {
        name: 'get_budget_status',
        title: 'Budget status',
        description: `Each expense type's monthly limit (a % of monthly income) vs what was spent, with status ok/near (80%+)/over, bucket totals vs targets, spending with no limit, and — for the current month — today's daily budget (income / 30) vs today's spending. ${READ_ONLY}`,
        inputSchema: {
            type: 'object',
            properties: { month: periodProps['month'] },
            additionalProperties: false,
        },
        run: budgetStatus,
    },
    {
        name: 'get_debts_and_dues',
        title: 'Debts and dues',
        description: `Credit cards (outstanding, statement amount, bill due, minimum due, due date, utilization) and loans/EMIs (balance, EMI, next due date), plus everything due within the next N days, soonest first. ${READ_ONLY}`,
        inputSchema: {
            type: 'object',
            properties: { days: { type: 'integer', minimum: 1, maximum: 365, description: 'Look-ahead window for dueSoon. Default 30.' } },
            additionalProperties: false,
        },
        run: debtsAndDues,
    },
    {
        name: 'get_circle_balances',
        title: 'Circle balances',
        description: 'Shared-expense circles (Circle Splits) the user belongs to: who paid what, each member\'s net (positive = is owed), the user\'s own position, and the suggested settlement transfers. Active circles only unless includeSettled is true. Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                circleId: { type: 'string', description: 'One circle. Default: all of the user\'s circles.' },
                includeSettled: { type: 'boolean', description: 'Also include settled circles. Default false.' },
            },
            additionalProperties: false,
        },
        run: circleBalances,
    },
];
exports.TOOL_BY_NAME = new Map(exports.TOOLS.map((t) => [t.name, t]));
//# sourceMappingURL=tools.js.map