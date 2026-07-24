import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

/**
 * Widget two-way sync (docs/family-sync-centralization-plan.md §8).
 *
 * Fires on every family-ledger record write and forwards EXPENSE records to the
 * OTHER family member's native devices as a high-priority FCM DATA message.
 * `MyFirebaseMessagingService` stores it in a device-local, display-only
 * "partner pending" overlay that the home-screen widget reads alongside the
 * snapshot and the local queue — so a partner's expense shows up on the widget
 * within seconds, without the app ever opening.
 *
 * STRICTLY DISPLAY-ONLY on the receiving side: the overlay never touches the
 * queue, the snapshot doc, or any authoritative state. Real sync still happens
 * exclusively through the app's ledger listener (single write path — see
 * AI_RULES). Old records (expense date > 7 days back) are not forwarded:
 * the widget only renders today/yesterday, and this caps the FCM burst from
 * bulk reconcile/migration pushes.
 */

const FRESH_DAYS = 7;
const MAX_DATA_BYTES = 3500; // FCM data limit is 4 KB — leave headroom

function isFreshDate(date: unknown): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const cutoff = new Date(Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return date >= cutoffDate;
}

export const notifyPartnerLedgerWrite = onDocumentWritten(
  'families/{familyId}/ledger/{recordId}',
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // ledger docs are never deleted (tombstones only)
    const record = after.data() as {
      type?: string;
      id?: string;
      deleted?: boolean;
      payload?: Record<string, unknown> | null;
      updatedAt?: string;
      updatedBy?: { uid?: string; email?: string; role?: string };
    };
    if (record?.type !== 'expense' || !record.id) return; // widget shows spend only

    const deleted = record.deleted === true;
    // Skip stale history (bulk reconcile/migration) — but always forward
    // tombstones, so a deletion drops off the partner's widget total.
    if (!deleted && !isFreshDate(record.payload?.['date'])) return;

    const writerUid = record.updatedBy?.uid ?? '';
    const db = admin.firestore();
    const familySnap = await db.collection('families').doc(event.params.familyId).get();
    const family = familySnap.data();
    if (!family || family['status'] === 'dissolved') return;

    const targetUids = [family['ownerUid'], family['partnerUid']]
      .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0 && uid !== writerUid);
    if (targetUids.length === 0) return;

    // Keep doc refs alongside tokens so dead registrations can be pruned below.
    const tokenEntries: { token: string; ref: FirebaseFirestore.DocumentReference }[] = [];
    for (const uid of targetUids) {
      const registrations = await db.collection('users')
        .where('ownerUid', '==', uid)
        .where('platform', '==', 'native')
        .get();
      for (const doc of registrations.docs) {
        const token = doc.data()['fcmToken'];
        if (typeof token === 'string' && token.length > 0) tokenEntries.push({ token, ref: doc.ref });
      }
    }
    if (tokenEntries.length === 0) {
      // Partner device has no live registration (toggle never enabled, or a
      // rotated token was pruned and the app hasn't re-registered yet).
      console.warn('notifyPartnerLedgerWrite: no native FCM tokens for', targetUids);
      return;
    }

    const recordJson = JSON.stringify({
      id: record.id,
      deleted,
      entry: deleted ? null : record.payload,
      updatedAt: record.updatedAt ?? '',
      updatedByEmail: record.updatedBy?.email ?? '',
    });
    if (Buffer.byteLength(recordJson, 'utf8') > MAX_DATA_BYTES) return;

    const result = await admin.messaging().sendEachForMulticast({
      tokens: tokenEntries.map((t) => t.token),
      android: { priority: 'high' },
      data: { spenzaKind: 'family-ledger-record', record: recordJson },
    });
    if (result.failureCount > 0) {
      console.warn('notifyPartnerLedgerWrite: some sends failed:',
        result.responses.filter((r) => !r.success).map((r) => r.error?.code));

      // Self-heal the registry: clear tokens FCM says are dead so stale
      // registrations can't mask "no live token" forever. The client
      // re-registers on next app launch (ensureNativeTokenFresh).
      // `invalid-argument` is only trusted as a bad-token signal when the same
      // payload succeeded for at least one other token.
      const prunes: Promise<unknown>[] = [];
      result.responses.forEach((response, index) => {
        if (response.success) return;
        const code = response.error?.code ?? '';
        const deadToken =
          code === 'messaging/registration-token-not-registered' ||
          (code === 'messaging/invalid-argument' && result.successCount > 0);
        if (!deadToken) return;
        prunes.push(
          tokenEntries[index].ref
            .update({ fcmToken: admin.firestore.FieldValue.delete() })
            .catch((error) => console.warn('notifyPartnerLedgerWrite: token prune failed:', error))
        );
      });
      if (prunes.length > 0) {
        await Promise.all(prunes);
        console.info(`notifyPartnerLedgerWrite: pruned ${prunes.length} dead token registration(s).`);
      }
    }
  }
);
