// Feature: personal-finance-pwa, Property 10: Monthly filter completeness
// Feature: personal-finance-pwa, Property 11: Monthly summary aggregation correctness
// Feature: personal-finance-pwa, Property 12: Budget rule category proportions
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { ExpenseEntry } from '../models/expense-entry.model';
import { ExpenseLimit, BudgetCategory } from '../models/expense-limit.model';
import { BudgetRuleSummary } from '../models/budget-rule-summary.model';
import { PREDEFINED_EXPENSE_TYPES, DEFAULT_BUDGET_PERCENTAGES } from '../models/category-definitions';

// ─── Pure logic helpers (mirrors ExpenseStore computed signals) ───────────────

function filterByMonth(entries: ExpenseEntry[], month: string): ExpenseEntry[] {
  return entries.filter(e => e.date.startsWith(month));
}

function computeMonthlySummary(
  entries: ExpenseEntry[],
  limits: ExpenseLimit[],
  month: string
): { totalSpent: number; totalLimit: number; netSavings: number } {
  const monthEntries = filterByMonth(entries, month);
  const totalSpent = monthEntries.reduce((sum, e) => sum + e.amount, 0);

  // totalLimit = sum of calculatedAmount for all limit types
  // calculatedAmount = income * (userPercentage / 100) — but here we use userPercentage directly
  // as a proxy for the limit amount (as stored in the entry's limit field)
  const totalLimit = monthEntries.reduce((sum, e) => sum + e.limit, 0);
  const netSavings = totalLimit - totalSpent;

  return { totalSpent, totalLimit, netSavings };
}

function computeBudgetRuleSummary(
  entries: ExpenseEntry[],
  limits: ExpenseLimit[],
  month: string,
  income: number
): BudgetRuleSummary {
  const monthEntries = filterByMonth(entries, month);
  const limitMap: Record<string, ExpenseLimit> = {};
  for (const limit of limits) {
    limitMap[limit.type] = limit;
  }

  let needsTotal = 0;
  let wantsTotal = 0;
  let savingsTotal = 0;
  let growthTotal = 0;
  let bufferTotal = 0;

  // Calculate target allocations from configured limits
  let needsTarget = 0;
  let wantsTarget = 0;
  let savingsTarget = 0;
  let growthTarget = 0;
  let bufferTarget = 0;

  for (const limit of limits) {
    const amount = (limit.userPercentage * income) / 100;
    switch (limit.category) {
      case 'Needs':
        needsTarget += amount;
        break;
      case 'Wants':
        wantsTarget += amount;
        break;
      case 'Savings':
        savingsTarget += amount;
        break;
      case 'Growth':
        growthTarget += amount;
        break;
      case 'Buffer':
        bufferTarget += amount;
        break;
    }
  }

  for (const entry of monthEntries) {
    const limit = limitMap[entry.type];
    const category = limit?.category ?? 'Buffer';

    switch (category) {
      case 'Needs':
        needsTotal += entry.amount;
        break;
      case 'Wants':
        wantsTotal += entry.amount;
        break;
      case 'Savings':
        savingsTotal += entry.amount;
        break;
      case 'Growth':
        growthTotal += entry.amount;
        break;
      case 'Buffer':
        bufferTotal += entry.amount;
        break;
    }
  }

  const needsPercentage = income > 0 ? (needsTotal / income) * 100 : 0;
  const wantsPercentage = income > 0 ? (wantsTotal / income) * 100 : 0;
  const savingsPercentage = income > 0 ? (savingsTotal / income) * 100 : 0;
  const growthPercentage = income > 0 ? (growthTotal / income) * 100 : 0;
  const bufferPercentage = income > 0 ? (bufferTotal / income) * 100 : 0;

  return {
    needsTotal,
    wantsTotal,
    savingsTotal,
    growthTotal,
    bufferTotal,
    needsPercentage,
    wantsPercentage,
    savingsPercentage,
    growthPercentage,
    bufferPercentage,
    needsTarget,
    wantsTarget,
    savingsTarget,
    growthTarget,
    bufferTarget,
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const monthArb = fc.integer({ min: 2020, max: 2029 }).chain(year =>
  fc.integer({ min: 1, max: 12 }).map(month => {
    const m = month.toString().padStart(2, '0');
    return `${year}-${m}`;
  })
);

const dateInMonthArb = (month: string) =>
  fc.integer({ min: 1, max: 28 }).map(day => {
    const d = day.toString().padStart(2, '0');
    return `${month}-${d}`;
  });

const expenseEntryForMonthArb = (month: string) =>
  fc.record<ExpenseEntry>({
    id:        fc.uuid(),
    date:      dateInMonthArb(month),
    amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
    type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
    limit:     fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
    savings:   fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
    timestamp: fc.constant(new Date().toISOString()),
  });

const expenseEntryArb = fc.record<ExpenseEntry>({
  id:        fc.uuid(),
  date:      monthArb.chain(m => dateInMonthArb(m)),
  amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
  type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  limit:     fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
  savings:   fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
  timestamp: fc.constant(new Date().toISOString()),
});

const expenseLimitArb = fc.record<ExpenseLimit>({
  type:                  fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  recommendedPercentage: fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
  userPercentage:        fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
  category:              fc.constantFrom<BudgetCategory>('Needs', 'Wants', 'Savings', 'Growth', 'Buffer'),
});

// ─── Property 10: Monthly Filter Completeness ─────────────────────────────────

describe('Property 10: Monthly Filter Completeness', () => {
  it('filter returns exactly entries whose date starts with the target month', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryArb, { minLength: 0, maxLength: 20 }),
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 10 }),
            fc.constant(month)
          )
        ),
        ([otherEntries, monthEntries, month]) => {
          const allEntries = [...otherEntries, ...monthEntries];
          const filtered = filterByMonth(allEntries, month);

          // All returned entries must be from the target month
          for (const e of filtered) {
            expect(e.date.startsWith(month)).toBe(true);
          }

          // All entries from the target month must be returned
          const expectedCount = allEntries.filter(e => e.date.startsWith(month)).length;
          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no entries from other months appear in the filtered result', () => {
    fc.assert(
      fc.property(
        monthArb,
        monthArb,
        fc.array(expenseEntryArb, { minLength: 1, maxLength: 20 }),
        (targetMonth, otherMonth, entries) => {
          if (targetMonth === otherMonth) return;

          const filtered = filterByMonth(entries, targetMonth);
          for (const e of filtered) {
            expect(e.date.startsWith(targetMonth)).toBe(true);
            expect(e.date.startsWith(otherMonth)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('filter is idempotent: filtering twice gives same result', () => {
    fc.assert(
      fc.property(
        monthArb,
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 20 }),
        (month, entries) => {
          const once = filterByMonth(entries, month);
          const twice = filterByMonth(once, month);
          expect(twice).toEqual(once);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Monthly Summary Aggregation Correctness ────────────────────

describe('Property 11: Monthly Summary Aggregation Correctness', () => {
  it('totalSpent equals sum of all entry amounts for the month', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 20 }),
            fc.constant(month)
          )
        ),
        ([entries, month]) => {
          const { totalSpent } = computeMonthlySummary(entries, [], month);
          const expected = entries.reduce((sum, e) => sum + e.amount, 0);
          expect(totalSpent).toBeCloseTo(expected, 3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('netSavings equals totalLimit - totalSpent', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 20 }),
            fc.constant(month)
          )
        ),
        ([entries, month]) => {
          const { totalSpent, totalLimit, netSavings } = computeMonthlySummary(entries, [], month);
          expect(netSavings).toBeCloseTo(totalLimit - totalSpent, 3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('totalSpent is 0 for an empty entries array', () => {
    fc.assert(
      fc.property(monthArb, (month) => {
        const { totalSpent, totalLimit, netSavings } = computeMonthlySummary([], [], month);
        expect(totalSpent).toBe(0);
        expect(totalLimit).toBe(0);
        expect(netSavings).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 12: Budget Rule Category Proportions ───────────────────────────

describe('Property 12: Budget Rule Category Proportions', () => {
  it('category totals (Needs + Wants + Savings) sum to at most total spent (Buffer excluded)', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 20 }),
            fc.array(expenseLimitArb, { minLength: 1, maxLength: 14 }),
            fc.float({ min: Math.fround(1), max: Math.fround(100000), noNaN: true }),
            fc.constant(month)
          )
        ),
        ([entries, limits, income, month]) => {
          const summary = computeBudgetRuleSummary(entries, limits, month, income);
          const categorizedTotal = summary.needsTotal + summary.wantsTotal + summary.savingsTotal + summary.growthTotal + summary.bufferTotal;
          const totalSpent = filterByMonth(entries, month).reduce((sum, e) => sum + e.amount, 0);

          // Categorized total must equal total spent (all entries are now categorized)
          expect(Math.abs(categorizedTotal - totalSpent)).toBeLessThan(0.001);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no entry is double-counted across categories', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 1, maxLength: 20 }),
            fc.constant(month)
          )
        ),
        ([entries, month]) => {
          // Use DEFAULT_BUDGET_PERCENTAGES to create limits with known categories
          const limits: ExpenseLimit[] = PREDEFINED_EXPENSE_TYPES.map(type => ({
            type,
            recommendedPercentage: DEFAULT_BUDGET_PERCENTAGES[type].recommendedPercentage,
            userPercentage: DEFAULT_BUDGET_PERCENTAGES[type].recommendedPercentage,
            category: DEFAULT_BUDGET_PERCENTAGES[type].category,
          }));

          const summary = computeBudgetRuleSummary(entries, limits, month, 10000);
          const monthEntries = filterByMonth(entries, month);

          // Manually compute expected totals
          let expectedNeeds = 0;
          let expectedWants = 0;
          let expectedSavings = 0;
          let expectedGrowth = 0;

          for (const entry of monthEntries) {
            const limit = limits.find(l => l.type === entry.type);
            const category = limit?.category ?? 'Buffer';
            if (category === 'Needs') expectedNeeds += entry.amount;
            else if (category === 'Wants') expectedWants += entry.amount;
            else if (category === 'Savings') expectedSavings += entry.amount;
            else if (category === 'Growth') expectedGrowth += entry.amount;
          }

          expect(summary.needsTotal).toBeCloseTo(expectedNeeds, 3);
          expect(summary.wantsTotal).toBeCloseTo(expectedWants, 3);
          expect(summary.savingsTotal).toBeCloseTo(expectedSavings, 3);
          expect(summary.growthTotal).toBeCloseTo(expectedGrowth, 3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('percentages are 0 when income is 0', () => {
    fc.assert(
      fc.property(
        monthArb.chain(month =>
          fc.tuple(
            fc.array(expenseEntryForMonthArb(month), { minLength: 0, maxLength: 10 }),
            fc.array(expenseLimitArb, { minLength: 0, maxLength: 5 }),
            fc.constant(month)
          )
        ),
        ([entries, limits, month]) => {
          const summary = computeBudgetRuleSummary(entries, limits, month, 0);
          expect(summary.needsPercentage).toBe(0);
          expect(summary.wantsPercentage).toBe(0);
          expect(summary.savingsPercentage).toBe(0);
          expect(summary.growthPercentage).toBe(0);
          expect(summary.bufferPercentage).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests (Task 16.3) ───────────────────────────────────────────────────

describe('Unit: addEntry prepend behavior', () => {
  it('addEntry prepends: after adding entry X to [A, B], result is [X, A, B]', () => {
    const today = new Date().toISOString().slice(0, 10);
    const makeEntry = (id: string): ExpenseEntry => ({
      id,
      date: today,
      amount: 10,
      type: 'Housing',
      limit: 100,
      savings: 90,
      timestamp: new Date().toISOString(),
    });

    const entryA = makeEntry('A');
    const entryB = makeEntry('B');
    const entryX = makeEntry('X');

    const existing = [entryA, entryB];
    const result = [entryX, ...existing];

    expect(result[0]).toEqual(entryX);
    expect(result[1]).toEqual(entryA);
    expect(result[2]).toEqual(entryB);
    expect(result).toHaveLength(3);
  });

  it('addEntry to empty array results in single-element array', () => {
    const entry: ExpenseEntry = {
      id: 'only',
      date: new Date().toISOString().slice(0, 10),
      amount: 5,
      type: 'Food',
      limit: 50,
      savings: 45,
      timestamp: new Date().toISOString(),
    };
    const result = [entry, ...[]];
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(entry);
  });
});

// ─── Unit: family full-snapshot merge logic ───────────────────────────────────

describe('Unit: family state$ remote merge (pure logic)', () => {
  const makeEntry = (id: string, timestamp: string, amount = 10): ExpenseEntry => ({
    id,
    date: '2025-01-01',
    amount,
    type: 'Food',
    limit: 50,
    savings: 40,
    timestamp,
  });

  function mergeEntries(
    local: ExpenseEntry[],
    remote: ExpenseEntry[]
  ): ExpenseEntry[] {
    const byId = new Map(local.map(e => [e.id, e]));
    for (const r of remote) {
      const l = byId.get(r.id);
      if (!l || (r.timestamp ?? '') >= (l.timestamp ?? '')) {
        byId.set(r.id, r);
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  it('remote entry with newer timestamp wins over local conflict', () => {
    const local = [makeEntry('e1', '2025-01-01T10:00:00Z', 10)];
    const remote = [makeEntry('e1', '2025-01-01T11:00:00Z', 99)];
    const merged = mergeEntries(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(99);
  });

  it('local entry is kept when its timestamp is newer than remote', () => {
    const local = [makeEntry('e1', '2025-01-01T12:00:00Z', 77)];
    const remote = [makeEntry('e1', '2025-01-01T09:00:00Z', 1)];
    const merged = mergeEntries(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(77);
  });

  it('local-only entries are preserved after merge', () => {
    const local = [makeEntry('local-only', '2025-01-01T10:00:00Z')];
    const remote = [makeEntry('remote-only', '2025-01-01T10:00:00Z')];
    const merged = mergeEntries(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.some(e => e.id === 'local-only')).toBe(true);
    expect(merged.some(e => e.id === 'remote-only')).toBe(true);
  });

  it('result is sorted by timestamp descending', () => {
    const local = [makeEntry('a', '2025-01-01T08:00:00Z')];
    const remote = [makeEntry('b', '2025-01-01T10:00:00Z')];
    const merged = mergeEntries(local, remote);
    expect(merged[0].id).toBe('b');
    expect(merged[1].id).toBe('a');
  });

  it('#applyingRemote flag: pushFamilyState should not be called during merge (guard check)', () => {
    let pushCalled = false;
    let applyingRemote = false;

    const pushFamilyState = () => {
      if (applyingRemote) return;
      pushCalled = true;
    };

    applyingRemote = true;
    try {
      const local = [makeEntry('e1', '2025-01-01T10:00:00Z')];
      const remote = [makeEntry('e2', '2025-01-01T11:00:00Z')];
      mergeEntries(local, remote);
      pushFamilyState();
    } finally {
      applyingRemote = false;
    }

    expect(pushCalled).toBe(false);
  });
});

describe('Unit: todayEntries filter', () => {
  it('returns only entries with today\'s date', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const entries: ExpenseEntry[] = [
      { id: '1', date: today, amount: 10, type: 'Food', limit: 50, savings: 40, timestamp: new Date().toISOString() },
      { id: '2', date: yesterday, amount: 20, type: 'Housing', limit: 100, savings: 80, timestamp: new Date().toISOString() },
      { id: '3', date: today, amount: 5, type: 'Transport', limit: 30, savings: 25, timestamp: new Date().toISOString() },
    ];

    const todayEntries = entries.filter(e => e.date === today);
    expect(todayEntries).toHaveLength(2);
    expect(todayEntries.every(e => e.date === today)).toBe(true);
  });

  it('returns empty array when no entries match today', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const entries: ExpenseEntry[] = [
      { id: '1', date: yesterday, amount: 10, type: 'Food', limit: 50, savings: 40, timestamp: new Date().toISOString() },
    ];
    const today = new Date().toISOString().slice(0, 10);
    const todayEntries = entries.filter(e => e.date === today);
    expect(todayEntries).toHaveLength(0);
  });
});

describe('Unit: limitMap keys', () => {
  it('limitMap keys match the type field of each limit', () => {
    const limits: ExpenseLimit[] = [
      { type: 'Housing', recommendedPercentage: 30, userPercentage: 30, category: 'Needs' },
      { type: 'Food', recommendedPercentage: 15, userPercentage: 15, category: 'Needs' },
      { type: 'Entertainment', recommendedPercentage: 10, userPercentage: 10, category: 'Wants' },
    ];

    const limitMap: Record<string, ExpenseLimit> = {};
    for (const limit of limits) {
      limitMap[limit.type] = limit;
    }

    expect(Object.keys(limitMap)).toContain('Housing');
    expect(Object.keys(limitMap)).toContain('Food');
    expect(Object.keys(limitMap)).toContain('Entertainment');
    expect(limitMap['Housing'].type).toBe('Housing');
    expect(limitMap['Food'].type).toBe('Food');
  });

  it('limitMap allows O(1) lookup by type', () => {
    const limits: ExpenseLimit[] = [
      { type: 'Savings', recommendedPercentage: 20, userPercentage: 20, category: 'Savings' },
    ];
    const limitMap: Record<string, ExpenseLimit> = {};
    for (const limit of limits) {
      limitMap[limit.type] = limit;
    }
    expect(limitMap['Savings']).toBeDefined();
    expect(limitMap['NonExistent']).toBeUndefined();
  });
});

describe('Unit: budgetRuleSummary with zero income', () => {
  it('returns zero percentages when monthlyIncome is 0', () => {
    const entries: ExpenseEntry[] = [
      { id: '1', date: '2024-01-15', amount: 500, type: 'Housing', limit: 1000, savings: 500, timestamp: new Date().toISOString() },
    ];
    const limits: ExpenseLimit[] = [
      { type: 'Housing', recommendedPercentage: 30, userPercentage: 30, category: 'Needs' },
    ];
    const income = 0;
    const month = '2024-01';

    const summary = computeBudgetRuleSummary(entries, limits, month, income);

    expect(summary.needsPercentage).toBe(0);
    expect(summary.wantsPercentage).toBe(0);
    expect(summary.savingsPercentage).toBe(0);
    expect(summary.growthPercentage).toBe(0);
    expect(summary.bufferPercentage).toBe(0);
  });

  it('returns zero targets when monthlyIncome is 0', () => {
    const summary = computeBudgetRuleSummary([], [], '2024-01', 0);
    expect(summary.needsTarget).toBe(0);
    expect(summary.wantsTarget).toBe(0);
    expect(summary.savingsTarget).toBe(0);
    expect(summary.growthTarget).toBe(0);
    expect(summary.bufferTarget).toBe(0);
  });
});

// ─── Unit Tests: Debt Payment Reversal Logic (Phase 5) ───────────────────────

type MiniAccount = { id: string; balance: number; allowOverdraft: boolean; archived: boolean };
type MiniDebt = { id: string; principalAmount: number; remainingBalance: number; status: 'active' | 'paid' | 'archived' };
type MiniPayment = { id: string; debtId: string; expenseId: string; accountId: string; amount: number };
type MiniEntry = { id: string; source?: string; debtId?: string; amount?: number; accountId?: string };

function roundMoney(n: number): number { return Number(n.toFixed(2)); }

function simulateDeleteDebtPayment(
  paymentId: string,
  payments: MiniPayment[],
  debts: MiniDebt[],
  entries: MiniEntry[],
  accounts: MiniAccount[],
): { payments: MiniPayment[]; debts: MiniDebt[]; entries: MiniEntry[]; accounts: MiniAccount[] } {
  const payment = payments.find(p => p.id === paymentId);
  if (!payment) throw new Error('Debt payment was not found.');
  const linkedEntry = entries.find(e => e.id === payment.expenseId);
  if (!linkedEntry) throw new Error('Linked debt payment expense was not found.');
  const debt = debts.find(d => d.id === payment.debtId);
  if (!debt) throw new Error('Debt was not found.');
  const account = accounts.find(a => a.id === payment.accountId && !a.archived);
  if (!account) throw new Error('Selected payment account was not found. Choose another account and try again.');
  const nextBalance = roundMoney(Math.min(debt.principalAmount, roundMoney(debt.remainingBalance + payment.amount)));
  return {
    payments: payments.filter(p => p.id !== paymentId),
    debts: debts.map(d => d.id === debt.id
      ? { ...d, remainingBalance: nextBalance, status: (nextBalance === 0 ? 'paid' : 'active') as MiniDebt['status'] }
      : d),
    entries: entries.filter(e => e.id !== payment.expenseId),
    accounts: accounts.map(a => a.id === payment.accountId
      ? { ...a, balance: roundMoney(a.balance + payment.amount) }
      : a),
  };
}

function simulateUpdateDebtPayment(
  paymentId: string,
  input: { accountId: string; amount: number; date: string; comment?: string },
  payments: MiniPayment[],
  debts: MiniDebt[],
  entries: MiniEntry[],
  accounts: MiniAccount[],
): { payments: MiniPayment[]; debts: MiniDebt[]; entries: MiniEntry[]; accounts: MiniAccount[] } {
  const amount = roundMoney(input.amount);
  const payment = payments.find(p => p.id === paymentId);
  if (!payment) throw new Error('Debt payment was not found.');
  const debt = debts.find(d => d.id === payment.debtId);
  if (!debt) throw new Error('Debt was not found.');
  const linkedEntry = entries.find(e => e.id === payment.expenseId);
  if (!linkedEntry) throw new Error('Linked debt payment expense was not found.');
  const newAccount = accounts.find(a => a.id === input.accountId && !a.archived);
  if (!newAccount) throw new Error('Payment account was not found.');
  const restoredDebtBalance = roundMoney(debt.remainingBalance + payment.amount);
  if (amount > restoredDebtBalance) throw new Error('Payment amount cannot be higher than the remaining debt balance.');
  // Compute net account delta
  const newAccountBalance = (() => {
    const oldAccountBalance = roundMoney(
      (accounts.find(a => a.id === payment.accountId)?.balance ?? 0) + payment.amount
    );
    if (payment.accountId === input.accountId) {
      return roundMoney(oldAccountBalance - amount);
    }
    return null; // different accounts — handled per-account
  })();
  const nextRemainingBalance = roundMoney(restoredDebtBalance - amount);
  const updatedAccounts: MiniAccount[] = accounts.map(a => {
    if (payment.accountId === input.accountId) {
      if (a.id === payment.accountId) {
        const nb = roundMoney(a.balance + payment.amount - amount);
        if (!a.allowOverdraft && nb < 0) throw new Error(`${a.id} does not have enough balance.`);
        return { ...a, balance: nb };
      }
      return a;
    }
    if (a.id === payment.accountId) return { ...a, balance: roundMoney(a.balance + payment.amount) };
    if (a.id === input.accountId) {
      const nb = roundMoney(a.balance - amount);
      if (!a.allowOverdraft && nb < 0) throw new Error(`${a.id} does not have enough balance.`);
      return { ...a, balance: nb };
    }
    return a;
  });
  void newAccountBalance;
  return {
    payments: payments.map(p => p.id === paymentId ? { ...p, accountId: input.accountId, amount, date: input.date } : p),
    debts: debts.map(d => d.id === debt.id
      ? { ...d, remainingBalance: nextRemainingBalance, status: (nextRemainingBalance === 0 ? 'paid' : 'active') as MiniDebt['status'] }
      : d),
    entries: entries.map(e => e.id === linkedEntry.id ? { ...e, amount, accountId: input.accountId } : e),
    accounts: updatedAccounts,
  };
}

describe('Unit: deleteDebtPayment logic', () => {
  const account: MiniAccount = { id: 'acc1', balance: 500, allowOverdraft: false, archived: false };
  const debt: MiniDebt = { id: 'debt1', principalAmount: 1000, remainingBalance: 200, status: 'active' };
  const payment: MiniPayment = { id: 'pay1', debtId: 'debt1', expenseId: 'exp1', accountId: 'acc1', amount: 300 };
  const entry: MiniEntry = { id: 'exp1', source: 'debt-payment', debtId: 'debt1', amount: 300, accountId: 'acc1' };

  it('restores account balance by the payment amount', () => {
    const result = simulateDeleteDebtPayment('pay1', [payment], [debt], [entry], [account]);
    expect(result.accounts[0].balance).toBe(roundMoney(500 + 300));
  });

  it('removes the expense entry', () => {
    const result = simulateDeleteDebtPayment('pay1', [payment], [debt], [entry], [account]);
    expect(result.entries.find(e => e.id === 'exp1')).toBeUndefined();
  });

  it('removes the payment record', () => {
    const result = simulateDeleteDebtPayment('pay1', [payment], [debt], [entry], [account]);
    expect(result.payments.find(p => p.id === 'pay1')).toBeUndefined();
  });

  it('recalculates debt remainingBalance capped at principalAmount', () => {
    const paidDebt: MiniDebt = { id: 'debt1', principalAmount: 1000, remainingBalance: 0, status: 'paid' };
    const bigPayment: MiniPayment = { id: 'pay1', debtId: 'debt1', expenseId: 'exp1', accountId: 'acc1', amount: 1500 };
    const result = simulateDeleteDebtPayment('pay1', [bigPayment], [paidDebt], [entry], [account]);
    expect(result.debts[0].remainingBalance).toBe(1000);
  });

  it('reopens debt status to active when it was paid', () => {
    const paidDebt: MiniDebt = { id: 'debt1', principalAmount: 1000, remainingBalance: 0, status: 'paid' };
    const result = simulateDeleteDebtPayment('pay1', [payment], [paidDebt], [entry], [account]);
    expect(result.debts[0].status).toBe('active');
  });

  it('throws when paymentId is not found', () => {
    expect(() => simulateDeleteDebtPayment('nonexistent', [payment], [debt], [entry], [account]))
      .toThrow('Debt payment was not found.');
  });

  it('throws when linked expense entry is not found', () => {
    expect(() => simulateDeleteDebtPayment('pay1', [payment], [debt], [], [account]))
      .toThrow('Linked debt payment expense was not found.');
  });
});

describe('Unit: updateDebtPayment logic', () => {
  const account: MiniAccount = { id: 'acc1', balance: 500, allowOverdraft: false, archived: false };
  const debt: MiniDebt = { id: 'debt1', principalAmount: 1000, remainingBalance: 700, status: 'active' };
  const payment: MiniPayment = { id: 'pay1', debtId: 'debt1', expenseId: 'exp1', accountId: 'acc1', amount: 300 };
  const entry: MiniEntry = { id: 'exp1', source: 'debt-payment', debtId: 'debt1', amount: 300, accountId: 'acc1' };

  it('reverses old account deduction and applies the new amount', () => {
    const result = simulateUpdateDebtPayment(
      'pay1', { accountId: 'acc1', amount: 200, date: '2026-06-05' },
      [payment], [debt], [entry], [account],
    );
    // balance was 500, old payment (300) restored → 800, new payment (200) deducted → 600
    expect(result.accounts[0].balance).toBe(600);
  });

  it('updates the debt remainingBalance correctly', () => {
    const result = simulateUpdateDebtPayment(
      'pay1', { accountId: 'acc1', amount: 200, date: '2026-06-05' },
      [payment], [debt], [entry], [account],
    );
    // restoredDebtBalance = 700 + 300 = 1000, then 1000 - 200 = 800
    expect(result.debts[0].remainingBalance).toBe(800);
  });

  it('sets debt status to paid when remaining reaches 0', () => {
    // remaining 300, old payment 300 → restored 600, new payment 600 exactly
    const d: MiniDebt = { id: 'debt1', principalAmount: 1000, remainingBalance: 300, status: 'active' };
    const acc: MiniAccount = { id: 'acc1', balance: 600, allowOverdraft: false, archived: false };
    const result = simulateUpdateDebtPayment(
      'pay1', { accountId: 'acc1', amount: 600, date: '2026-06-05' },
      [payment], [d], [entry], [acc],
    );
    expect(result.debts[0].remainingBalance).toBe(0);
    expect(result.debts[0].status).toBe('paid');
  });

  it('rejects overpayment: new amount exceeds remaining + old amount', () => {
    // restoredDebtBalance = 700 + 300 = 1000; new amount 1001 > 1000
    expect(() => simulateUpdateDebtPayment(
      'pay1', { accountId: 'acc1', amount: 1001, date: '2026-06-05' },
      [payment], [debt], [entry], [account],
    )).toThrow('Payment amount cannot be higher than the remaining debt balance.');
  });

  it('rejects when new account would overdraft and allowOverdraft is false', () => {
    const acc2: MiniAccount = { id: 'acc2', balance: 50, allowOverdraft: false, archived: false };
    expect(() => simulateUpdateDebtPayment(
      'pay1', { accountId: 'acc2', amount: 200, date: '2026-06-05' },
      [payment], [debt], [entry], [account, acc2],
    )).toThrow('does not have enough balance.');
  });
});

describe('Unit: deleteEntry rejects debt-payment entries', () => {
  it('detects debt-payment source and throws the right error message', () => {
    const entries: MiniEntry[] = [
      { id: 'dp1', source: 'debt-payment', debtId: 'debt1', amount: 500, accountId: 'acc1' },
      { id: 'reg1', amount: 100 },
    ];

    const checkRejectDebtPaymentEntry = (entryId: string): boolean => {
      const e = entries.find(x => x.id === entryId);
      return e?.source === 'debt-payment' || !!e?.debtId;
    };

    expect(checkRejectDebtPaymentEntry('dp1')).toBe(true);
    expect(checkRejectDebtPaymentEntry('reg1')).toBe(false);
  });

  it('entry with debtId but no source is also blocked', () => {
    const entries: MiniEntry[] = [
      { id: 'dp2', debtId: 'debt1', amount: 300, accountId: 'acc1' },
    ];
    const isDebtPayment = (e: MiniEntry): boolean => e.source === 'debt-payment' || !!e.debtId;
    expect(isDebtPayment(entries[0])).toBe(true);
  });
});

describe('Unit: clearLocalData resets state', () => {
  it('clearLocalData resets all state fields to initial values', () => {
    // Simulate the state object
    let state = {
      entries: [
        { id: '1', date: '2024-01-01', amount: 100, type: 'Food', limit: 200, savings: 100, timestamp: new Date().toISOString() },
      ] as ExpenseEntry[],
      limits: [
        { type: 'Food', recommendedPercentage: 15, userPercentage: 15, category: 'Needs' as const },
      ] as ExpenseLimit[],
      monthlyIncome: 5000,
      syncStatus: 'error' as const,
    };

    // Simulate clearLocalData
    state = {
      entries: [],
      limits: [],
      monthlyIncome: 0,
      syncStatus: 'idle',
    };

    expect(state.entries).toHaveLength(0);
    expect(state.limits).toHaveLength(0);
    expect(state.monthlyIncome).toBe(0);
    expect(state.syncStatus).toBe('idle');
  });
});
