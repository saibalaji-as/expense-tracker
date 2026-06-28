# Playwright — Automated End-to-End Testing

> **In one sentence:** Playwright is a robot that opens Spenza in a real browser, clicks through it exactly like a user would, and reports whether anything broke — so bugs are caught before real users ever see them.

---

## 1. What it is (plain English)

There are different "sizes" of automated test:

- **Unit tests** check one small function in isolation ("does `addTwoNumbers(2,3)` return 5?").
- **End-to-end (E2E) tests** check the *whole app working together*, from the user's point of view ("can a user sign in, add an expense, and see it appear on the dashboard?").

**Playwright** is the tool Spenza uses for E2E tests. It launches a real Chromium browser, navigates to the running app, and then *acts like a person*: it clicks buttons, types into fields, waits for things to load, and checks that the right text and elements appear. If a button that used to work now does nothing, the test fails and tells you exactly where.

Think of it as a tireless QA tester who re-checks **every important flow in the app, in seconds, every time you change the code.**

---

## 2. The pain point it solves

In an app like Spenza, features are deeply tangled: login affects Drive sync, Drive sync affects the dashboard, the dashboard depends on stored data, subscriptions gate certain screens. **Changing one thing can silently break something three steps away.**

Manually re-testing every flow before each release is slow, boring, and error-prone — humans skip steps. Playwright solves this by making the full regression suite:

- **Automatic** — runs with one command (`npm run e2e`).
- **Repeatable** — does the exact same steps every time, no skipped checks.
- **Fast** — 200+ scenarios in minutes instead of hours of manual clicking.
- **Evidence-producing** — on failure it captures screenshots, video, and a "trace" you can replay.

The pain points solved: **regressions slipping into releases, slow manual QA, and not knowing *why* something broke.**

---

## 3. How Spenza uses Playwright

Spenza's setup is unusually thoughtful, because testing an app that depends on Google login and Google Drive is hard — you don't want real Google popups in an automated test. The config file (`playwright.config.ts`) documents the strategy directly. Here's how each hard problem is handled:

### a) Faking login (no real Google popup)
The app keeps you signed in using Capacitor Preferences, which on the web are stored in `localStorage` under a `CapacitorStorage.` prefix. So the tests simply **inject the auth keys into `localStorage` before the app starts**, and Angular boots up believing a real session was restored — no OAuth popup needed.

> This is a great example of tests building on knowledge of [Capacitor](01-capacitor.md) and [OAuth](03-oauth-google-signin.md).

### b) Faking Google Drive
The real app reads/writes the user's data on Google Drive. In tests, **every call to `googleapis.com` is intercepted** (via Playwright's `page.route()`) and answered with canned fixture JSON. The app thinks it's talking to Drive; really it's talking to a local fake. This makes tests fast and deterministic — no network, no real account.

### c) Faking Firebase
Auth and Firestore run against the **Firebase emulators** (local copies on ports 9099 / 8080). `global-setup.ts` points the app at them, and subscription status is seeded per test. So payments/subscription logic can be tested without touching production.

### The configuration highlights
From `personal-finance-pwa/playwright.config.ts`:

```ts
testDir: './e2e/tests',
fullyParallel: false,   // tests run serially because auth state is per-page
workers: 1,
use: {
  baseURL: 'http://localhost:4200',
  trace: 'on-first-retry',          // record a replay if a test fails on retry
  screenshot: 'only-on-failure',    // capture the screen when something breaks
  video: 'retain-on-failure',       // keep video only for failures
},
projects: [
  { name: 'chromium', use: { viewport: { width: 390, height: 844 } } }, // iPhone 14 Pro — primary
  { name: 'desktop',  use: { viewport: { width: 1280, height: 800 } } },
],
webServer: {
  command: 'npm run start -- --configuration=development',  // auto-starts the app first
  url: 'http://localhost:4200',
},
```

Two things to notice:
- The **primary viewport is phone-sized (390×844)** — Spenza is mobile-first, so it's tested mobile-first.
- Playwright **starts the Angular dev server itself** before running, so you don't have to.

### The reporting pipeline
The `e2e` script does more than run tests:

```json
"e2e": "playwright test; node e2e/generate-report.js; node e2e/extract-html-report.js"
```

After the run it generates a human-readable Markdown report (`e2e/TEST_REPORT.md`) and extracts the HTML report. The documented workflow is: **run → read TEST_REPORT.md → fix failures → repeat.**

---

## 4. Key files to look at

- `personal-finance-pwa/playwright.config.ts` — the whole strategy is commented at the top.
- `personal-finance-pwa/e2e/tests/` — the actual test scenarios.
- `personal-finance-pwa/e2e/fixtures/` — the canned Drive/Firebase responses.
- `personal-finance-pwa/e2e/helpers/` — the auth-injection helper and shared utilities.
- `personal-finance-pwa/e2e/global-setup.ts` / `global-teardown.ts` — points the app at emulators, cleans up.
- `personal-finance-pwa/e2e/TEST_REPORT.md` — the readable results.
- `personal-finance-pwa/e2e/E2E_FIX_NOTES.md` — notes on fixing flaky/failing tests.

Useful commands (from `package.json`):
- `npm run e2e` — run everything + generate reports.
- `npm run e2e:headed` — watch the browser do it (great for understanding).
- `npm run e2e:debug` — step through a test.
- `npm run e2e:report` — open the HTML report.

---

## 5. Gotchas worth knowing

- **Tests run serially (`workers: 1`).** Auth state is per-page, so running in parallel would let sessions collide. Don't "optimise" this without understanding why.
- **Selectors matter.** E2E tests are sensitive to how elements are found on screen; the project's memory notes that several fixes were specifically about selector stability. Prefer stable, intentional selectors over brittle ones.
- **Cold starts on CI are slow.** The config gives the dev server up to 240s to boot on CI — a cold `ng serve` is genuinely slow, so the timeout is generous on purpose.
- **The fakes must stay in sync with reality.** Because Drive/Firebase are mocked, if the real API shape changes, the fixtures must be updated too — otherwise tests pass while production breaks.

---

## TL;DR

Playwright is Spenza's automated user. It drives a real browser through every important flow at phone size, while cleverly faking Google login, Google Drive, and Firebase so tests are fast and reliable. It then produces screenshots, video, and a readable report so you know exactly what broke and why.
