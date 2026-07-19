import { describe, expect, it } from 'vitest';
import type { CircleExpense, CircleMember } from '../models/circle.model';
import {
  buildShareSummaryText,
  computeMemberBalances,
  computeMyShare,
  computeMyShareOfExpense,
  computeSettlementTransfers,
  computeShareOwedToOthers,
} from './circle-settlement';

function member(memberId: string, name = memberId): CircleMember {
  return { memberId, name, uid: null, email: null, joinedAt: null };
}

function expense(partial: Partial<CircleExpense> & Pick<CircleExpense, 'amount' | 'paidByMemberId' | 'participantMemberIds'>): CircleExpense {
  return {
    expenseId: partial.expenseId ?? 'e1',
    circleId: 'c1',
    description: partial.description ?? 'Test',
    date: partial.date ?? '2026-07-19',
    authorUid: 'u1',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    deleted: partial.deleted ?? false,
    ...partial,
  };
}

const abc = [member('a'), member('b'), member('c')];

describe('computeMemberBalances', () => {
  it('splits an expense equally among participants', () => {
    const balances = computeMemberBalances(abc, [
      expense({ amount: 300, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'] }),
    ]);
    expect(balances).toEqual([
      { memberId: 'a', paid: 300, share: 100, net: 200 },
      { memberId: 'b', paid: 0, share: 100, net: -100 },
      { memberId: 'c', paid: 0, share: 100, net: -100 },
    ]);
  });

  it('distributes rounding remainder deterministically by memberId sort', () => {
    const balances = computeMemberBalances(abc, [
      expense({ amount: 100, paidByMemberId: 'a', participantMemberIds: ['c', 'b', 'a'] }),
    ]);
    // 10000 paise / 3 = 3333 r1 → 'a' (first by sort) carries the extra paisa.
    expect(balances.find((b) => b.memberId === 'a')!.share).toBe(33.34);
    expect(balances.find((b) => b.memberId === 'b')!.share).toBe(33.33);
    expect(balances.find((b) => b.memberId === 'c')!.share).toBe(33.33);
    const totalShare = balances.reduce((s, b) => s + b.share, 0);
    expect(totalShare).toBeCloseTo(100, 10);
  });

  it('supports partial participation (payer not participating)', () => {
    const balances = computeMemberBalances(abc, [
      expense({ amount: 200, paidByMemberId: 'a', participantMemberIds: ['b', 'c'] }),
    ]);
    expect(balances).toEqual([
      { memberId: 'a', paid: 200, share: 0, net: 200 },
      { memberId: 'b', paid: 0, share: 100, net: -100 },
      { memberId: 'c', paid: 0, share: 100, net: -100 },
    ]);
  });

  it('ignores tombstoned expenses, unknown participants, and non-positive amounts', () => {
    const balances = computeMemberBalances(abc, [
      expense({ amount: 300, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'], deleted: true }),
      expense({ expenseId: 'e2', amount: 90, paidByMemberId: 'a', participantMemberIds: ['ghost', 'b', 'c'] }),
      expense({ expenseId: 'e3', amount: 0, paidByMemberId: 'b', participantMemberIds: ['a', 'b'] }),
      expense({ expenseId: 'e4', amount: -5, paidByMemberId: 'b', participantMemberIds: ['a', 'b'] }),
    ]);
    // e2: 90 split between b and c only (ghost dropped).
    expect(balances).toEqual([
      { memberId: 'a', paid: 90, share: 0, net: 90 },
      { memberId: 'b', paid: 0, share: 45, net: -45 },
      { memberId: 'c', paid: 0, share: 45, net: -45 },
    ]);
  });

  it('deduplicates repeated participant ids', () => {
    const balances = computeMemberBalances(abc, [
      expense({ amount: 100, paidByMemberId: 'a', participantMemberIds: ['a', 'a', 'b'] }),
    ]);
    expect(balances.find((b) => b.memberId === 'a')!.share).toBe(50);
    expect(balances.find((b) => b.memberId === 'b')!.share).toBe(50);
  });

  it('nets across multiple expenses with different payers', () => {
    const balances = computeMemberBalances(abc, [
      expense({ expenseId: 'e1', amount: 3000, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'] }),
      expense({ expenseId: 'e2', amount: 600, paidByMemberId: 'b', participantMemberIds: ['a', 'b', 'c'] }),
      expense({ expenseId: 'e3', amount: 900, paidByMemberId: 'c', participantMemberIds: ['a', 'b', 'c'] }),
    ]);
    // total 4500, per head 1500.
    expect(balances).toEqual([
      { memberId: 'a', paid: 3000, share: 1500, net: 1500 },
      { memberId: 'b', paid: 600, share: 1500, net: -900 },
      { memberId: 'c', paid: 900, share: 1500, net: -600 },
    ]);
  });
});

describe('computeSettlementTransfers', () => {
  it('produces minimal transfers matching largest debtor to largest creditor', () => {
    const balances = computeMemberBalances(abc, [
      expense({ expenseId: 'e1', amount: 3000, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'] }),
      expense({ expenseId: 'e2', amount: 600, paidByMemberId: 'b', participantMemberIds: ['a', 'b', 'c'] }),
      expense({ expenseId: 'e3', amount: 900, paidByMemberId: 'c', participantMemberIds: ['a', 'b', 'c'] }),
    ]);
    const transfers = computeSettlementTransfers(balances);
    expect(transfers).toEqual([
      { fromMemberId: 'b', toMemberId: 'a', amount: 900 },
      { fromMemberId: 'c', toMemberId: 'a', amount: 600 },
    ]);
  });

  it('returns no transfers when everyone is settled', () => {
    const balances = computeMemberBalances(abc, [
      expense({ amount: 300, paidByMemberId: 'a', participantMemberIds: ['a'] }),
    ]);
    expect(computeSettlementTransfers(balances)).toEqual([]);
  });

  it('conserves money: total sent equals total received equals positive nets', () => {
    const members = [member('a'), member('b'), member('c'), member('d'), member('e')];
    const expenses = [
      expense({ expenseId: 'e1', amount: 1234.56, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c', 'd', 'e'] }),
      expense({ expenseId: 'e2', amount: 789.01, paidByMemberId: 'b', participantMemberIds: ['a', 'b', 'c'] }),
      expense({ expenseId: 'e3', amount: 55.5, paidByMemberId: 'c', participantMemberIds: ['d', 'e'] }),
      expense({ expenseId: 'e4', amount: 999.99, paidByMemberId: 'd', participantMemberIds: ['a', 'b', 'c', 'd', 'e'] }),
    ];
    const balances = computeMemberBalances(members, expenses);
    const transfers = computeSettlementTransfers(balances);

    const totalNet = balances.reduce((s, b) => s + Math.round(b.net * 100), 0);
    expect(totalNet).toBe(0);

    const positiveNets = balances
      .filter((b) => b.net > 0)
      .reduce((s, b) => s + Math.round(b.net * 100), 0);
    const totalTransferred = transfers.reduce((s, t) => s + Math.round(t.amount * 100), 0);
    expect(totalTransferred).toBe(positiveNets);
    // At most n-1 transfers.
    expect(transfers.length).toBeLessThanOrEqual(members.length - 1);
  });
});

describe('computeMyShare', () => {
  it('returns the member per-head share and 0 for unknown members', () => {
    const expenses = [
      expense({ amount: 300, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'] }),
    ];
    expect(computeMyShare('b', abc, expenses)).toBe(100);
    expect(computeMyShare('nope', abc, expenses)).toBe(0);
  });
});

describe('computeMyShareOfExpense', () => {
  it('returns the per-head share with deterministic rounding', () => {
    const e = expense({ amount: 100, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'] });
    expect(computeMyShareOfExpense('a', e, abc)).toBe(33.34);
    expect(computeMyShareOfExpense('b', e, abc)).toBe(33.33);
  });

  it('returns 0 for non-participants and deleted expenses', () => {
    const e = expense({ amount: 100, paidByMemberId: 'a', participantMemberIds: ['a', 'b'] });
    expect(computeMyShareOfExpense('c', e, abc)).toBe(0);
    expect(computeMyShareOfExpense('a', { ...e, deleted: true }, abc)).toBe(0);
  });
});

describe('computeShareOwedToOthers', () => {
  it('sums shares of others-paid expenses only', () => {
    const expenses = [
      // a paid: a owes nothing here.
      expense({ expenseId: 'e1', amount: 300, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'] }),
      // b paid: a's share 200.
      expense({ expenseId: 'e2', amount: 600, paidByMemberId: 'b', participantMemberIds: ['a', 'b', 'c'] }),
      // c paid, a not participating: nothing.
      expense({ expenseId: 'e3', amount: 100, paidByMemberId: 'c', participantMemberIds: ['b', 'c'] }),
      // deleted: ignored.
      expense({ expenseId: 'e4', amount: 900, paidByMemberId: 'b', participantMemberIds: ['a', 'b'], deleted: true }),
    ];
    expect(computeShareOwedToOthers('a', abc, expenses)).toBe(200);
    // Consistency: trued-up own share + owed-to-others == total share from balances.
    const total = computeMyShare('a', abc, expenses);
    const ownPaidShare = computeMyShareOfExpense('a', expenses[0], abc);
    expect(ownPaidShare + computeShareOwedToOthers('a', abc, expenses)).toBeCloseTo(total, 10);
  });
});

describe('buildShareSummaryText', () => {
  it('renders totals, balances, and transfers with the provided formatter', () => {
    const text = buildShareSummaryText(
      'Goa Trip',
      abc,
      [
        expense({ expenseId: 'e1', amount: 3000, paidByMemberId: 'a', participantMemberIds: ['a', 'b', 'c'] }),
        expense({ expenseId: 'e2', amount: 600, paidByMemberId: 'b', participantMemberIds: ['a', 'b', 'c'] }),
        expense({ expenseId: 'e3', amount: 900, paidByMemberId: 'c', participantMemberIds: ['a', 'b', 'c'] }),
        expense({ expenseId: 'e4', amount: 100, paidByMemberId: 'a', participantMemberIds: ['a'], deleted: true }),
      ],
      (n) => `₹${n}`,
    );
    expect(text).toContain('Goa Trip — Spenza Splits');
    expect(text).toContain('Total spent: ₹4500 across 3 expenses');
    expect(text).toContain('• a gets back ₹1500');
    expect(text).toContain('• b owes ₹900');
    expect(text).toContain('• b → a: ₹900');
    expect(text).toContain('• c → a: ₹600');
  });
});
