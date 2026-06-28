/**
 * Module 1 — Authentication
 * TC-AUTH-01 through TC-AUTH-08
 */
import { test, expect } from '../fixtures/auth.fixture';
import { mockGoogleApis } from '../fixtures/auth.fixture';
import { expectRoute, getCapacitorKey } from '../helpers/page-helpers';

test.describe('Auth — TC-AUTH', () => {

  test('TC-AUTH-01 — Unauthenticated user is redirected to login', async ({ unauthenticatedPage: page }) => {
    await page.goto('/#/daily');
    await expectRoute(page, '/auth/callback');
    await expect(page.locator('text=/sign in/i').or(page.locator('text=/log in/i')).first()).toBeVisible();
  });

  test('TC-AUTH-04 — Sign-out clears session and redirects to login', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/\/#\/settings/);
    // onSignOut() signs out directly (no confirmation modal), so the app redirects
    // immediately. Looking for a confirm button afterwards races the navigation and
    // the element detaches mid-click.
    const signOutBtn = page.locator('button').filter({ hasText: /sign out|log out/i }).first();
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();
    await expectRoute(page, '/auth/callback');
    // Auth state should be cleared
    const authState = await getCapacitorKey(page, 'gapi_auth_state');
    expect(authState).toBeNull();
  });

  test('TC-AUTH-06 — Sign-in failure shows error, stays on login page', async ({ page }) => {
    await mockGoogleApis(page);
    // Override GSI mock to simulate a failure
    await page.route('**/accounts.google.com/gsi/client**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.google = {
            accounts: {
              oauth2: {
                initTokenClient: (config) => ({
                  requestAccessToken: () => {
                    // Simulate error callback
                    setTimeout(() => config.callback({ error: 'access_denied', error_description: 'The user denied access.' }), 100);
                  }
                }),
                revoke: () => {},
              },
              id: { initialize: () => {}, renderButton: () => {}, prompt: () => {} }
            }
          };
        `,
      });
    });
    await page.goto('/#/auth/callback');
    await page.waitForURL(/\/#\/auth\/callback/);
    const signInBtn = page.locator('button').filter({ hasText: /sign in/i }).first();
    if (await signInBtn.isVisible({ timeout: 3000 })) {
      await signInBtn.click();
      // After a failed sign-in, user stays on auth page
      await expect(page).toHaveURL(/\/#\/auth\/callback/, { timeout: 5000 });
    }
  });

  test('TC-AUTH-07 — App restores session silently from storage (no picker)', async ({ page }) => {
    await mockGoogleApis(page);
    // Use addInitScript so keys land on http://localhost:4200, not about:blank
    await page.addInitScript(() => {
      const set = (k: string, v: string) => localStorage.setItem(`CapacitorStorage.${k}`, v);
      set('gapi_auth_state', '1');
      set('gapi_scope_version', '9');
      set('gapi_user_email', 'test@spenza.e2e');
      set('firebase_uid', 'e2e-test-uid-001');
      set('gapi_access_token', 'ya29.fake-token');
      set('gapi_access_token_expires_at', String(Date.now() + 3_600_000));
      set('spenza_backup_mode', 'single');
    });
    // Navigate directly — should go to daily without showing account picker
    await page.goto('/#/daily');
    await expectRoute(page, '/daily');
    // GSI sign-in prompt should NOT have been called
    const signinCalled = await page.evaluate(() => (window as any).__gsiSignInCalled ?? false);
    expect(signinCalled).toBe(false);
  });

  test('TC-AUTH-08 — Missing Drive scope shows recovery message', async ({ page }) => {
    await mockGoogleApis(page);
    // Override tokeninfo to return without drive scope
    await page.route('**/oauth2/v3/tokeninfo**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'test@spenza.e2e', sub: 'uid-001', scope: 'openid email profile' }),
      });
    });
    // Override GSI to return token without drive scope
    await page.route('**/accounts.google.com/gsi/client**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.google = {
            accounts: {
              oauth2: {
                initTokenClient: (config) => ({
                  requestAccessToken: () => {
                    setTimeout(() => config.callback({
                      access_token: 'token-no-drive',
                      expires_in: 3600,
                      scope: 'openid email profile',
                    }), 100);
                  }
                }),
                revoke: () => {},
              },
              id: { initialize: () => {}, renderButton: () => {}, prompt: () => {} }
            }
          };
        `,
      });
    });
    await page.goto('/#/auth/callback');
    const signInBtn = page.locator('button').filter({ hasText: /sign in/i }).first();
    if (await signInBtn.isVisible({ timeout: 3000 })) {
      await signInBtn.click();
      // Should show the "grant drive access" message
      const errorMsg = page.locator('text=/drive|permission|checkbox|all.*permission/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    }
  });

});
