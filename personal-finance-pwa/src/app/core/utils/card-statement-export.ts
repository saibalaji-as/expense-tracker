import { DebtAccount } from '../models';
import { CardCycleActivity } from './credit-card-cycle';

/**
 * CSV export of one credit-card statement window as recorded in Spenza
 * (opens in Excel / Google Sheets). Pure — the component handles the download.
 */

const money = (amount: number): string => amount.toFixed(2);

export function csvCell(value: string | number): string {
  const text = String(value);
  // Neutralise spreadsheet formula injection from free-text descriptions.
  const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const csvRow = (...cells: Array<string | number>): string => cells.map(csvCell).join(',');
const row = csvRow;

const KIND_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  payment: 'Payment',
  refund: 'Refund',
  cashback: 'Cashback',
  charge: 'Fee / interest',
  'cash-withdrawal': 'Cash withdrawal',
};

export function cardStatementCsv(card: DebtAccount, activity: CardCycleActivity, currency: string): string {
  const { window, statement } = activity;
  const rows: string[] = [
    row('Card', card.name),
    ...(card.cardLast4 ? [row('Card ending', card.cardLast4)] : []),
    row('Currency', currency),
    row('Statement', window.billDateStr ? `Bill dated ${window.billDateStr}` : 'Unbilled (current cycle)'),
    row('Period', `${window.fromStr} to ${window.toStr}`),
    row('Opening balance', money(activity.openingBalance)),
    '',
    row('Date', 'Type', 'Description', 'Debit', 'Credit'),
    ...activity.lines.map((line) =>
      row(
        line.date,
        KIND_LABELS[line.kind] ?? line.kind,
        line.description,
        line.direction === 'debit' ? money(line.amount) : '',
        line.direction === 'credit' ? money(line.amount) : ''
      )
    ),
    '',
    row('Purchases', money(activity.totalPurchases)),
    row('Fees, interest and cash withdrawals', money(activity.totalOtherDebits)),
    row('Refunds and cashback', money(activity.totalCredits)),
    row('Payments', money(activity.totalPayments)),
    row('Closing balance (Spenza records)', money(activity.closingBalance)),
  ];
  if (statement) {
    rows.push(
      row('Bank statement amount', money(statement.amount)),
      row('Difference (bank minus Spenza)', money(statement.amount - activity.closingBalance)),
      ...(statement.minDue !== undefined ? [row('Minimum due', money(statement.minDue))] : []),
      ...(statement.dueDateStr ? [row('Payment due date', statement.dueDateStr)] : [])
    );
  }
  // BOM so Excel reads UTF-8 (₹, non-Latin descriptions) correctly.
  return `﻿${rows.join('\r\n')}\r\n`;
}

export function cardStatementFileName(card: DebtAccount, activity: CardCycleActivity): string {
  const slug = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card';
  const suffix = activity.window.billDateStr ?? `unbilled-${activity.window.toStr}`;
  return `spenza-${slug}-statement-${suffix}.csv`;
}
