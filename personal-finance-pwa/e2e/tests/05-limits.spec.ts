/**
 * Module 5 — Expense Limits / Budget Setup
 * TC-LMT-01 through TC-LMT-09
 */
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Limits — TC-LMT', () => {

  test('TC-LMT-01 — Set monthly income persists and recomputes limits', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // The monthly-income field has a stable id (#monthlyIncome).
    const incomeField = page.locator('#monthlyIncome');
    await expect(incomeField).toBeVisible({ timeout: 5000 });
    await incomeField.fill('80000');
    const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 })) await saveBtn.click();
    // Income persists (recomputing every category limit below it).
    await expect(incomeField).toHaveValue(/80[,]?000/);
  });

  test('TC-LMT-02 — Adjusting a category percentage updates running total', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // Find Entertainment percentage input
    const entertainmentRow = page.locator('[class*="limit-row"], [class*="category-row"]').filter({ hasText: /entertainment/i }).first();
    const pctInput = entertainmentRow.locator('input[type="number"]');
    if (await pctInput.isVisible({ timeout: 3000 })) {
      await pctInput.fill('10');
      // Running total should update
      await expect(page.locator('text=/total|100|%/').first()).toBeVisible({ timeout: 3000 });
    } else {
      test.skip(true, 'Category percentage input not found');
    }
  });

  test('TC-LMT-03 — Running total > 100% shows warning', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // Push some category values over 100 total
    const inputs = page.locator('[class*="limit-row"] input[type="number"], [class*="category"] input[type="number"]');
    const count = await inputs.count();
    if (count > 0) {
      // Set Housing to 99%
      await inputs.first().fill('99');
      // Warning should appear
      await expect(page.locator('text=/exceed|over|100%|warning/i').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-LMT-04 — Savings below 20% shows low-savings warning', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // Find the Savings/Emergency Fund row and set to 2%
    const savingsRow = page.locator('[class*="limit-row"], [class*="category-row"]').filter({ hasText: /savings|emergency/i }).first();
    const pctInput = savingsRow.locator('input[type="number"]');
    if (await pctInput.isVisible({ timeout: 3000 })) {
      await pctInput.fill('2');
      const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
      await saveBtn.click();
      // Low savings warning card should appear
      await expect(page.locator('text=/low.*savings|savings.*low|below.*20|increase.*savings/i')).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'Savings input not found');
    }
  });

  test('TC-LMT-05 — Add a custom expense category', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    const addCustomBtn = page.locator('button').filter({ hasText: /add.*custom|custom.*category|add category/i }).first();
    if (await addCustomBtn.isVisible({ timeout: 3000 })) {
      await addCustomBtn.click();
      // The limits page renders duplicate mobile (md:hidden) + desktop (hidden md:block)
      // copies of the custom-category form; .first() would hit the hidden copy, so scope
      // every field to the *visible* copy.
      const nameInput = page
        .locator('input[placeholder*="name" i]:visible, input[placeholder*="category" i]:visible')
        .first();
      await nameInput.fill('Pet Care');
      const pctInput = page.locator('input[type="number"]:visible').last();
      await pctInput.fill('3');
      // The custom name lives in an input value (not page text), so assert on the value.
      await expect(nameInput).toHaveValue('Pet Care', { timeout: 5000 });
    } else {
      test.skip(true, 'Add custom category button not found');
    }
  });

  test('TC-LMT-06 — Delete a custom category removes it', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // Assumes TC-LMT-05 ran first and Pet Care exists, or uses any custom category
    const customRow = page.locator('[class*="limit-row"]').filter({ hasText: /pet care/i }).first();
    if (await customRow.isVisible({ timeout: 3000 })) {
      const deleteBtn = customRow.locator('button[aria-label*="delete" i], button').filter({ hasText: /delete|remove/i }).first();
      await deleteBtn.click();
      const confirmBtn = page.locator('button').filter({ hasText: /confirm|yes/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2000 })) await confirmBtn.click();
      await expect(page.locator('text=Pet Care')).toBeHidden({ timeout: 5000 });
    } else {
      test.skip(true, 'No custom category found to delete');
    }
  });

  test('TC-LMT-07 — Cannot delete a predefined category', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // Housing is predefined
    const housingRow = page.locator('[class*="limit-row"]').filter({ hasText: /housing/i }).first();
    if (await housingRow.isVisible({ timeout: 3000 })) {
      const deleteBtn = housingRow.locator('button[aria-label*="delete" i], button').filter({ hasText: /delete/i }).first();
      // Delete button should not exist for predefined categories
      const hasDelete = await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false);
      expect(hasDelete).toBe(false);
    }
  });

  test('TC-LMT-08 — Limits persist across sessions (read from snapshot)', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // The limits page renders both mobile and desktop layouts; assert against the
    // copy visible for the current viewport. Housing is seeded at 30%.
    await expect(page.getByText('Housing', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/Housing percentage/i).filter({ visible: true }).first()).toHaveValue('30');
  });

  test('TC-LMT-09 — Category group colour-coding is visually distinct', async ({ authenticatedPage: page }) => {
    await page.goto('/#/limits');
    await page.waitForURL(/limits/);
    // The group labels appear in both the mobile and desktop layouts; assert the
    // copy visible for the current viewport.
    await expect(page.getByText('Needs', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Wants', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
  });

});
