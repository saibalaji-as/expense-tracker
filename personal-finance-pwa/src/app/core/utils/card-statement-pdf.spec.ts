import {
  compareStatementWithLedger,
  parseBankStatementLines,
  parseStatementDate,
} from './card-statement-pdf';
import { CardActivityLine } from './credit-card-cycle';
import { PdfTextLine } from './pdf-text-lines';

const NOW = new Date('2026-09-28T10:00:00');

describe('parseStatementDate', () => {
  it('reads the formats banks print', () => {
    expect(parseStatementDate('12/09/2026', 2026)).toBe('2026-09-12');
    expect(parseStatementDate('12-09-26', 2026)).toBe('2026-09-12');
    expect(parseStatementDate('12 Sep 26', 2026)).toBe('2026-09-12');
    expect(parseStatementDate('12-SEP-2026', 2026)).toBe('2026-09-12');
    expect(parseStatementDate('12 Sep', 2026)).toBe('2026-09-12');
    expect(parseStatementDate('Sep 12, 2026', 2026)).toBe('2026-09-12');
    expect(parseStatementDate('31/02/2026', 2026)).toBeUndefined();
    expect(parseStatementDate('hello', 2026)).toBeUndefined();
  });
});

describe('parseBankStatementLines', () => {
  it('reads an HDFC-style statement: label row then value row, Cr markers, time column', () => {
    const parsed = parseBankStatementLines(
      [
        'HDFC Bank Credit Cards',
        'Statement Date : 25/09/2026',
        'Payment Due Date   Total Dues   Minimum Amount Due',
        '15/10/2026   20,300.00   1,015.00',
        'Credit Limit Available Credit Limit Available Cash Limit',
        '1,00,000.00 79,700.00 40,000.00',
        'Date  Transaction Description  Amount (in Rs.)',
        '28/08/2026 14:22:10 SWIGGY BANGALORE 450.00',
        '02/09/2026 09:10:44 AMAZON PAY INDIA PVT LTD 1,299.00',
        '10/09/2026 NETBANKING TRANSFER (Ref# 0000123456) 5,000.00 Cr',
        '15/09/2026 18:01:00 FUEL SURCHARGE WAIVER 12.50 Cr',
        'Reward Points Summary',
      ],
      NOW
    );
    expect(parsed.statementDateStr).toBe('2026-09-25');
    expect(parsed.dueDateStr).toBe('2026-10-15');
    expect(parsed.totalDue).toBe(20300);
    expect(parsed.minDue).toBe(1015);
    expect(parsed.transactions).toEqual([
      { dateStr: '2026-08-28', description: 'SWIGGY BANGALORE', amount: 450, direction: 'debit' },
      { dateStr: '2026-09-02', description: 'AMAZON PAY INDIA PVT LTD', amount: 1299, direction: 'debit' },
      { dateStr: '2026-09-10', description: 'NETBANKING TRANSFER (Ref# 0000123456)', amount: 5000, direction: 'credit' },
      { dateStr: '2026-09-15', description: 'FUEL SURCHARGE WAIVER', amount: 12.5, direction: 'credit' },
    ]);
  });

  it('reads inline summary labels and SBI-style named dates with C/D markers', () => {
    const parsed = parseBankStatementLines(
      [
        'Total Amount Due: Rs. 8,125.40',
        'Minimum Amount Due: Rs. 407.00',
        'Payment Due Date: 14 Oct 2026',
        'Statement Date: 25 Sep 2026',
        '12 Sep 26 BIGBASKET BENGALURU IN 2,340.90 D',
        '14 Sep 26 PAYMENT RECEIVED 000DP014257000 6,000.00 C',
        '20 Sep 26 UBER INDIA SYSTEMS 215.00 D',
      ],
      NOW
    );
    expect([parsed.totalDue, parsed.minDue, parsed.dueDateStr, parsed.statementDateStr]).toEqual([8125.4, 407, '2026-10-14', '2026-09-25']);
    expect(parsed.transactions.map((t) => [t.dateStr, t.amount, t.direction])).toEqual([
      ['2026-09-12', 2340.9, 'debit'],
      ['2026-09-14', 6000, 'credit'],
      ['2026-09-20', 215, 'debit'],
    ]);
  });

  it('handles a posting-date column and AED amounts', () => {
    const parsed = parseBankStatementLines(
      ['03/09/2026 04/09/2026 CARREFOUR DUBAI AE AED 250.75', '05/09/2026 06/09/2026 PAYMENT - THANK YOU 1,000.00'],
      NOW
    );
    expect(parsed.transactions).toEqual([
      { dateStr: '2026-09-03', description: 'CARREFOUR DUBAI AE', amount: 250.75, direction: 'debit' },
      { dateStr: '2026-09-05', description: 'PAYMENT - THANK YOU', amount: 1000, direction: 'credit' },
    ]);
  });

  it('ignores lines that are not transactions', () => {
    const parsed = parseBankStatementLines(
      ['25/09/2026', 'Page 1 of 3', '12/09/2026 Opening Balance 4,000.00', 'Customer Care 1800 000 0000', 'GSTIN 29AAACH2702H1Z5'],
      NOW
    );
    expect(parsed.transactions).toEqual([]);
    expect(parsed.totalDue).toBeUndefined();
  });
});

describe('parseBankStatementLines — positioned lines (boxed summary, app-style rows)', () => {
  /** A line as pdf-text-lines.ts delivers it: cells with their horizontal extent. */
  const line = (y: number, ...cells: Array<[number, number, string]>): PdfTextLine => ({
    text: cells.map((cell) => cell[2]).join(' '),
    page: 1,
    y,
    segments: cells.map(([x0, x1, text]) => ({ text, x0, x1 })),
  });

  // Layout of a web-printed statement: labels above their values, some labels
  // and values wrapped over two lines, several boxes side by side.
  const lines: PdfTextLine[] = [
    line(675, [30, 140, 'Email ID : someone@example.com'], [454, 503, 'Statement Date'], [543, 584, '2 Sept 2026']),
    line(661, [454, 493, 'Billing Cycle'], [515, 584, '3 Aug - 2 Sept 2026']),
    line(632, [54, 104, 'OPENING BALANCE'], [165, 220, 'PAYMENTS/CREDITS'], [281, 335, 'PURCHASES/DEBITS'], [394, 443, 'FINANCE CHARGES']),
    line(629, [487, 544, 'TOTAL AMOUNT DUE']),
    line(616, [61, 98, '₹9,000.00'], [174, 212, '₹6,500.00'], [290, 327, '₹1,779.00'], [409, 428, '₹0.00'], [487, 559, '₹4,279.00']),
    line(601, [487, 513, 'MINIMUM'], [539, 566, 'DUE DATE']),
    line(594, [69, 125, 'TOTAL CREDIT LIMIT'], [217, 282, 'AVAILABLE CREDIT LIMIT'], [487, 498, 'DUE'], [539, 564, '22 Sept']),
    line(585, [487, 520, '₹214.00'], [539, 556, '2026']),
    line(578, [75, 121, '₹2,49,000.00'], [228, 273, '₹2,44,721.00']),
    line(537, [396, 438, 'CURRENT DUES'], [513, 555, 'MINIMUM DUES']),
    line(519, [402, 433, '₹999.00'], [519, 549, '₹999.00']),
    line(480, [30, 80, 'DATE & TIME'], [203, 280, 'TRANSACTION DESCRIPTION'], [460, 497, 'CASHPOINTS'], [559, 584, 'AMOUNT']),
    line(466, [30, 75, '15 Aug 2026, 03:08'], [203, 290, 'NETFLIX DI SI MUMBAI IND'], [470, 478, '+1'], [565, 584, '₹199.00']),
    line(452, [30, 75, '19 Aug 2026, 00:00'], [203, 290, 'UPI - Axis amazonupi@apl'], [470, 480, '-14'], [560, 584, '+₹500.00']),
    line(438, [30, 75, '19 Aug 2026, 00:00'], [203, 290, 'Payment received - UPI'], [555, 584, '+₹6,000.00']),
    line(424, [30, 75, '02 Sept 2026, 00:00'], [203, 290, 'EMI Principal AMAZON 1210018487668432'], [562, 584, '₹1,580.00']),
    line(300, [30, 580, 'Please ensure that at least the "Minimum Amount Due" reaches us by the "Due Date"']),
  ];
  const parsed = parseBankStatementLines(lines, NOW);

  it('reads each summary figure from its own column, not from the neighbouring box', () => {
    expect(parsed.totalDue).toBe(4279);
    expect(parsed.minDue).toBe(214);
    expect(parsed.dueDateStr).toBe('2026-09-22');
    expect(parsed.statementDateStr).toBe('2026-09-02');
    expect([parsed.totalCredits, parsed.totalDebits]).toEqual([6500, 1779]);
  });

  it('reads rows with "date, time", a points column and signed credits', () => {
    expect(parsed.transactions).toEqual([
      { dateStr: '2026-08-15', description: 'NETFLIX DI SI MUMBAI IND', amount: 199, direction: 'debit' },
      { dateStr: '2026-08-19', description: 'UPI - Axis amazonupi@apl', amount: 500, direction: 'credit' },
      { dateStr: '2026-08-19', description: 'Payment received - UPI', amount: 6000, direction: 'credit' },
      { dateStr: '2026-09-02', description: 'EMI Principal AMAZON 1210018487668432', amount: 1580, direction: 'debit' },
    ]);
  });

  it('reproduces the statement totals from the rows', () => {
    const total = (direction: 'debit' | 'credit'): number =>
      parsed.transactions.filter((t) => t.direction === direction).reduce((sum, t) => sum + t.amount, 0);
    expect(total('credit')).toBe(parsed.totalCredits);
    expect(total('debit')).toBe(parsed.totalDebits);
  });
});

describe('parseBankStatementLines — signs and edge formats', () => {
  it('treats a signed amount as a credit by default', () => {
    const parsed = parseBankStatementLines(['05/09/2026 REFUND FROM STORE -250.00', '06/09/2026 GROCERY MART 300.00'], NOW);
    expect(parsed.transactions.map((t) => t.direction)).toEqual(['credit', 'debit']);
  });

  it('lets the printed totals decide when a statement signs its spends', () => {
    // This layout writes spends as "-" and payments as "+".
    const parsed = parseBankStatementLines(
      [
        'Payments/Credits: 1,000.00',
        'Purchases/Debits: 550.00',
        '05/09/2026 GROCERY MART -300.00',
        '06/09/2026 FUEL STATION -250.00',
        '10/09/2026 CARD PAYMENT +1,000.00',
      ],
      NOW
    );
    expect(parsed.transactions.map((t) => t.direction)).toEqual(['debit', 'debit', 'credit']);
  });

  it('never lets a Cr/Dr marker be overridden by a sign', () => {
    const parsed = parseBankStatementLines(['05/09/2026 FEE REVERSAL -99.00 Dr', '06/09/2026 SHOP +10.00 Cr'], NOW);
    expect(parsed.transactions.map((t) => t.direction)).toEqual(['debit', 'credit']);
  });

  it('does not read the hour of a year-less date as its year', () => {
    const parsed = parseBankStatementLines(['Statement Date: 25/09/2026', '15 Aug 03:08 COFFEE HOUSE 120.00'], NOW);
    expect(parsed.transactions).toEqual([{ dateStr: '2026-08-15', description: 'COFFEE HOUSE', amount: 120, direction: 'debit' }]);
  });
});

describe('compareStatementWithLedger', () => {
  const line = (id: string, date: string, amount: number, direction: 'debit' | 'credit' = 'debit'): CardActivityLine => ({
    id, date, amount, direction, kind: direction === 'debit' ? 'purchase' : 'payment', description: id,
  });

  it('pairs transactions, and lists what is missing on each side', () => {
    const bank = [
      { dateStr: '2026-09-02', description: 'AMAZON', amount: 1299, direction: 'debit' as const },
      { dateStr: '2026-09-05', description: 'SWIGGY', amount: 450, direction: 'debit' as const },
      { dateStr: '2026-09-10', description: 'PAYMENT', amount: 5000, direction: 'credit' as const },
      { dateStr: '2026-09-20', description: 'ANNUAL FEE', amount: 590, direction: 'debit' as const },
    ];
    const app = [
      line('amazon', '2026-09-01', 1299),
      line('swiggy', '2026-09-05', 450),
      line('payment', '2026-09-10', 5000, 'credit'),
      line('cash-tea', '2026-09-11', 80),
    ];
    const result = compareStatementWithLedger(bank, app, '2026-08-26', '2026-09-25');
    expect(result.matched.map((m) => m.app.id)).toEqual(['amazon', 'swiggy', 'payment']);
    expect(result.onlyInBank.map((t) => t.description)).toEqual(['ANNUAL FEE']);
    expect(result.onlyInApp.map((l) => l.id)).toEqual(['cash-tea']);
    expect([result.bankDebits, result.bankCredits, result.appDebits, result.appCredits]).toEqual([2339, 5000, 1829, 5000]);
  });

  it('matches one-to-one: two identical bank charges need two logged entries', () => {
    const bank = [
      { dateStr: '2026-09-05', description: 'COFFEE', amount: 200, direction: 'debit' as const },
      { dateStr: '2026-09-05', description: 'COFFEE', amount: 200, direction: 'debit' as const },
    ];
    const result = compareStatementWithLedger(bank, [line('one', '2026-09-05', 200)], '2026-08-26', '2026-09-25');
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInBank).toHaveLength(1);
  });

  it('never matches across direction or beyond the date tolerance', () => {
    const bank = [
      { dateStr: '2026-09-05', description: 'REFUND', amount: 300, direction: 'credit' as const },
      { dateStr: '2026-09-20', description: 'SHOP', amount: 700, direction: 'debit' as const },
    ];
    const app = [line('spend-300', '2026-09-05', 300), line('shop-early', '2026-09-10', 700)];
    const result = compareStatementWithLedger(bank, app, '2026-08-26', '2026-09-25');
    expect(result.matched).toHaveLength(0);
    expect(result.onlyInBank).toHaveLength(2);
    expect(result.onlyInApp).toHaveLength(2);
  });

  it('uses out-of-window lines for matching but never reports them as missing', () => {
    const bank = [{ dateStr: '2026-08-26', description: 'LATE POST', amount: 99, direction: 'debit' as const }];
    const app = [line('edge', '2026-08-25', 99), line('older', '2026-08-24', 10)];
    const result = compareStatementWithLedger(bank, app, '2026-08-26', '2026-09-25');
    expect(result.matched.map((m) => m.app.id)).toEqual(['edge']);
    expect(result.onlyInApp).toEqual([]);
  });
});
