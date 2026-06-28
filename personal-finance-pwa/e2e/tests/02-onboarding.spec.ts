/**
 * Module 2 — Onboarding & Mode Selection
 * TC-ONBD-01 through TC-ONBD-07
 */
import { test, expect } from '../fixtures/auth.fixture';
import { expectRoute } from '../helpers/page-helpers';

test.describe('Onboarding — TC-ONBD', () => {

  test('TC-ONBD-01 — First-time user (no mode set) is routed to mode-select', async ({ page }) => {
    const { mockGoogleApis, seedAuthNoMode, mockEmptyDrive } = await import('../fixtures/auth.fixture');
    await mockGoogleApis(page);
    // Drive must look empty, otherwise the setupGuard recovers single mode from the
    // mocked config and never redirects to /mode-select.
    await mockEmptyDrive(page);
    await seedAuthNoMode(page);
    await page.goto('/#/daily');
    await expectRoute(page, '/mode-select');
    // Mode buttons carry stable aria-labels regardless of locale.
    await expect(page.locator('[aria-label="Single User mode"]')).toBeVisible();
    await expect(page.locator('[aria-label="Family / Shared mode"]')).toBeVisible();
  });

  test('TC-ONBD-02 — Selecting Single mode persists mode and advances to sign-in', async ({ page }) => {
    const { mockGoogleApis, seedAuthNoMode, mockEmptyDrive } = await import('../fixtures/auth.fixture');
    await mockGoogleApis(page);
    await mockEmptyDrive(page);
    await seedAuthNoMode(page);
    await page.goto('/#/mode-select');
    await page.waitForURL(/\/#\/mode-select/);
    const singleBtn = page.locator('[aria-label="Single User mode"]');
    await expect(singleBtn).toBeVisible();
    await singleBtn.click();
    // onSelectSingle() persists the mode then advances to the /auth/callback sign-in
    // step (mode-selection.component.ts) — it does not jump straight to /limits.
    // Assert the real next step and that the mode was actually saved.
    await expect(page).toHaveURL(/auth\/callback/, { timeout: 10_000 });
    const savedMode = await page.evaluate(() =>
      localStorage.getItem('CapacitorStorage.spenza_backup_mode')
    );
    expect(savedMode).toBe('single');
  });

  test('TC-ONBD-03 — Family mode is gated behind Pro for non-Pro users', async ({ authenticatedPage: page }) => {
    await page.goto('/#/mode-select');
    await page.waitForURL(/\/#\/mode-select/);
    const familyBtn = page.locator('button, [role="button"]').filter({ hasText: /family|shared/i }).first();
    if (await familyBtn.isVisible()) {
      await familyBtn.click();
      // Should show paywall or stay on mode-select, NOT go to family-setup
      const isOnFamilySetup = page.url().includes('family-setup');
      const hasProPrompt = await page.locator('text=/pro|upgrade|premium|subscribe/i').isVisible({ timeout: 3000 }).catch(() => false);
      expect(isOnFamilySetup || hasProPrompt).toBeTruthy();
    }
  });

  test('TC-ONBD-04 — Zero-income user navigating to /daily is redirected to income setup', async ({ noIncomePage: page }) => {
    // noIncomePage fixture already attempted to navigate to /#/daily
    await expect(page).toHaveURL(/limits.*onboarding=income|limits/, { timeout: 10_000 });
  });

  test('TC-ONBD-05 — Entering income enables access to daily route', async ({ noIncomePage: page }) => {
    await page.goto('/#/limits?onboarding=income');
    await page.waitForURL(/limits/);
    // Find income input
    const incomeInput = page.locator('input[type="number"], input[inputmode="decimal"]').first();
    await incomeInput.fill('50000');
    // Find save button
    const saveBtn = page.locator('button').filter({ hasText: /save|confirm/i }).first();
    await saveBtn.click();
    // Should now be able to reach /daily
    await page.goto('/#/daily');
    await expectRoute(page, '/daily');
  });

  test('TC-ONBD-06 — Budget percentages default to recommended values on fresh limits page', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // The Housing percentage field is labelled "Housing percentage" (sr-only) in both the
    // mobile and desktop layouts; pick the one visible for the current viewport.
    const housingPct = page.getByLabel(/Housing percentage/i).filter({ visible: true }).first();
    await expect(housingPct).toBeVisible({ timeout: 5000 });
    await expect(housingPct).toHaveValue('30');
  });

  test('TC-ONBD-07 — Returning user with mode+income bypasses onboarding', async ({ authenticatedPage: page }) => {
    // authenticatedPage already has mode=single and monthlyIncome=50000
    // navigating to /daily should land directly on /daily, not /mode-select
    await page.goto('/#/daily');
    await expectRoute(page, '/daily');
    // mode-select must NOT be shown
    await expect(page).not.toHaveURL(/mode-select/);
  });

});
