"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConfirmedStatement = exports.STATEMENT_HISTORY_LIMIT = void 0;
exports.confirmedStatements = confirmedStatements;
exports.confirmedStatementFor = confirmedStatementFor;
exports.upsertStatementHistory = upsertStatementHistory;
/**
 * Stored credit-card statements (2026-10-02 model — replaces the frozen
 * "derived snapshot" of 2026-07-19).
 *
 * A statement is the BANK'S amount for one bill date. It is only ever written
 * from a source of truth — the user, a bank message or a bank PDF — never
 * guessed by the app. Until it exists the cycle is "statement pending" and
 * credit-card-cycle.ts shows a live estimate instead.
 *
 * `DebtAccount.statementHistory` keeps one statement per bill date (newest
 * first); `DebtAccount.statement` mirrors the newest for older builds.
 */
/** Confirmed statements kept per card (3 years of monthly bills). */
exports.STATEMENT_HISTORY_LIMIT = 36;
/** A statement counts as the bank's truth unless it is a legacy auto-derived snapshot. */
const isConfirmedStatement = (statement) => !!statement && statement.source !== 'derived';
exports.isConfirmedStatement = isConfirmedStatement;
/** All confirmed statements of a card, newest first, one per bill date. */
function confirmedStatements(card) {
    const byBillDate = new Map();
    for (const statement of card.statementHistory ?? []) {
        if ((0, exports.isConfirmedStatement)(statement) && !byBillDate.has(statement.billDateStr)) {
            byBillDate.set(statement.billDateStr, statement);
        }
    }
    // `statement` is the field older builds write; honour a user-confirmed one
    // that is newer than (or missing from) the history.
    const latest = card.statement;
    if ((0, exports.isConfirmedStatement)(latest)) {
        const existing = byBillDate.get(latest.billDateStr);
        if (!existing || latest.updatedAt > existing.updatedAt)
            byBillDate.set(latest.billDateStr, latest);
    }
    return [...byBillDate.values()].sort((a, b) => b.billDateStr.localeCompare(a.billDateStr));
}
function confirmedStatementFor(card, billDateStr) {
    return confirmedStatements(card).find((statement) => statement.billDateStr === billDateStr) ?? null;
}
/** History with `statement` inserted/replaced for its bill date, newest first, capped. */
function upsertStatementHistory(card, statement) {
    const others = confirmedStatements(card).filter((item) => item.billDateStr !== statement.billDateStr);
    return [statement, ...others]
        .sort((a, b) => b.billDateStr.localeCompare(a.billDateStr))
        .slice(0, exports.STATEMENT_HISTORY_LIMIT);
}
//# sourceMappingURL=credit-card-statement.js.map