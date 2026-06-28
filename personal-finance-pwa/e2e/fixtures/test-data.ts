/**
 * Canonical test fixture data for Spenza E2E tests.
 *
 * This module exports the seed backup document and the LocalBackupSnapshot
 * wrapper that the app reads from CapacitorStorage on startup.
 *
 * The snapshot's `userEmail` must match the injected `gapi_user_email` key
 * or the app will reject it as a cross-account snapshot.
 */

export const TEST_USER_EMAIL = 'test@spenza.e2e';
export const TEST_USER_UID   = 'e2e-test-uid-001';
export const TEST_DRIVE_FILE_ID   = 'e2e-drive-file-id-001';
export const TEST_CONFIG_FILE_ID  = 'e2e-config-file-id-001';
export const FAKE_ACCESS_TOKEN    = 'ya29.fake-access-token-e2e';
export const MODIFIED_TIME        = '2026-01-15T10:00:00.000Z';

// ── Expense entries ──────────────────────────────────────────────────────────

const today = new Date();
const fmt = (d: Date) => d.toISOString().split('T')[0];
const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };

export const TEST_EXPENSES = [
  {
    id: 'exp-001',
    date: fmt(today),
    amount: 500,
    type: 'Food & Groceries',
    limit: 5000,
    savings: 4500,
    timestamp: new Date().toISOString(),
    comment: 'Weekly groceries',
  },
  {
    id: 'exp-002',
    date: fmt(today),
    amount: 200,
    type: 'Transportation',
    limit: 2500,
    savings: 2300,
    timestamp: new Date().toISOString(),
    comment: 'Cab to office',
  },
  {
    id: 'exp-003',
    date: daysAgo(1),
    amount: 1200,
    type: 'Entertainment',
    limit: 3000,
    savings: 1800,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    comment: 'Movie tickets',
  },
  {
    id: 'exp-004',
    date: daysAgo(3),
    amount: 3500,
    type: 'Housing',
    limit: 15000,
    savings: 11500,
    timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
    comment: 'Rent',
  },
];

// ── Limits ───────────────────────────────────────────────────────────────────

export const TEST_LIMITS = [
  { type: 'Housing',              recommendedPercentage: 30, userPercentage: 30, category: 'Needs'   },
  { type: 'Food & Groceries',     recommendedPercentage: 10, userPercentage: 10, category: 'Needs'   },
  { type: 'Transportation',       recommendedPercentage: 5,  userPercentage: 5,  category: 'Needs'   },
  { type: 'Utilities',            recommendedPercentage: 3,  userPercentage: 3,  category: 'Needs'   },
  { type: 'Healthcare',           recommendedPercentage: 2,  userPercentage: 2,  category: 'Needs'   },
  { type: 'Entertainment',        recommendedPercentage: 6,  userPercentage: 6,  category: 'Wants'   },
  { type: 'Dining Out',           recommendedPercentage: 7,  userPercentage: 7,  category: 'Wants'   },
  { type: 'Shopping/Clothing',    recommendedPercentage: 7,  userPercentage: 7,  category: 'Wants'   },
  { type: 'Savings/Emergency Fund', recommendedPercentage: 12, userPercentage: 12, category: 'Savings' },
  { type: 'Investments',          recommendedPercentage: 6,  userPercentage: 6,  category: 'Growth'  },
  { type: 'Education',            recommendedPercentage: 2,  userPercentage: 2,  category: 'Growth'  },
  { type: 'Personal Care',        recommendedPercentage: 5,  userPercentage: 5,  category: 'Wants'   },
  { type: 'Subscriptions',        recommendedPercentage: 5,  userPercentage: 5,  category: 'Wants'   },
  { type: 'Miscellaneous',        recommendedPercentage: 0,  userPercentage: 0,  category: 'Buffer'  },
];

// ── Asset accounts ────────────────────────────────────────────────────────────

export const TEST_ACCOUNTS = [
  {
    id: 'acct-001',
    name: 'HDFC Salary',
    type: 'bank',
    balance: 25000,
    allowOverdraft: false,
    isDefault: true,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'acct-002',
    name: 'Cash Wallet',
    type: 'cash',
    balance: 2000,
    allowOverdraft: false,
    isDefault: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ── Debts ─────────────────────────────────────────────────────────────────────

export const TEST_DEBTS = [
  {
    id: 'debt-001',
    name: 'HDFC Credit Card',
    type: 'credit-card',
    principalAmount: 100000,
    remainingBalance: 45000,
    interestRate: 18,
    monthlyEmi: 5000,
    startDate: '2025-01-01',
    nextDueDate: '2026-07-15',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ── Full backup document ──────────────────────────────────────────────────────

export const TEST_BACKUP_DOC = {
  version: '1.0',
  lastUpdated: MODIFIED_TIME,
  metadata: {
    monthlyIncome: 50000,
    currency: 'INR',
  },
  expenses: TEST_EXPENSES,
  limits: TEST_LIMITS,
  accounts: TEST_ACCOUNTS,
  accountAdjustments: [],
  debts: TEST_DEBTS,
  debtPayments: [],
};

// ── LocalBackupSnapshot (what the app stores in CapacitorStorage) ─────────────

export const TEST_SNAPSHOT = {
  version: '1',
  userEmail: TEST_USER_EMAIL,
  fileId: TEST_DRIVE_FILE_ID,
  mode: 'single',
  sharedFileId: null,
  modifiedTime: MODIFIED_TIME,
  dirty: false,
  savedAt: new Date().toISOString(),
  doc: TEST_BACKUP_DOC,
};

// ── spenza-config.json (Drive config) ────────────────────────────────────────

export const TEST_DRIVE_CONFIG = {
  version: '1',
  mode: 'single',
  sharedFileId: null,
  familyFolderId: null,
  ownerRole: null,
  aiSettings: {
    provider: 'hosted',
  },
  lastUpdated: MODIFIED_TIME,
};

// ── Drive API mock responses ──────────────────────────────────────────────────

export const DRIVE_FILE_LIST_RESPONSE = {
  files: [
    {
      id: TEST_DRIVE_FILE_ID,
      name: 'spenza-backup.json',
      modifiedTime: MODIFIED_TIME,
      size: '12345',
    },
  ],
};

export const DRIVE_CONFIG_LIST_RESPONSE = {
  files: [
    {
      id: TEST_CONFIG_FILE_ID,
      name: 'spenza-config.json',
      modifiedTime: MODIFIED_TIME,
    },
  ],
};

export const DRIVE_WRITE_RESPONSE = {
  id: TEST_DRIVE_FILE_ID,
  name: 'spenza-backup.json',
  modifiedTime: new Date().toISOString(),
};

// ── Firestore subscription doc (Pro user) ────────────────────────────────────

export const FIRESTORE_PRO_SUBSCRIPTION = {
  status: 'active',
  plan: 'monthly',
  provider: 'razorpay',
  startDate: '2026-01-01T00:00:00Z',
  expiresAt: '2027-01-01T00:00:00Z',
  subscriptionId: 'sub_test_001',
};
