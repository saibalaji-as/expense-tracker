import {
  AccountBalanceAdjustment,
  AssetAccount,
  AssetAccountType,
  DebtAccount,
  DebtAccountType,
  DebtAdjustment,
  DebtPayment,
  ExpenseEntry,
} from '../models';
import { csvRow as row } from './card-statement-export';
import { toLocalDateString } from './local-date';

/**
 * CSV "statements" for every Finances account (2026-10-22):
 *  - asset accounts (bank / wallet / cash / other) — full ledger with running balance,
 *    replaying exactly the records derived-balance.util.ts uses, so the closing row
 *    equals the balance on screen;
 *  - credit cards and loans — full ledger with running outstanding;
 *  - one combined file with every account's lines (Account column first).
 * Pure — the component hands the text to file-download.ts.
 */

export interface AccountExportRecords {
  entries: readonly ExpenseEntry[];
  accountAdjustments: readonly AccountBalanceAdjustment[];
  debtPayments: readonly DebtPayment[];
  debtAdjustments: readonly DebtAdjustment[];
  accounts: readonly AssetAccount[];
  debts: readonly DebtAccount[];
}

export interface LedgerLine {
  date: string;
  /** Tie-breaker within a day (ISO timestamp / createdAt). */
  sortKey: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Ledger {
  opening: number;
  closing: number;
  lines: LedgerLine[];
}

const round = (amount: number): number => Number(amount.toFixed(2));
const money = (amount: number): string => amount.toFixed(2);
const amountCell = (amount: number): string => (amount ? money(amount) : '');

const ASSET_TYPE_LABELS: Record<AssetAccountType, string> = {
  bank: 'Bank account',
  wallet: 'Wallet',
  cash: 'Cash',
  other: 'Other account',
};

const DEBT_TYPE_LABELS: Record<DebtAccountType, string> = {
  'credit-card': 'Credit card',
  'personal-loan': 'Personal loan',
  'vehicle-loan': 'Vehicle loan',
  'home-loan': 'Home loan',
  other: 'Other loan',
};

export const accountTypeLabel = (account: AssetAccount): string => ASSET_TYPE_LABELS[account.type] ?? 'Account';
export const debtTypeLabel = (debt: DebtAccount): string => DEBT_TYPE_LABELS[debt.type] ?? 'Loan';

/** createdAt is an ISO instant; show it as the user's local calendar day. */
function localDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso.slice(0, 10) : toLocalDateString(date);
}

function entryDescription(entry: ExpenseEntry): string {
  const comment = entry.comment?.trim();
  return comment ? `${entry.type} — ${comment}` : entry.type;
}

interface RawLine {
  date: string;
  sortKey: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
}

function sortLines(lines: RawLine[]): RawLine[] {
  return [...lines].sort((a, b) =>
    a.date === b.date ? a.sortKey.localeCompare(b.sortKey) : a.date.localeCompare(b.date)
  );
}

/** Running balance where debits reduce (asset) or increase (debt) the balance. */
function withBalances(opening: number, lines: RawLine[], debitSign: 1 | -1): Ledger {
  let balance = round(opening);
  const out: LedgerLine[] = sortLines(lines).map((line) => {
    balance = round(balance + debitSign * line.debit - debitSign * line.credit);
    return { ...line, balance };
  });
  return { opening: round(opening), closing: balance, lines: out };
}

// ── Asset accounts ───────────────────────────────────────────────────────────

export function assetAccountLedger(account: AssetAccount, records: AccountExportRecords): Ledger {
  const debtName = new Map(records.debts.map((debt) => [debt.id, debt.name]));
  const paymentByExpense = new Map(records.debtPayments.map((payment) => [payment.expenseId, payment]));
  const lines: RawLine[] = [];

  for (const adjustment of records.accountAdjustments) {
    if (adjustment.accountId !== account.id) continue;
    const increase = adjustment.kind === 'increase';
    lines.push({
      date: localDay(adjustment.createdAt),
      sortKey: adjustment.createdAt,
      type: increase ? 'Balance added' : 'Balance reduced',
      description: adjustment.reason?.trim() || (increase ? 'Manual increase' : 'Manual decrease'),
      debit: increase ? 0 : adjustment.amount,
      credit: increase ? adjustment.amount : 0,
    });
  }

  for (const entry of records.entries) {
    if (entry.accountId !== account.id) continue;
    const payment = entry.source === 'debt-payment' ? paymentByExpense.get(entry.id) : undefined;
    const target = payment ? debtName.get(payment.debtId) : entry.debtId ? debtName.get(entry.debtId) : undefined;
    const isPayment = entry.source === 'debt-payment';
    lines.push({
      date: entry.date,
      sortKey: entry.timestamp ?? '',
      type: isPayment ? 'Debt payment' : 'Expense',
      description: isPayment && target ? `Payment to ${target}${entry.comment?.trim() ? ` — ${entry.comment.trim()}` : ''}` : entryDescription(entry),
      debit: entry.amount,
      credit: 0,
    });
  }

  for (const adjustment of records.debtAdjustments) {
    if (adjustment.kind !== 'cash-withdrawal' || adjustment.linkedAccountId !== account.id) continue;
    const card = debtName.get(adjustment.debtId);
    lines.push({
      date: adjustment.date,
      sortKey: adjustment.createdAt,
      type: 'Cash withdrawal',
      description: `${card ? `From ${card}` : 'From credit card'}${adjustment.reason?.trim() ? ` — ${adjustment.reason.trim()}` : ''}`,
      debit: 0,
      credit: adjustment.amount,
    });
  }

  return withBalances(account.initialBalance ?? 0, lines, -1);
}

// ── Credit cards and loans ───────────────────────────────────────────────────

const DEBT_ADJUSTMENT_LABELS: Record<DebtAdjustment['kind'], string> = {
  refund: 'Refund',
  cashback: 'Cashback',
  charge: 'Fee / interest',
  'cash-withdrawal': 'Cash withdrawal',
};

export function debtLedger(debt: DebtAccount, records: AccountExportRecords): Ledger {
  const accountName = new Map(records.accounts.map((account) => [account.id, account.name]));
  const lines: RawLine[] = [];

  for (const entry of records.entries) {
    if (entry.debtId !== debt.id || entry.source === 'debt-payment') continue;
    lines.push({
      date: entry.date,
      sortKey: entry.timestamp ?? '',
      type: debt.type === 'credit-card' ? 'Purchase' : 'Charge',
      description: entryDescription(entry),
      debit: entry.amount,
      credit: 0,
    });
  }

  for (const payment of records.debtPayments) {
    if (payment.debtId !== debt.id) continue;
    const from = accountName.get(payment.accountId);
    const comment = records.entries.find((entry) => entry.id === payment.expenseId)?.comment?.trim();
    lines.push({
      date: payment.date,
      sortKey: payment.createdAt,
      type: 'Payment',
      description: `${from ? `Paid from ${from}` : 'Payment'}${comment ? ` — ${comment}` : ''}`,
      debit: 0,
      credit: payment.amount,
    });
  }

  for (const adjustment of records.debtAdjustments) {
    if (adjustment.debtId !== debt.id) continue;
    const reducesOutstanding = adjustment.kind === 'refund' || adjustment.kind === 'cashback';
    const into = adjustment.linkedAccountId ? accountName.get(adjustment.linkedAccountId) : undefined;
    const reason = adjustment.reason?.trim();
    const description =
      [adjustment.kind === 'cash-withdrawal' && into ? `To ${into}` : '', reason ?? ''].filter(Boolean).join(' — ') ||
      DEBT_ADJUSTMENT_LABELS[adjustment.kind];
    lines.push({
      date: adjustment.date,
      sortKey: adjustment.createdAt,
      type: DEBT_ADJUSTMENT_LABELS[adjustment.kind],
      description,
      debit: reducesOutstanding ? 0 : adjustment.amount,
      credit: reducesOutstanding ? adjustment.amount : 0,
    });
  }

  // Opening: the card's tracking anchor when it has one; otherwise back-solved so the
  // running outstanding lands exactly on the outstanding shown in the app.
  const net = lines.reduce((sum, line) => sum + line.debit - line.credit, 0);
  const opening =
    debt.type === 'credit-card' && debt.openingOutstanding !== undefined
      ? debt.openingOutstanding
      : round(debt.remainingBalance - net);
  return withBalances(opening, lines, 1);
}

// ── CSV writers ──────────────────────────────────────────────────────────────

function bom(rows: string[]): string {
  // BOM so Excel reads UTF-8 (₹, non-Latin descriptions) correctly.
  return `﻿${rows.join('\r\n')}\r\n`;
}

function ledgerTable(ledger: Ledger, openingLabel: string, debitLabel: string, creditLabel: string, balanceLabel: string): string[] {
  const totalDebit = round(ledger.lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round(ledger.lines.reduce((sum, line) => sum + line.credit, 0));
  return [
    row('Date', 'Type', 'Description', debitLabel, creditLabel, balanceLabel),
    row('', 'Opening', openingLabel, '', '', money(ledger.opening)),
    ...ledger.lines.map((line) =>
      row(line.date, line.type, line.description, amountCell(line.debit), amountCell(line.credit), money(line.balance))
    ),
    '',
    row(`Total ${debitLabel.toLowerCase()}`, money(totalDebit)),
    row(`Total ${creditLabel.toLowerCase()}`, money(totalCredit)),
  ];
}

export function assetAccountCsv(account: AssetAccount, records: AccountExportRecords, currency: string, now = new Date()): string {
  const ledger = assetAccountLedger(account, records);
  return bom([
    row('Account', account.name),
    row('Account type', accountTypeLabel(account)),
    row('Currency', currency),
    row('Exported on', toLocalDateString(now)),
    row('Transactions', ledger.lines.length),
    '',
    ...ledgerTable(ledger, 'Starting balance', 'Money out', 'Money in', 'Balance'),
    row('Closing balance', money(ledger.closing)),
  ]);
}

export function debtCsv(debt: DebtAccount, records: AccountExportRecords, currency: string, now = new Date()): string {
  const ledger = debtLedger(debt, records);
  const isCard = debt.type === 'credit-card';
  const header = [
    row(isCard ? 'Card' : 'Loan', debt.name),
    row('Type', debtTypeLabel(debt)),
    ...(isCard && debt.cardLast4 ? [row('Card ending', debt.cardLast4)] : []),
    ...(debt.cardNetworkOrBank ? [row('Bank / network', debt.cardNetworkOrBank)] : []),
    ...(isCard && debt.creditLimit ? [row('Credit limit', money(debt.creditLimit))] : []),
    ...(!isCard ? [row('Principal', money(debt.principalAmount))] : []),
    ...(!isCard && debt.interestRate !== undefined ? [row('Interest rate (%)', debt.interestRate)] : []),
    ...(!isCard && debt.monthlyEmi ? [row('Monthly EMI', money(debt.monthlyEmi))] : []),
    row('Status', debt.status),
    row('Currency', currency),
    row('Exported on', toLocalDateString(now)),
    row('Transactions', ledger.lines.length),
    '',
  ];
  return bom([
    ...header,
    ...ledgerTable(ledger, isCard ? 'Outstanding when tracking started' : 'Outstanding before recorded payments', 'Debit', 'Credit', 'Outstanding'),
    row('Closing outstanding', money(ledger.closing)),
    ...(Math.abs(ledger.closing - debt.remainingBalance) >= 0.01
      ? [row('Outstanding shown in Spenza', money(debt.remainingBalance))]
      : []),
  ]);
}

/** Every account, card and loan in one flat table — sorts/filters cleanly in Excel. */
export function allAccountsCsv(records: AccountExportRecords, currency: string, now = new Date()): string {
  const accounts = records.accounts.filter((account) => !account.archived);
  const debts = records.debts.filter((debt) => debt.status !== 'archived');
  const body: string[] = [];
  const summary: string[] = [];

  for (const account of accounts) {
    const ledger = assetAccountLedger(account, records);
    summary.push(row(account.name, accountTypeLabel(account), 'Balance', money(ledger.closing)));
    body.push(row(account.name, accountTypeLabel(account), '', 'Opening', 'Starting balance', '', '', money(ledger.opening)));
    for (const line of ledger.lines) {
      body.push(row(account.name, accountTypeLabel(account), line.date, line.type, line.description, amountCell(line.debit), amountCell(line.credit), money(line.balance)));
    }
  }
  for (const debt of debts) {
    const ledger = debtLedger(debt, records);
    summary.push(row(debt.name, debtTypeLabel(debt), 'Outstanding', money(ledger.closing)));
    body.push(row(debt.name, debtTypeLabel(debt), '', 'Opening', 'Opening outstanding', '', '', money(ledger.opening)));
    for (const line of ledger.lines) {
      body.push(row(debt.name, debtTypeLabel(debt), line.date, line.type, line.description, amountCell(line.debit), amountCell(line.credit), money(line.balance)));
    }
  }

  return bom([
    row('Spenza — all accounts'),
    row('Currency', currency),
    row('Exported on', toLocalDateString(now)),
    '',
    row('Account', 'Account type', 'Figure', 'Amount'),
    ...summary,
    '',
    row('Account', 'Account type', 'Date', 'Type', 'Description', 'Debit / money out', 'Credit / money in', 'Balance after'),
    ...body,
  ]);
}

function slug(name: string, fallback: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

export function accountExportFileName(name: string, now = new Date()): string {
  return `spenza-${slug(name, 'account')}-transactions-${toLocalDateString(now)}.csv`;
}

export function allAccountsFileName(now = new Date()): string {
  return `spenza-all-accounts-${toLocalDateString(now)}.csv`;
}
