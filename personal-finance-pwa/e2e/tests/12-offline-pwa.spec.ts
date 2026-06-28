/**
 * Module 13 — Offline & PWA
 * TC-PWA-01 through TC-PWA-06
 */
import { test, expect } from '../fixtures/auth.fixture';
import { goOffline, goOnline } from '../helpers/page-helpers';

test.describe('Offline & PWA — TC-PWA', () => {

  // Reloading while offline requires the service worker to serve the cached app shell.
  // `ng serve` (the E2E dev server) does NOT build/register ngsw, so a reload offline
  // fails with ERR_INTERNET_DISCONNECTED. Run this against a production build + static
  // server (ng build → serve dist) where the SW is present.
  test.skip('TC-PWA-01 — App shell renders offline from snapshot cache', async ({ authenticatedPage: page }) => {
    // The snapshot is already in localStorage; go offline and reload
    await goOffline(page);
    await page.reload();
    // Expenses from the cached snapshot should still be visible
    await expect(page.locator('text=/food.*grocer|500/i').first()).toBeVisible({ timeout: 8000 });
    await goOnline(page);
  });

  test('TC-PWA-02 — Offline banner appears then disappears on reconnect', async ({ authenticatedPage: page }) => {
    // The app-level OfflineBannerComponent reacts to navigator online/offline events
    // (no service worker needed). Its copy is "You are offline — entries will sync…".
    await goOffline(page);
    await expect(page.getByText(/you are offline/i)).toBeVisible({ timeout: 8000 });
    await goOnline(page);
    await expect(page.getByText(/you are offline/i)).toBeHidden({ timeout: 10_000 });
  });

  test('TC-PWA-03 — Expenses logged offline are visible immediately', async ({ authenticatedPage: page }) => {
    // A category (expenseType) is required before the submit button is enabled.
    // The entries list shows a per-category group *total*, and the seed already has
    // Food & Groceries today — logging Food would only bump that group's total and
    // never surface "777". Use Utilities (no seeded entry today) so the new entry is
    // its own group whose total equals the amount we just logged.
    await page.locator('button').filter({ hasText: /utilit/i }).first().click();
    await goOffline(page);
    const amountInput = page.locator('#amount-input');
    await amountInput.fill('777');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('text=777').or(page.locator('text=₹777')).first()).toBeVisible({ timeout: 8000 });
    await goOnline(page);
  });

  test('TC-PWA-06 — Web manifest contains required fields', async ({ page }) => {
    const response = await page.request.get('http://localhost:4200/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
  });

});
