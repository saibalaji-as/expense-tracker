/**
 * Firestore: families/{familyId}
 * Written by Firebase Function only. Clients read-only.
 */
export interface FamilyDocument {
  familyId: string;           // same as the document ID
  ownerUid: string;           // Firebase UID of the owner
  partnerUid: string | null;  // Firebase UID of the partner once joined
  ownerEmail: string;         // display only
  partnerEmail: string | null;
  createdAt: string;          // ISO timestamp
  updatedAt: string;
  status: 'active' | 'dissolved';
}

/**
 * Which entity type a family activity delta refers to.
 * Absent in old delta documents — treat absent as 'expense'.
 */
export type FamilyDeltaType =
  | 'expense'
  | 'account'
  | 'accountAdjustment'
  | 'debt'
  | 'debtPayment'
  | 'limits';

/**
 * Firestore: families/{familyId}/activity/{activityId}
 * Written by the client (owner or partner).
 * Each document is one entity delta — create, update, or delete.
 *
 * dataType discriminates which entity this delta affects.
 * entityId is the primary key of the affected entity (for 'limits' use 'global').
 * expenseId is kept for backward compat with old expense-only deltas.
 */
export interface FamilyActivityDelta {
  activityId: string;           // same as document ID
  familyId: string;
  authorUid: string;            // Firebase UID of who made the change
  authorEmail: string;
  authorRole: 'owner' | 'partner';
  action: 'create' | 'update' | 'delete';
  dataType?: FamilyDeltaType;   // absent in old docs → treat as 'expense'
  entityId?: string;            // primary key of the affected entity
  expenseId?: string;           // backward compat — equals entityId for expense deltas
  payload: Record<string, unknown> | null; // null for delete
  timestamp: string;            // ISO timestamp — used for ordering
  clientWrittenAt: string;      // when the client sent this (for conflict detection)
}

/**
 * Firestore: familyInvites/{inviteCode}
 * Short-lived invite. Written by Firebase Function, redeemed once.
 */
export interface FamilyInvite {
  inviteCode: string;         // document ID — 8-char uppercase alphanumeric
  familyId: string;
  ownerUid: string;
  ownerEmail: string;
  expiresAt: string;          // ISO timestamp — 24 hours from creation
  redeemedAt: string | null;
  redeemedByUid: string | null;
}
