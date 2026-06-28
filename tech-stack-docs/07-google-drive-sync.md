# Google Drive Sync — Where the User's Data Really Lives

> **In one sentence:** Instead of storing your expenses in Spenza's own database, Spenza saves them as a private JSON file in *your own Google Drive* — so you own your data, it follows you across devices, and Spenza never has to be the custodian of your finances.

---

## 1. What it is (plain English)

Most apps keep your data on *their* servers. Spenza makes a deliberate, unusual choice: **your data lives in your Google Drive**, in a hidden, app-only folder (the `drive.appdata` space). Spenza writes a JSON file there and reads it back. That file is the **authoritative source of truth**; the device keeps a local cached copy for speed and offline use.

Think of it as Spenza using *your* filing cabinet instead of keeping your documents in *their* office. They have a key to one drawer (granted via OAuth consent), and only that drawer.

---

## 2. The pain point it solves

- **Data ownership & trust.** Your financial data sits in *your* Google account, not a company database that could be breached, sold, or shut down. If you stop using Spenza, your data is still in your Drive.
- **Cross-device continuity.** Sign in on a new phone → Spenza reads the same Drive file → your history is just *there*. No export/import.
- **Lower liability & cost for Spenza.** It doesn't have to securely store, back up, and be legally responsible for everyone's financial records, nor pay for that storage.
- **Privacy by design.** The `drive.appdata` folder is hidden from your normal Drive view and inaccessible to other apps.

---

## 3. How Spenza uses it

### The access flow (how it connects to the other stacks)
1. The user signs in with Google and **consents** to the `drive.appdata` scope ([03-oauth-google-signin.md](03-oauth-google-signin.md)).
2. That produces a short-lived **access token**.
3. The token is attached to Google Drive API calls (via the auth interceptor) to read/write the JSON backup file.
4. Data is saved **locally first**, then synced to Drive in the background with retry ([06-offline-storage-and-pwa.md](06-offline-storage-and-pwa.md)).

This is why OAuth and Drive are inseparable: **the consent token is the only thing that unlocks the Drive file.** If the Drive scope is missing, every call 403s — exactly the "granular consent" failure the auth code defends against.

### The services involved
- `google-drive.service.ts` — the low-level read/write to the Drive AppData file.
- `sync.service.ts` — orchestrates local↔Drive sync, ordering, and retry.
- `family-sync.service.ts` — coordinates shared/household ("family mode") syncing so multiple members stay consistent.
- `sync-diagnostics.service.ts` — surfaces sync health/problems for debugging.

### Authoritative vs. cached
The project context states it directly: *"Current source of truth for user data: Google Drive JSON backup."* Returning users also keep a **local cached copy** so the app starts instantly; **Drive remains authoritative** and syncs after launch once a token is available. So:

- **Read on startup:** show local cache immediately → then reconcile with Drive.
- **Write:** local first → background sync to Drive → retry on failure.

### A historical note (why JSON, not Sheets)
Spenza *used* to use Google Sheets and even had a spreadsheets OAuth scope. That was removed (the scope version bumped to `v9` to drop the Sheets scope). The data model is now a **single JSON backup file**, which is simpler, faster, and needs a narrower permission.

---

## 4. Key files to look at

- `personal-finance-pwa/src/app/core/services/google-drive.service.ts` — Drive read/write.
- `personal-finance-pwa/src/app/core/services/sync.service.ts` — sync orchestration + retry.
- `personal-finance-pwa/src/app/core/services/family-sync.service.ts` — household/shared sync.
- `personal-finance-pwa/src/app/core/services/sync-diagnostics.service.ts` — sync health.
- `personal-finance-pwa/src/app/core/utils/drive-scope.ts` — verifies the Drive permission was granted.

---

## 5. Gotchas worth knowing

- **No token, no Drive.** Drive access depends entirely on a valid Google access token; if it's missing/expired and silent refresh fails, sync must queue and retry — never lose the local data.
- **Granular consent can silently disable Drive.** A user who unticks the Drive box gets a working login but a dead Drive — handled by `MissingDriveScopeError` (see [03-oauth-google-signin.md](03-oauth-google-signin.md)).
- **Conflict direction matters.** Drive is authoritative; the local copy is a cache. Be deliberate about merge/conflict logic so a stale local copy doesn't overwrite newer Drive data (family mode makes this especially important).
- **`appdata` is invisible by design.** Users won't see the file in their normal Drive — that's expected, not a bug.
- **Tests fake Drive entirely.** Playwright intercepts all `googleapis.com` calls with fixtures, so test behaviour reflects the fixtures, not real Drive.

---

## TL;DR

Spenza stores each user's expense data as a private JSON file in their *own* Google Drive (the hidden `appdata` folder), unlocked by the OAuth consent token, with a local cached copy for instant, offline startup. Drive is the source of truth; the device caches and syncs in the background with retry. The payoff: users own their data, it follows them across devices, and Spenza avoids being the custodian of everyone's finances.
