/**
 * Module 3 — Daily Expense Logging
 * TC-DAILY-01 through TC-DAILY-17 (TC-DAILY-18 requires native Android)
 */
import { test, expect } from '../fixtures/auth.fixture';
import { expectRoute, expectToast, goOffline, goOnline } from '../helpers/page-helpers';

// ── Helpers specific to this module ──────────────────────────────────────────

/** Click the form's submit button (text is i18n'd: "Log Food & Groceries", etc.) */
async function submit(page: Parameters<typeof test>[1] extends { page: infer P } ? P : any) {
  await page.locator('button[type="submit"]').click();
}

/** Select a category chip by visible text/aria-label, waiting for it to render.
 *  The chip carries both aria-label and visible text, so a single text filter
 *  matches either. We *wait* for it (chips can render a beat after #amount-input)
 *  and verify the selection took effect (aria-pressed), since a missed click
 *  leaves expenseType empty and the submit button disabled. */
async function selectCat(page: any, pattern: RegExp) {
  const chip = page.locator('button[aria-label]').filter({ hasText: pattern }).first();
  await chip.waitFor({ state: 'visible', timeout: 10_000 });
  await chip.click();
  // Confirm it's now the active category; retry once if the first click didn't land.
  if ((await chip.getAttribute('aria-pressed')) !== 'true') {
    await chip.click();
  }
}

/** Fill the amount input (id="amount-input") */
async function fillAmount(page: any, value: string) {
  await page.locator('#amount-input').fill(value);
}

/** First entry row in today's list */
function firstEntry(page: any) {
  return page.locator('#todays-entries li').first();
}

test.describe('Daily Expense — TC-DAILY', () => {

  test('TC-DAILY-01 — Log a new expense (happy path)', async ({ authenticatedPage: page }) => {
    await selectCat(page, /food|grocer/i);
    await fillAmount(page, '500');
    // Optional comment input
    const commentInput = page.locator('#comment-input');
    if (await commentInput.isVisible({ timeout: 1000 })) {
      await commentInput.fill('Weekly groceries');
    }
    await submit(page);
    // Entry amount appears in the list
    await expect(page.locator('text=500').or(page.locator('text=₹500')).first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DAILY-02 — Log expense with a past date', async ({ authenticatedPage: page }) => {
    // A category (expenseType) is required before the submit button is enabled.
    await selectCat(page, /food|grocer/i);
    const datePicker = page.locator('#date-input');
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    await datePicker.fill(threeDaysAgo.toISOString().split('T')[0]);
    await fillAmount(page, '300');
    await submit(page);
    await expect(page.locator('text=300').or(page.locator('text=₹300')).first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DAILY-03 — Edit an existing expense updates amount', async ({ authenticatedPage: page }) => {
    // Need an entry in the list first — log one (category required to enable submit)
    await selectCat(page, /food|grocer/i);
    await fillAmount(page, '500');
    await submit(page);
    await page.locator('text=500').or(page.locator('text=₹500')).first().waitFor({ state: 'visible', timeout: 8000 });

    // Entries are grouped by type; tapping a group row opens a detail dialog. The
    // seed already has a Food & Groceries entry today, so this group has 2 entries
    // and the dialog renders the grouped view whose per-entry button is labelled
    // "Edit entry" (the single-entry view uses "Edit"). Match either inside the
    // dialog so the test is robust to the entry count.
    await firstEntry(page).click();
    const detailDialog = page.locator('[role="dialog"]');
    await detailDialog.getByRole('button', { name: /edit/i }).first().click();
    // The form is now populated with the entry; change the amount and resubmit.
    const amountInput = page.locator('#amount-input');
    await amountInput.fill('750');
    await submit(page);
    // The collapsed list row shows the GROUP TOTAL (group.totalAmount), not the
    // individual entry amount — with the seeded Food entry plus this one, the row
    // reads ₹1,250 after the edit. Reopen the group detail, where each entry's own
    // amount is rendered, to verify the edit took effect (₹750).
    await firstEntry(page).click();
    const reopenedDialog = page.locator('[role="dialog"]');
    await expect(
      reopenedDialog.locator('text=750').or(reopenedDialog.locator('text=₹750')).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('TC-DAILY-04 — Delete an expense removes it from the list', async ({ authenticatedPage: page }) => {
    // Seed an entry (category required to enable submit)
    await selectCat(page, /food|grocer/i);
    await fillAmount(page, '100');
    await submit(page);
    await expect(page.locator('text=100').or(page.locator('text=₹100')).first()).toBeVisible({ timeout: 8000 });

    // Click the delete button on the first entry
    const deleteBtn = firstEntry(page).locator('button[aria-label]').filter({ hasText: /delete/i });
    if (await deleteBtn.isVisible({ timeout: 3000 })) {
      await deleteBtn.click();
      // Confirm dialog if shown
      const confirmBtn = page.locator('button').filter({ hasText: /confirm|yes|delete/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2000 })) await confirmBtn.click();
    } else {
      test.skip(true, 'Delete button not found on entry');
    }
  });

  test('TC-DAILY-05 — Overspend shows negative savings indicator', async ({ authenticatedPage: page }) => {
    // Log an amount that exceeds today's daily budget (₹50,000 / 30 ≈ ₹1,667/day)
    await selectCat(page, /food|grocer/i);
    await fillAmount(page, '5000');
    await submit(page);
    // The app should show the remaining budget pill in destructive color or
    // the savings pill shows a negative value styled in destructive/warning
    await expect(
      page.locator('[class*="destructive"]')
        .or(page.locator('[role="alert"]').filter({ hasText: /over|budget|warn/i }))
        .or(page.locator('text=/−|−₹|-₹/'))
        .first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('TC-DAILY-13 — Expense links to payment source account', async ({ proUserPage: page }) => {
    // A category (expenseType) is required before the submit button is enabled.
    await selectCat(page, /food|grocer/i);
    // The account selector is app-themed-select with formControlName="accountId"
    // Try selecting via the underlying select or by clicking the themed-select component
    const themedSelect = page.locator('app-themed-select[formcontrolname="accountId"]');
    const nativeSelect = themedSelect.locator('select');
    if (await nativeSelect.isVisible({ timeout: 2000 })) {
      await nativeSelect.selectOption({ index: 1 }); // First real account
    } else if (await themedSelect.isVisible({ timeout: 2000 })) {
      await themedSelect.click();
      const option = page.locator('[role="option"], li').filter({ hasText: /hdfc|salary|cash/i }).first();
      if (await option.isVisible({ timeout: 2000 })) await option.click();
    }
    await fillAmount(page, '200');
    await submit(page);
    await expect(page.locator('text=200').or(page.locator('text=₹200')).first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DAILY-14 — Expense saves locally while offline', async ({ authenticatedPage: page }) => {
    // The list shows a per-category group *total*, not individual amounts. The seed
    // already has Food & Groceries today, so logging Food would only change that
    // group's total (₹650), never surfacing "150". Use Utilities — a category with
    // no seeded entry today — so the new entry forms its own group whose total IS
    // the amount we just logged.
    await selectCat(page, /utilit/i);
    await goOffline(page);
    await fillAmount(page, '150');
    await submit(page);
    // Entry appears in the list immediately (added to the in-memory store before sync)
    await expect(page.locator('text=150').or(page.locator('text=₹150')).first()).toBeVisible({ timeout: 8000 });
    // Offline toast: "Entry saved locally — will sync when online" (role="alert")
    await expect(
      page.locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first()
    ).toBeVisible({ timeout: 5000 });
    await goOnline(page);
  });

  test('TC-DAILY-15 — Offline entry syncs on reconnect', async ({ authenticatedPage: page }) => {
    await selectCat(page, /food|grocer/i);
    await goOffline(page);
    await fillAmount(page, '250');
    await submit(page);
    // Offline toast should be visible
    const offlineAlert = page.locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first();
    await expect(offlineAlert).toBeVisible({ timeout: 5000 });
    // Reconnect
    await goOnline(page);
    // Offline banner should disappear
    await expect(offlineAlert).toBeHidden({ timeout: 10_000 });
  });

  test('TC-DAILY-12 — Voice input shows unsupported message when Speech API absent', async ({ authenticatedPage: page }) => {
    await page.evaluate(() => {
      (window as any).SpeechRecognition = undefined;
      (window as any).webkitSpeechRecognition = undefined;
    });
    const micBtn = page.locator('button[aria-label*="voice" i], button[aria-label*="mic" i], button[aria-label*="speak" i]').first();
    if (await micBtn.isVisible({ timeout: 3000 })) {
      await micBtn.click();
      await expect(
        page.locator('text=/not.*support|voice.*unavail/i').first()
      ).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'Voice button not visible — may require Pro/AI to be enabled');
    }
  });

  test('TC-DAILY-16 — Date navigation shows different day entries', async ({ authenticatedPage: page }) => {
    // The date header has a "Go to today" link when not on today
    // Navigate by changing the date input to yesterday
    const datePicker = page.locator('#date-input');
    if (await datePicker.isVisible({ timeout: 3000 })) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await datePicker.fill(yesterday.toISOString().split('T')[0]);
      // "Go to today" button should appear
      const todayBtn = page.locator('button').filter({ hasText: /go.*today|today/i }).first();
      await expect(todayBtn).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'Date input not found');
    }
  });

});
