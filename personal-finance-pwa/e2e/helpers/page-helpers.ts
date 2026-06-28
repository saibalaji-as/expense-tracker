/**
 * Reusable page interaction helpers for Spenza E2E tests.
 */

import { Page, expect } from '@playwright/test';

// ── Navigation ────────────────────────────────────────────────────────────────

export async function navigateTo(page: Page, route: string): Promise<void> {
  await page.goto(`/#${route}`);
  await page.waitForURL(new RegExp(route.replace('/', '\\/').replace('?', '\\?')));
}

export async function waitForAppReady(page: Page): Promise<void> {
  // The app shows a loading spinner on startup; wait for it to disappear
  const spinner = page.locator('[data-testid="app-loading"], .loading-spinner, [class*="loading"]').first();
  try {
    await spinner.waitFor({ state: 'hidden', timeout: 15_000 });
  } catch {
    // Spinner may not be visible on all pages
  }
}

// ── Toast / feedback ──────────────────────────────────────────────────────────

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  const toast = page.locator('[role="alert"], [class*="toast"], [class*="snack"]').filter({ hasText: text });
  await expect(toast).toBeVisible({ timeout: 8_000 });
}

export async function expectNoToast(page: Page): Promise<void> {
  const toast = page.locator('[role="alert"], [class*="toast"]');
  await expect(toast).toBeHidden({ timeout: 3_000 });
}

// ── Modal / dialog ────────────────────────────────────────────────────────────

export async function confirmDialog(page: Page): Promise<void> {
  const confirmBtn = page
    .locator('button, [role="button"]')
    .filter({ hasText: /confirm|yes|delete|ok/i })
    .first();
  await confirmBtn.click();
}

export async function dismissDialog(page: Page): Promise<void> {
  const cancelBtn = page
    .locator('button, [role="button"]')
    .filter({ hasText: /cancel|no|dismiss|close/i })
    .first();
  await cancelBtn.click();
}

// ── Form helpers ──────────────────────────────────────────────────────────────

export async function fillAmount(page: Page, amount: number): Promise<void> {
  const input = page
    .locator('input[type="number"], input[inputmode="decimal"], input[placeholder*="amount" i]')
    .first();
  await input.fill(String(amount));
}

export async function selectCategory(page: Page, category: string): Promise<void> {
  // The app uses a custom ThemedSelectComponent or button chips for categories
  const chip = page.locator('button, [role="option"], [role="button"]').filter({ hasText: category });
  if (await chip.count() > 0) {
    await chip.first().click();
    return;
  }
  // Fallback: select element
  const select = page.locator('select').first();
  await select.selectOption(category);
}

export async function tapSave(page: Page): Promise<void> {
  // The submit button text is i18n'd ("Log Food & Groceries", "Update Housing", etc.)
  // so we target the form's single submit button by type, not by text.
  await page.locator('button[type="submit"]').click();
}

export async function tapAdd(page: Page): Promise<void> {
  const addBtn = page
    .locator('button')
    .filter({ hasText: /add|new|\+/i })
    .first();
  await addBtn.click();
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

export async function tapNavItem(page: Page, label: string): Promise<void> {
  const navItem = page
    .locator('nav a, [role="navigation"] a, nav button, [class*="bottom-nav"] a')
    .filter({ hasText: new RegExp(label, 'i') });
  await navItem.first().click();
}

// ── Expense-specific ─────────────────────────────────────────────────────────

export async function logExpense(
  page: Page,
  opts: { amount: number; category: string; comment?: string }
): Promise<void> {
  await selectCategory(page, opts.category);
  await fillAmount(page, opts.amount);
  if (opts.comment) {
    const commentInput = page.locator('textarea, input[placeholder*="comment" i], input[placeholder*="note" i]').first();
    if (await commentInput.isVisible()) {
      await commentInput.fill(opts.comment);
    }
  }
  await tapSave(page);
}

// ── Offline simulation ────────────────────────────────────────────────────────

export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  // setOffline does not reliably dispatch the navigator online/offline events that
  // SyncService (and the app's online handler) listen to, so fire them explicitly.
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

// ── Route assertion ───────────────────────────────────────────────────────────

export async function expectRoute(page: Page, route: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/')), { timeout: 10_000 });
}

// ── localStorage assertion ────────────────────────────────────────────────────

export async function getCapacitorKey(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(`CapacitorStorage.${k}`), key);
}

export async function expectCapacitorKey(page: Page, key: string, value: string): Promise<void> {
  const actual = await getCapacitorKey(page, key);
  expect(actual).toBe(value);
}
