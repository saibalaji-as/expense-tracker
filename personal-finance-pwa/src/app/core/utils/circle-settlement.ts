/**
 * Circle Splits settlement engine — PURE functions, no Angular imports.
 * Design: docs/circle-splits-plan.md §6.
 *
 * All arithmetic is done in integer paise (amount * 100) so every member's
 * device computes byte-identical results. Equal-split rounding remainders are
 * distributed deterministically: participants sorted by memberId, the first
 * `remainder` of them carry one extra paisa.
 */

import type { CircleExpense, CircleMember } from '../models/circle.model';

export interface MemberBalance {
  memberId: string;
  /** Total paid on behalf of the group, in currency units. */
  paid: number;
  /** Total per-head share owed across expenses participated in, in currency units. */
  share: number;
  /** paid - share. Positive: should receive. Negative: owes. */
  net: number;
}

export interface SettlementTransfer {
  fromMemberId: string;
  toMemberId: string;
  /** Currency units, always > 0. */
  amount: number;
}

const toPaise = (amount: number): number => Math.round(amount * 100);
const fromPaise = (paise: number): number => paise / 100;

/**
 * Per-participant equal-split shares of ONE expense, in paise. Participants
 * are deduped, restricted to `validMemberIds`, and sorted by memberId; the
 * first `remainder` participants carry one extra paisa — identical logic on
 * every device.
 */
function expenseSharesPaise(
  expense: CircleExpense,
  validMemberIds: ReadonlySet<string>,
): Map<string, number> {
  const shares = new Map<string, number>();
  const participants = [...new Set(expense.participantMemberIds)]
    .filter((id) => validMemberIds.has(id))
    .sort();
  if (participants.length === 0) return shares;
  const totalPaise = toPaise(expense.amount);
  if (!Number.isFinite(totalPaise) || totalPaise <= 0) return shares;
  const base = Math.floor(totalPaise / participants.length);
  const remainder = totalPaise - base * participants.length;
  participants.forEach((memberId, index) => {
    shares.set(memberId, base + (index < remainder ? 1 : 0));
  });
  return shares;
}

/** One member's per-head share of a single expense, in currency units. */
export function computeMyShareOfExpense(
  memberId: string,
  expense: CircleExpense,
  members: CircleMember[],
): number {
  if (expense.deleted) return 0;
  const valid = new Set(members.map((m) => m.memberId));
  return fromPaise(expenseSharesPaise(expense, valid).get(memberId) ?? 0);
}

/**
 * Sum of the member's shares across non-deleted expenses that OTHERS paid.
 * This is what gets posted to the personal budget on Settle Up — the member's
 * own paid bills are trued-up in place instead (plan §true-up).
 */
export function computeShareOwedToOthers(
  memberId: string,
  members: CircleMember[],
  expenses: CircleExpense[],
): number {
  const valid = new Set(members.map((m) => m.memberId));
  let paise = 0;
  for (const expense of expenses) {
    if (expense.deleted || expense.paidByMemberId === memberId) continue;
    paise += expenseSharesPaise(expense, valid).get(memberId) ?? 0;
  }
  return fromPaise(paise);
}

/**
 * Per-member paid/share/net over the non-deleted expenses.
 * Members with no activity still appear with zeros so the UI can render
 * everyone consistently.
 */
export function computeMemberBalances(
  members: CircleMember[],
  expenses: CircleExpense[],
): MemberBalance[] {
  const paidPaise = new Map<string, number>();
  const sharePaise = new Map<string, number>();
  for (const m of members) {
    paidPaise.set(m.memberId, 0);
    sharePaise.set(m.memberId, 0);
  }

  const valid = new Set(members.map((m) => m.memberId));
  for (const expense of expenses) {
    if (expense.deleted) continue;
    const shares = expenseSharesPaise(expense, valid);
    if (shares.size === 0) continue;

    if (paidPaise.has(expense.paidByMemberId)) {
      paidPaise.set(expense.paidByMemberId, paidPaise.get(expense.paidByMemberId)! + toPaise(expense.amount));
    }
    for (const [memberId, share] of shares) {
      sharePaise.set(memberId, sharePaise.get(memberId)! + share);
    }
  }

  return members.map((m) => {
    const paid = paidPaise.get(m.memberId) ?? 0;
    const share = sharePaise.get(m.memberId) ?? 0;
    return {
      memberId: m.memberId,
      paid: fromPaise(paid),
      share: fromPaise(share),
      net: fromPaise(paid - share),
    };
  });
}

/**
 * Greedy minimal-transfer settlement: repeatedly matches the largest debtor
 * with the largest creditor. Produces at most (n - 1) transfers.
 * Ties broken by memberId so output ordering is deterministic on every device.
 */
export function computeSettlementTransfers(balances: MemberBalance[]): SettlementTransfer[] {
  const creditors: { memberId: string; paise: number }[] = [];
  const debtors: { memberId: string; paise: number }[] = [];

  for (const b of balances) {
    const paise = toPaise(b.net);
    if (paise > 0) creditors.push({ memberId: b.memberId, paise });
    else if (paise < 0) debtors.push({ memberId: b.memberId, paise: -paise });
  }

  const byAmountThenId = (
    a: { memberId: string; paise: number },
    b: { memberId: string; paise: number },
  ) => b.paise - a.paise || a.memberId.localeCompare(b.memberId);

  creditors.sort(byAmountThenId);
  debtors.sort(byAmountThenId);

  const transfers: SettlementTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const paise = Math.min(creditor.paise, debtor.paise);
    if (paise > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: fromPaise(paise),
      });
    }
    creditor.paise -= paise;
    debtor.paise -= paise;
    if (creditor.paise === 0) ci++;
    if (debtor.paise === 0) di++;
  }
  return transfers;
}

/**
 * The given member's own per-head share total (what should be posted to their
 * personal budget on Settle Up), in currency units.
 */
export function computeMyShare(
  memberId: string,
  members: CircleMember[],
  expenses: CircleExpense[],
): number {
  const balance = computeMemberBalances(members, expenses).find((b) => b.memberId === memberId);
  return balance ? balance.share : 0;
}

/**
 * Plain-text settlement summary for sharing (WhatsApp etc.).
 * `formatAmount` lets the caller apply the app currency formatting.
 */
export function buildShareSummaryText(
  circleName: string,
  members: CircleMember[],
  expenses: CircleExpense[],
  formatAmount: (amount: number) => string,
): string {
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));
  const balances = computeMemberBalances(members, expenses);
  const transfers = computeSettlementTransfers(balances);
  const active = expenses.filter((e) => !e.deleted);
  const total = fromPaise(active.reduce((sum, e) => sum + toPaise(e.amount), 0));

  const lines: string[] = [
    `${circleName} — Spenza Splits`,
    `Total spent: ${formatAmount(total)} across ${active.length} expense${active.length === 1 ? '' : 's'}`,
    '',
    'Balances:',
    ...balances.map((b) => {
      const name = nameOf.get(b.memberId) ?? b.memberId;
      if (b.net > 0) return `• ${name} gets back ${formatAmount(b.net)}`;
      if (b.net < 0) return `• ${name} owes ${formatAmount(-b.net)}`;
      return `• ${name} is settled`;
    }),
  ];
  if (transfers.length > 0) {
    lines.push('', 'Settle up:');
    lines.push(
      ...transfers.map(
        (t) =>
          `• ${nameOf.get(t.fromMemberId) ?? t.fromMemberId} → ${nameOf.get(t.toMemberId) ?? t.toMemberId}: ${formatAmount(t.amount)}`,
      ),
    );
  }
  return lines.join('\n');
}
