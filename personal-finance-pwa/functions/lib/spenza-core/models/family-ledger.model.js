"use strict";
// GENERATED from src/app/core/models/family-ledger.model.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
/**
 * Family Ledger — record-level Firestore sync (docs/family-sync-centralization-plan.md).
 *
 * One shared record = one Firestore document at `families/{familyId}/ledger/{type:id}`.
 * All writes are idempotent upserts; deletions are tombstones (`deleted: true`).
 * This replaces the single full-state document at `families/{id}/state/current`
 * (kept read-only for one-time migration).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEDGER_META_ID = exports.LEDGER_LIMITS_ID = void 0;
exports.ledgerDocId = ledgerDocId;
/** Singleton record ids. */
exports.LEDGER_LIMITS_ID = 'limits';
exports.LEDGER_META_ID = 'meta';
/** Firestore document id for a record ('/' is the only forbidden character). */
function ledgerDocId(type, id) {
    return `${type}:${id.replace(/\//g, '_')}`;
}
//# sourceMappingURL=family-ledger.model.js.map