import { CardStatement, DebtAccount } from '../models';

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
export const STATEMENT_HISTORY_LIMIT = 36;

/** A statement counts as the bank's truth unless it is a legacy auto-derived snapshot. */
export const isConfirmedStatement = (statement: CardStatement | undefined | null): statement is CardStatement =>
  !!statement && statement.source !== 'derived';

/** All confirmed statements of a card, newest first, one per bill date. */
export function confirmedStatements(card: DebtAccount): CardStatement[] {
  const byBillDate = new Map<string, CardStatement>();
  for (const statement of card.statementHistory ?? []) {
    if (isConfirmedStatement(statement) && !byBillDate.has(statement.billDateStr)) {
      byBillDate.set(statement.billDateStr, statement);
    }
  }
  // `statement` is the field older builds write; honour a user-confirmed one
  // that is newer than (or missing from) the history.
  const latest = card.statement;
  if (isConfirmedStatement(latest)) {
    const existing = byBillDate.get(latest.billDateStr);
    if (!existing || latest.updatedAt > existing.updatedAt) byBillDate.set(latest.billDateStr, latest);
  }
  return [...byBillDate.values()].sort((a, b) => b.billDateStr.localeCompare(a.billDateStr));
}

export function confirmedStatementFor(card: DebtAccount, billDateStr: string): CardStatement | null {
  return confirmedStatements(card).find((statement) => statement.billDateStr === billDateStr) ?? null;
}

/** History with `statement` inserted/replaced for its bill date, newest first, capped. */
export function upsertStatementHistory(card: DebtAccount, statement: CardStatement): CardStatement[] {
  const others = confirmedStatements(card).filter((item) => item.billDateStr !== statement.billDateStr);
  return [statement, ...others]
    .sort((a, b) => b.billDateStr.localeCompare(a.billDateStr))
    .slice(0, STATEMENT_HISTORY_LIMIT);
}
