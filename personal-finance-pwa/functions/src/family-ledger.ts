import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import type { Request } from 'firebase-functions/v2/https';

/**
 * Family Ledger commit for the native Android widget/notification path
 * (docs/family-sync-centralization-plan.md).
 *
 * Upserts expenses/adjustments logged from the home-screen widget as
 * INDIVIDUAL record documents under `families/{familyId}/ledger/` — the same
 * collection the Angular clients write directly and listen to. Replaces the
 * full-state merge of the legacy `syncWidgetExpenseToFamily` function (source
 * deleted in Phase 2 — undeploy it with `firebase functions:delete syncWidgetExpenseToFamily`).
 *
 * Idempotent: a record whose ledger doc already exists (live or tombstoned) is
 * skipped, so WorkManager retries are harmless. Linked account/debt balances
 * are applied to the corresponding ledger records when they exist, so the
 * partner's balances stay timely; the logging device's next app-open pushes
 * the authoritative balance anyway (last-writer-wins per record).
 */

const CORS_ORIGINS = [
  'https://spenza.site',
  'http://localhost:4200',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];

interface LedgerWriter {
  uid: string;
  email: string;
  role: 'owner' | 'partner';
}

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

function ledgerDocId(type: string, id: string): string {
  return `${type}:${String(id).replace(/\//g, '_')}`;
}

function record(type: string, id: string, payload: unknown, writer: LedgerWriter) {
  return JSON.parse(JSON.stringify({
    type,
    id,
    payload,
    deleted: false,
    updatedAt: new Date().toISOString(),
    updatedBy: writer,
  }));
}

export const commitFamilyLedger = functions.onRequest(
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
      const isOwner = family['ownerUid'] === uid;
      const isPartner = family['partnerUid'] === uid;
      if (!isOwner && !isPartner) {
        res.status(403).json({ error: 'Not a member of this family' });
        return;
      }
      const writer: LedgerWriter = { uid, email, role: isOwner ? 'owner' : 'partner' };
      const ledger = db.collection('families').doc(familyId).collection('ledger');

      let applied = 0;
      await db.runTransaction(async (tx) => {
        applied = 0; // transactions can retry — keep the count accurate

        // ── Reads first (Admin transactions forbid reads after writes) ──
        const itemRefs = [
          ...expenses.filter((e) => e?.id).map((e) => ledger.doc(ledgerDocId('expense', e.id))),
          ...adjustments.filter((a) => a?.id).map((a) => ledger.doc(ledgerDocId('adjustment', a.id))),
        ];
        const accountIds = new Set<string>();
        const debtIds = new Set<string>();
        for (const entry of expenses) {
          if (entry?.debtId) debtIds.add(String(entry.debtId));
          else if (entry?.accountId) accountIds.add(String(entry.accountId));
        }
        for (const adjustment of adjustments) {
          if (adjustment?.accountId) accountIds.add(String(adjustment.accountId));
        }
        const accountRefs = Array.from(accountIds).map((id) => ledger.doc(ledgerDocId('account', id)));
        const debtRefs = Array.from(debtIds).map((id) => ledger.doc(ledgerDocId('debt', id)));

        const [itemSnaps, accountSnaps, debtSnaps] = await Promise.all([
          itemRefs.length ? tx.getAll(...itemRefs) : Promise.resolve([]),
          accountRefs.length ? tx.getAll(...accountRefs) : Promise.resolve([]),
          debtRefs.length ? tx.getAll(...debtRefs) : Promise.resolve([]),
        ]);

        const existingDocIds = new Set(itemSnaps.filter((s) => s.exists).map((s) => s.id));
        const accounts = new Map<string, any>();
        for (const snap of accountSnaps) {
          const data = snap.exists ? snap.data() : null;
          if (data && !data['deleted'] && data['payload']) accounts.set(String(data['id']), data['payload']);
        }
        const debts = new Map<string, any>();
        for (const snap of debtSnaps) {
          const data = snap.exists ? snap.data() : null;
          if (data && !data['deleted'] && data['payload']) debts.set(String(data['id']), data['payload']);
        }
        const touchedAccounts = new Set<string>();
        const touchedDebts = new Set<string>();

        // ── Writes ──
        for (const entry of expenses) {
          const id = entry?.id ? String(entry.id) : '';
          if (!id || existingDocIds.has(ledgerDocId('expense', id))) continue; // idempotent

          if (entry.debtId && debts.has(String(entry.debtId))) {
            // Credit-card purchase: raise the card's outstanding.
            const debt = debts.get(String(entry.debtId));
            if (debt['type'] === 'credit-card' && debt['status'] === 'active') {
              debt['remainingBalance'] = roundMoney((debt['remainingBalance'] ?? 0) + roundMoney(entry.amount ?? 0));
              debt['updatedAt'] = new Date().toISOString();
              touchedDebts.add(String(entry.debtId));
            } else {
              delete entry.debtId; // card archived since save — keep expense, drop link
            }
          } else if (entry.accountId && accounts.has(String(entry.accountId))) {
            const account = accounts.get(String(entry.accountId));
            const amount = roundMoney(entry.amount ?? 0);
            const next = roundMoney((account['balance'] ?? 0) - amount);
            if (amount <= 0) continue;
            if (!account['allowOverdraft'] && next < 0) continue; // stays queued app-side
            account['balance'] = next;
            account['updatedAt'] = new Date().toISOString();
            touchedAccounts.add(String(entry.accountId));
          }
          // Account/debt record not in the ledger yet (family not migrated or
          // no accounts): still write the expense — balances converge from the
          // logging device's next app-open push.
          tx.set(ledger.doc(ledgerDocId('expense', id)), record('expense', id, entry, writer));
          existingDocIds.add(ledgerDocId('expense', id));
          applied++;
        }

        for (const adjustment of adjustments) {
          const id = adjustment?.id ? String(adjustment.id) : '';
          if (!id || existingDocIds.has(ledgerDocId('adjustment', id))) continue;
          if (adjustment.accountId && accounts.has(String(adjustment.accountId))) {
            const account = accounts.get(String(adjustment.accountId));
            const amount = roundMoney(adjustment.amount ?? 0);
            if (amount > 0) {
              const delta = adjustment.kind === 'decrease' ? -amount : amount;
              account['balance'] = roundMoney((account['balance'] ?? 0) + delta);
              account['updatedAt'] = new Date().toISOString();
              touchedAccounts.add(String(adjustment.accountId));
            }
          }
          tx.set(ledger.doc(ledgerDocId('adjustment', id)), record('adjustment', id, adjustment, writer));
          existingDocIds.add(ledgerDocId('adjustment', id));
          applied++;
        }

        for (const accountId of touchedAccounts) {
          tx.set(ledger.doc(ledgerDocId('account', accountId)),
            record('account', accountId, accounts.get(accountId), writer));
        }
        for (const debtId of touchedDebts) {
          tx.set(ledger.doc(ledgerDocId('debt', debtId)),
            record('debt', debtId, debts.get(debtId), writer));
        }
      });

      res.json({ synced: applied });
    } catch (err) {
      console.warn('commitFamilyLedger failed:', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
);
