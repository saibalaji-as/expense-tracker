/**
 * Playwright fixtures for Spenza E2E authentication.
 *
 * Because the app restores auth state from Capacitor Preferences (which maps
 * to localStorage on web with prefix `CapacitorStorage.`), we can bypass the
 * real Google OAuth popup by setting the right localStorage keys before the
 * Angular app bootstraps.
 *
 * Two fixture variants are exported:
 *
 *   authenticatedPage  – page with full auth + single-mode backup snapshot
 *   unauthenticatedPage – clean page (no storage), lands on /auth/callback
 *   proUserPage        – like authenticatedPage but with Pro subscription
 */

import { test as base, Page, Route } from '@playwright/test';
import {
  TEST_USER_EMAIL,
  TEST_USER_UID,
  TEST_DRIVE_FILE_ID,
  TEST_CONFIG_FILE_ID,
  FAKE_ACCESS_TOKEN,
  TEST_SNAPSHOT,
  TEST_BACKUP_DOC,
  TEST_DRIVE_CONFIG,
  DRIVE_FILE_LIST_RESPONSE,
  DRIVE_CONFIG_LIST_RESPONSE,
  DRIVE_WRITE_RESPONSE,
  FIRESTORE_PRO_SUBSCRIPTION,
} from './test-data';

// ── Storage key builder (Capacitor Preferences web prefix) ───────────────────

const cap = (key: string) => `CapacitorStorage.${key}`;

// ── Auth state injector ───────────────────────────────────────────────────────

/**
 * Injects a fully-authenticated session into the page's localStorage.
 * Must be called BEFORE navigating to the app URL so the Angular bootstrap
 * sees the keys during its first session-restore read.
 */
export async function injectAuthState(
  page: Page,
  options: { isPro?: boolean; hasIncome?: boolean; extraKeys?: Record<string, string> } = {}
): Promise<void> {
  const { isPro = false, hasIncome = true, extraKeys = {} } = options;

  const snapshot = hasIncome
    ? TEST_SNAPSHOT
    : { ...TEST_SNAPSHOT, doc: { ...TEST_SNAPSHOT.doc, metadata: { ...TEST_SNAPSHOT.doc.metadata, monthlyIncome: 0 } } };

  // Build the full key→value map that must be in localStorage before Angular boots.
  const storageMap: Record<string, string> = {
    [cap('gapi_auth_state')]: '1',
    [cap('gapi_scope_version')]: '9',
    [cap('gapi_user_email')]: TEST_USER_EMAIL,
    [cap('firebase_uid')]: TEST_USER_UID,
    [cap('gapi_access_token')]: FAKE_ACCESS_TOKEN,
    [cap('gapi_access_token_expires_at')]: String(Date.now() + 3_600_000),
    [cap('spenza_backup_mode')]: 'single',
    [cap('spenza_config_file_id')]: 'e2e-config-file-id-001',
    [cap('spenza_drive_backup_snapshot_v1')]: JSON.stringify(snapshot),
    [cap('spenza_ai_provider')]: 'hosted',
    ...extraKeys,
  };

  // addInitScript runs BEFORE any JavaScript on the page (including Angular's
  // bootstrap) on every navigation for this page object.
  // This is the correct Playwright approach to pre-seeding localStorage —
  // it runs on the actual app origin (http://localhost:4200), not about:blank.
  await page.addInitScript((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      localStorage.setItem(key, value);
    }
  }, Object.entries(storageMap));
}

// ── Google Drive API route mocks ──────────────────────────────────────────────

/**
 * Intercepts all Google APIs calls so tests never hit real servers.
 */
export async function mockGoogleApis(page: Page, options: { isPro?: boolean } = {}): Promise<void> {
  const { isPro = false } = options;

  // Token info → returns fake user info
  await page.route('**/oauth2/v3/tokeninfo**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        sub: TEST_USER_UID,
        scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
        exp: String(Math.floor(Date.now() / 1000) + 3600),
      }),
    });
  });

  // Drive file list (backup.json discovery)
  await page.route('**/drive/v3/files?**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('spenza-config')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DRIVE_CONFIG_LIST_RESPONSE) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DRIVE_FILE_LIST_RESPONSE) });
    }
  });

  // Drive file metadata (modifiedTime check)
  await page.route(`**/drive/v3/files/${TEST_DRIVE_FILE_ID}?**`, async (route: Route) => {
    const url = route.request().url();
    if (url.includes('alt=media')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_BACKUP_DOC),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: TEST_DRIVE_FILE_ID, modifiedTime: TEST_SNAPSHOT.modifiedTime }),
      });
    }
  });

  // Drive config file
  await page.route(`**/drive/v3/files/${TEST_CONFIG_FILE_ID}?**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DRIVE_CONFIG),
    });
  });

  // Drive write (PATCH upload)
  await page.route('**/upload/drive/v3/files/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DRIVE_WRITE_RESPONSE),
    });
  });

  // Drive file create (POST upload)
  await page.route('**/upload/drive/v3/files?**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DRIVE_WRITE_RESPONSE, id: TEST_DRIVE_FILE_ID }),
    });
  });

  // Generic Drive write (non-upload PATCH)
  await page.route(`**/drive/v3/files/${TEST_DRIVE_FILE_ID}`, async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DRIVE_WRITE_RESPONSE) });
    } else {
      await route.continue();
    }
  });

  // Firestore: subscription status
  await page.route('**/firestore.googleapis.com/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('subscription') || url.includes('users')) {
      const body = isPro
        ? { fields: { status: { stringValue: 'active' }, plan: { stringValue: 'monthly' }, expiresAt: { stringValue: '2027-01-01T00:00:00Z' } } }
        : { fields: { status: { stringValue: 'inactive' } } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    } else {
      await route.continue();
    }
  });

  // Firebase Functions (AI endpoints) — mock with canned responses
  await page.route('**cloudfunctions.net**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('generateInsights')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sections: [
            { title: 'Wins', content: 'You are under budget on Housing.' },
            { title: 'Warnings', content: 'Entertainment spend is 40% of limit.' },
          ],
          provider: 'groq',
          generatedAt: new Date().toISOString(),
        }),
      });
    } else if (url.includes('extractReceipt')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ amount: 350, category: 'Food & Groceries', confidence: 0.92, provider: 'gemini' }),
      });
    } else if (url.includes('parseVoiceExpense') || url.includes('voiceExpense')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ amount: 300, category: 'Food & Groceries', comment: 'Spent 300 on food today' }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  // Google Sign-In (GSI) script — mock so no real auth popups open
  await page.route('**/accounts.google.com/gsi/client**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.google = {
          accounts: {
            oauth2: {
              initTokenClient: () => ({ requestAccessToken: () => {} }),
              revoke: (token, cb) => cb && cb(),
            },
            id: {
              initialize: () => {},
              renderButton: () => {},
              prompt: () => {},
            }
          }
        };
      `,
    });
  });

  // Razorpay — mock checkout
  await page.route('**/razorpay.com/**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

// ── First-time user (authenticated, NO mode configured) ──────────────────────

/**
 * Seeds only the auth keys — intentionally no `spenza_backup_mode` and no
 * backup snapshot — so the user looks like a brand-new first-time user.
 * Pair with mockEmptyDrive() so the setupGuard's loadFromDrive() can't recover
 * a mode from the mocked Drive config.
 */
export async function seedAuthNoMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const set = (k: string, v: string) => localStorage.setItem(`CapacitorStorage.${k}`, v);
    set('gapi_auth_state', '1');
    set('gapi_scope_version', '9');
    set('gapi_user_email', 'test@spenza.e2e');
    set('firebase_uid', 'e2e-test-uid-001');
    set('gapi_access_token', 'ya29.fake-token');
    set('gapi_access_token_expires_at', String(Date.now() + 3_600_000));
    // Intentionally NO spenza_backup_mode / snapshot — setupGuard must redirect.
  });
}

/**
 * Overrides the Drive mocks so the account looks empty: no backup file and a
 * config whose `mode` is null. With seedAuthNoMode(), setupGuard.loadFromDrive()
 * resolves mode=null and redirects to /mode-select instead of recovering the
 * default single-mode test config. Register AFTER mockGoogleApis() — Playwright
 * matches the most-recently-registered route first.
 */
export async function mockEmptyDrive(page: Page): Promise<void> {
  await page.route('**/drive/v3/files?**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  });
  await page.route('**/drive/v3/files/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('alt=media')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.0', mode: null, sharedFileId: null, familyFolderId: null, ownerRole: null }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'e2e-empty-config', modifiedTime: new Date().toISOString() }),
      });
    }
  });
}

// ── Fixture type definitions ──────────────────────────────────────────────────

type SpenzaFixtures = {
  authenticatedPage: Page;
  unauthenticatedPage: Page;
  proUserPage: Page;
  noIncomePage: Page;
};

// ── Test fixture definitions ──────────────────────────────────────────────────

export const test = base.extend<SpenzaFixtures>({

  /** Fully authenticated single-user page with income + limits configured */
  authenticatedPage: async ({ page }, use) => {
    await mockGoogleApis(page);
    // Seed a deterministic FREE subscription override so subscription.service
    // resolves instantly in dev mode (no hanging Firestore listener). Without it,
    // subscriptionGuard only settles at its 6s waitUntilLoaded() cap — slower than
    // the guard tests' 5s assertion window — so non-Pro users appear to reach
    // /finances before the redirect fires.
    await injectAuthState(page, {
      isPro: false,
      hasIncome: true,
      extraKeys: {
        [cap('e2e_subscription_status')]: JSON.stringify({
          tier: 'free',
          expiresAt: null,
          isActive: true,
          planType: null,
          cancelPending: false,
        }),
      },
    });
    // waitUntil:'commit' avoids hanging on the 'load' event (occasionally never
    // fires in dev mode when a sub-resource/mocked request stalls → 30s timeout).
    await page.goto('/#/daily', { waitUntil: 'commit' });
    await page.waitForURL(/\/#\/daily/);
    // The app gates the router-outlet behind isLoading(); waitForURL returns
    // immediately for hash routes, so explicitly wait for the daily form to render
    // (bootstrap complete). Interacting — or going offline — before this wedges the
    // page with an empty <main>.
    await page.locator('#amount-input').waitFor({ state: 'visible', timeout: 20_000 });
    await use(page);
  },

  /** Clean page — no auth state, lands on /auth/callback */
  unauthenticatedPage: async ({ page }, use) => {
    await mockGoogleApis(page);
    // No addInitScript — fresh page with no auth keys
    await page.goto('/');
    await use(page);
  },

  /** Authenticated Pro user (finances, family sync unlocked) */
  proUserPage: async ({ page }, use) => {
    await mockGoogleApis(page, { isPro: true });
    // Pass the subscription override as an extra localStorage key so it is injected
    // by addInitScript BEFORE Angular boots. The subscription.service.ts (dev mode only)
    // reads this key in startListening() to bypass the Firestore gRPC-web listener.
    await injectAuthState(page, {
      isPro: true,
      hasIncome: true,
      extraKeys: {
        [cap('e2e_subscription_status')]: JSON.stringify({
          tier: 'pro',
          expiresAt: '2027-12-31T23:59:59.000Z',
          isActive: true,
          planType: 'monthly',
          cancelPending: false,
        }),
      },
    });
    // waitUntil:'commit' avoids hanging on the 'load' event (occasionally never
    // fires in dev mode when a sub-resource/mocked request stalls → 30s timeout).
    await page.goto('/#/daily', { waitUntil: 'commit' });
    await page.waitForURL(/\/#\/daily/);
    // The app gates the router-outlet behind isLoading(); waitForURL returns
    // immediately for hash routes, so explicitly wait for the daily form to render
    // (bootstrap complete). Interacting — or going offline — before this wedges the
    // page with an empty <main>.
    await page.locator('#amount-input').waitFor({ state: 'visible', timeout: 20_000 });
    await use(page);
  },

  /** Authenticated but no monthly income → setup guard active */
  noIncomePage: async ({ page }, use) => {
    await mockGoogleApis(page);
    await injectAuthState(page, { isPro: false, hasIncome: false });
    await page.goto('/#/daily');
    await use(page);
  },
});

export { expect } from '@playwright/test';
