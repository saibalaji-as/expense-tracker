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
 * Firestore: families/{familyId}/activity/{activityId}
 * Written by client (owner or partner) via Firebase Function.
 * Each document is one expense delta — create, update, or delete.
 */
export interface FamilyActivityDelta {
  activityId: string;         // same as document ID
  familyId: string;
  authorUid: string;          // Firebase UID of who made the change
  authorEmail: string;
  authorRole: 'owner' | 'partner';
  action: 'create' | 'update' | 'delete';
  expenseId: string;          // the ExpenseEntry.id this delta refers to
  payload: ExpenseDeltaPayload | null; // null for delete
  timestamp: string;          // ISO timestamp — used for ordering
  clientWrittenAt: string;    // when the client sent this (for conflict detection)
}

/**
 * The expense data carried in a delta.
 * Matches the shape of ExpenseEntry exactly.
 */
export interface ExpenseDeltaPayload {
  id: string;
  date: string;
  amount: number;
  type: string;
  limit: number;
  savings: number;
  timestamp: string;
  comment?: string;
  accountId?: string;
  source?: string;
  createdByEmail?: string;
  createdByRole?: string;
  updatedByEmail?: string;
  updatedByRole?: string;
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
