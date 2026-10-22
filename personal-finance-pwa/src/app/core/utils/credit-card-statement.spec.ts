import { confirmedStatementFor, confirmedStatements, isConfirmedStatement, STATEMENT_HISTORY_LIMIT, upsertStatementHistory } from './credit-card-statement';
import { CardStatement, DebtAccount } from '../models';

function baseCard(): DebtAccount {
  return {
    id: 'cc-1',
    name: 'HDFC Card',
    type: 'credit-card',
    principalAmount: 100000,
    remainingBalance: 5000,
    startDate: '2026-01-01',
    status: 'active',
    billGenerationDay: 25,
    paymentDueDay: 15,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('statement history', () => {
  it('keeps one statement per bill date, newest first, capped', () => {
    let card = baseCard();
    for (let month = 1; month <= STATEMENT_HISTORY_LIMIT + 4; month++) {
      const year = 2020 + Math.floor((month - 1) / 12);
      const mm = `${((month - 1) % 12) + 1}`.padStart(2, '0');
      const statement: CardStatement = { billDateStr: `${year}-${mm}-25`, amount: month, source: 'user', updatedAt: `${month}`.padStart(3, '0') };
      card = { ...card, statement, statementHistory: upsertStatementHistory(card, statement) };
    }
    expect(card.statementHistory).toHaveLength(STATEMENT_HISTORY_LIMIT);
    expect(card.statementHistory![0].amount).toBe(STATEMENT_HISTORY_LIMIT + 4);

    const replaced: CardStatement = { ...card.statementHistory![0], amount: 777, updatedAt: 'zzz' };
    const history = upsertStatementHistory(card, replaced);
    expect(history).toHaveLength(STATEMENT_HISTORY_LIMIT);
    expect(history[0].amount).toBe(777);
  });

  it('lets a newer legacy `statement` win over the history entry for the same bill', () => {
    const card: DebtAccount = {
      ...baseCard(),
      statementHistory: [{ billDateStr: '2026-08-25', amount: 100, source: 'user', updatedAt: '2026-08-26T00:00:00Z' }],
      statement: { billDateStr: '2026-08-25', amount: 150, source: 'user', updatedAt: '2026-08-27T00:00:00Z' },
    };
    expect(confirmedStatements(card)).toHaveLength(1);
    expect(confirmedStatements(card)[0].amount).toBe(150);
  });
});

describe('confirmed statements', () => {
  it('never treats a legacy auto-derived snapshot as the bank truth', () => {
    const derived: CardStatement = { billDateStr: '2026-08-25', amount: 999, source: 'derived', updatedAt: 'x' };
    expect(isConfirmedStatement(derived)).toBe(false);
    expect(isConfirmedStatement(undefined)).toBe(false);
    expect(confirmedStatementFor({ ...baseCard(), statement: derived, statementHistory: [derived] }, '2026-08-25')).toBeNull();
  });

  it('accepts user, bank-message and bank-PDF statements', () => {
    for (const source of ['user', 'sms', 'pdf'] as const) {
      const statement: CardStatement = { billDateStr: '2026-08-25', amount: 100, source, updatedAt: 'x' };
      expect(confirmedStatementFor({ ...baseCard(), statementHistory: [statement] }, '2026-08-25')?.source).toBe(source);
    }
  });
});
