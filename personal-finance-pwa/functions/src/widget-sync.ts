import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import type { Request } from 'firebase-functions/v2/https';

/**
 * Pushes expenses/adjustments logged from the native Android home-screen widget
 * straight into the family's shared Firestore state, so a partner sees them within
 * seconds — without the logging user ever having to open the app.
 *
 * The web client writes the same `families/{familyId}/state/current` document via a
 * client-side transaction (see FamilySyncService.pushState). This function performs
 * the equivalent merge with the Admin SDK so the background WorkManager job (which
 * has no Firestore client SDK) can reach the partner. The merged document shape and
 * `{ doc, lastWriter, updatedAt, revision, deletedEntryIds }` envelope are identical,
 * so the partner's existing onSnapshot listener applies it with no changes.
 */

const CORS_ORIGINS = [
  'https://spenza.site',
  'http://localhost:4200',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];

async function requireAuth(req: Request): Promise<{ uid: string; email: string }> {
  const authorization = req.headers.authorization ?? '';
  const match = authorization.match(/^Bearer (.+)$/);
  if (!match) throw new Error('Missing Firebase ID token');
  const decoded = await admin.auth().verifyIdToken(match[1]);
  if (!decoded.email) throw new Error('Authenticated user has no email');
  return { uid: decoded.uid, email: decoded.email };
}

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Decrements the linked account balance for a spend. Returns false if the account
 *  is missing/archived or the spend would overdraw a non-overdraft account. */
function applyLinkedExpense(accounts: any[], entry: any): boolean {
  const accountId: string = entry?.accountId ?? '';
  if (!accountId) return true;
  const amount = roundMoney(entry?.amount ?? 0);
  if (amount <= 0) return false;

  for (const account of accounts) {
    if (!account || account.id !== accountId || account.archived) continue;
    const next = roundMoney((account.balance ?? 0) - amount);
    if (!account.allowOverdraft && next < 0) return false;
    account.balance = next;
    account.updatedAt = new Date().toISOString();
    if (entry.createdByEmail !== undefined) account.updatedByEmail = entry.createdByEmail;
    if (entry.createdByRole !== undefined) account.updatedByRole = entry.createdByRole;
    return true;
  }
  return false;
}

/** Increments the linked account balance for a manual balance adjustment. */
function applyAccountAdjustment(accounts: any[], adjustment: any): boolean {
  const accountId: string = adjustment?.accountId ?? '';
  const amount = roundMoney(adjustment?.amount ?? 0);
  if (!accountId || amount <= 0) return false;

  for (const account of accounts) {
    if (!account || account.id !== accountId || account.archived) continue;
    account.balance = roundMoney((account.balance ?? 0) + amount);
    account.updatedAt = new Date().toISOString();
    if (adjustment.createdByEmail !== undefined) account.updatedByEmail = adjustment.createdByEmail;
    if (adjustment.createdByRole !== undefined) account.updatedByRole = adjustment.createdByRole;
    return true;
  }
  return false;
}

export const syncWidgetExpenseToFamily = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const familyId = typeof req.body?.familyId === 'string' ? req.body.familyId.trim() : '';
    const expenses: any[] = Array.isArray(req.body?.expenses) ? req.body.expenses : [];
    const adjustments: any[] = Array.isArray(req.body?.adjustments) ? req.body.adjustments : [];

    if (!familyId) {
      res.status(400).json({ error: 'familyId is required' });
      return;
    }
    if (expenses.length === 0 && adjustments.length === 0) {
      res.json({ synced: 0, skipped: true });
      return;
    }

    try {
      const { uid, email } = await requireAuth(req);
      const db = admin.firestore();

      const familySnap = await db.collection('families').doc(familyId).get();
      if (!familySnap.exists) {
        res.status(404).json({ error: 'Family not found' });
        return;
      }
      const family = familySnap.data()!;
      if (family['status'] === 'dissolved') {
        res.status(410).json({ error: 'Family dissolved' });
        return;
      }
      // Authorize: caller must be a member of this family.
      const isOwner = family['ownerUid'] === uid;
      const isPartner = family['partnerUid'] === uid;
      if (!isOwner && !isPartner) {
        res.status(403).json({ error: 'Not a member of this family' });
        return;
      }
      const role: 'owner' | 'partner' = isOwner ? 'owner' : 'partner';

      const stateRef = db.doc(`families/${familyId}/state/current`);
      let appliedExpenses = 0;
      let appliedAdjustments = 0;

      const newRevision = await db.runTransaction(async (tx) => {
        const snap = await tx.get(stateRef);
        if (!snap.exists) {
          // No baseline state yet — the owner must open the app once so the initial
          // full document is published. Signal the caller to keep the items queued.
          throw new Error('NO_STATE_DOC');
        }
        const data = snap.data() as {
          doc: any;
          revision?: number;
          deletedEntryIds?: string[];
        };
        const doc = data.doc ?? {};
        const docExpenses: any[] = Array.isArray(doc.expenses) ? doc.expenses : (doc.expenses = []);
        const docAccounts: any[] = Array.isArray(doc.accounts) ? doc.accounts : (doc.accounts = []);
        const docAdjustments: any[] = Array.isArray(doc.accountAdjustments)
          ? doc.accountAdjustments
          : (doc.accountAdjustments = []);

        const existingExpenseIds = new Set(docExpenses.map((e) => e?.id).filter(Boolean));
        const existingAdjustmentIds = new Set(docAdjustments.map((a) => a?.id).filter(Boolean));

        for (const entry of expenses) {
          const id = entry?.id ?? '';
          if (!id || existingExpenseIds.has(id)) continue; // idempotent on retry
          if (!applyLinkedExpense(docAccounts, entry)) continue; // skip if account gone/overdraft
          docExpenses.push(entry);
          existingExpenseIds.add(id);
          appliedExpenses++;
        }
        for (const adjustment of adjustments) {
          const id = adjustment?.id ?? '';
          if (!id || existingAdjustmentIds.has(id)) continue;
          if (!applyAccountAdjustment(docAccounts, adjustment)) continue;
          docAdjustments.push(adjustment);
          existingAdjustmentIds.add(id);
          appliedAdjustments++;
        }

        const currentRevision: number = data.revision ?? 0;
        const nextRevision = currentRevision + 1;
        doc.lastUpdated = new Date().toISOString();

        tx.set(stateRef, {
          doc,
          lastWriter: { uid, email, role },
          updatedAt: new Date().toISOString(),
          revision: nextRevision,
          deletedEntryIds: data.deletedEntryIds ?? [],
        });
        return nextRevision;
      });

      res.json({ synced: appliedExpenses + appliedAdjustments, revision: newRevision });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'NO_STATE_DOC') {
        // 409 → worker keeps the queue and retries after the owner next opens the app.
        res.status(409).json({ error: 'Family state not initialized yet' });
        return;
      }
      console.warn('syncWidgetExpenseToFamily failed:', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
);
