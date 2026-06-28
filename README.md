# Spenza — Command Reference (README)

Spenza is a personal-finance / expense-tracking PWA. The web app is an **Angular 21** application that lives in `personal-finance-pwa/`, packaged for Android with **Capacitor**, backed by **Firebase** (Hosting, Firestore, Auth, Cloud Functions) and **Netlify** for static hosting. Cloud Functions handle Razorpay subscriptions.

This document lists **every terminal command used anywhere in the project** — npm scripts, build/test/deploy commands, Firebase, Playwright, Capacitor/Android, AI-context (Graphify) tooling, and CI — each with a detailed explanation of what it does, where to run it, and when you'd use it.

> **Path conventions**
> - **Repo root**: the top-level `expense-tracker/` folder (contains `scripts/`, `netlify.toml`, `personal-finance-pwa/`).
> - **App root**: `personal-finance-pwa/` — this is where almost every npm / build / test command runs (it holds `package.json`, `angular.json`, `firebase.json`).
> - **Functions root**: `personal-finance-pwa/functions/` — the Cloud Functions sub-package with its own `package.json`.
> - **Android root**: `personal-finance-pwa/android/` — the native Android project (Gradle).

---

## 1. Prerequisites & one-time setup

| Tool | Version | Why |
|------|---------|-----|
| Node.js | **22** | Required by CI and Cloud Functions (`engines.node = 22`). |
| npm | **10.9.2** | Declared `packageManager`; use the matching major. |
| Firebase CLI | latest | Emulators, deploy, functions logs. |
| Java JDK + Android SDK | — | Only for Android/Gradle builds. |
| Python 3 | — | Only for the `gate-console.py` lint helper. |
| `uv` + Graphify | — | Only for the AI knowledge-graph tooling (optional). |

### `npm install`
Run in **app root** (`personal-finance-pwa/`). Installs all dependencies and devDependencies from `package.json` into `node_modules/`, resolving versions and updating `package-lock.json` if needed. Use this for local development right after cloning or after pulling changes that touch dependencies.

```bash
cd personal-finance-pwa
npm install
```

### `npm ci`
Clean, reproducible install. Deletes `node_modules/` and installs **exactly** the versions pinned in `package-lock.json`, failing if `package.json` and the lockfile disagree. This is what CI and Netlify use because it's faster and deterministic. Use it in automation or whenever you want a pristine install.

```bash
npm ci
```

### Install the Firebase CLI (global)
Installs the `firebase` command globally so you can run emulators and deploys. CI installs it this way; locally you can also use `npx firebase-tools` instead.

```bash
npm install -g firebase-tools
```

### `npm install @capacitor/push-notifications`
Adds the Capacitor push-notifications plugin. Invoked by the `setup-android-fixes.sh` helper; only needed if the dependency is missing.

```bash
npm install @capacitor/push-notifications
```

---

## 2. App development & build (npm scripts in `personal-finance-pwa/package.json`)

All of these run from the **app root**. Each maps to an entry under `"scripts"`.

### `npm start`  →  `ng serve`
Starts the Angular dev server with live reload at **http://localhost:4200**. This is your everyday "run the app locally" command. Playwright also launches this automatically for E2E runs.

```bash
npm start
```

You can pass a configuration through, e.g. development mode (this exact form is what Playwright uses):

```bash
npm run start -- --configuration=development
```

### `npm run ng`  →  `ng`
A passthrough to the Angular CLI binary. Use it to run any `ng` subcommand through the locally-installed CLI without a global install, e.g. `npm run ng -- generate component foo`.

```bash
npm run ng -- <ng-subcommand>
```

### `npm run build`  →  `ng build`
Produces a production build into `dist/personal-finance-pwa/browser/`. This is the artifact Firebase Hosting and Netlify publish, and the web assets Capacitor copies into Android. Run before any deploy or `cap sync`.

```bash
npm run build
```

Production configuration explicitly (used in CI):

```bash
npm run build -- --configuration production
```

### `npm run watch`  →  `ng build --watch --configuration development`
Rebuilds continuously in development configuration whenever source files change, writing to `dist/`. Useful when something consumes the built output (e.g. an Android `cap sync` loop) and you want it kept fresh, as an alternative to `ng serve`.

```bash
npm run watch
```

---

## 3. Unit & rules tests

### `npm test`  →  `ng test`
Runs the Angular unit test suite via the `@angular/build:unit-test` builder (Vitest under the hood, per `vitest.config.ts`, which includes `src/**/*.spec.ts`). This is the primary unit-test command.

```bash
npm test
```

### `npm run test:rules`  →  Firestore security-rules tests
Runs the Firestore **security-rules** test suite. It boots the Firestore emulator under a throwaway project (`demo-spenza-rules`) and runs Vitest with the dedicated `vitest.rules.config.ts` (which includes only `firestore-tests/**/*.spec.ts`, runs serially, and uses longer timeouts). These are kept separate from `npm test` because they need a live emulator.

```bash
npm run test:rules
```

Expanded form (what the script actually executes):

```bash
firebase emulators:exec --only firestore --project demo-spenza-rules "vitest run -c vitest.rules.config.ts"
```

### Running Vitest directly (optional)
The default config drives `npm test`, but you can invoke Vitest directly for the rules config or ad-hoc runs:

```bash
npx vitest run                              # one-shot run, default config
npx vitest run -c vitest.rules.config.ts    # rules suite (needs Firestore emulator running)
```

---

## 4. End-to-end (E2E) tests — Playwright

The E2E suite uses Playwright. Playwright auto-starts the dev server (`npm run start -- --configuration=development`) via its `webServer` config and targets **http://localhost:4200**. For Firestore-dependent specs, run it inside the Firebase emulators (see the CI command below).

### `npm run e2e`
Full local E2E run: executes the Playwright suite, then generates a Markdown report (`e2e/generate-report.js`) and extracts the HTML report (`e2e/extract-html-report.js`). Note the steps are chained with `;`, so report generation runs even if tests fail (which also means a test failure won't fail this script's exit code — CI deliberately calls `playwright test` directly instead).

```bash
npm run e2e
```

Expands to:

```bash
playwright test; node e2e/generate-report.js; node e2e/extract-html-report.js
```

### `npm run e2e:headed`
Same as `npm run e2e` but runs the browser in **headed** mode so you can watch the tests execute. Useful for debugging flaky UI behavior.

```bash
npm run e2e:headed
```

### `npm run e2e:debug`  →  `playwright test --debug`
Launches the Playwright Inspector, pausing execution so you can step through tests, inspect selectors, and live-debug.

```bash
npm run e2e:debug
```

### `npm run e2e:list`  →  `playwright test --list`
Lists every discovered test without running anything. Good for confirming which specs/titles are registered.

```bash
npm run e2e:list
```

### `npm run e2e:report`  →  `playwright show-report e2e-report`
Opens the previously-generated Playwright HTML report (from the `e2e-report/` folder) in a browser.

```bash
npm run e2e:report
```

### `npm run e2e:md-report`  →  `node e2e/generate-report.js`
Regenerates only the Markdown summary report from the latest results JSON, without re-running tests.

```bash
npm run e2e:md-report
```

### `npm run e2e:full-report`  →  `node e2e/extract-html-report.js`
Extracts/post-processes the full HTML report from results, without re-running tests.

```bash
npm run e2e:full-report
```

### Install Playwright browsers
Before the first E2E run you need browser binaries. CI installs only Chromium with OS dependencies; locally you can install all.

```bash
npx playwright install --with-deps chromium   # CI: chromium + system deps
npx playwright install                         # local: all default browsers
```

### Run E2E against the Firebase emulators (CI-style)
This is the reliable way to run the suite with a real Auth + Firestore backend. The `demo-spenza` project ID makes the emulators run fully offline with no credentials. Playwright starts `ng serve` itself; `emulators:exec` just keeps Auth (9099) and Firestore (8080) up for the duration. CI calls `playwright test` directly (not `npm run e2e`) so a test failure isn't masked by the chained report steps.

```bash
firebase emulators:exec --only auth,firestore --project demo-spenza "npx playwright test"
```

---

## 5. Firebase — emulators, hosting & deploy

Run from the **app root** (where `firebase.json` and `.firebaserc` live). The default project is `spenza-notifications`; the hosting target `spenza-site` maps to site `spenza-finance`.

### `npm run emulators:start`  →  `firebase emulators:start --only auth,firestore`
Starts the Firebase Auth (port 9099) and Firestore (port 8080) emulators locally, with the Emulator UI on port 4400. Use this when developing features that read/write Firestore or use auth, so you don't touch production data.

```bash
npm run emulators:start
```

### `firebase emulators:exec ...`
Runs a one-off command **inside** a temporary emulator session and shuts the emulators down afterward. Used by `test:rules` and by the E2E CI command. General form:

```bash
firebase emulators:exec --only <services> --project <id> "<command>"
```

### Firebase deploy commands

Before deploying interactively you may need to authenticate and/or select the project (CI uses a token instead and skips these):

```bash
firebase login                              # authenticate the CLI (one-time, interactive)
firebase use spenza-notifications           # select the active project (default per .firebaserc)
```

**Full production deploy (Hosting + subscription Functions) — what CI runs.**
This is the exact command the GitHub Actions workflow runs on push to `main` after building. It deploys the hosting site and a specific allow-list of Razorpay subscription functions, non-interactively, authenticating with a CI token. Run only when you intend to ship to production.

```bash
npx firebase-tools@latest deploy \
  --only hosting:spenza-site,functions:createSubscriptionHandoff,functions:redeemSubscriptionHandoff,functions:createRazorpaySubscription,functions:verifyRazorpayPayment,functions:razorpayWebhook,functions:restoreRazorpaySubscription,functions:cancelRazorpaySubscription \
  --project spenza-notifications --non-interactive --token "$FIREBASE_TOKEN"
```

**Deploy only the Cloud Functions.** Pushes just the functions (build them first). Used during the production-launch security-fix flow. Also available as `npm run deploy` from the functions package (see §6).

```bash
firebase deploy --only functions
```

**Deploy specific functions only.** Target one or more functions by name (comma-separated) instead of redeploying all of them.

```bash
firebase deploy --only functions:sendDueReminders,functions:registerToken
```

**Deploy only Hosting.** Publishes the built web app (`dist/personal-finance-pwa/browser`) without touching functions. Build with the production config first.

```bash
firebase deploy --only hosting
```

**Deploy Firestore security rules.** Pushes `firestore.rules`. **CI does NOT deploy rules** — you must run this manually after changing rules, or rule-dependent screens (e.g. reminders) break with permission-denied.

```bash
npx firebase-tools deploy --only firestore:rules --project spenza-notifications
```

**Deploy Firestore indexes.** Pushes `firestore.indexes.json`. Indexes must finish building before queries that depend on them work.

```bash
firebase deploy --only firestore:indexes
```

**Combined rules + indexes + functions deploy.** Deploy backend pieces together (indexes build before the dependent function query runs).

```bash
firebase deploy --only functions:sendDueReminders,functions:registerToken,firestore:indexes,firestore:rules
```

### Delete a deployed function
Removes an already-deployed function instance from the cloud (e.g. retiring the insecure `testNotification` endpoint after redeploy).

```bash
firebase functions:delete testNotification
```

---

## 6. Cloud Functions package (`personal-finance-pwa/functions/`)

This sub-package has its own `package.json` and Node 22 runtime. Run these from the **functions root**.

### `npm ci` / `npm install` (functions)
Installs the functions package's dependencies (firebase-admin, firebase-functions, razorpay). CI runs `npm ci` here separately from the app.

```bash
cd personal-finance-pwa/functions
npm ci
```

### `npm run build`  →  `tsc`
Compiles the functions' TypeScript to JavaScript in `lib/` (entry point `lib/index.js`). Must run before deploying functions.

```bash
npm run build
```

### `npm run build:watch`  →  `tsc --watch`
Recompiles continuously on file changes — handy while developing functions alongside the emulator.

```bash
npm run build:watch
```

### `npm run serve`  →  build + functions emulator
Builds the functions and starts only the Functions emulator, so you can exercise them locally.

```bash
npm run serve
```

### `npm run shell` / `npm start`  →  build + functions shell
Builds, then opens the Firebase Functions interactive shell to invoke functions manually with custom payloads. `npm start` is an alias for `npm run shell`.

```bash
npm run shell
```

### `npm run deploy`  →  `firebase deploy --only functions`
Deploys all functions from within the functions package.

```bash
npm run deploy
```

### `npm run logs`  →  `firebase functions:log`
Streams/prints the deployed Cloud Functions logs for debugging production behavior.

```bash
npm run logs
```

---

## 7. Android / Capacitor

Capacitor wraps the built web app into a native Android project. Web→native commands run from the **app root**; Gradle commands run from the **Android root** (`personal-finance-pwa/android/`).

### `npx cap sync` / `npx cap sync android`
Copies the latest web build from `dist/` into the native project and updates native plugin dependencies. **Run after every `npm run build`** so the Android app reflects your latest web code. `cap sync android` targets only Android.

```bash
npx cap sync
npx cap sync android
```

### `npx cap run android`
Builds and launches the app on a connected device or emulator in one step — the quickest way to test on-device.

```bash
npx cap run android
```

### `npx cap open android`
Opens the native project in Android Studio (useful for native debugging or release signing).

```bash
npx cap open android
```

### Gradle: `./gradlew clean`
Run from `personal-finance-pwa/android/`. Deletes previous build outputs for a clean rebuild.

```bash
cd personal-finance-pwa/android
./gradlew clean
```

### Gradle: `./gradlew assembleDebug`
Builds a debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`. Add `--stacktrace` to see full errors on failure.

```bash
./gradlew assembleDebug
./gradlew assembleDebug --stacktrace   # verbose errors
```

### Release signing env vars: `SPENZA_STORE_PASSWORD` / `SPENZA_KEY_PASSWORD`
The release signing config in `android/app/build.gradle` reads the keystore and key passwords from the environment (`storePassword System.getenv("SPENZA_STORE_PASSWORD")`, `keyPassword System.getenv("SPENZA_KEY_PASSWORD")`, with `keyAlias 'spenza'` and `storeFile spenza-release.keystore`). You **must export both before building a signed release** — if they're unset the signing passwords fall back to empty strings and the signed build will fail. Set them in the same shell session that runs `bundleRelease` (don't commit them).

```bash
export SPENZA_STORE_PASSWORD='<your-keystore-password>'
export SPENZA_KEY_PASSWORD='<your-key-password>'
```

### Gradle: `./gradlew bundleRelease`
Builds the **signed** release Android App Bundle (`.aab`) for uploading to the Google Play Store. Run it from `personal-finance-pwa/android/` **after** exporting the two signing passwords above (and with `google-services.json` in place). Without the env vars set, signing will fail.

```bash
export SPENZA_STORE_PASSWORD='<your-keystore-password>'
export SPENZA_KEY_PASSWORD='<your-key-password>'
cd personal-finance-pwa/android
./gradlew bundleRelease
```

### `adb install`
Installs a built APK onto a connected device via the Android Debug Bridge.

```bash
adb install app/build/outputs/apk/debug/app-debug.apk      # debug build
adb install android/app/release/app-release.apk            # release build
```

### Helper script: `./rebuild-android.sh`
Run from the **app root**. End-to-end Android rebuild: `npm run build` → `npx cap sync android` → `./gradlew clean` → `./gradlew assembleDebug`, with status checks at each step and the APK path printed at the end.

```bash
./rebuild-android.sh
```

### Helper script: `./setup-android-fixes.sh`
Run from the **app root**. Installs the `@capacitor/push-notifications` plugin and runs `npx cap sync android`, then prints follow-up steps (adding `google-services.json`, building/testing).

```bash
./setup-android-fixes.sh
```

---

## 8. Code-quality helper

### `python3 scripts/gate-console.py`
Run from the **app root** (`personal-finance-pwa/`). Wraps `console.log` / `console.warn` calls behind Angular's `isDevMode()` in a fixed list of service/component files, so debug logging is stripped from production. Run it before shipping when you've added console logging.

```bash
python3 scripts/gate-console.py
```

> Formatting is handled by the Prettier config embedded in `package.json` (100-char width, single quotes, Angular HTML parser) — typically via your editor/IDE rather than a dedicated script.

---

## 9. AI knowledge-graph tooling (Graphify) — repo root

These commands maintain the code knowledge graph in `graphify-out/`. They're optional developer tooling, not part of the app build. Scripts live in the **repo root** `scripts/` folder.

### `./scripts/setup-ai-context.sh`
One-time setup on a fresh clone or second machine. Installs `uv` (via Homebrew if missing), installs Graphify (`uv tool install graphifyy`), configures the Codex and VS Code Copilot Chat integrations, installs a `post-merge` git hook so `git pull` auto-refreshes the graph, and builds the initial graph.

```bash
./scripts/setup-ai-context.sh
```

### `./scripts/refresh-ai-context.sh`
Rebuilds/refreshes the local Graphify graph (`graphify update . --force`). Pass `--quiet` for the non-failing form the git hook uses.

```bash
./scripts/refresh-ai-context.sh
./scripts/refresh-ai-context.sh --quiet   # used by the post-merge hook
```

### Graphify CLI (used directly when querying the codebase)

```bash
graphify update .                 # refresh the graph after code changes (AST-only, no API cost)
graphify update . --force         # force a full refresh
graphify query "<question>"       # ask a scoped question about the codebase
graphify path "<A>" "<B>"         # show the relationship/path between two concepts
graphify explain "<concept>"      # focused explanation of one concept
graphify affected "<concept>"     # what a change to a shared service/state would affect
graphify codex install            # configure Codex integration
graphify vscode install           # configure VS Code Copilot Chat integration
```

---

## 10. Continuous Integration (GitHub Actions)

Two workflows in `.github/workflows/`. They don't introduce new tools — they orchestrate the commands above on Node 22.

### `deploy-firebase.yml` — Deploy to Firebase Hosting (on push to `main`)
Sequence: checkout → set up Node 22 with npm cache → write `environment.prod.ts` from secrets → `npm ci` (app) → `npm run build -- --configuration production` → `npm ci` (functions) → `npm run build` (functions) → inject the Razorpay live key and Google Maps key into the built `index.html` (with validation) → `npx firebase-tools@latest deploy ...` (the production deploy command from §5).

### `e2e.yml` — E2E Tests (on PRs and pushes touching `personal-finance-pwa/**`)
Sequence: checkout → Node 22 with npm cache → `npm ci` → `npx playwright install --with-deps chromium` → `npm install -g firebase-tools` → run the suite with `firebase emulators:exec --only auth,firestore --project demo-spenza "npx playwright test"` → generate markdown/HTML reports (`node e2e/generate-report.js && node e2e/extract-html-report.js`) → upload `e2e-report/` and `e2e-results.json` as artifacts. Gates merges on the suite passing.

---

## 11. Netlify build

Configured in `netlify.toml` (base directory `personal-finance-pwa`). Netlify runs this on deploy; you generally don't run it by hand:

```bash
npm ci && npm run build
```

Published directory: `dist/personal-finance-pwa/browser`. All routes redirect to `/index.html` for Angular client-side routing.

---

## Quick reference (most-used, from `personal-finance-pwa/`)

```bash
npm install                 # install dependencies (local dev)
npm ci                      # clean, lockfile-exact install (CI)
npm start                   # dev server at http://localhost:4200
npm run build               # production build into dist/
npm test                    # unit tests (Angular/Vitest)
npm run test:rules          # Firestore security-rules tests (needs emulator)
npm run e2e                 # full Playwright run + reports
npm run e2e:report          # open the HTML E2E report
npm run emulators:start     # Auth + Firestore emulators
npx cap sync android        # push web build into the Android project
./rebuild-android.sh        # full Android rebuild → debug APK
```
