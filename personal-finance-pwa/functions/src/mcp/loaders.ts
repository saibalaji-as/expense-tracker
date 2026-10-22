/**
 * Read-only I/O. There is no write call to Drive in this module, and the only
 * Firestore reads are the user's own family ledger and circles, each behind
 * the same membership test as firestore.rules (the Admin SDK bypasses rules).
 */
import * as admin from 'firebase-admin';
import type { CircleDocument, CircleExpense, LedgerRecord } from '../spenza-core/models';
import { DEFAULT_TIMEZONE, TTL } from './config';
import { McpToolError } from './errors';
import { fromBackupDocument, fromLedgerRecords, SpenzaData } from './spenza-data';
import { resolveTimezone } from './zoned-time';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const BACKUP_NAME = 'spenza-backup.json';

/** Drive helper with GET only, by construction. */
async function driveGet(url: string, accessToken: string): Promise<Response> {
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401 || res.status === 403) {
    throw new McpToolError('DRIVE_ACCESS_REVOKED', 'Google Drive refused access. Reconnect Spenza in Claude.');
  }
  if (!res.ok) throw new McpToolError('UPSTREAM_ERROR', `Google Drive returned ${res.status}. Try again in a minute.`);
  return res;
}

export async function loadDriveBackup(accessToken: string): Promise<SpenzaData> {
  const q = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
  const list = await driveGet(
    `${DRIVE_FILES}?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&pageSize=5&fields=files(id,modifiedTime)`,
    accessToken,
  );
  const files = ((await list.json()) as { files?: { id: string; modifiedTime?: string }[] }).files ?? [];
  const newest = files[0];
  if (!newest) {
    throw new McpToolError('NO_BACKUP', 'No Spenza backup found in your Google Drive. Open the Spenza app once so it can create it.');
  }
  const file = await driveGet(`${DRIVE_FILES}/${encodeURIComponent(newest.id)}?alt=media`, accessToken);
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new McpToolError('UPSTREAM_ERROR', 'Your Spenza backup could not be read.');
  }
  return fromBackupDocument(raw, newest.modifiedTime ?? null);
}

export interface FamilyMembership {
  familyId: string;
  role: 'owner' | 'partner';
}

/** Same membership test as firestore.rules `isFamilyMember`; dissolved families are ignored. */
export async function findFamily(uid: string): Promise<FamilyMembership | null> {
  const families = admin.firestore().collection('families');
  for (const [field, role] of [['ownerUid', 'owner'], ['partnerUid', 'partner']] as const) {
    const snap = await families.where(field, '==', uid).limit(5).get();
    const active = snap.docs.find((d) => d.data()['status'] !== 'dissolved');
    if (active) return { familyId: active.id, role };
  }
  return null;
}

export async function loadFamilyLedger(family: FamilyMembership): Promise<SpenzaData> {
  const snap = await admin.firestore().collection('families').doc(family.familyId).collection('ledger').get();
  return fromLedgerRecords(snap.docs.map((d) => d.data() as LedgerRecord), family);
}

const dataCache = new Map<string, { data: SpenzaData; at: number }>();

/** Family members read the shared ledger (fresher than any one member's Drive copy); everyone else reads Drive. */
export async function loadSpenzaData(uid: string, getDriveToken: () => Promise<string>): Promise<SpenzaData> {
  const hit = dataCache.get(uid);
  if (hit && Date.now() - hit.at < TTL.dataCacheMs) return hit.data;
  const family = await findFamily(uid);
  const data = family ? await loadFamilyLedger(family) : await loadDriveBackup(await getDriveToken());
  if (dataCache.size >= 200) dataCache.delete(dataCache.keys().next().value!);
  dataCache.set(uid, { data, at: Date.now() });
  return data;
}

export async function loadUserTimezone(uid: string): Promise<string> {
  const snap = await admin.firestore().collection('users').doc(uid).get().catch(() => null);
  return resolveTimezone(snap?.data()?.['timezone'], DEFAULT_TIMEZONE);
}

export interface CircleSnapshot {
  circle: CircleDocument;
  expenses: CircleExpense[];
}

/** Circles the user belongs to (rules: `request.auth.uid in memberUids`). */
export async function loadCircles(uid: string, circleId?: string): Promise<CircleSnapshot[]> {
  const db = admin.firestore();
  let docs: admin.firestore.DocumentSnapshot[];
  if (circleId) {
    const doc = await db.collection('circles').doc(circleId).get();
    const members = (doc.data()?.['memberUids'] ?? []) as string[];
    if (!doc.exists || !members.includes(uid)) {
      throw new McpToolError('NOT_A_MEMBER', 'Circle not found.');
    }
    docs = [doc];
  } else {
    docs = (await db.collection('circles').where('memberUids', 'array-contains', uid).get()).docs;
  }
  return Promise.all(
    docs.map(async (doc) => {
      const expenses = await doc.ref.collection('expenses').get();
      return {
        circle: { ...(doc.data() as CircleDocument), circleId: doc.id },
        expenses: expenses.docs
          .map((e) => ({ ...(e.data() as CircleExpense), expenseId: e.id }))
          .filter((e) => !e.deleted),
      };
    }),
  );
}
