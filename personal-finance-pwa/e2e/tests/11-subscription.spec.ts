/**
 * Module 12 — Subscription / Pro Paywall
 * TC-SUB-01 through TC-SUB-06
 */
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Subscription — TC-SUB', () => {

  test('TC-SUB-01 — Non-Pro user cannot access /finances (subscription guard)', async ({ authenticatedPage: page }) => {
    // authenticatedPage is non-Pro
    await page.goto('/#/finances');
    // Should be redirected away from /finances
    await expect(page).not.toHaveURL(/finances/, { timeout: 5000 });
    // Should land on subscribe or upgrade page
    await expect(page).toHaveURL(/subscribe|upgrade|settings|daily/, { timeout: 5000 });
  });

  test('TC-SUB-03 — Pro status shown in settings after payment', async ({ proUserPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    await expect(page.locator('text=/pro.*active|spenza.*pro|active.*pro/i').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-SUB-05 — Expired Pro gates finances again', async ({ authenticatedPage: page }) => {
    // Simulate expired Pro by overriding Firestore mock with expired subscription
    await page.route('**/firestore.googleapis.com/**', async (route) => {
      if (route.request().url().includes('subscription')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ fields: { status: { stringValue: 'expired' }, expiresAt: { stringValue: '2025-01-01T00:00:00Z' } } }),
        });
      } else {
        await route.continue();
      }
    });
    await page.goto('/#/finances');
    await expect(page).not.toHaveURL(/finances/, { timeout: 5000 });
  });

  // webOnlyGuard calls the bundled Capacitor.isNativePlatform(), resolved at build time
  // to `false` for the web bundle. Patching window.Capacitor at runtime doesn't change
  // the already-imported module, and faking a native bridge to flip it destabilises app
  // bootstrap. This guard is genuinely native-only — verified on-device, not in web E2E.
  test.skip('TC-SUB-06 — Subscribe page is not accessible on native (webOnlyGuard)', async ({ authenticatedPage: page }) => {
    // Simulate native platform
    await page.evaluate(() => {
      (window as any).__capacitorPlatform = 'android';
      // Patch Capacitor.isNativePlatform()
      (window as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
    });
    await page.goto('/#/subscribe');
    // Should redirect to /settings
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });
  });

});
