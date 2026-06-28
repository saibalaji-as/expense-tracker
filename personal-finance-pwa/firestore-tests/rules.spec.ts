// TC-RULES — Firestore security-rules tests for Spenza.
// Runs against the Firestore emulator via @firebase/rules-unit-testing.
// Kept OUTSIDE src/ so the normal `vitest run` (which has no emulator) skips it.
// Run with:  npm run test:rules
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const OWNER = 'owner-uid';
const PARTNER = 'partner-uid';
const STRANGER = 'stranger-uid';
const FAM = 'fam1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-spenza-rules',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed baseline data with rules disabled (simulates Functions-written docs).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `families/${FAM}`), {
      familyId: FAM, ownerUid: OWNER, partnerUid: PARTNER,
      ownerEmail: 'o@x.com', partnerEmail: 'p@x.com',
      status: 'active', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    });
    await setDoc(doc(db, `users/${OWNER}/subscription/status`), { tier: 'pro' });
    await setDoc(doc(db, `families/${FAM}/activity/seed1`), {
      activityId: 'seed1', familyId: FAM, authorUid: OWNER, authorEmail: 'o@x.com',
      authorRole: 'owner', action: 'create', payload: {}, timestamp: '2026-01-01', clientWrittenAt: '2026-01-01',
    });
    await setDoc(doc(db, 'familyInvites/REDEEMED1'), {
      inviteCode: 'REDEEMED1', familyId: FAM, ownerUid: OWNER, ownerEmail: 'o@x.com', redeemedAt: '2026-01-02',
    });
    await setDoc(doc(db, 'familyInvites/OPEN1'), {
      inviteCode: 'OPEN1', familyId: FAM, ownerUid: OWNER, ownerEmail: 'o@x.com', redeemedAt: null,
    });
  });
});

const owner = () => testEnv.authenticatedContext(OWNER).firestore();
const partner = () => testEnv.authenticatedContext(PARTNER).firestore();
const stranger = () => testEnv.authenticatedContext(STRANGER).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

describe('users/{uid}/subscription — owner read-only, never writable', () => {
  it('owner can read own subscription', async () => {
    await assertSucceeds(getDoc(doc(owner(), `users/${OWNER}/subscription/status`)));
  });
  it('another user cannot read it', async () => {
    await assertFails(getDoc(doc(stranger(), `users/${OWNER}/subscription/status`)));
  });
  it('even the owner cannot write it (Functions only)', async () => {
    await assertFails(setDoc(doc(owner(), `users/${OWNER}/subscription/status`), { tier: 'free' }));
  });
});

describe('users/{uid}/reminders — owner-only read & write', () => {
  it('owner can write then read their reminder', async () => {
    await assertSucceeds(setDoc(doc(owner(), `users/${OWNER}/reminders/r1`), { title: 'Pay rent' }));
    await assertSucceeds(getDoc(doc(owner(), `users/${OWNER}/reminders/r1`)));
  });
  it('another user cannot read it', async () => {
    await assertFails(getDoc(doc(stranger(), `users/${OWNER}/reminders/r1`)));
  });
  it('another user cannot write it', async () => {
    await assertFails(setDoc(doc(stranger(), `users/${OWNER}/reminders/r1`), { title: 'evil' }));
  });
  it('unauthenticated access is denied', async () => {
    await assertFails(getDoc(doc(anon(), `users/${OWNER}/reminders/r1`)));
  });
});

describe('families/{familyId} — members read, never client-writable', () => {
  it('owner can read the family doc', async () => {
    await assertSucceeds(getDoc(doc(owner(), `families/${FAM}`)));
  });
  it('partner can read the family doc', async () => {
    await assertSucceeds(getDoc(doc(partner(), `families/${FAM}`)));
  });
  it('a stranger cannot read the family doc', async () => {
    await assertFails(getDoc(doc(stranger(), `families/${FAM}`)));
  });
  it('a member cannot write the family doc (Functions only)', async () => {
    await assertFails(updateDoc(doc(owner(), `families/${FAM}`), { status: 'dissolved' }));
  });
});

describe('families/{familyId}/activity — member-scoped, author-bound, immutable', () => {
  const delta = (authorUid: string, familyId: string) => ({
    activityId: 'a1', familyId, authorUid, authorEmail: 'x@x.com', authorRole: 'owner',
    action: 'create', payload: { amount: 100 }, timestamp: '2026-02-01', clientWrittenAt: '2026-02-01',
  });

  it('a member can create their OWN delta', async () => {
    await assertSucceeds(setDoc(doc(partner(), `families/${FAM}/activity/a1`), delta(PARTNER, FAM)));
  });
  it('a member cannot forge a delta as another author', async () => {
    await assertFails(setDoc(doc(partner(), `families/${FAM}/activity/a1`), delta(OWNER, FAM)));
  });
  it('a delta with a mismatched familyId field is rejected', async () => {
    await assertFails(setDoc(doc(owner(), `families/${FAM}/activity/a1`), delta(OWNER, 'other-family')));
  });
  it('a non-member cannot create a delta', async () => {
    await assertFails(setDoc(doc(stranger(), `families/${FAM}/activity/a1`), delta(STRANGER, FAM)));
  });
  it('a member can read activity', async () => {
    await assertSucceeds(getDoc(doc(owner(), `families/${FAM}/activity/seed1`)));
  });
  it('a non-member cannot read activity', async () => {
    await assertFails(getDoc(doc(stranger(), `families/${FAM}/activity/seed1`)));
  });
  it('deltas are immutable — update denied', async () => {
    await assertFails(updateDoc(doc(owner(), `families/${FAM}/activity/seed1`), { action: 'delete' }));
  });
  it('deltas are immutable — delete denied', async () => {
    await assertFails(deleteDoc(doc(owner(), `families/${FAM}/activity/seed1`)));
  });
});

describe('families/{familyId}/state — members read & write', () => {
  it('a member can write the shared state snapshot', async () => {
    await assertSucceeds(setDoc(doc(partner(), `families/${FAM}/state/current`), { version: '8', expenses: [] }));
  });
  it('a member can read the shared state snapshot', async () => {
    await assertSucceeds(getDoc(doc(owner(), `families/${FAM}/state/current`)));
  });
  it('a non-member cannot read or write the state snapshot', async () => {
    await assertFails(getDoc(doc(stranger(), `families/${FAM}/state/current`)));
    await assertFails(setDoc(doc(stranger(), `families/${FAM}/state/current`), { version: 'x' }));
  });
});

describe('familyInvites — owner sees own; open invites are redeemable; never client-writable', () => {
  it('owner can read their own (redeemed) invite', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'familyInvites/REDEEMED1')));
  });
  it('any signed-in user can read an UNREDEEMED invite (to redeem it)', async () => {
    await assertSucceeds(getDoc(doc(stranger(), 'familyInvites/OPEN1')));
  });
  it('a non-owner cannot read a REDEEMED invite', async () => {
    await assertFails(getDoc(doc(stranger(), 'familyInvites/REDEEMED1')));
  });
  it('invites are not client-writable (Functions only)', async () => {
    await assertFails(setDoc(doc(owner(), 'familyInvites/NEW'), { ownerUid: OWNER, redeemedAt: null }));
  });
});
