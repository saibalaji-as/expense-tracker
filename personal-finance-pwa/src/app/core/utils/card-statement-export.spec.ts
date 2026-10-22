import { cardStatementCsv, cardStatementFileName } from './card-statement-export';
import { CardCycleActivity } from './credit-card-cycle';
import { DebtAccount } from '../models';

const card: DebtAccount = {
  id: 'cc-1', name: 'HDFC Regalia Gold', type: 'credit-card', principalAmount: 100000, remainingBalance: 0,
  startDate: '2026-01-01', status: 'active', billGenerationDay: 25, cardLast4: '4321', createdAt: 'x', updatedAt: 'x',
};

const activity: CardCycleActivity = {
  window: { billDateStr: '2026-09-25', fromStr: '2026-08-26', toStr: '2026-09-25' },
  openingBalance: 5000,
  lines: [
    { id: '1', date: '2026-09-02', kind: 'purchase', description: 'Shopping — Amazon, "Echo"', amount: 1299, direction: 'debit' },
    { id: '2', date: '2026-09-10', kind: 'payment', description: 'Bill payment', amount: 5000, direction: 'credit' },
    { id: '3', date: '2026-09-12', kind: 'refund', description: '=HYPERLINK("x")', amount: 99.5, direction: 'credit' },
  ],
  totalPurchases: 1299,
  totalOtherDebits: 0,
  totalCredits: 99.5,
  totalPayments: 5000,
  closingBalance: 1199.5,
  statement: { billDateStr: '2026-09-25', amount: 1250, minDue: 100, dueDateStr: '2026-10-15', source: 'sms', updatedAt: 'x' },
};

describe('cardStatementCsv', () => {
  const csv = cardStatementCsv(card, activity, 'INR');
  const lines = csv.replace('﻿', '').split('\r\n');

  it('starts with a BOM and carries the header block', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe('Card,HDFC Regalia Gold');
    expect(lines).toContain('Period,2026-08-26 to 2026-09-25');
    expect(lines).toContain('Opening balance,5000.00');
  });

  it('quotes commas/quotes and neutralises formula-like descriptions', () => {
    expect(lines).toContain('2026-09-02,Purchase,"Shopping — Amazon, ""Echo""",1299.00,');
    expect(lines).toContain('2026-09-12,Refund,"\'=HYPERLINK(""x"")",,99.50');
  });

  it('ends with totals and the bank comparison', () => {
    expect(lines).toContain('Closing balance (Spenza records),1199.50');
    expect(lines).toContain('Bank statement amount,1250.00');
    expect(lines).toContain('Difference (bank minus Spenza),50.50');
    expect(lines).toContain('Payment due date,2026-10-15');
  });

  it('names the file after the card and bill date', () => {
    expect(cardStatementFileName(card, activity)).toBe('spenza-hdfc-regalia-gold-statement-2026-09-25.csv');
    expect(
      cardStatementFileName(card, { ...activity, window: { billDateStr: null, fromStr: '2026-09-26', toStr: '2026-10-02' } })
    ).toBe('spenza-hdfc-regalia-gold-statement-unbilled-2026-10-02.csv');
  });
});
