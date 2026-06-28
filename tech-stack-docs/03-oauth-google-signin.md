# OAuth Consent & Google Sign-In — Login and Permissions

> **In one sentence:** OAuth is how Spenza lets you log in with your Google account *and* asks your permission to use specific things (like a private folder in your Google Drive) — without ever seeing your Google password.

---

## 1. What it is (plain English)

OAuth answers two separate questions that people often confuse:

1. **Authentication — "Who are you?"** Spenza needs to know your identity. Instead of making you create yet another username/password, it asks Google to vouch for you ("Sign in with Google").
2. **Authorization (consent) — "What are you allowing this app to do?"** Spenza wants to store your data in *your* Google Drive. It can't just do that — it has to **ask your permission**. That permission screen ("Spenza wants to see, edit, create and delete its own configuration data in your Drive") is the **consent** step.

The magic of OAuth: you never give Spenza your Google password. Instead, after you consent, Google hands Spenza a temporary **access token** — like a hotel key card. The card opens *only the rooms you approved* (your Drive app-data folder), works *only for a while* (then expires), and can be revoked anytime — all without exposing your master key (your password).

---

## 2. The pain point it solves

Without OAuth, an app wanting to store data in your Drive would have to ask for your actual Google password and act as you — a massive security and trust problem. OAuth solves several pains at once:

- **No password sharing.** Spenza never sees or stores your Google password.
- **Least privilege.** Spenza only requests the *exact* scopes it needs, and you see and approve them.
- **Revocable, expiring access.** Tokens expire (Spenza refreshes them silently) and you can revoke access in your Google account at any time.
- **No separate account system.** No "forgot password" flows, no password database for Spenza to secure and leak.

For Spenza specifically, OAuth is the **key that unlocks Drive sync** ([07-google-drive-sync.md](07-google-drive-sync.md)) and establishes the **Firebase identity** ([05-firebase.md](05-firebase.md)).

---

## 3. The scopes Spenza requests (and why)

A **scope** is a single, specific permission. Spenza asks for exactly these (`auth.service.ts`):

```ts
const ALL_SCOPES = `openid email profile https://www.googleapis.com/auth/drive.appdata`;
```

| Scope | What it grants | Why Spenza needs it |
|-------|----------------|---------------------|
| `openid` | A verified identity token | Proves who you are to Firebase Auth. |
| `email` | Your email address | Identifies your account/data. |
| `profile` | Basic profile (name) | Personalises the UI (e.g. greeting). |
| `drive.appdata` | Access to a **private, app-only folder** in your Drive | Where Spenza stores your expense data — *invisible to other apps and not your normal Drive files*. |

The `drive.appdata` scope is deliberately narrow: Spenza can only touch its **own** hidden folder, **not** your photos, documents, or anything else in Drive. That is "least privilege" in action.

There's also a **scope version** constant:

```ts
const SCOPE_VERSION = '9'; // v9 = removed spreadsheets scope (Sheets import removed)
```

When the required scopes change, this version bumps. On the next launch the app notices the mismatch and **clears the cached session to force fresh consent** — so users always re-approve when permissions genuinely change, and aren't left with stale tokens missing a needed scope.

---

## 4. How Spenza uses OAuth — two different code paths

This is the heart of it: **web and native phones sign in differently**, and Spenza handles both behind one `signIn()` concept (see [01-capacitor.md](01-capacitor.md) for the platform split).

### On the web — Google Identity Services (GSI)
The browser loads Google's GSI script (`accounts.google.com/gsi/client`). Spenza uses a **token client** to request an access token, which pops up Google's consent screen:

```ts
// Force the consent screen only when we previously lost a needed scope:
tokenClient.requestAccessToken(forceConsent ? { prompt: 'consent' } : undefined);
```

If you've already consented, Google skips the screen (`prompt` left default); if a scope was denied last time, Spenza passes `prompt: 'consent'` to re-show the checkboxes.

### On native Android — the social-login plugin
Inside the Capacitor shell, Spenza uses `@capgo/capacitor-social-login`, which triggers Android's **native account picker** (no browser popup):

```ts
const { SocialLogin } = await import('@capgo/capacitor-social-login');
result = await SocialLogin.login({ provider: 'google', options });
```

### Then: connecting to Firebase
Whichever path produced the Google token, Spenza converts it into a Firebase session so the backend knows who you are:

```ts
const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
const credential = GoogleAuthProvider.credential(idToken, accessToken);
const userCred = await signInWithCredential(auth, credential);
```

### Keeping you logged in (silent refresh)
Access tokens are short-lived. Spenza stores the token and its expiry, and refreshes it **silently before it expires** (with a 5-minute safety buffer) so you're never bounced to a login screen mid-action:

```ts
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min early
```

The session itself is restored from device storage on startup so the app opens straight into your data (see [06-offline-storage-and-pwa.md](06-offline-storage-and-pwa.md)).

---

## 5. The "granular consent" problem (a real bug this code defends against)

Google lets users **untick individual permission checkboxes** on the consent screen — this is called *granular consent*. A user could approve sign-in but **untick the Drive checkbox**. The result: sign-in "succeeds," but every Drive call returns `403 Forbidden`, which used to throw the user into an **endless sign-in → error → sign-in loop**.

Spenza fixes this explicitly. After sign-in it **checks whether the Drive scope was actually granted**:

```ts
// drive-scope.ts
export function grantedScopesIncludeDrive(scopeString) {
  return !!scopeString && scopeString.includes(DRIVE_APPDATA_SCOPE);
}
```

If Drive was *not* granted, it throws a clear, user-friendly error instead of looping:

```ts
export class MissingDriveScopeError extends Error {
  // "Google sign-in completed, but Drive access was not granted.
  //  Please sign in again and tick ALL permission checkboxes..."
}
```

…and it sets a flag so the **next** sign-in *forces* the consent screen again (`prompt: 'consent'`), giving the user another chance to tick the box. This is a textbook example of defensive OAuth handling.

---

## 6. Key files to look at

- `personal-finance-pwa/src/app/core/services/auth.service.ts` — the whole sign-in engine (web + native, token refresh, Firebase link).
- `personal-finance-pwa/src/app/core/utils/drive-scope.ts` — the granular-consent check (kept dependency-free so it's unit-testable).
- `personal-finance-pwa/src/app/features/auth/auth-callback.component.ts` — the landing/login screen.
- `personal-finance-pwa/src/app/core/guards/auth.guard.ts` — blocks routes until a session is restored.
- `personal-finance-pwa/src/app/core/interceptors/auth.interceptor.ts` — attaches the token to outgoing API calls.
- `personal-finance-pwa/capacitor.config.ts` — native SocialLogin provider config.

---

## 7. Gotchas worth knowing

- **Two OAuth clients in Google Cloud.** A **Web** client ID (injected via `window.__GOOGLE_CLIENT_ID__` in `index.html`) *and* an **Android** client whose SHA-1 matches the APK signer. Native sign-in fails silently if the Android client/SHA-1 is wrong.
- **Granular consent is the classic trap.** Always assume a user might untick a scope; the code shows the right pattern — verify granted scopes, fail loudly, force re-consent next time.
- **Scope changes must bump `SCOPE_VERSION`.** Otherwise returning users keep a cached token missing the new scope.
- **Never rename the token storage keys** (`gapi_access_token`, etc.) — the native Android widget reads them directly.
- **`drive.appdata` is intentionally minimal.** If a feature ever needs broader Drive access, that's a new scope, new consent, and a version bump — don't widen it casually.

---

## TL;DR

OAuth lets users sign into Spenza with Google and *grant a narrow, revocable permission* to a private Drive folder — no password sharing. Spenza requests only the scopes it needs, runs two sign-in paths (web GSI vs native Android picker), links the result to Firebase, refreshes tokens silently, and carefully defends against Google's "granular consent" trap so a user who unticks the Drive box gets a clear message instead of an infinite loop.
