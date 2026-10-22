import { describe, expect, it } from 'vitest';
import type { CircleDocument, CircleExpense, DebtAccount, ExpenseEntry, ExpenseLimit, LedgerRecord } from '../spenza-core/models';
import { cardCycleState } from '../spenza-core/utils/credit-card-cycle';
import { McpToolError } from './errors';
import { handleRpc, type RequestContext } from './protocol';
import { fromBackupDocument, fromLedgerRecords, type SpenzaData } from './spenza-data';
import { TOOL_BY_NAME, type ToolContext } from './tools';
import { zonedNow } from './zoned-time';

// 21 Oct 2026, 10:00 in the user's timezone.
const NOW = new Date(2026, 9, 21, 10, 0, 0);

const e = (id: string, date: string, amount: number, type: string, extra: Partial<ExpenseEntry> = {}): ExpenseEntry => ({
  id, date, amount, type, limit: 0, savings: 0, timestamp: `${date}T10:00:00Z`, ...extra,
});

const limits: ExpenseLimit[] = [
  { type: 'Food & Groceries', recommendedPercentage: 10, userPercentage: 10, category: 'Needs' },
  { type: 'Shopping', recommendedPercentage: 10, userPercentage: 5, category: 'Wants' },
];

const card: DebtAccount = {
  id: 'card1', name: 'HDFC Card', type: 'credit-card', principalAmount: 0, remainingBalance: 4000,
  startDate: '2026-01-01', status: 'active', billGenerationDay: 5, paymentDueDay: 25, creditLimit: 100000,
  cardLast4: '1234', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const loan: DebtAccount = {
  id: 'loan1', name: 'Car loan', type: 'vehicle-loan', principalAmount: 500000, remainingBalance: 320000,
  monthlyEmi: 12000, interestRate: 9.5, startDate: '2024-01-01', nextDueDate: '2026-11-05', status: 'active',
  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};

function backup(extra: Record<string, unknown> = {}): SpenzaData {
  return fromBackupDocument({
    version: '1', lastUpdated: '2026-10-21T04:00:00Z',
    metadata: { monthlyIncome: 60000, currency: 'INR' },
    expenses: [
      e('1', '2026-10-02', 3000, 'Food & Groceries', { comment: 'Big basket', accountId: 'acc1' }),
      e('2', '2026-10-15', 2500, 'Food & Groceries', { comment: 'Restaurant' }),
      e('3', '2026-10-21', 400, 'Shopping', { comment: 'Socks' }),
      e('4', '2026-10-10', 900, 'Gifts'),
      e('5', '2026-09-12', 5000, 'Food & Groceries'),
      // Card bill repayment: must never count as spending.
      e('6', '2026-10-20', 7000, 'Debt Payment', { source: 'debt-payment', debtId: 'card1' }),
    ],
    limits,
    accounts: [{ id: 'acc1', name: 'Savings a/c', type: 'bank', balance: 999, initialBalance: 10000, allowOverdraft: false, isDefault: true, archived: false, createdAt: '', updatedAt: '' }],
    debts: [card, loan],
    ...extra,
  }, '2026-10-21T04:30:00Z');
}

function ctxFor(data: SpenzaData, circles: { circle: CircleDocument; expenses: CircleExpense[] }[] = []): ToolContext {
  return { uid: 'me-uid', now: NOW, timezone: 'Asia/Kolkata', data: async () => data, circles: async () => circles };
}

const run = (name: string, args: Record<string, unknown>, ctx: ToolContext) => TOOL_BY_NAME.get(name)!.run(args, ctx);

describe('spenza-data', () => {
  it('heals account balances from records, like the app', () => {
    const data = backup();
    // 10000 initial − 3000 (entry 1 paid from acc1)
    expect(data.accounts[0].balance).toBe(7000);
    expect(data.dataAsOf).toBe('2026-10-21T04:30:00Z');
  });

  it('rebuilds family state from the ledger and skips tombstones', () => {
    const rec = (type: LedgerRecord['type'], id: string, payload: unknown, deleted = false, updatedAt = '2026-10-20T00:00:00Z'): LedgerRecord => ({
      type, id, payload, deleted, updatedAt, updatedBy: { uid: 'x', email: 'x@y.z', role: 'owner' },
    });
    const data = fromLedgerRecords([
      rec('expense', 'a', e('a', '2026-10-03', 100, 'Shopping', { createdByEmail: 'owner@x.com', createdByRole: 'owner' })),
      rec('expense', 'b', null, true, '2026-10-21T08:00:00Z'),
      rec('expense', 'c', e('c', '2026-10-04', 50, 'Shopping', { createdByEmail: 'partner@x.com', createdByRole: 'partner' })),
      rec('limits', 'limits', { limits }),
      rec('meta', 'meta', { monthlyIncome: 80000, currency: 'AED' }),
    ], { familyId: 'fam1', role: 'partner' });
    expect(data.expenses.map((x) => x.id)).toEqual(['c', 'a']);
    expect(data.monthlyIncome).toBe(80000);
    expect(data.currency).toBe('AED');
    expect(data.limits).toHaveLength(2);
    expect(data.dataAsOf).toBe('2026-10-21T08:00:00Z');
    expect(data.family).toEqual({ familyId: 'fam1', role: 'partner' });
  });
});

describe('get_spending_summary', () => {
  it('summarises the current month and excludes card bill payments', async () => {
    const r = await run('get_spending_summary', {}, ctxFor(backup()));
    expect(r['period']).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(r['total']).toBe(6800);
    expect(r['count']).toBe(4);
    const byType = r['byType'] as { type: string; total: number; bucket: string }[];
    expect(byType[0]).toMatchObject({ type: 'Food & Groceries', total: 5500, bucket: 'Needs' });
    expect(byType.find((t) => t.type === 'Gifts')?.bucket).toBe('Buffer');
    expect(r['byBucket']).toMatchObject({ Needs: 5500, Wants: 400, Buffer: 900 });
    expect(r['previousPeriod']).toMatchObject({ from: '2026-09-01', to: '2026-09-30', total: 5000 });
    expect(r['changeVsPrevious']).toEqual({ amount: 1800, percent: 36 });
    expect(r['currency']).toBe('INR');
  });

  it('supports from/to with an equal-length previous period', async () => {
    const r = await run('get_spending_summary', { from: '2026-10-11', to: '2026-10-20' }, ctxFor(backup()));
    expect(r['total']).toBe(2500);
    expect(r['previousPeriod']).toMatchObject({ from: '2026-10-01', to: '2026-10-10', total: 3900 });
  });

  it('rejects bad input and member grouping outside family mode', async () => {
    await expect(run('get_spending_summary', { month: '2026-13' }, ctxFor(backup()))).rejects.toBeInstanceOf(McpToolError);
    await expect(run('get_spending_summary', { month: '2026-10', from: '2026-10-01' }, ctxFor(backup()))).rejects.toThrow(/either month/);
    await expect(run('get_spending_summary', { groupBy: 'member' }, ctxFor(backup()))).rejects.toThrow(/family mode/);
  });

  it('groups by family member in family mode', async () => {
    const data = { ...backup(), family: { familyId: 'f', role: 'owner' as const } };
    data.expenses = data.expenses.map((x, i) => ({ ...x, createdByEmail: i % 2 ? 'b@x.com' : 'a@x.com', createdByRole: 'owner' as const }));
    const r = await run('get_spending_summary', { groupBy: 'member' }, ctxFor(data));
    const members = r['byMember'] as { member: string; total: number }[];
    expect(members.reduce((s, m) => s + m.total, 0)).toBe(6800);
  });
});

describe('list_expenses', () => {
  it('filters, searches and pages', async () => {
    const ctx = ctxFor(backup());
    const r = await run('list_expenses', { type: 'food & groceries' }, ctx);
    expect(r['totalMatches']).toBe(2);
    expect((r['expenses'] as { id: string }[]).map((x) => x.id)).toEqual(['2', '1']);
    expect((r['expenses'] as { account?: string }[])[1].account).toBe('Savings a/c');

    const s = await run('list_expenses', { search: 'socks' }, ctx);
    expect(s['totalMatches']).toBe(1);

    const p1 = await run('list_expenses', { limit: 3 }, ctx);
    expect((p1['expenses'] as unknown[]).length).toBe(3);
    expect(p1['nextCursor']).toBe('3');
    const p2 = await run('list_expenses', { limit: 3, cursor: '3' }, ctx);
    expect((p2['expenses'] as unknown[]).length).toBe(1);
    expect(p2['nextCursor']).toBeNull();
  });
});

describe('get_budget_status', () => {
  it('compares limits with spending and adds today', async () => {
    const r = await run('get_budget_status', {}, ctxFor(backup()));
    const types = r['types'] as { type: string; limit: number; spent: number; status: string }[];
    // Food limit = 10% of 60000 = 6000; spent 5500 → 91.67% → near
    expect(types.find((t) => t.type === 'Food & Groceries')).toMatchObject({ limit: 6000, spent: 5500, status: 'near' });
    // Shopping limit = 3000; spent 400 → ok
    expect(types.find((t) => t.type === 'Shopping')).toMatchObject({ limit: 3000, spent: 400, status: 'ok' });
    expect(r['unbudgetedSpending']).toEqual([{ type: 'Gifts', spent: 900 }]);
    expect(r['today']).toEqual({ date: '2026-10-21', dailyBudget: 2000, spentToday: 400, remainingToday: 1600 });
    const needs = (r['buckets'] as { bucket: string; spent: number; target: number }[]).find((b) => b.bucket === 'Needs');
    expect(needs).toMatchObject({ spent: 5500, target: 6000 });
  });

  it('has no today block for a past month', async () => {
    const r = await run('get_budget_status', { month: '2026-09' }, ctxFor(backup()));
    expect(r['today']).toBeUndefined();
    expect(r['totalSpent']).toBe(5000);
  });
});

describe('get_debts_and_dues', () => {
  it('reports cards with the app maths and loans due in the window', async () => {
    const data = backup();
    const r = await run('get_debts_and_dues', { days: 30 }, ctxFor(data));
    const expected = cardCycleState(data.debts[0], { entries: data.expenses, adjustments: data.debtAdjustments, payments: data.debtPayments }, NOW);
    const cards = r['creditCards'] as Record<string, unknown>[];
    expect(cards[0]).toMatchObject({ name: 'HDFC Card', last4: '1234', outstanding: expected.totalOutstanding, billDue: expected.billDue, dueDate: expected.dueDateStr });
    const loans = r['loans'] as Record<string, unknown>[];
    expect(loans[0]).toMatchObject({ name: 'Car loan', monthlyEmi: 12000, nextDueDate: '2026-11-05', daysUntilDue: 15 });
    const due = r['dueSoon'] as { name: string; dueDate: string }[];
    expect(due.some((d) => d.name === 'Car loan')).toBe(true);
    expect(due.map((d) => d.dueDate)).toEqual([...due.map((d) => d.dueDate)].sort());
  });

  it('leaves loans outside the window out of dueSoon', async () => {
    const r = await run('get_debts_and_dues', { days: 7 }, ctxFor(backup()));
    expect((r['dueSoon'] as { name: string }[]).some((d) => d.name === 'Car loan')).toBe(false);
  });
});

describe('get_circle_balances', () => {
  const circle: CircleDocument = {
    circleId: 'c1', name: 'Goa trip', currency: 'INR', ownerUid: 'other', ownerEmail: 'o@x.com',
    members: {
      m1: { memberId: 'm1', name: 'Asha', uid: 'other', email: 'o@x.com', joinedAt: null },
      m2: { memberId: 'm2', name: 'Me', uid: 'me-uid', email: 'me@x.com', joinedAt: null },
    },
    memberUids: ['other', 'me-uid'], status: 'active', createdAt: '', updatedAt: '', settledAt: null,
  };
  const exp: CircleExpense = {
    expenseId: 'x1', circleId: 'c1', description: 'Hotel', amount: 3000, date: '2026-10-10',
    paidByMemberId: 'm1', participantMemberIds: ['m1', 'm2'], authorUid: 'other', createdAt: '', updatedAt: '', deleted: false,
  };

  it('shows what I owe and the transfer', async () => {
    const r = await run('get_circle_balances', {}, ctxFor(backup(), [{ circle, expenses: [exp] }]));
    const c = (r['circles'] as Record<string, any>[])[0];
    expect(c['you']).toMatchObject({ name: 'Me', net: -1500, summary: 'you owe' });
    expect(c['settlement']).toEqual([{ from: 'Me', to: 'Asha', amount: 1500, involvesYou: true }]);
    expect(c['totalSpent']).toBe(3000);
  });

  it('hides settled circles unless asked', async () => {
    const settled = { circle: { ...circle, status: 'settled' as const }, expenses: [exp] };
    expect((await run('get_circle_balances', {}, ctxFor(backup(), [settled])))['circles']).toEqual([]);
    expect(((await run('get_circle_balances', { includeSettled: true }, ctxFor(backup(), [settled])))['circles'] as unknown[]).length).toBe(1);
  });
});

describe('protocol', () => {
  const rc = (pro = true): RequestContext => ({
    tool: async () => ctxFor(backup()),
    requirePro: async () => { if (!pro) throw new McpToolError('NOT_PRO', 'Pro needed'); },
  });

  it('negotiates the protocol version', async () => {
    const known = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, rc());
    expect((known as any).result.protocolVersion).toBe('2025-03-26');
    const unknown = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, rc());
    expect((unknown as any).result.protocolVersion).toBe('2025-06-18');
    expect((unknown as any).result.capabilities.tools).toBeDefined();
  });

  it('never answers notifications', async () => {
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, rc())).toBeNull();
  });

  it('lists only read-only tools', async () => {
    const r = (await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, rc())) as any;
    expect(r.result.tools.map((t: any) => t.name)).toEqual([
      'get_spending_summary', 'list_expenses', 'get_budget_status', 'get_debts_and_dues', 'get_circle_balances',
    ]);
    expect(r.result.tools.every((t: any) => t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false)).toBe(true);
  });

  it('calls a tool and returns text + structured content', async () => {
    const r = (await handleRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_spending_summary', arguments: {} } }, rc())) as any;
    expect(r.result.isError).toBeUndefined();
    expect(r.result.structuredContent.total).toBe(6800);
    expect(JSON.parse(r.result.content[0].text).total).toBe(6800);
  });

  it('returns NOT_PRO as a tool error the model can explain', async () => {
    const r = (await handleRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_expenses' } }, rc(false))) as any;
    expect(r.result.isError).toBe(true);
    expect(r.result.structuredContent.error).toBe('NOT_PRO');
  });

  it('reports unknown tools, methods and malformed messages', async () => {
    expect(((await handleRpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'add_expense' } }, rc())) as any).error.code).toBe(-32602);
    expect(((await handleRpc({ jsonrpc: '2.0', id: 7, method: 'nope' }, rc())) as any).error.code).toBe(-32601);
    expect(((await handleRpc({ id: 8 }, rc())) as any).error.code).toBe(-32600);
  });

  it('serves resources and the monthly review prompt', async () => {
    const res = (await handleRpc({ jsonrpc: '2.0', id: 9, method: 'resources/read', params: { uri: 'spenza://settings' } }, rc())) as any;
    expect(JSON.parse(res.result.contents[0].text)).toMatchObject({ currency: 'INR', today: '2026-10-21', mode: 'single' });
    const cats = (await handleRpc({ jsonrpc: '2.0', id: 10, method: 'resources/read', params: { uri: 'spenza://categories' } }, rc())) as any;
    expect(JSON.parse(cats.result.contents[0].text).yourLimits).toHaveLength(2);
    const p = (await handleRpc({ jsonrpc: '2.0', id: 11, method: 'prompts/get', params: { name: 'monthly_review', arguments: { month: '2026-09' } } }, rc())) as any;
    expect(p.result.messages[0].content.text).toContain('2026-09');
  });
});

describe('zonedNow', () => {
  it('gives the user\'s wall clock, not the server\'s', () => {
    // 20:00 UTC on 21 Oct = 01:30 on 22 Oct in India
    const d = zonedNow('Asia/Kolkata', Date.UTC(2026, 9, 21, 20, 0, 0));
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 22, 1, 30]);
  });
});
