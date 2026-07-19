/**
 * Circle Splits — group expense sharing (trip settlement).
 * Design/decisions: docs/circle-splits-plan.md
 *
 * A Circle is an N-member shared expense group synced through Firestore.
 * Circle expenses NEVER enter the personal `expenses[]` array — only the
 * user's own per-head share is posted as one ExpenseEntry on Settle Up
 * (`source: 'circle-settle'`). See plan §1 "Budget integrity rule".
 */

export interface CircleMember {
  memberId: string;
  /** Display name — placeholder name until the seat is claimed. */
  name: string;
  /** Firebase uid once the seat is claimed via a Circle Link; null for placeholders. */
  uid: string | null;
  email: string | null;
  joinedAt: string | null;
}

export type CircleStatus = 'active' | 'settled';

export interface CircleDocument {
  circleId: string;
  name: string;
  emoji?: string;
  /** Creator's app currency at creation time (e.g. 'INR'). */
  currency: string;
  ownerUid: string;
  ownerEmail: string;
  members: Record<string, CircleMember>;
  /** Claimed member uids — mirrors members[*].uid; used by rules + queries. */
  memberUids: string[];
  status: CircleStatus;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
}

export interface CircleExpense {
  expenseId: string;
  circleId: string;
  description: string;
  /** Positive decimal in circle currency. */
  amount: number;
  /** Local date YYYY-MM-DD. */
  date: string;
  /** Who paid — may be an unclaimed placeholder member. */
  paidByMemberId: string;
  /** Equal split among these members (>= 1). */
  participantMemberIds: string[];
  /** Who logged the record — Firestore write ownership. */
  authorUid: string;
  createdAt: string;
  updatedAt: string;
  /** Tombstone — documents are never deleted. */
  deleted: boolean;
}

export interface CircleInvite {
  code: string;
  circleId: string;
  ownerUid: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

/** Capacitor Preferences key holding a Circle Link code captured before sign-in. */
export const PENDING_CIRCLE_JOIN_KEY = 'spenza_pending_circle_join_v1';

/** ExpenseEntry.source tag for the per-head share auto-logged on Settle Up. */
export const CIRCLE_SETTLE_EXPENSE_SOURCE = 'circle-settle';

/**
 * Capacitor Preferences cache of the signed-in user's ACTIVE circles, written
 * by CircleSyncService. Read by the native Android widget (Java) to show the
 * "Circle expense" checkbox + circle name label — the widget cannot reach
 * Firestore. Schema: { email, circles: ActiveCircleCacheItem[] }.
 */
export const ACTIVE_CIRCLES_CACHE_KEY = 'spenza_active_circles_v1';

export interface ActiveCircleCacheItem {
  circleId: string;
  name: string;
  /** The cache owner's member seat in this circle. */
  myMemberId: string;
  memberIds: string[];
}

/** Base URL used to build shareable Circle Links. */
export const CIRCLE_LINK_BASE = 'https://spenza.site';

export function buildCircleLink(inviteCode: string): string {
  return `${CIRCLE_LINK_BASE}/#/join/${inviteCode}`;
}
