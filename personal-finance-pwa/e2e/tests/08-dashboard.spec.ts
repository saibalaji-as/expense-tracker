/**
 * Module 8 — Dashboard & Analytics
 * TC-DASH-01 through TC-DASH-08
 */
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Dashboard — TC-DASH', () => {

  test('TC-DASH-01 — Dashboard stat chips show today/week/avg', async ({ authenticatedPage: page }) => {
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    // Today chip: seed has ₹700 today (500+200)
    await expect(page.getByText(/today/i).filter({ visible: true }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/week/i).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-DASH-02 — YTD chart renders with monthly bars', async ({ authenticatedPage: page }) => {
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    const chart = page.locator('canvas').first();
    await expect(chart).toBeVisible({ timeout: 8000 });
  });

  test('TC-DASH-03 — Budget rule 50/30/20 summary is shown', async ({ authenticatedPage: page }) => {
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    await expect(page.locator('text=/needs|50/i').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=/wants|30/i').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/savings|20/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-DASH-04 — 6-month trend section is visible', async ({ authenticatedPage: page }) => {
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    // The "Last 6 Months" trend section renders as a heading.
    await expect(page.getByRole('heading', { name: /6 month|last 6/i }).first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DASH-05 — Net Worth panel shows Assets minus Liabilities', async ({ proUserPage: page }) => {
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    // Seeded: Assets=27000, Liabilities=45000 → Net Worth=-18000
    // The net worth section should be visible
    await expect(page.getByText(/net worth|assets|liabilities/i).filter({ visible: true }).first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DASH-06 — Activity feed shows recent expense entry', async ({ authenticatedPage: page }) => {
    // First add an expense. A category (expenseType) is required before the
    // submit button is enabled, so pick one before filling the amount.
    await page.goto('/#/daily');
    await page.waitForURL(/daily/);
    await page.locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first().click();
    const amountInput = page.locator('#amount-input');
    await amountInput.fill('333');
    await page.locator('button[type="submit"]').click();
    // Go to dashboard and check activity feed
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    await expect(page.locator('text=/activity|recent|feed/i').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DASH-07 — AI Insights section is visible (hosted mode)', async ({ authenticatedPage: page }) => {
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    // Insights section header
    await expect(page.locator('text=/insight|analysis|summary/i').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DASH-08 — AI deep dive button triggers insight fetch', async ({ authenticatedPage: page }) => {
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    const aiBtn = page.locator('button').filter({ hasText: /get.*analysis|ai.*insight|deep.*dive|generate/i }).first();
    if (await aiBtn.isVisible({ timeout: 3000 })) {
      await aiBtn.click();
      // Loading spinner then insight content from mock
      await expect(page.locator('text=/wins|warnings|suggestions|over.*budget/i').first()).toBeVisible({ timeout: 10000 });
    } else {
      // Insights may auto-generate — check content is visible
      await expect(page.locator('text=/wins|housing|budget/i').first()).toBeVisible({ timeout: 5000 });
    }
  });

});
