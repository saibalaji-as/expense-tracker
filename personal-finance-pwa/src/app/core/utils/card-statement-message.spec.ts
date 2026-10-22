import { parseStatementMessage } from './card-statement-message';

const NOW = new Date('2026-09-26T10:00:00');

describe('parseStatementMessage', () => {
  it('reads an HDFC-style statement message', () => {
    const parsed = parseStatementMessage(
      'HDFC Bank Credit Card ending 4321: Statement generated. Total Due: Rs.20,300.00, Min Due: Rs.1,015.00, Due Date: 15-10-2026. Pay via NetBanking.',
      NOW
    );
    expect(parsed).toEqual({ amount: 20300, minDue: 1015, dueDateStr: '2026-10-15', cardLast4: '4321', mentionsStatement: true });
  });

  it('reads an ICICI-style "Total of … or minimum of … is due by"', () => {
    const parsed = parseStatementMessage(
      'ICICI Bank Credit Card XX9012 Statement is sent to sa****@gmail.com. Total of Rs 45,678.90 or minimum of Rs 2,290.00 is due by 15-OCT-26.',
      NOW
    );
    expect(parsed).toEqual({ amount: 45678.9, minDue: 2290, dueDateStr: '2026-10-15', cardLast4: '9012', mentionsStatement: true });
  });

  it('reads an SBI Card-style message with "Amt" abbreviations and slashes', () => {
    const parsed = parseStatementMessage(
      'E-statement of SBI Credit Card ending XX5566 dated 25/09/2026 has been mailed. Total Amt Due Rs 8125.40, Min Amt Due Rs 407.00, payable by 14/10/2026.',
      NOW
    );
    expect(parsed).toEqual({ amount: 8125.4, minDue: 407, dueDateStr: '2026-10-14', cardLast4: '5566', mentionsStatement: true });
  });

  it('reads an Axis-style message with INR and a 2-digit year', () => {
    const parsed = parseStatementMessage(
      'Your Axis Bank Credit Card no. XX7788 statement is generated. Total amount due INR 12,000.00. Minimum amount due INR 600.00. Due date 15-10-26.',
      NOW
    );
    expect(parsed).toEqual({ amount: 12000, minDue: 600, dueDateStr: '2026-10-15', cardLast4: '7788', mentionsStatement: true });
  });

  it('never reads the minimum due as the total when the minimum comes first', () => {
    const parsed = parseStatementMessage(
      'Kotak Credit Card xx1122 statement: Min Amt Due Rs.950. Total Amt Due Rs.19000. Due Date 15-OCT-2026.',
      NOW
    );
    expect(parsed?.amount).toBe(19000);
    expect(parsed?.minDue).toBe(950);
  });

  it('reads AED amounts and a due date without a year', () => {
    const parsed = parseStatementMessage(
      'Your credit card statement is ready. Total amount due is AED 3,450.75 and minimum due is AED 172.50. Payment due date: 20 Oct.',
      NOW
    );
    expect(parsed).toEqual({ amount: 3450.75, minDue: 172.5, dueDateStr: '2026-10-20', mentionsStatement: true });
  });

  it('rolls a year-less due date into next year when it would be long past', () => {
    const parsed = parseStatementMessage('Statement generated. Total due Rs 500. Due on 5 Jan.', new Date('2026-12-26T10:00:00'));
    expect(parsed?.dueDateStr).toBe('2027-01-05');
  });

  it('accepts a zero-amount statement', () => {
    const parsed = parseStatementMessage('Statement for card ending 4321 generated. Total Amt Due Rs 0.00. Min Amt Due Rs 0.00.', NOW);
    expect(parsed?.amount).toBe(0);
    expect(parsed?.minDue).toBeUndefined();
  });

  it('marks a plain due reminder as not mentioning a statement', () => {
    const parsed = parseStatementMessage('Reminder: Rs 20,300 is due on your HDFC Credit Card ending 4321 by 15-10-2026.', NOW);
    expect(parsed?.amount).toBe(20300);
    expect(parsed?.mentionsStatement).toBe(false);
  });

  it('returns null for messages without an amount due', () => {
    expect(parseStatementMessage('Rs 450 spent on HDFC Credit Card ending 4321 at SWIGGY on 26-09-26.', NOW)).toBeNull();
    expect(parseStatementMessage('Your OTP is 482913', NOW)).toBeNull();
    expect(parseStatementMessage('', NOW)).toBeNull();
  });

  it('rejects impossible due dates', () => {
    const parsed = parseStatementMessage('Statement generated. Total due Rs 500. Due date 31-02-2026.', NOW);
    expect(parsed?.amount).toBe(500);
    expect(parsed?.dueDateStr).toBeUndefined();
  });
});
