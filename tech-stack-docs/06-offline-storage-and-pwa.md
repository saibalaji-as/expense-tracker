# Offline Storage & PWA — Never Lose an Entry

> **In one sentence:** A combination of Capacitor Preferences, IndexedDB, and a Service Worker lets Spenza save your data on the device *first*, work with no internet, and load instantly — so an expense you typed is never lost, even on a flaky connection.

---

## 1. What it is (plain English)

This isn't one technology — it's a layered strategy with three players:

1. **Capacitor Preferences** — simple, reliable **key/value storage** on the device (think: a small notebook for settings, the login session, and a cached snapshot of your data). Works the same on web and native.
2. **IndexedDB (via the `idb` library)** — a real **in-browser database** for larger or queued data (used for the offline/legacy sync queue).
3. **Service Worker (PWA)** — a script that sits between the app and the network. It **caches the app's files** so the website loads (and runs) even offline, and makes the web app **installable** like a native app. This is what makes Spenza a **PWA** (Progressive Web App).

Together these implement an **offline-first** design: the device is the primary place data is written, and the cloud is synced afterward.

---

## 2. The pain point it solves

Imagine typing an expense on the bus, in a tunnel, with no signal. In a naive "cloud-first" app, that save fails and your entry is gone. That's unacceptable for an expense tracker — the whole point is to capture spending *the moment it happens*.

Spenza's offline-first rule (recorded in the project's own memory) is blunt: **never lose a user entry.** This layer solves:

- **Data loss on poor connectivity** — save locally first, *then* sync.
- **Slow cold starts** — show a cached snapshot instantly instead of waiting on the network.
- **App unusable offline** — the Service Worker serves the cached app so it opens and works with no internet.
- **Re-downloading everything each launch** — caching avoids it.

---

## 3. How Spenza uses it

### The offline-first flow
The documented rule is: **save local-first, sync to Drive in the background with retry; refresh tokens silently; keep receipts decoupled.** In practice:

1. You add an expense → it's written to local storage immediately and shown in the UI.
2. In the background, Spenza syncs the change up to Google Drive (the authoritative copy — see [07-google-drive-sync.md](07-google-drive-sync.md)).
3. If the sync fails (no token, no network), it **retries** later — your data is already safe locally.

### Capacitor Preferences — the fast local cache
Spenza wraps Preferences in a `StorageService`. It holds:
- the **auth session** (so you stay logged in across restarts),
- the short-lived **Google access token** and its expiry,
- a **local backup snapshot** of your data for instant startup.

On startup, `auth.service.ts` reads all the session keys in **one parallel batch**, because each Preferences read on Android is a native round-trip and doing them sequentially measurably slowed cold start:

```ts
const [authState, scopeVersion, email, uid, token, expiresAt] = await Promise.all([
  this.storageService.get('gapi_auth_state'),
  this.storageService.get('gapi_scope_version'),
  // ...etc
]);
```

> **Cross-stack tie-in:** on the **web**, Capacitor Preferences are stored in `localStorage` under a `CapacitorStorage.` prefix — which is exactly how the [Playwright tests](02-playwright.md) fake a logged-in session.

### IndexedDB via `idb` — the bigger/queued store
For data that doesn't fit a simple key/value model — notably the offline/legacy sync queue — Spenza uses **IndexedDB** through the `idb` library (a thin, friendly wrapper around the browser's verbose IndexedDB API).

### Service Worker — the PWA layer
Angular's built-in service worker (`@angular/service-worker`, configured by `ngsw-config.json`) caches the app shell and assets. This:
- makes the website **load offline**,
- makes Spenza **installable** to the home screen as a PWA, and
- speeds up repeat visits by serving cached files.

---

## 4. Key files to look at

- `personal-finance-pwa/src/app/core/services/storage.service.ts` — the Capacitor Preferences wrapper.
- `personal-finance-pwa/src/app/core/services/sync.service.ts` — background sync to Drive with retry.
- `personal-finance-pwa/src/app/core/services/expense-store.service.ts` — the in-memory source of truth that's persisted.
- `personal-finance-pwa/ngsw-config.json` — service worker caching rules.
- `personal-finance-pwa/package.json` — see `idb`, `@capacitor/preferences`, `@angular/service-worker`.

---

## 5. Gotchas worth knowing

- **Local-first is a hard rule, not a nicety.** Any new write path must save locally before attempting the network. Breaking this risks data loss — the cardinal sin for this app.
- **Don't rename storage keys casually.** Session/token keys are read by `auth.service` *and* the native Android widget. Renaming silently breaks restore and the widget.
- **Batch native reads.** Sequential Preferences reads are slow on Android; read in parallel on startup.
- **Drive is authoritative, local is a cache.** On conflict, the design treats Drive as the source of truth and the local snapshot as a fast-start convenience — keep that direction straight when reasoning about sync.
- **Service worker caching can hide updates.** During development a stale service worker can serve old files; know how to bypass/refresh it when debugging.

---

## TL;DR

Spenza's offline-first stack saves to the device first (Capacitor Preferences for session + snapshot, IndexedDB for queued data) and syncs to Drive in the background with retry, while a Service Worker caches the app so it loads and works offline and installs like a native app. The guiding rule is simple and absolute: never lose a user entry.
