import { CardActivityLine } from './credit-card-cycle';
import { toLocalDateString } from './local-date';
import { PdfTextLine, PdfTextSegment } from './pdf-text-lines';

/**
 * Reads the text of a bank's credit-card statement PDF (lines rebuilt from the
 * PDF by CardStatementPdfService / pdf-text-lines.ts) and compares it with what
 * is logged in Spenza. Pure and on-device: the statement never leaves the
 * phone/browser.
 *
 * Bank layouts differ, so the reader is deliberately generic: a transaction is
 * a line that STARTS with a date and ENDS with a 2-decimal amount (optionally
 * marked Cr/Dr or signed). Summary figures are read next to their label — on
 * the same line, or in the same COLUMN underneath it when the PDF line carries
 * positions (boxed layouts such as HDFC's). Anything it cannot read is simply
 * not listed — the result is always shown to the user as a check, never applied
 * to the data on its own.
 */

export interface BankStatementTransaction {
  dateStr: string;
  description: string;
  amount: number;
  /** 'debit' raises the outstanding (purchase/fee); 'credit' lowers it (payment/refund). */
  direction: 'debit' | 'credit';
}

export interface ParsedBankStatement {
  totalDue?: number;
  minDue?: number;
  dueDateStr?: string;
  statementDateStr?: string;
  /** "Payments/Credits" and "Purchases/Debits" totals printed in the summary, when found. */
  totalCredits?: number;
  totalDebits?: number;
  transactions: BankStatementTransaction[];
}

/** A statement line: plain text, or text with column positions from the PDF. */
export type StatementLine = string | PdfTextLine;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAME = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*`;
const NUMERIC_DATE = String.raw`\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})`;
// A 2-digit year must not be the hour of a time that follows ("15 Aug 03:08").
const NAMED_DATE = String.raw`\d{1,2}[-\s]?${MONTH_NAME}(?:[-\s,']*(?:\d{4}|\d{2}(?![:\d])))?`;
const US_NAMED_DATE = String.raw`${MONTH_NAME}\s+\d{1,2}(?![:\d])(?:,?\s*\d{4})?`;
const ANY_DATE = String.raw`(?:${NUMERIC_DATE}|${NAMED_DATE}|${US_NAMED_DATE})`;
const AMOUNT = String.raw`[0-9][0-9,]*\.[0-9]{2}`;
const CURRENCY = String.raw`(?:rs\.?|inr|₹|aed|usd|\$)`;

const LEADING_DATE = new RegExp(String.raw`^\s*(${ANY_DATE})(?![0-9A-Za-z])`, 'i');
const TRAILING_AMOUNT = new RegExp(
  String.raw`([-+−])?\s*${CURRENCY}?\s*(${AMOUNT})\s*(\(?\s*(?:cr|dr|c|d)\.?\s*\)?)?\s*$`,
  'i'
);
const SECOND_DATE_OR_TIME = new RegExp(String.raw`^[\s,|]*(?:${ANY_DATE}(?![0-9A-Za-z])|\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m\b)?)\s*`, 'i');
/** A reward/cash-points column between the description and the amount ("+14", "-52"). */
const TRAILING_POINTS = /\s[-+−]\s?\d{1,5}$/;
const SUMMARY_WORDS = /\b(opening balance|previous balance|closing balance|total (?:amount )?due|total dues|minimum (?:amount )?due|credit limit|available (?:credit|cash)|statement date|payment due date|statement period)\b/i;
const CREDIT_WORDS = /\b(payment received|payment - thank you|payment thank you|refund|reversal|cashback|cash back|credit adjustment)\b/i;

const parseAmount = (raw: string): number => Number(raw.replace(/,/g, ''));
const round2 = (n: number): number => Number(n.toFixed(2));

/** Parses the date formats banks print; `fallbackYear` fills in a missing year. */
export function parseStatementDate(raw: string, fallbackYear: number): string | undefined {
  const text = raw.trim().toLowerCase();
  let day: number;
  let month: number;
  let year: number | null = null;

  let match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/);
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else if ((match = text.match(new RegExp(String.raw`^(\d{1,2})[-\s]?(${MONTH_NAME})[-\s,']*(\d{4}|\d{2})?$`)))) {
    day = Number(match[1]);
    month = MONTHS[match[2].slice(0, 3)];
    year = match[3] ? Number(match[3]) : null;
  } else if ((match = text.match(new RegExp(String.raw`^(${MONTH_NAME})\s+(\d{1,2}),?\s*(\d{4})?$`)))) {
    day = Number(match[2]);
    month = MONTHS[match[1].slice(0, 3)];
    year = match[3] ? Number(match[3]) : null;
  } else {
    return undefined;
  }

  const fullYear = year === null ? fallbackYear : year < 100 ? 2000 + year : year;
  const date = new Date(fullYear, month - 1, day);
  if (!(month >= 1 && month <= 12) || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return toLocalDateString(date);
}

interface ReadTransaction extends BankStatementTransaction {
  /** Explicit sign printed in front of the amount, if any. */
  sign: '+' | '-' | null;
  /** True when a Cr/Dr marker or credit wording already settles the direction. */
  marked: boolean;
}

function readTransaction(line: string, fallbackYear: number): ReadTransaction | null {
  const dateMatch = line.match(LEADING_DATE);
  if (!dateMatch) return null;
  const dateStr = parseStatementDate(dateMatch[1], fallbackYear);
  if (!dateStr) return null;

  let rest = line.slice(dateMatch[0].length);
  const amountMatch = rest.match(TRAILING_AMOUNT);
  if (!amountMatch) return null;
  const amount = parseAmount(amountMatch[2]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  rest = rest.slice(0, amountMatch.index);

  // Drop a posting date and/or time that follows the transaction date.
  for (let i = 0; i < 2; i++) rest = rest.replace(SECOND_DATE_OR_TIME, '');
  const description = rest.replace(/\s+/g, ' ').trim().replace(TRAILING_POINTS, '').trim();
  // A real transaction names a merchant; a row of bare numbers is a summary table row.
  if (!/[a-z]{2}/i.test(description) || SUMMARY_WORDS.test(description)) return null;

  const marker = (amountMatch[3] ?? '').replace(/[^a-z]/gi, '').toLowerCase();
  const sign = amountMatch[1] ? (amountMatch[1] === '+' ? '+' : '-') : null;
  const markedCredit = marker === 'cr' || marker === 'c';
  const markedDebit = marker === 'dr' || marker === 'd';
  // A signed amount is money coming back to the card ("+₹500" / "-500.00")
  // unless the statement's own totals say otherwise — see settleSignedDirections.
  const direction: 'debit' | 'credit' =
    markedCredit || (!markedDebit && (sign !== null || CREDIT_WORDS.test(description))) ? 'credit' : 'debit';
  return { dateStr, description, amount, direction, sign, marked: markedCredit || markedDebit };
}

/**
 * Signs mean different things on different statements. When the summary prints
 * its "payments/credits" and "purchases/debits" totals, pick the reading of the
 * signs that reproduces them; otherwise keep "signed = credit".
 */
function settleSignedDirections(
  transactions: ReadTransaction[],
  totalCredits: number | undefined,
  totalDebits: number | undefined
): void {
  if (totalCredits === undefined && totalDebits === undefined) return;
  if (!transactions.some((transaction) => transaction.sign !== null && !transaction.marked)) return;

  const readings: Array<(transaction: ReadTransaction) => 'debit' | 'credit'> = [
    (transaction) => transaction.direction, // signed = credit
    (transaction) => (transaction.sign === '-' ? 'debit' : transaction.sign === '+' ? 'credit' : transaction.direction),
    (transaction) => (transaction.sign === '+' ? 'debit' : transaction.sign === '-' ? 'credit' : transaction.direction),
  ];
  const fits = (reading: (typeof readings)[number]): boolean => {
    let credits = 0;
    let debits = 0;
    for (const transaction of transactions) {
      const direction = transaction.marked || transaction.sign === null ? transaction.direction : reading(transaction);
      if (direction === 'credit') credits += transaction.amount;
      else debits += transaction.amount;
    }
    return (
      (totalCredits !== undefined && Math.abs(round2(credits) - totalCredits) < 1) ||
      (totalDebits !== undefined && Math.abs(round2(debits) - totalDebits) < 1)
    );
  };
  const reading = readings.find(fits);
  if (!reading) return;
  for (const transaction of transactions) {
    if (!transaction.marked && transaction.sign !== null) transaction.direction = reading(transaction);
  }
}

type SummaryKey = 'totalDue' | 'minDue' | 'dueDate' | 'statementDate' | 'totalCredits' | 'totalDebits';

const LABELS: Array<{ key: SummaryKey; pattern: RegExp }> = [
  { key: 'minDue', pattern: /min(?:imum)?\.?\s*(?:amount|amt|payment)?\.?\s*due/i },
  { key: 'totalDue', pattern: /total\s*(?:amount|amt|payment)?\.?\s*(?:dues?|payable)|total\s*outstanding/i },
  { key: 'dueDate', pattern: /(?:payment\s*)?due\s*date|pay(?:ment)?\s*by/i },
  { key: 'statementDate', pattern: /statement\s*(?:date|generation\s*date)/i },
  { key: 'totalCredits', pattern: /payments?\s*(?:\/|&|and)\s*credits?/i },
  { key: 'totalDebits', pattern: /purchases?\s*(?:\/|&|and)\s*debits?/i },
];
const isDateKey = (key: SummaryKey): boolean => key === 'dueDate' || key === 'statementDate';

/** How far below a label (PDF units) its value may sit, and how many column cells are read. */
const COLUMN_REACH = 60;
const COLUMN_CELLS = 4;

type Summary = Omit<ParsedBankStatement, 'transactions'>;

function readSummary(lines: readonly StatementLine[], fallbackYear: number): Summary {
  const summary: Summary = {};
  const amountAfter = new RegExp(String.raw`^[\s:=-]*${CURRENCY}?\s*(${AMOUNT}|[0-9][0-9,]*)(?![0-9/.-])`, 'i');
  const dateAfter = new RegExp(String.raw`^[\s:=-]*(${ANY_DATE})`, 'i');

  const assign = (key: SummaryKey, raw: string): void => {
    if (key === 'totalDue' && summary.totalDue === undefined) summary.totalDue = parseAmount(raw);
    else if (key === 'minDue' && summary.minDue === undefined) summary.minDue = parseAmount(raw);
    else if (key === 'totalCredits' && summary.totalCredits === undefined) summary.totalCredits = parseAmount(raw);
    else if (key === 'totalDebits' && summary.totalDebits === undefined) summary.totalDebits = parseAmount(raw);
    else if (key === 'dueDate' && !summary.dueDateStr) summary.dueDateStr = parseStatementDate(raw, fallbackYear);
    else if (key === 'statementDate' && !summary.statementDateStr) summary.statementDateStr = parseStatementDate(raw, fallbackYear);
  };

  /** Labels in `text` whose value follows immediately; returns the ones left without a value. */
  const readInline = (text: string) => {
    const found = LABELS.map((label) => ({ label, match: text.match(label.pattern) }))
      .filter((item): item is { label: (typeof LABELS)[number]; match: RegExpMatchArray } => !!item.match)
      // "Minimum amount due" also contains "amount due" style text — keep label order by position.
      .sort((a, b) => a.match.index! - b.match.index!);
    const unresolved: typeof found = [];
    for (const item of found) {
      const after = text.slice(item.match.index! + item.match[0].length);
      const value = after.match(isDateKey(item.label.key) ? dateAfter : amountAfter);
      if (value) assign(item.label.key, value[1]);
      else unresolved.push(item);
    }
    return unresolved;
  };

  /** The cells underneath a segment, in the same column, joined top to bottom. */
  const columnBelow = (lineIndex: number, segment: PdfTextSegment): string => {
    const origin = lines[lineIndex] as PdfTextLine;
    const cells: string[] = [];
    let x0 = segment.x0;
    let x1 = segment.x1;
    for (let i = lineIndex + 1; i < lines.length && cells.length < COLUMN_CELLS; i++) {
      const line = lines[i];
      if (typeof line === 'string' || line.page !== origin.page || origin.y - line.y > COLUMN_REACH) break;
      for (const candidate of line.segments) {
        const overlap = Math.min(x1, candidate.x1) - Math.max(x0, candidate.x0);
        const narrower = Math.min(x1 - x0, candidate.x1 - candidate.x0);
        // Same column: left edges line up, or the cells overlap for the most part.
        if (Math.abs(candidate.x0 - x0) <= 3 || (narrower > 0 && overlap / narrower >= 0.6)) {
          cells.push(candidate.text);
          x0 = Math.min(x0, candidate.x0);
          x1 = Math.max(x1, candidate.x1);
          break;
        }
      }
    }
    return cells.join(' ');
  };

  lines.forEach((line, index) => {
    if (typeof line !== 'string') {
      // Positioned PDF line: a label's value is to its right in the same cell
      // or the next one, or underneath it in the same column (boxed layouts,
      // labels wrapped over two lines).
      line.segments.forEach((segment, segmentIndex) => {
        const right = line.segments[segmentIndex + 1];
        if (readInline(segment.text).length === 0) return;
        if (right && readInline(`${segment.text} ${right.text}`).length === 0) return;
        readInline(`${segment.text} ${columnBelow(index, segment)}`);
      });
      return;
    }

    // Plain text line.
    // 1) Value on the same line, right after its label ("Total Amount Due: 20,300.00").
    const unresolved = readInline(line);
    if (unresolved.length === 0) return;

    // 2) Table layout: labels in one row, values in the next
    //    ("Total Dues  Minimum Amount Due  Payment Due Date" / "20,300.00  1,015.00  15/10/2026").
    const nextLine = lines[index + 1];
    const next = typeof nextLine === 'string' ? nextLine : '';
    const amounts = [...next.matchAll(new RegExp(AMOUNT, 'g'))].map((m) => m[0]);
    const dates = [...next.matchAll(new RegExp(ANY_DATE, 'gi'))].map((m) => m[0]);
    let amountIndex = 0;
    let dateIndex = 0;
    for (const item of unresolved) {
      if (isDateKey(item.label.key)) {
        if (dates[dateIndex] !== undefined) assign(item.label.key, dates[dateIndex++]);
      } else if (amounts[amountIndex] !== undefined) {
        assign(item.label.key, amounts[amountIndex++]);
      }
    }
  });

  if (summary.minDue !== undefined && summary.totalDue !== undefined && summary.minDue > summary.totalDue) {
    delete summary.minDue;
  }
  return summary;
}

export function parseBankStatementLines(lines: readonly StatementLine[], now: Date = new Date()): ParsedBankStatement {
  const clean: StatementLine[] = [];
  for (const line of lines) {
    if (typeof line === 'string') {
      const text = line.replace(/\s+/g, ' ').trim();
      if (text.length > 0) clean.push(text);
    } else if (line.text.trim().length > 0) {
      clean.push(line);
    }
  }
  const summary = readSummary(clean, now.getFullYear());
  const fallbackYear = summary.statementDateStr ? Number(summary.statementDateStr.slice(0, 4)) : now.getFullYear();
  const read: ReadTransaction[] = [];
  for (const line of clean) {
    const transaction = readTransaction(typeof line === 'string' ? line : line.text, fallbackYear);
    if (transaction) read.push(transaction);
  }
  settleSignedDirections(read, summary.totalCredits, summary.totalDebits);
  return {
    ...summary,
    transactions: read.map(({ dateStr, description, amount, direction }) => ({ dateStr, description, amount, direction })),
  };
}

// ─── Comparison with the logged data ─────────────────────────────────────────

export interface StatementMatch {
  bank: BankStatementTransaction;
  app: CardActivityLine;
}

export interface StatementComparison {
  matched: StatementMatch[];
  /** On the bank statement but not logged in Spenza. */
  onlyInBank: BankStatementTransaction[];
  /** Logged in Spenza (inside the statement window) but not on the bank statement. */
  onlyInApp: CardActivityLine[];
  bankDebits: number;
  bankCredits: number;
  appDebits: number;
  appCredits: number;
}

/** Days a logged date may differ from the bank's date and still be the same transaction. */
export const STATEMENT_MATCH_DATE_TOLERANCE_DAYS = 3;

const dayNumber = (dateStr: string): number => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/**
 * One-to-one matching on direction + exact amount + nearest date (within the
 * tolerance). `appLines` may include a few days either side of the statement
 * window so boundary transactions still pair up; only lines inside
 * [windowFromStr, windowToStr] are reported as missing from the bank statement.
 */
export function compareStatementWithLedger(
  bank: readonly BankStatementTransaction[],
  appLines: readonly CardActivityLine[],
  windowFromStr: string,
  windowToStr: string
): StatementComparison {
  const available = [...appLines];
  const matched: StatementMatch[] = [];
  const onlyInBank: BankStatementTransaction[] = [];

  const ordered = [...bank].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  for (const transaction of ordered) {
    let bestIndex = -1;
    let bestGap = Number.POSITIVE_INFINITY;
    available.forEach((line, index) => {
      if (line.direction !== transaction.direction) return;
      if (Math.abs(line.amount - transaction.amount) >= 0.005) return;
      const gap = Math.abs(dayNumber(line.date) - dayNumber(transaction.dateStr));
      if (gap <= STATEMENT_MATCH_DATE_TOLERANCE_DAYS && gap < bestGap) {
        bestGap = gap;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      matched.push({ bank: transaction, app: available[bestIndex] });
      available.splice(bestIndex, 1);
    } else {
      onlyInBank.push(transaction);
    }
  }

  const inWindow = (line: CardActivityLine): boolean => line.date >= windowFromStr && line.date <= windowToStr;
  const onlyInApp = available.filter(inWindow);
  const windowApp = [...matched.map((m) => m.app), ...onlyInApp];
  const sum = <T,>(items: readonly T[], pick: (item: T) => number): number =>
    round2(items.reduce((total, item) => total + pick(item), 0));

  return {
    matched,
    onlyInBank,
    onlyInApp,
    bankDebits: sum(bank.filter((t) => t.direction === 'debit'), (t) => t.amount),
    bankCredits: sum(bank.filter((t) => t.direction === 'credit'), (t) => t.amount),
    appDebits: sum(windowApp.filter((l) => l.direction === 'debit'), (l) => l.amount),
    appCredits: sum(windowApp.filter((l) => l.direction === 'credit'), (l) => l.amount),
  };
}
