"use strict";
// GENERATED from src/app/core/models/circle.model.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
/**
 * Circle Splits — group expense sharing (trip settlement).
 * Design/decisions: docs/circle-splits-plan.md
 *
 * A Circle is an N-member shared expense group synced through Firestore.
 * Circle expenses NEVER enter the personal `expenses[]` array — only the
 * user's own per-head share is posted as one ExpenseEntry on Settle Up
 * (`source: 'circle-settle'`). See plan §1 "Budget integrity rule".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CIRCLE_LINK_BASE = exports.ACTIVE_CIRCLES_CACHE_KEY = exports.CIRCLE_SETTLE_LOGGED_KEY = exports.CIRCLE_SETTLE_EXPENSE_SOURCE = exports.PENDING_CIRCLE_JOIN_KEY = void 0;
exports.familyKeyOf = familyKeyOf;
exports.buildCircleLink = buildCircleLink;
/** The member's settlement-group key: their family head, or themselves. */
function familyKeyOf(member) {
    return member.familyHeadMemberId ?? member.memberId;
}
/** Capacitor Preferences key holding a Circle Link code captured before sign-in. */
exports.PENDING_CIRCLE_JOIN_KEY = 'spenza_pending_circle_join_v1';
/** ExpenseEntry.source tag for the per-head share auto-logged on Settle Up. */
exports.CIRCLE_SETTLE_EXPENSE_SOURCE = 'circle-settle';
/**
 * Capacitor Preferences key — circles whose settle share THIS device already
 * auto-logged, as `${uid}:${circleId}` strings. Persistent on purpose: the
 * entry-comment scan alone re-logged the share after the user deleted the
 * auto-logged Daily expense (delete → next app start → scan finds nothing →
 * duplicate). A deletion is a user decision; it must stay deleted.
 */
exports.CIRCLE_SETTLE_LOGGED_KEY = 'spenza_circle_settle_logged_v1';
/**
 * Capacitor Preferences cache of the signed-in user's ACTIVE circles, written
 * by CircleSyncService. Read by the native Android widget (Java) to show the
 * "Circle expense" checkbox + circle name label — the widget cannot reach
 * Firestore. Schema: { email, circles: ActiveCircleCacheItem[] }.
 */
exports.ACTIVE_CIRCLES_CACHE_KEY = 'spenza_active_circles_v1';
/** Base URL used to build shareable Circle Links. */
exports.CIRCLE_LINK_BASE = 'https://spenza.site';
function buildCircleLink(inviteCode) {
    return `${exports.CIRCLE_LINK_BASE}/#/join/${inviteCode}`;
}
//# sourceMappingURL=circle.model.js.map