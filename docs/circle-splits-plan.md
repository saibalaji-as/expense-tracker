# Circle Splits — Group Expense Sharing (Trip Settlement)

Status: Phase 1 in progress (2026-07-19).
Owner naming: feature **Splits**, a group **Circle**, invite **Circle Link**, settlement **Settle Up**.

## 1. Requirement (BA analysis)

User story: a group goes on a trip. During the trip each person pays for things
(hotel, fuel, food) from their own pocket. After the trip everyone settles:
each member owes `their per-head share − what they paid`. Members who paid more
than their share receive money.

Product decisions (agreed with Sai 2026-07-19):

- **Synced, multi-user.** Members install/open Spenza via a shared Circle Link.
  This is deliberately a growth loop: the link lands on the PWA
  (`https://spenza.site/#/join/CODE`), so joiners need only a Google sign-in,
  not an APK.
- **Free tier, NOT Pro-gated.** A paywalled invite link kills the viral loop.
  (Family mode stays Pro; Circles are free. Firestore cost per circle is
  negligible — tens of small docs.)
- **Placeholder members are mandatory.** The creator adds people by name.
  Joiners claim their seat via the link. Settlement must never block on
  everyone installing the app. The creator (or any member) can log cash spends
  on behalf of unclaimed members.
- **Equal split only** in Phase 1 (per-expense participant selection allowed —
  "who was part of this bill"). Exact/percent splits deferred.
- **Budget integrity rule (FINAL, revised 2026-07-19):** circle bills live
  ONLY in the circle while it is active — they never touch `expenses[]`,
  budgets, accounts, streaks, or analytics. On **Settle Up**, every member's
  device AUTO-LOGS one personal `ExpenseEntry` for their per-head share
  (`source: 'circle-settle'`, category Miscellaneous, comment = the full Share
  Summary text + `[circleId]` dedupe tag). No user action, no modal.
  REVERTED alternative (implemented then removed same day, kept here as a
  decision record): the "linked-entry / full-now-true-up-on-settle" model —
  paid-by-me bills mirrored into Daily at full amount and were auto-reduced to
  the share on settle. Rejected by product owner as an unnecessary flow;
  don't reintroduce without re-reading TASK_HISTORY 2026-07-19.
- Each member can create/edit/delete **their own** circle expenses and view
  everyone's (enforced by Firestore rules, not just UI).

## 2. Why not reuse the Family Ledger

The Family Ledger (`families/{id}/ledger`) is hard-wired to 2 roles
(owner/partner), merges full financial state (accounts, debts, limits), and is
Pro-gated. Circles are N-member, expense-only, free, and ephemeral
(settled/archived). Separate collections, separate rules, separate services.
No shared code paths except `firestore-db.ts` and the auth/ID-token plumbing.

## 3. Data model (Firestore)

```
circles/{circleId}
  circleId, name, emoji?, currency          // creator's app currency snapshot
  ownerUid, ownerEmail
  members: {                                 // map keyed by memberId (uuid)
    [memberId]: {
      memberId, name,                        // display name (placeholder name)
      uid: string|null, email: string|null,  // set when seat is claimed
      joinedAt: string|null
    }
  }
  memberUids: string[]                       // claimed uids — used by rules + queries
  status: 'active' | 'settled'
  createdAt, updatedAt, settledAt: string|null

circles/{circleId}/expenses/{expenseId}
  expenseId, circleId
  description, amount (number, > 0), date (YYYY-MM-DD)
  paidByMemberId                             // who paid (may be an unclaimed member)
  participantMemberIds: string[]             // equal split among these (>= 1)
  authorUid                                  // who logged it — write ownership
  createdAt, updatedAt
  deleted: boolean                           // tombstone — no doc deletes

circleInvites/{code}                          // 8-char code, MULTI-USE (whole
  code, circleId, ownerUid                    // group shares one link), 7-day TTL
  createdAt, expiresAt, revoked: boolean
```

Differences vs family invites: multi-use + 7-day TTL (a trip link is pasted in
a WhatsApp group once; single-use 24h codes would force the owner to generate
N codes).

## 4. Security rules

- `circles/{id}` read: `request.auth.uid in resource.data.memberUids`.
  Client writes: **none** (Functions only) — membership and status changes are
  server-authoritative.
- `expenses` read: member. Create: member AND `authorUid == request.auth.uid`
  AND circle `status == 'active'`. Update: author only (owner may also edit,
  for cleanup of placeholder spends) and only while active. Delete: never —
  tombstone via update.
- `circleInvites` read: owner or unexpired+unrevoked (joiner needs to preview
  circle name before sign-up). Writes: Functions only.

## 5. Cloud Functions (functions/src/circles.ts)

All POST, Firebase ID-token auth, CORS same as family.ts. **No Pro gate.**

- `createCircle { name, memberNames[] }` → creates circle; caller becomes
  owner + first claimed member; each name becomes a placeholder member.
  Cap: 20 members, 40-char names. Returns `{ circleId }`.
- `createCircleInvite { circleId }` → owner-only, returns `{ inviteCode,
  expiresAt }` (reusable, 7 days).
- `redeemCircleInvite { inviteCode, claimMemberId?, displayName? }` →
  transaction: validates invite; if `claimMemberId` given claims that
  placeholder (must be unclaimed), else appends a new member; adds uid to
  `memberUids`. Idempotent for already-joined uid. Returns `{ circleId }`.
- `updateCircle { circleId, name?, addMemberNames?, renameMember?, removeMemberId? }`
  → owner-only housekeeping; removing a member only allowed when they have no
  expenses and no participation.
- `settleCircle { circleId }` → owner-only, sets `status: 'settled'`,
  `settledAt`. Expenses become read-only via rules.

## 6. Client architecture (Angular)

- `core/models/circle.model.ts` — interfaces above + join-intent storage key.
- `core/utils/circle-settlement.ts` — PURE:
  - `computeMemberBalances(members, expenses)` → per member `{ paid, share, net }`
    in integer paise (rounding remainder distributed deterministically to the
    first participants by memberId sort, so everyone's client shows identical
    numbers).
  - `computeSettlementTransfers(balances)` → greedy min-transfer list
    (largest debtor pays largest creditor). N−1 transfers max.
  - Unit-tested (vitest).
- `core/services/circle-api.service.ts` — fetch wrappers (mirrors
  `FamilyApiService`, shares `FamilyApiError` shape via own `CircleApiError`).
- `core/services/circle-sync.service.ts` — Firestore listeners via
  `getSharedFirestore()`:
  - `circles` query `where('memberUids','array-contains', uid)` → `circles()` signal.
  - per-circle expense listener attached on demand → `expenses()` signal.
  - Direct client writes for expense create/update/tombstone (rules-guarded),
    same trust model as the family ledger.
- Pending join intent: `/join/:code` is a public route; if unauthenticated it
  stores the code in Capacitor Preferences (`spenza_pending_circle_join_v1`)
  and routes to `/auth/callback`; `/splits` redeems any pending code on load.
  No `app.ts` bootstrap changes — keeps blast radius zero.

## 7. UI (features/splits/)

- `/splits` — Splits home: your circles (name, member avatars, **your net**
  position colored green/red), create-circle sheet (name + member name chips),
  "Have a Circle Link?" code entry, auto-redeem of pending join.
- `/splits/:id` — Circle detail, 3 tabs:
  - **Expenses**: date-grouped list (payer chip, amount, participants count),
    FAB to add; add/edit sheet: description, amount, date, "Paid by" member
    select, participant checkboxes (default all). Author-only edit/delete.
  - **Balances**: per-member paid / share / net bars.
  - **Settle Up**: minimal transfer list ("Bala → Sai ₹1,250"), share-summary
    button (navigator.share / clipboard: full text breakdown for WhatsApp),
    owner-only **Settle Up** action → `settleCircle` + "post my share to
    budget" modal (category picker, default Entertainment; skippable).
- `/join/:code` — public join screen: circle name preview, claim-your-seat
  picker (unclaimed members) or "join as new", sign-in handoff.
- Nav: desktop nav item `nav.splits` (Users icon) + mobile top-bar icon.
- i18n: `splits.*` keys in en/ta/hi from day one.

## 8. Phases

- **Phase 1 (this pass):** everything in §3–§7. Web/PWA + Capacitor WebView.
- **Phase 2 (native, needs local Android build):** widget checkbox "Circle
  expense" + circle picker in `ExpenseWidgetActivity`; queue tag
  `circleId`; flushed by app → Firestore write. Also FCM nudge when a
  circle member adds an expense (reuse `notifyPartnerLedgerWrite` pattern).
- **Phase 3 (only if demand):** exact/percent splits, multi-currency circles,
  settlement payment links (UPI deep links), receipt photos on circle expenses.

## 9. Explicitly rejected

- Dumping circle expenses into `expenses[]` (corrupts budgets — see §1).
- Reusing family ledger collections/rules for N members.
- Pro-gating circle creation or joining.
- Real-money settlement execution (UPI collect etc.) — Spenza records, never
  moves money.
