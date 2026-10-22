"use strict";
// GENERATED from src/app/core/utils/circle-settlement.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
/**
 * Circle Splits settlement engine — PURE functions, no Angular imports.
 * Design: docs/circle-splits-plan.md §6.
 *
 * All arithmetic is done in integer paise (amount * 100) so every member's
 * device computes byte-identical results. Equal-split rounding remainders are
 * distributed deterministically: participants sorted by memberId, the first
 * `remainder` of them carry one extra paisa.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeMyShareOfExpense = computeMyShareOfExpense;
exports.computeShareOwedToOthers = computeShareOwedToOthers;
exports.computeMemberBalances = computeMemberBalances;
exports.circleHasFamilies = circleHasFamilies;
exports.computeFamilyBalances = computeFamilyBalances;
exports.computeFamilySettlementTransfers = computeFamilySettlementTransfers;
exports.computeCarriedShare = computeCarriedShare;
exports.computeSettlementTransfers = computeSettlementTransfers;
exports.computeMyShare = computeMyShare;
exports.buildShareSummaryText = buildShareSummaryText;
const circle_model_1 = require("../models/circle.model");
const toPaise = (amount) => Math.round(amount * 100);
const fromPaise = (paise) => paise / 100;
/**
 * Per-participant equal-split shares of ONE expense, in paise. Participants
 * are deduped, restricted to `validMemberIds`, and sorted by memberId; the
 * first `remainder` participants carry one extra paisa — identical logic on
 * every device.
 */
function expenseSharesPaise(expense, validMemberIds) {
    const shares = new Map();
    const participants = [...new Set(expense.participantMemberIds)]
        .filter((id) => validMemberIds.has(id))
        .sort();
    if (participants.length === 0)
        return shares;
    const totalPaise = toPaise(expense.amount);
    if (!Number.isFinite(totalPaise) || totalPaise <= 0)
        return shares;
    const base = Math.floor(totalPaise / participants.length);
    const remainder = totalPaise - base * participants.length;
    participants.forEach((memberId, index) => {
        shares.set(memberId, base + (index < remainder ? 1 : 0));
    });
    return shares;
}
/** One member's per-head share of a single expense, in currency units. */
function computeMyShareOfExpense(memberId, expense, members) {
    if (expense.deleted)
        return 0;
    const valid = new Set(members.map((m) => m.memberId));
    return fromPaise(expenseSharesPaise(expense, valid).get(memberId) ?? 0);
}
/**
 * Sum of the member's shares across non-deleted expenses that OTHERS paid.
 * This is what gets posted to the personal budget on Settle Up — the member's
 * own paid bills are trued-up in place instead (plan §true-up).
 */
function computeShareOwedToOthers(memberId, members, expenses) {
    const valid = new Set(members.map((m) => m.memberId));
    let paise = 0;
    for (const expense of expenses) {
        if (expense.deleted || expense.paidByMemberId === memberId)
            continue;
        paise += expenseSharesPaise(expense, valid).get(memberId) ?? 0;
    }
    return fromPaise(paise);
}
/**
 * Per-member paid/share/net over the non-deleted expenses.
 * Members with no activity still appear with zeros so the UI can render
 * everyone consistently.
 */
function computeMemberBalances(members, expenses) {
    const paidPaise = new Map();
    const sharePaise = new Map();
    for (const m of members) {
        paidPaise.set(m.memberId, 0);
        sharePaise.set(m.memberId, 0);
    }
    const valid = new Set(members.map((m) => m.memberId));
    for (const expense of expenses) {
        if (expense.deleted)
            continue;
        const shares = expenseSharesPaise(expense, valid);
        if (shares.size === 0)
            continue;
        if (paidPaise.has(expense.paidByMemberId)) {
            paidPaise.set(expense.paidByMemberId, paidPaise.get(expense.paidByMemberId) + toPaise(expense.amount));
        }
        for (const [memberId, share] of shares) {
            sharePaise.set(memberId, sharePaise.get(memberId) + share);
        }
    }
    return members.map((m) => {
        const paid = paidPaise.get(m.memberId) ?? 0;
        const share = sharePaise.get(m.memberId) ?? 0;
        return {
            memberId: m.memberId,
            paid: fromPaise(paid),
            share: fromPaise(share),
            net: fromPaise(paid - share),
        };
    });
}
/** True when at least one member carries a family assignment. */
function circleHasFamilies(members) {
    return members.some((m) => m.familyHeadMemberId != null);
}
/**
 * Member balances rolled up per family (paise-exact). Ungrouped members form
 * single-member groups, so this is safe to use on any circle.
 */
function computeFamilyBalances(members, expenses) {
    const balances = computeMemberBalances(members, expenses);
    const memberById = new Map(members.map((m) => [m.memberId, m]));
    const groups = new Map();
    for (const b of balances) {
        const member = memberById.get(b.memberId);
        if (!member)
            continue;
        const key = (0, circle_model_1.familyKeyOf)(member);
        const group = groups.get(key) ?? { memberIds: [], paidPaise: 0, sharePaise: 0 };
        group.memberIds.push(b.memberId);
        group.paidPaise += toPaise(b.paid);
        group.sharePaise += toPaise(b.share);
        groups.set(key, group);
    }
    return [...groups.entries()]
        .map(([headMemberId, g]) => ({
        headMemberId,
        memberIds: [
            ...g.memberIds.filter((id) => id === headMemberId),
            ...g.memberIds.filter((id) => id !== headMemberId).sort(),
        ],
        paid: fromPaise(g.paidPaise),
        share: fromPaise(g.sharePaise),
        net: fromPaise(g.paidPaise - g.sharePaise),
    }))
        .sort((a, b) => a.headMemberId.localeCompare(b.headMemberId));
}
/**
 * Head-to-head settlement transfers. With no families this equals
 * computeSettlementTransfers over member balances.
 */
function computeFamilySettlementTransfers(members, expenses) {
    const familyBalances = computeFamilyBalances(members, expenses).map((f) => ({
        memberId: f.headMemberId,
        paid: f.paid,
        share: f.share,
        net: f.net,
    }));
    return computeSettlementTransfers(familyBalances);
}
/**
 * The TOTAL share the given member carries on Settle Up under family rules:
 * heads (and individuals) carry their whole family's share; non-head family
 * members carry 0 — their head covers them.
 */
function computeCarriedShare(memberId, members, expenses) {
    const me = members.find((m) => m.memberId === memberId);
    if (!me)
        return 0;
    if ((0, circle_model_1.familyKeyOf)(me) !== memberId)
        return 0; // non-head family member
    const family = computeFamilyBalances(members, expenses).find((f) => f.headMemberId === memberId);
    return family ? family.share : 0;
}
/**
 * Greedy minimal-transfer settlement: repeatedly matches the largest debtor
 * with the largest creditor. Produces at most (n - 1) transfers.
 * Ties broken by memberId so output ordering is deterministic on every device.
 */
function computeSettlementTransfers(balances) {
    const creditors = [];
    const debtors = [];
    for (const b of balances) {
        const paise = toPaise(b.net);
        if (paise > 0)
            creditors.push({ memberId: b.memberId, paise });
        else if (paise < 0)
            debtors.push({ memberId: b.memberId, paise: -paise });
    }
    const byAmountThenId = (a, b) => b.paise - a.paise || a.memberId.localeCompare(b.memberId);
    creditors.sort(byAmountThenId);
    debtors.sort(byAmountThenId);
    const transfers = [];
    let ci = 0;
    let di = 0;
    while (ci < creditors.length && di < debtors.length) {
        const creditor = creditors[ci];
        const debtor = debtors[di];
        const paise = Math.min(creditor.paise, debtor.paise);
        if (paise > 0) {
            transfers.push({
                fromMemberId: debtor.memberId,
                toMemberId: creditor.memberId,
                amount: fromPaise(paise),
            });
        }
        creditor.paise -= paise;
        debtor.paise -= paise;
        if (creditor.paise === 0)
            ci++;
        if (debtor.paise === 0)
            di++;
    }
    return transfers;
}
/**
 * The given member's own per-head share total (what should be posted to their
 * personal budget on Settle Up), in currency units.
 */
function computeMyShare(memberId, members, expenses) {
    const balance = computeMemberBalances(members, expenses).find((b) => b.memberId === memberId);
    return balance ? balance.share : 0;
}
/**
 * Plain-text settlement summary for sharing (WhatsApp etc.).
 * `formatAmount` lets the caller apply the app currency formatting.
 */
function buildShareSummaryText(circleName, members, expenses, formatAmount) {
    const nameOf = new Map(members.map((m) => [m.memberId, m.name]));
    const hasFamilies = circleHasFamilies(members);
    const balances = computeMemberBalances(members, expenses);
    const transfers = hasFamilies
        ? computeFamilySettlementTransfers(members, expenses)
        : computeSettlementTransfers(balances);
    const active = expenses.filter((e) => !e.deleted);
    const total = fromPaise(active.reduce((sum, e) => sum + toPaise(e.amount), 0));
    const balanceLines = hasFamilies
        ? computeFamilyBalances(members, expenses).map((f) => {
            const name = nameOf.get(f.headMemberId) ?? f.headMemberId;
            const label = f.memberIds.length > 1 ? `${name} (family of ${f.memberIds.length})` : name;
            if (f.net > 0)
                return `• ${label} gets back ${formatAmount(f.net)}`;
            if (f.net < 0)
                return `• ${label} owes ${formatAmount(-f.net)}`;
            return `• ${label} is settled`;
        })
        : balances.map((b) => {
            const name = nameOf.get(b.memberId) ?? b.memberId;
            if (b.net > 0)
                return `• ${name} gets back ${formatAmount(b.net)}`;
            if (b.net < 0)
                return `• ${name} owes ${formatAmount(-b.net)}`;
            return `• ${name} is settled`;
        });
    const lines = [
        `${circleName} — Spenza Splits`,
        `Total spent: ${formatAmount(total)} across ${active.length} expense${active.length === 1 ? '' : 's'}`,
        '',
        'Balances:',
        ...balanceLines,
    ];
    if (transfers.length > 0) {
        lines.push('', 'Settle up:');
        lines.push(...transfers.map((t) => `• ${nameOf.get(t.fromMemberId) ?? t.fromMemberId} → ${nameOf.get(t.toMemberId) ?? t.toMemberId}: ${formatAmount(t.amount)}`));
    }
    return lines.join('\n');
}
//# sourceMappingURL=circle-settlement.js.map