import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Server-side delivery for user-created date/time reminders.
 *
 * Why this exists: on the web the client could only fire a reminder while a tab
 * was open (and native scheduled a local OS notification only on the device that
 * created it). This scheduled function is the single source of truth for
 * delivering `users/{uid}/reminders` of type `datetime` across every web device
 * the user has registered — independent of any tab being open.
 *
 * Native devices keep their own local notifications, so we deliberately push
 * ONLY to web tokens here to avoid double-notifying native users.
 *
 * Runs every minute; a reminder is delivered on the first run where
 * `remindAt <= now`. Delivery is claimed atomically by stamping `notifiedAt`
 * inside a transaction so overlapping runs never double-send.
 */
export const sendDueReminders = onSchedule('every 1 minutes', async () => {
  const db = getFirestore();
  const messaging = getMessaging();
  const now = Timestamp.now();

  const dueSnap = await db
    .collectionGroup('reminders')
    .where('type', '==', 'datetime')
    .where('status', '==', 'active')
    .where('notifiedAt', '==', null)
    .where('remindAt', '<=', now)
    .get();

  if (dueSnap.empty) {
    console.log('sendDueReminders: no reminders due');
    return;
  }

  // Resolve a user's web FCM tokens once per run (a user may own several).
  const tokenCache = new Map<string, { token: string; ref: FirebaseFirestore.DocumentReference }[]>();
  const resolveWebTokens = async (uid: string) => {
    const cached = tokenCache.get(uid);
    if (cached) return cached;
    const snap = await db
      .collection('users')
      .where('ownerUid', '==', uid)
      .where('platform', '==', 'web')
      .get();
    const tokens = snap.docs
      .map((d) => ({ token: d.data().fcmToken as string | undefined, ref: d.ref }))
      .filter((t): t is { token: string; ref: FirebaseFirestore.DocumentReference } => !!t.token);
    tokenCache.set(uid, tokens);
    return tokens;
  };

  let pushed = 0;
  let noToken = 0;
  let failures = 0;
  let removed = 0;

  for (const doc of dueSnap.docs) {
    const userRef = doc.ref.parent.parent; // users/{uid}
    if (!userRef) continue;
    const uid = userRef.id;
    const reminder = doc.data();

    const targets = await resolveWebTokens(uid);
    if (!targets.length) {
      // No web device to deliver to. Leave the reminder untouched so the client's
      // grace-period expiry can mark it expired (and native local notifications,
      // if any, still fire on-device).
      noToken++;
      continue;
    }

    // Atomically claim delivery so concurrent runs can't double-send.
    let claimed = false;
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const d = fresh.data();
      if (!fresh.exists || !d || d.notifiedAt != null || d.status !== 'active') return;
      tx.update(doc.ref, { notifiedAt: FieldValue.serverTimestamp() });
      claimed = true;
    });
    if (!claimed) continue;

    const title = (reminder.title as string)?.trim() || 'You have a reminder';
    const resp = await messaging.sendEachForMulticast({
      tokens: targets.map((t) => t.token),
      notification: {
        title: 'Spenza Reminder',
        body: title,
      },
      webpush: {
        fcmOptions: { link: '/reminders' },
        notification: {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: `spenza-reminder-${doc.id}`,
          requireInteraction: true,
          vibrate: [200, 100, 200],
        },
      },
      data: { type: 'reminder', reminderId: doc.id, url: '/reminders' },
    });

    pushed += resp.successCount;
    failures += resp.failureCount;

    // Prune tokens FCM tells us are dead so future runs stay clean.
    resp.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code ?? '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        void targets[i].ref.delete();
        removed++;
      } else {
        console.error(`sendDueReminders: send failed for ${uid}:`, code, r.error?.message);
      }
    });
  }

  console.log(
    `sendDueReminders complete: ${dueSnap.size} due — ` +
    `${pushed} pushes sent, ${noToken} with no web token, ${failures} failures, ${removed} stale tokens removed`
  );
});
