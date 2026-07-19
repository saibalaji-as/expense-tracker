/**
 * Circle Splits — group expense sharing (docs/circle-splits-plan.md).
 *
 * FREE tier by design: no requireProTier anywhere in this file. The Circle
 * Link join flow is Spenza's growth loop — a paywall here kills it.
 *
 * Circle documents and invites are server-authoritative (client rules deny
 * writes); only the expenses subcollection is client-writable under rules.
 */
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import type { Request } from 'firebase-functions/v2/https';

const CORS_ORIGINS = [
  'https://spenza.site',
  'http://localhost:4200',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];

const MAX_MEMBERS = 20;
const MAX_NAME_LENGTH = 40;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — trip-length links

async function requireCircleAuth(req: Request): Promise<{ uid: string; email: string }> {
  const authorization = req.headers.authorization ?? '';
  const match = authorization.match(/^Bearer (.+)$/);
  if (!match) throw new Error('Missing Firebase ID token');
  const decoded = await admin.auth().verifyIdToken(match[1]);
  if (!decoded.email) throw new Error('Authenticated user has no email');
  return { uid: decoded.uid, email: decoded.email };
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
}

export const createCircle = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const name = cleanName(req.body?.name);
    const currency = typeof req.body?.currency === 'string' ? req.body.currency.trim().slice(0, 8) : 'INR';
    const rawMemberNames: unknown[] = Array.isArray(req.body?.memberNames) ? req.body.memberNames : [];
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const memberNames = rawMemberNames.map(cleanName).filter((n) => n.length > 0);
    if (memberNames.length + 1 > MAX_MEMBERS) {
      res.status(400).json({ error: `A circle supports at most ${MAX_MEMBERS} members` });
      return;
    }

    try {
      const { uid, email } = await requireCircleAuth(req);
      const now = new Date().toISOString();
      const ref = admin.firestore().collection('circles').doc();

      const selfMemberId = randomUUID();
      const members: Record<string, unknown> = {
        [selfMemberId]: {
          memberId: selfMemberId,
          name: cleanName(req.body?.ownerDisplayName) || email.split('@')[0],
          uid,
          email,
          joinedAt: now,
        },
      };
      for (const memberName of memberNames) {
        const memberId = randomUUID();
        members[memberId] = { memberId, name: memberName, uid: null, email: null, joinedAt: null };
      }

      await ref.set({
        circleId: ref.id,
        name,
        currency,
        ownerUid: uid,
        ownerEmail: email,
        members,
        memberUids: [uid],
        status: 'active',
        createdAt: now,
        updatedAt: now,
        settledAt: null,
      });
      res.json({ circleId: ref.id });
    } catch (err) {
      console.warn('createCircle failed:', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
);

export const createCircleInvite = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const circleId = typeof req.body?.circleId === 'string' ? req.body.circleId.trim() : '';
    if (!circleId) {
      res.status(400).json({ error: 'circleId is required' });
      return;
    }

    try {
      const { uid } = await requireCircleAuth(req);
      const circleSnap = await admin.firestore().collection('circles').doc(circleId).get();
      if (!circleSnap.exists) {
        res.status(404).json({ error: 'Circle not found' });
        return;
      }
      const circle = circleSnap.data()!;
      if (circle['ownerUid'] !== uid) {
        res.status(403).json({ error: 'Only the circle owner can create a Circle Link' });
        return;
      }
      if (circle['status'] !== 'active') {
        res.status(409).json({ error: 'Circle is settled' });
        return;
      }

      // Reuse a live invite so the shared link stays stable for the group.
      const existing = await admin.firestore()
        .collection('circleInvites')
        .where('circleId', '==', circleId)
        .where('revoked', '==', false)
        .limit(5)
        .get();
      const live = existing.docs
        .map((d) => d.data())
        .find((inv) => new Date(inv['expiresAt'] as string).getTime() > Date.now());
      if (live) {
        res.json({ inviteCode: live['code'], expiresAt: live['expiresAt'] });
        return;
      }

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
      const inviteCode = generateInviteCode();
      await admin.firestore().collection('circleInvites').doc(inviteCode).set({
        code: inviteCode,
        circleId,
        ownerUid: uid,
        createdAt: now,
        expiresAt,
        revoked: false,
      });
      res.json({ inviteCode, expiresAt });
    } catch (err) {
      console.warn('createCircleInvite failed:', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
);

export const redeemCircleInvite = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const inviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim().toUpperCase() : '';
    const claimMemberId = typeof req.body?.claimMemberId === 'string' ? req.body.claimMemberId.trim() : '';
    const displayName = cleanName(req.body?.displayName);
    if (!inviteCode) {
      res.status(400).json({ error: 'inviteCode is required' });
      return;
    }

    try {
      const { uid, email } = await requireCircleAuth(req);
      const inviteRef = admin.firestore().collection('circleInvites').doc(inviteCode);

      const circleId = await admin.firestore().runTransaction(async (transaction) => {
        const inviteSnap = await transaction.get(inviteRef);
        if (!inviteSnap.exists) throw new Error('Invite not found');
        const invite = inviteSnap.data()!;
        if (invite['revoked'] === true) throw new Error('Invite revoked');
        if (new Date(invite['expiresAt'] as string).getTime() <= Date.now()) {
          throw new Error('Invite expired');
        }

        const circleRef = admin.firestore().collection('circles').doc(invite['circleId'] as string);
        const circleSnap = await transaction.get(circleRef);
        if (!circleSnap.exists) throw new Error('Circle not found');
        const circle = circleSnap.data()!;
        if (circle['status'] !== 'active') throw new Error('Circle is settled');

        const members = { ...(circle['members'] as Record<string, Record<string, unknown>>) };
        const memberUids: string[] = [...((circle['memberUids'] as string[]) ?? [])];

        // Idempotent: already a member — just return the circle.
        if (memberUids.includes(uid)) return invite['circleId'] as string;

        const now = new Date().toISOString();
        if (claimMemberId) {
          const seat = members[claimMemberId];
          if (!seat) throw new Error('Seat not found');
          if (seat['uid'] !== null) throw new Error('Seat already claimed');
          members[claimMemberId] = { ...seat, uid, email, joinedAt: now };
        } else {
          if (Object.keys(members).length + 1 > MAX_MEMBERS) {
            throw new Error('Circle is full');
          }
          const memberId = randomUUID();
          members[memberId] = {
            memberId,
            name: displayName || email.split('@')[0],
            uid,
            email,
            joinedAt: now,
          };
        }
        memberUids.push(uid);
        transaction.update(circleRef, { members, memberUids, updatedAt: now });
        return invite['circleId'] as string;
      });

      res.json({ circleId });
    } catch (err) {
      console.warn('redeemCircleInvite failed:', err);
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Seat already claimed') || message.includes('Circle is full') || message.includes('Circle is settled')) {
        res.status(409).json({ error: message });
      } else if (
        message.includes('Invite not found') ||
        message.includes('Invite revoked') ||
        message.includes('Invite expired') ||
        message.includes('Circle not found') ||
        message.includes('Seat not found')
      ) {
        res.status(404).json({ error: message });
      } else {
        res.status(401).json({ error: 'Unauthorized' });
      }
    }
  }
);

/**
 * Join-screen preview: a signed-in NON-member holding a Circle Link needs the
 * circle name + unclaimed seats before redeeming, but security rules only let
 * members read circle docs. This endpoint returns the minimal preview.
 */
export const previewCircleInvite = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const inviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim().toUpperCase() : '';
    if (!inviteCode) {
      res.status(400).json({ error: 'inviteCode is required' });
      return;
    }

    try {
      const { uid } = await requireCircleAuth(req);
      const inviteSnap = await admin.firestore().collection('circleInvites').doc(inviteCode).get();
      if (!inviteSnap.exists) {
        res.status(404).json({ error: 'Invite not found' });
        return;
      }
      const invite = inviteSnap.data()!;
      if (invite['revoked'] === true || new Date(invite['expiresAt'] as string).getTime() <= Date.now()) {
        res.status(404).json({ error: 'Invite expired' });
        return;
      }
      const circleSnap = await admin.firestore().collection('circles').doc(invite['circleId'] as string).get();
      if (!circleSnap.exists) {
        res.status(404).json({ error: 'Circle not found' });
        return;
      }
      const circle = circleSnap.data()!;
      const members = Object.values(circle['members'] as Record<string, Record<string, unknown>>);
      res.json({
        circleId: circle['circleId'],
        name: circle['name'],
        currency: circle['currency'],
        status: circle['status'],
        memberCount: members.length,
        alreadyMember: ((circle['memberUids'] as string[]) ?? []).includes(uid),
        unclaimedMembers: members
          .filter((m) => m['uid'] === null)
          .map((m) => ({ memberId: m['memberId'], name: m['name'] })),
      });
    } catch (err) {
      console.warn('previewCircleInvite failed:', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
);

export const updateCircle = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const circleId = typeof req.body?.circleId === 'string' ? req.body.circleId.trim() : '';
    if (!circleId) {
      res.status(400).json({ error: 'circleId is required' });
      return;
    }
    const newName = cleanName(req.body?.name);
    const rawAddNames: unknown[] = Array.isArray(req.body?.addMemberNames) ? req.body.addMemberNames : [];
    const addMemberNames = rawAddNames.map(cleanName).filter((n) => n.length > 0);

    try {
      const { uid } = await requireCircleAuth(req);
      const circleRef = admin.firestore().collection('circles').doc(circleId);
      await admin.firestore().runTransaction(async (transaction) => {
        const snap = await transaction.get(circleRef);
        if (!snap.exists) throw new Error('Circle not found');
        const circle = snap.data()!;
        if (circle['ownerUid'] !== uid) throw new Error('Owner only');
        if (circle['status'] !== 'active') throw new Error('Circle is settled');

        const members = { ...(circle['members'] as Record<string, Record<string, unknown>>) };
        if (Object.keys(members).length + addMemberNames.length > MAX_MEMBERS) {
          throw new Error('Circle is full');
        }
        for (const memberName of addMemberNames) {
          const memberId = randomUUID();
          members[memberId] = { memberId, name: memberName, uid: null, email: null, joinedAt: null };
        }
        transaction.update(circleRef, {
          members,
          ...(newName ? { name: newName } : {}),
          updatedAt: new Date().toISOString(),
        });
      });
      res.json({ success: true });
    } catch (err) {
      console.warn('updateCircle failed:', err);
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Owner only')) res.status(403).json({ error: message });
      else if (message.includes('Circle not found')) res.status(404).json({ error: message });
      else if (message.includes('Circle is full') || message.includes('Circle is settled')) res.status(409).json({ error: message });
      else res.status(401).json({ error: 'Unauthorized' });
    }
  }
);

export const settleCircle = functions.onRequest(
  { cors: CORS_ORIGINS, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const circleId = typeof req.body?.circleId === 'string' ? req.body.circleId.trim() : '';
    if (!circleId) {
      res.status(400).json({ error: 'circleId is required' });
      return;
    }

    try {
      const { uid } = await requireCircleAuth(req);
      const circleRef = admin.firestore().collection('circles').doc(circleId);
      const snap = await circleRef.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'Circle not found' });
        return;
      }
      const circle = snap.data()!;
      if (circle['ownerUid'] !== uid) {
        res.status(403).json({ error: 'Only the circle owner can settle the circle' });
        return;
      }
      if (circle['status'] !== 'active') {
        res.status(409).json({ error: 'Circle already settled' });
        return;
      }
      const now = new Date().toISOString();
      await circleRef.update({ status: 'settled', settledAt: now, updatedAt: now });
      res.json({ success: true });
    } catch (err) {
      console.warn('settleCircle failed:', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
);
