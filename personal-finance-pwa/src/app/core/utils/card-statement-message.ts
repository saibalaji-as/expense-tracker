import { toLocalDateString } from './local-date';

/**
 * Reads a bank's credit-card statement message ("Statement generated. Total
 * due Rs 20,300. Min due Rs 1,015. Due date 15-10-2026") — pasted by the user
 * or captured by the Android notification listener. Parsed locally; the text
 * never leaves the device. Mirrors SpendNotificationClassifier.parseStatement
 * (Java) — keep the two in step.
 */
export interface ParsedStatementMessage {
  /** Total amount due on the statement. */
  amount: number;
  minDue?: number;
  /** Payment due date, local 'YYYY-MM-DD'. */
  dueDateStr?: string;
  cardLast4?: string;
  /** True when the text explicitly says a statement/bill was generated. */
  mentionsStatement: boolean;
}

const CURRENCY = String.raw`(?:rs\.?|inr|₹|aed|usd|us\$|\$|dhs?\.?)`;
const NUMBER = String.raw`([0-9][0-9,]*(?:\.[0-9]{1,2})?)`;
const MONEY = String.raw`(?:${CURRENCY}\s*)?${NUMBER}`;
const STRICT_MONEY = String.raw`${CURRENCY}\s*${NUMBER}`;
const LINK = String.raw`\s*(?:is|of|:|-|=|as)?\s*`;

const MIN_DUE_PATTERNS = [
  new RegExp(String.raw`min(?:imum)?\.?\s*(?:amount|amt)?\.?\s*(?:due|payable)${LINK}${MONEY}`, 'i'),
  new RegExp(String.raw`min(?:imum)?\.?\s*(?:amount|amt)?\.?\s*of\s*${MONEY}`, 'i'),
  new RegExp(String.raw`min(?:imum)?\.?\s*(?:amount|amt)\.?${LINK}${MONEY}`, 'i'),
  new RegExp(String.raw`mad${LINK}${MONEY}`, 'i'),
];

const TOTAL_DUE_PATTERNS = [
  new RegExp(String.raw`total\s*(?:amount|amt)?\.?\s*(?:due|payable|outstanding)${LINK}${MONEY}`, 'i'),
  new RegExp(String.raw`total\s*of\s*${MONEY}`, 'i'),
  new RegExp(String.raw`(?:statement|stmt|bill)\s*(?:amount|amt|balance|bal)\.?${LINK}${MONEY}`, 'i'),
  new RegExp(String.raw`(?:amount|amt)\.?\s*(?:due|payable)${LINK}${MONEY}`, 'i'),
  new RegExp(String.raw`(?:statement|stmt|bill)[^.]{0,60}?\bfor\s*${STRICT_MONEY}`, 'i'),
  new RegExp(String.raw`(?:due|payable|outstanding)\s*(?:of|is|:)?\s*${STRICT_MONEY}`, 'i'),
  new RegExp(String.raw`${STRICT_MONEY}\s*(?:is\s*)?(?:due|payable)`, 'i'),
];

const STATEMENT_WORDS = /\b(?:e-?statement|statement|stmt)\b|\bbill\b[^.]{0,30}\bgenerated\b|\bbill\s+(?:amount|amt)\b/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAME = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*`;
const DUE_LEAD = String.raw`(?:due\s*(?:date|dt|on|by)?|payable\s*(?:by|on)|pay\s*by|payment\s*by|\bby)\s*(?:is|:|-)?\s*`;

const DUE_DATE_PATTERNS: Array<{ pattern: RegExp; read: (m: RegExpMatchArray) => [number, number, number | null] }> = [
  {
    // 15-10-2026, 15/10/26, 15.10.2026
    pattern: new RegExp(String.raw`${DUE_LEAD}(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b`, 'i'),
    read: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  {
    // 15-Oct-2026, 15 OCT 26, 15Oct, 15th October
    pattern: new RegExp(String.raw`${DUE_LEAD}(\d{1,2})(?:st|nd|rd|th)?[-\s]?${MONTH_NAME}(?:[-\s,']*(\d{4}|\d{2})\b)?`, 'i'),
    read: (m) => [Number(m[1]), MONTHS[m[2].toLowerCase()], m[3] ? Number(m[3]) : null],
  },
  {
    // Oct 15, 2026 / October 15
    pattern: new RegExp(String.raw`${DUE_LEAD}${MONTH_NAME}\s*(\d{1,2})(?:st|nd|rd|th)?(?:[\s,]*(\d{4})\b)?`, 'i'),
    read: (m) => [Number(m[2]), MONTHS[m[1].toLowerCase()], m[3] ? Number(m[3]) : null],
  },
];

const LAST4_PATTERNS = [
  /(?:ending(?:\s+with|\s+in)?|ends\s+with|card\s+no\.?)\s*(?:x+|\*+)?\s*(\d{4})\b/i,
  /(?:x{2,}|\*{2,})\s*-?\s*(\d{4})\b/i,
];

const parseNumber = (raw: string): number => Number(raw.replace(/,/g, ''));

function firstAmount(text: string, patterns: RegExp[]): { amount: number; match: RegExpMatchArray } | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseNumber(match[1]);
    if (Number.isFinite(amount) && amount >= 0) return { amount, match };
  }
  return null;
}

function resolveDueDate(day: number, month: number, year: number | null, now: Date): string | undefined {
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return undefined;
  let fullYear: number;
  if (year === null) {
    // No year in the message: the next such date that is not well in the past.
    fullYear = now.getFullYear();
    const candidate = new Date(fullYear, month - 1, day);
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45);
    if (candidate < cutoff) fullYear += 1;
  } else {
    fullYear = year < 100 ? 2000 + year : year;
  }
  const date = new Date(fullYear, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return toLocalDateString(date);
}

export function parseStatementMessage(rawText: string, now: Date = new Date()): ParsedStatementMessage | null {
  const text = (rawText ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 8) return null;

  // Minimum due first, then blank it out so "min amount due" is never read as the total.
  const min = firstAmount(text, MIN_DUE_PATTERNS);
  const withoutMin = min ? text.replace(min.match[0], ' ') : text;
  const total = firstAmount(withoutMin, TOTAL_DUE_PATTERNS);
  if (!total) return null;

  let dueDateStr: string | undefined;
  for (const { pattern, read } of DUE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const [day, month, year] = read(match);
    dueDateStr = resolveDueDate(day, month, year, now);
    if (dueDateStr) break;
  }

  let cardLast4: string | undefined;
  for (const pattern of LAST4_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      cardLast4 = match[1];
      break;
    }
  }

  return {
    amount: total.amount,
    ...(min && min.amount > 0 && min.amount <= total.amount ? { minDue: min.amount } : {}),
    ...(dueDateStr ? { dueDateStr } : {}),
    ...(cardLast4 ? { cardLast4 } : {}),
    mentionsStatement: STATEMENT_WORDS.test(text),
  };
}
