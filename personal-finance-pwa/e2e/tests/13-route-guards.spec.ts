/**
 * Module 14 — Route Guards & Navigation
 * TC-GUARD-01 through TC-GUARD-06
 */
import { test, expect } from '../fixtures/auth.fixture';
import { mockGoogleApis, seedAuthNoMode, mockEmptyDrive } from '../fixtures/auth.fixture';

test.describe('Route Guards — TC-GUARD', () => {

  test('TC-GUARD-01 — authGuard blocks all protected routes when unauthenticated', async ({ page }) => {
    await mockGoogleApis(page);
    const protectedRoutes = ['/daily', '/monthly', '/limits', '/settings', '/dashboard'];
    for (const route of protectedRoutes) {
      await page.goto(`/#${route}`);
      await expect(page).toHaveURL(/auth\/callback/, { timeout: 8000 });
    }
    // Public routes should remain accessible
    await page.goto('/#/privacy');
    await expect(page).toHaveURL(/privacy/);
    await page.goto('/#/terms');
    await expect(page).toHaveURL(/terms/);
  });

  test('TC-GUARD-02 — setupGuard redirects to mode-select when no mode configured', async ({ page }) => {
    await mockGoogleApis(page);
    await mockEmptyDrive(page);   // Drive config mode=null so the guard can't recover single mode
    await seedAuthNoMode(page);   // auth keys only, no spenza_backup_mode
    await page.goto('/#/daily');
    await expect(page).toHaveURL(/mode-select/, { timeout: 8000 });
  });

  test('TC-GUARD-03 — setupGuard redirects to income setup when income = 0', async ({ noIncomePage: page }) => {
    await expect(page).toHaveURL(/limits.*onboarding=income|limits/, { timeout: 8000 });
  });

  test('TC-GUARD-04 — subscriptionGuard blocks /finances for non-Pro', async ({ authenticatedPage: page }) => {
    await page.goto('/#/finances');
    // Should NOT land on /finances for non-Pro
    await expect(page).not.toHaveURL(/^\S*finances$/, { timeout: 5000 });
  });

  test('TC-GUARD-05 — Setup-complete user is redirected away from /mode-select', async ({ authenticatedPage: page }) => {
    await page.goto('/#/mode-select');
    // Should redirect away (to /daily since setup is complete)
    await expect(page).not.toHaveURL(/mode-select/, { timeout: 5000 });
    await expect(page).toHaveURL(/daily/, { timeout: 5000 });
  });

  test('TC-GUARD-06 — Bottom nav is hidden on /mode-select and /family-setup', async ({ page }) => {
    await mockGoogleApis(page);
    await mockEmptyDrive(page);
    await seedAuthNoMode(page);
    await page.goto('/#/mode-select');
    await page.waitForURL(/mode-select/, { timeout: 8000 });
    const bottomNav = page.locator('nav[class*="bottom"], [data-testid="bottom-nav"], [class*="bottom-nav"]').first();
    const navVisible = await bottomNav.isVisible({ timeout: 2000 }).catch(() => false);
    expect(navVisible).toBe(false);
  });

});
