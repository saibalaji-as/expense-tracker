import { defineConfig, devices } from '@playwright/test';

/**
 * Spenza E2E — Playwright configuration
 *
 * Auth strategy: Capacitor Preferences on web stores under the prefix
 * `CapacitorStorage.`  We inject auth keys into localStorage directly in
 * the auth fixture before any Angular bootstrap runs, so the app sees a
 * fully-restored session without a real Google OAuth popup.
 *
 * Drive strategy: all googleapis.com fetch calls are intercepted via
 * page.route() and return fixture JSON, so no real Drive access is needed.
 *
 * Firebase strategy: Auth + Firestore emulators (ports 9099 / 8080).
 * The app is pointed at them via FIREBASE_AUTH_EMULATOR_HOST env vars
 * injected in global-setup.ts.  Subscription status is seeded per-test.
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,           // keep serial — auth state is per-page
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
    ['json', { outputFile: 'e2e-results.json' }],
  ],

  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },   // iPhone 14 Pro — primary target
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // Start the Angular dev server before tests run
  webServer: {
    command: 'npm run start -- --configuration=development',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    // Cold `ng serve` on a CI runner can exceed 2 min; give it headroom.
    timeout: process.env['CI'] ? 240_000 : 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
