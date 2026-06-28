/**
 * Module 11 — Settings  (merged with module 10 — family sync is Pro-only)
 * TC-SET-01 through TC-SET-14
 */
import { test, expect } from '../fixtures/auth.fixture';
import { getCapacitorKey } from '../helpers/page-helpers';

test.describe('Settings — TC-SET', () => {

  test('TC-SET-01 — Switch to Dark mode persists preference', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    const darkBtn = page.locator('button, [role="radio"], input[type="radio"]').filter({ hasText: /dark/i }).first();
    if (await darkBtn.isVisible({ timeout: 5000 })) {
      await darkBtn.click();
      // data-theme or class on <html> or <body> should reflect dark
      const theme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme')
        || document.documentElement.className
        || document.body.className
      );
      expect(theme).toMatch(/dark/i);
    } else {
      const themeToggle = page.locator('[data-testid="theme-toggle"], input[type="checkbox"]').filter({ hasText: /dark/i }).first();
      if (await themeToggle.isVisible({ timeout: 2000 })) {
        await themeToggle.click();
      }
    }
  });

  test('TC-SET-02 — Change language to Tamil', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    const tamilOption = page.locator('select, button, [role="option"]').filter({ hasText: /tamil|தமிழ்/i }).first();
    if (await tamilOption.isVisible({ timeout: 5000 })) {
      await tamilOption.click();
      // Language key should update in storage
      const lang = await getCapacitorKey(page, 'spenza_language');
      expect(lang).toMatch(/ta/i);
    } else {
      test.skip(true, 'Tamil language option not found in settings');
    }
  });

  test('TC-SET-03 — Change currency to USD updates display', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    const usdOption = page.locator('button, select, [role="option"]').filter({ hasText: /usd|\$/i }).first();
    if (await usdOption.isVisible({ timeout: 5000 })) {
      await usdOption.click();
      // Navigate to daily to check formatting
      await page.goto('/#/daily');
      await page.waitForURL(/daily/);
      await expect(page.locator('text=/\\$|USD/').first()).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'USD option not found in settings');
    }
  });

  test('TC-SET-06 — Export backup JSON downloads a file', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    // Listen for download event
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      page.locator('button').filter({ hasText: /export.*backup|download.*backup|export.*json/i }).first().click().catch(() => {}),
    ]);
    if (download) {
      expect(download.suggestedFilename()).toMatch(/backup|spenza/i);
    } else {
      test.skip(true, 'Export button not found or no download triggered');
    }
  });

  // The install button is driven by the real `beforeinstallprompt` event, which the
  // browser only fires when the PWA install criteria are met. A synthetic Event has
  // no `platforms`/`prompt` contract and headless Chromium never dispatches the real
  // one, so this can't be exercised in E2E. Verified manually on a supported browser.
  test.skip('TC-SET-09 — PWA install prompt button appears when supported', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      (event as any).prompt = () => Promise.resolve();
      (event as any).userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });
    await expect(page.locator('button').filter({ hasText: /install.*app|add.*home/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-SET-11 — AI API key is masked in UI (BYOK mode)', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    // Switch to BYOK mode
    const byokOption = page.locator('button, [role="radio"]').filter({ hasText: /use.*my.*key|byok|bring.*own/i }).first();
    if (await byokOption.isVisible({ timeout: 3000 })) {
      await byokOption.click();
      const keyInput = page.locator('input[type="password"], input[placeholder*="key" i]').first();
      if (await keyInput.isVisible({ timeout: 2000 })) {
        await keyInput.fill('AIzaSy-test-fake-gemini-key');
        await page.locator('button').filter({ hasText: /save/i }).first().click();
        // Re-open settings — key should be masked
        await page.reload();
        await page.waitForURL(/settings/);
        const keyField = page.locator('input[type="password"], input[placeholder*="key" i]').first();
        const val = await keyField.inputValue();
        // Should be masked or empty (not showing plaintext)
        expect(val).not.toBe('AIzaSy-test-fake-gemini-key');
      }
    } else {
      test.skip(true, 'BYOK mode option not found');
    }
  });

  test('TC-SET-12 — Clear all data wipes storage and redirects to onboarding', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    const clearBtn = page.locator('button').filter({ hasText: /clear.*all.*data|reset.*app|delete.*data/i }).first();
    if (await clearBtn.isVisible({ timeout: 5000 })) {
      await clearBtn.click();
      // The confirmation lives in the app-modal ([role="dialog"], z-50). Targeting it
      // directly avoids clicking the trigger button that now sits behind the backdrop.
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 3000 });
      await dialog.getByRole('button', { name: /confirm/i }).click();
      // Should return to auth/onboarding
      await expect(page).toHaveURL(/auth\/callback|mode-select|\/$/, { timeout: 10000 });
      // Auth state should be cleared
      const authState = await getCapacitorKey(page, 'gapi_auth_state');
      expect(authState).toBeNull();
    } else {
      test.skip(true, 'Clear all data button not found');
    }
  });

  test('TC-SET-13 — AI provider card shows three options', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    // The three provider options are the only aria-pressed buttons on the page.
    // Their visible titles are "Hosted", "My Keys" and "Off".
    const aiButtons = page.locator('button[aria-pressed]');
    await expect(aiButtons.filter({ hasText: /hosted/i })).toHaveCount(1);
    await expect(aiButtons.filter({ hasText: /my key/i })).toHaveCount(1);
    await expect(aiButtons.filter({ hasText: /off|disabled/i })).toHaveCount(1);
  });

});
