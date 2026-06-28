# Capacitor — Turning the Web App into an Android App

> **In one sentence:** Capacitor takes Spenza's website (HTML/JS built by Angular) and wraps it inside a real Android app, while also giving that web code a "bridge" to use native phone features it normally couldn't touch.

---

## 1. What it is (plain English)

A normal website runs inside a browser tab. It can't send a push notification when closed, can't store data in a truly native way, and can't trigger Android's native Google account picker. Those abilities belong to *native* apps written in Java/Kotlin.

**Capacitor** is the bridge between those two worlds. It does two things:

1. **Packaging.** It puts your built web app into a native Android container (a `WebView` — basically a full-screen, chrome-less browser inside an app). The user installs it from an APK / Play Store and it feels like a normal app.
2. **The native bridge.** It exposes **plugins** — small pieces of JavaScript that call into native Android code. So your TypeScript can write `await Preferences.set(...)` and behind the scenes it runs real native Android storage code.

Think of Capacitor as a *power adapter*: the web app is an appliance built for one kind of socket (the browser), and Capacitor is the adapter that lets it plug into a completely different socket (the phone's operating system).

---

## 2. The pain point it solves

Without Capacitor, Spenza would have to be built **twice**:
- once as a website in Angular/TypeScript, and
- again as a separate native Android app in Kotlin,

…with two teams, two codebases, two sets of bugs, and features drifting out of sync.

Capacitor removes that duplication. **One Angular codebase ships to both the website and the Android app.** A feature is written once and appears in both places. The only parts that differ are the few spots that need native power, and Capacitor isolates those behind a clean check:

```ts
// auth.service.ts
readonly #isNative = Capacitor.isNativePlatform();
// ...later, the code branches: native phones use one path, the browser another
```

So the pain points solved are: **code duplication, maintenance cost, feature drift, and the inability of plain web code to use native phone features.**

---

## 3. How Spenza uses Capacitor

### The configuration
`personal-finance-pwa/capacitor.config.ts` defines the app's identity and behaviour:

```ts
appId: 'com.spenza.app',           // the unique Android package name
appName: 'Spenza',
webDir: 'dist/personal-finance-pwa/browser',  // the built Angular output Capacitor packages
android: {
  allowMixedContent: false,        // security: don't load insecure http content
  captureInput: true,              // better keyboard handling
  overScrollMode: 'never',         // smooth, native-feeling scroll
},
```

The important idea: Capacitor doesn't build the web app — **Angular does** (`npm run build` → produces `dist/personal-finance-pwa/browser`). Capacitor just **picks up that folder** (`webDir`) and bakes it into the Android shell.

### The plugins Spenza actually uses
Spenza is built on Capacitor `^8.3.x`. Each plugin is a separate native capability:

| Plugin | What it gives Spenza | Pain point solved |
|--------|----------------------|-------------------|
| `@capacitor/core` + `@capacitor/cli` | The bridge itself + build tooling | The foundation everything else rides on. |
| `@capacitor/preferences` | Native key/value storage on the device | Reliable, fast local data that survives app restarts (used for the auth session, cached backup, settings). See [06-offline-storage-and-pwa.md](06-offline-storage-and-pwa.md). |
| `@capgo/capacitor-social-login` | **Native** Google sign-in (Android's account picker) | A real popup-free login on Android. See [03-oauth-google-signin.md](03-oauth-google-signin.md). |
| `@capacitor/browser` | Opens an external page in a system browser | The subscription/payment page is Firebase-hosted; native opens it in a real browser rather than the app's WebView. |
| `@capacitor/push-notifications` | Receives server-pushed notifications (via Firebase Cloud Messaging) | Reminders that arrive even when the app is closed. See [05-firebase.md](05-firebase.md). |
| `@capacitor/local-notifications` | Schedules notifications on the device itself | Spending/reminder alerts that don't need a server. |
| `@capacitor/app` | App lifecycle events (resume, back button, deep links) | Knowing when the user reopens the app, handling Android's back button. |

### The native-vs-web split in practice
The single most important real example is **sign-in**. Spenza detects the platform and picks the right login method:

- **On the web**, it loads Google's GSI script in the browser and shows the standard Google popup.
- **On Android (native)**, it calls the Capacitor social-login plugin, which triggers Android's *native* account picker:

```ts
// auth.service.ts — only runs when inside the native shell
if (this.#isNative) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({
    google: { webClientId: '...apps.googleusercontent.com' },
  });
}
```

Same app, same screen, two completely different login mechanisms underneath — and Capacitor is what makes that possible without two codebases.

---

## 4. Key files to look at

- `personal-finance-pwa/capacitor.config.ts` — app identity and native behaviour.
- `personal-finance-pwa/src/app/core/services/auth.service.ts` — the clearest example of the native/web branch (`Capacitor.isNativePlatform()`).
- `personal-finance-pwa/src/app/core/services/storage.service.ts` — wraps Capacitor Preferences.
- `personal-finance-pwa/src/app/core/services/local-notification.service.ts` and `fcm.service.ts` — notification plugins.
- `personal-finance-pwa/package.json` — the full plugin list under `dependencies`.

---

## 5. Gotchas worth knowing (pulled from the project's own notes)

- **Android needs its own OAuth client.** The config file ends with a comment: native Google sign-in uses the **Web** OAuth client ID, *but* Google Cloud must **also** have an **Android** OAuth client for `com.spenza.app` whose **SHA-1 fingerprint exactly matches the APK signing certificate**. If the SHA-1 is wrong, native sign-in silently fails. (See `sha-keys.md` in the repo root.)
- **`webDir` must point at the freshly built Angular output**, otherwise the Android app ships stale web code. Always build Angular before syncing Capacitor.
- **Storage keys are a contract.** The auth token keys stored via Preferences are *also read by the native Android home-screen widget*. The code explicitly warns: do **not** rename those key strings (`gapi_access_token`, etc.) or the widget breaks.
- **Capacitor Preferences on web** stores values under a `CapacitorStorage.` prefix in `localStorage` — this detail is exactly what the Playwright tests exploit to fake a logged-in session (see [02-playwright.md](02-playwright.md)).

---

## TL;DR

Capacitor is the reason Spenza is *one* project instead of two. It packages the Angular web app as an Android app and hands that web code a set of plugins (storage, notifications, native login, browser) so it can behave like a true native app where it matters — while everything else stays plain web code.
