"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CURRENCY = void 0;
exports.fromBackupDocument = fromBackupDocument;
exports.fromLedgerRecords = fromLedgerRecords;
exports.normalize = normalize;
const derived_balance_util_1 = require("../spenza-core/utils/derived-balance.util");
exports.DEFAULT_CURRENCY = 'INR';
const arr = (value) => (Array.isArray(value) ? value : []);
const num = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
/** Parses the Drive backup JSON (BackupDocument in google-drive.service.ts). */
function fromBackupDocument(raw, modifiedTime) {
    if (!raw || typeof raw !== 'object')
        throw new Error('Backup is not a JSON object');
    const doc = raw;
    const metadata = (doc['metadata'] ?? {});
    return normalize({
        source: 'drive',
        dataAsOf: modifiedTime ?? (typeof doc['lastUpdated'] === 'string' ? doc['lastUpdated'] : null),
        monthlyIncome: num(metadata['monthlyIncome']),
        currency: typeof metadata['currency'] === 'string' && metadata['currency'] ? metadata['currency'] : exports.DEFAULT_CURRENCY,
        expenses: arr(doc['expenses']),
        limits: arr(doc['limits']),
        accounts: arr(doc['accounts']),
        accountAdjustments: arr(doc['accountAdjustments']),
        debts: arr(doc['debts']),
        debtPayments: arr(doc['debtPayments']),
        debtAdjustments: arr(doc['debtAdjustments']),
        family: null,
    });
}
/**
 * Rebuilds the family's state from its ledger documents, the way the app's
 * `applyLedgerChanges` does for a fresh device: tombstones are skipped, the
 * `limits` and `meta` singletons carry limits, income and currency.
 */
function fromLedgerRecords(records, family) {
    const data = {
        source: 'family-ledger',
        dataAsOf: null,
        monthlyIncome: 0,
        currency: exports.DEFAULT_CURRENCY,
        expenses: [],
        limits: [],
        accounts: [],
        accountAdjustments: [],
        debts: [],
        debtPayments: [],
        debtAdjustments: [],
        family,
    };
    for (const record of records) {
        if (record.updatedAt && (!data.dataAsOf || record.updatedAt > data.dataAsOf))
            data.dataAsOf = record.updatedAt;
        if (record.deleted || record.payload == null)
            continue;
        switch (record.type) {
            case 'expense':
                data.expenses.push(record.payload);
                break;
            case 'adjustment':
                data.accountAdjustments.push(record.payload);
                break;
            case 'debt-payment':
                data.debtPayments.push(record.payload);
                break;
            case 'debt-adjustment':
                data.debtAdjustments.push(record.payload);
                break;
            case 'account':
                data.accounts.push(record.payload);
                break;
            case 'debt':
                data.debts.push(record.payload);
                break;
            case 'limits': {
                const limits = record.payload.limits;
                if (Array.isArray(limits))
                    data.limits = limits;
                break;
            }
            case 'meta': {
                const meta = record.payload;
                data.monthlyIncome = num(meta.monthlyIncome, data.monthlyIncome);
                if (typeof meta.currency === 'string' && meta.currency)
                    data.currency = meta.currency;
                break;
            }
            default: break;
        }
    }
    return normalize(data);
}
/**
 * Same healing the app's ExpenseStore applies at every load boundary: account
 * balances and anchored card outstandings are derived from the records, never
 * trusted as stored numbers (see derived-balance.util.ts).
 */
function normalize(data) {
    const expenses = data.expenses
        .filter((e) => e && typeof e.date === 'string' && typeof e.amount === 'number')
        .sort((a, b) => b.date.localeCompare(a.date) || (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
    const balances = (0, derived_balance_util_1.computeDerivedBalances)(data.accounts, {
        accountAdjustments: data.accountAdjustments,
        entries: expenses,
        debtAdjustments: data.debtAdjustments,
    });
    const accounts = data.accounts.map((a) => (balances.has(a.id) ? { ...a, balance: balances.get(a.id) } : a));
    const outstandings = (0, derived_balance_util_1.computeDerivedOutstandings)(data.debts, {
        entries: expenses,
        debtPayments: data.debtPayments,
        debtAdjustments: data.debtAdjustments,
    });
    const debts = data.debts.map((d) => outstandings.has(d.id) ? { ...d, remainingBalance: outstandings.get(d.id) } : d);
    return { ...data, expenses, accounts, debts };
}
//# sourceMappingURL=spenza-data.js.map