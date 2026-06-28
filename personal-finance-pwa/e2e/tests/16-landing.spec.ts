/**
 * Module 18 — Public Landing Page
 * TC-LAND-01 through TC-LAND-05
 */
import { test, expect } from '../fixtures/auth.fixture';
import { mockGoogleApis } from '../fixtures/auth.fixture';

test.describe('Landing Page — TC-LAND', () => {

  test('TC-LAND-01 — Logged-out visitor sees landing content, not redirect', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/');
    // Should stay on root / or /#/ — not redirected to /auth/callback
    // The WelcomeComponent renders the landing page content
    await expect(page).not.toHaveURL(/auth\/callback/, { timeout: 5000 });
    // Landing content should be present (app name, sign-in button)
    await expect(
      page.locator('text=/spenza|expense.*tracker|finance/i').first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('TC-LAND-02 — Signed-in user at / is redirected to /daily', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/daily/, { timeout: 8000 });
  });

  test('TC-LAND-03 — Static branding visible without JavaScript', async ({ page }) => {
    // Fetch the *raw served HTML* (no JS executed) — the live DOM is unreliable here
    // because Angular clears the static #spenza-info block from <app-root> on bootstrap.
    // The raw index.html keeps the branding for no-JS crawlers / OAuth reviewers.
    const res = await page.request.get('/');
    expect(res.status()).toBe(200);
    const rawHtml = await res.text();
    const hasStaticContent = /spenza|expense/i.test(rawHtml);
    expect(hasStaticContent).toBe(true);
  });

  test('TC-LAND-04 — /privacy and /terms routes render content in the SPA', async ({ page }) => {
    // In hash routing, /privacy is a client-side route rendered by Angular.
    // Dev server always serves index.html; the Angular router handles rendering.
    await page.goto('/#/privacy');
    // Should render privacy content (not crash, not redirect to auth)
    await expect(page).not.toHaveURL(/auth\/callback/, { timeout: 5000 });
    await expect(
      page.locator('text=/privacy|data.*policy|information/i').first()
    ).toBeVisible({ timeout: 8000 });

    await page.goto('/#/terms');
    await expect(page).not.toHaveURL(/auth\/callback/, { timeout: 5000 });
    await expect(
      page.locator('text=/terms|conditions|usage/i').first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('TC-LAND-05 — Data-scope explanation and Privacy/Terms links are present on landing', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/');
    // Privacy + Terms links rendered by the welcome page. The hidden static SEO copy
    // is now cleared from the live DOM on bootstrap, leaving a single visible link each.
    await expect(page.locator('a[href*="privacy"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('a[href*="terms"]').first()).toBeVisible({ timeout: 5000 });
  });

});
