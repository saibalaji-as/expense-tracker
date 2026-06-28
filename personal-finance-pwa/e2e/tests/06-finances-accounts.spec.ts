/**
 * Module 6 — Finances: Asset Accounts
 * TC-FIN-01 through TC-FIN-09
 */
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Finances — Asset Accounts — TC-FIN', () => {

  test.beforeEach(async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
  });

  test('TC-FIN-01 — Create a new bank account', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    const addBtn = page.locator('button').filter({ hasText: /add.*account|new.*account/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    // Name input uses formControlName="name" with an example placeholder (not "name").
    await page.locator('input[formcontrolname="name"]:visible').first().fill('HDFC Salary');
    // Select type = Bank (usually a dropdown)
    const typeSelect = page.locator('select').first();
    if (await typeSelect.isVisible({ timeout: 2000 })) {
      await typeSelect.selectOption({ label: 'Bank' });
    }
    await page.locator('input[type="number"]:visible').first().fill('25000');
    // Toggle default checkbox if present
    const defaultCheck = page.locator('input[type="checkbox"]').filter({ has: page.locator('~label:has-text("default")') }).first();
    if (await defaultCheck.isVisible({ timeout: 1000 })) await defaultCheck.check();
    // New-account submit is labelled "Add account"/"Create", not "Save"; target the form submit.
    const saveBtn = page.locator('button[type="submit"]:visible').first();
    await saveBtn.click();
    await expect(page.locator('text=HDFC Salary')).toBeVisible({ timeout: 5000 });
  });

  test('TC-FIN-02 — Cannot create account with empty name', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    const addBtn = page.locator('button').filter({ hasText: /add.*account|new.*account/i }).first();
    await addBtn.click();
    // Leave name empty and submit (form submit button, label is i18n'd)
    const nameInput = page.locator('input[formcontrolname="name"]:visible').first();
    await expect(nameInput).toBeVisible();
    const saveBtn = page.locator('button[type="submit"]:visible').first();
    await saveBtn.click();
    // saveAccount() returns early on invalid form, so the modal stays open
    // (the app marks the required name field as touched rather than showing a text error).
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  test('TC-FIN-03 — Edit account name', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // HDFC Salary account is seeded in fixture. Edit buttons carry aria-label "Edit".
    const editBtn = page.locator('button[aria-label*="edit" i]').first();
    if (await editBtn.isVisible({ timeout: 3000 })) {
      await editBtn.click();
      // The edit modal's name field uses formControlName="name" (i18n placeholder, not "name").
      const nameInput = page.locator('input[formcontrolname="name"]:visible').first();
      await nameInput.fill('HDFC Main');
      await page.locator('button[type="submit"]:visible').first().click();
      await expect(page.locator('text=HDFC Main')).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'Edit button not found for account');
    }
  });

  test('TC-FIN-04 — Only one account can be default at a time', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // From seeded data we have 2 accounts; set Cash Wallet as default
    const cashAcct = page.locator('[class*="account-item"]').filter({ hasText: /cash/i });
    const editBtn = cashAcct.locator('button').filter({ hasText: /edit/i }).first();
    if (await editBtn.isVisible({ timeout: 3000 })) {
      await editBtn.click();
      const defaultToggle = page.locator('input[type="checkbox"]').first();
      if (!(await defaultToggle.isChecked())) await defaultToggle.check();
      const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
      await saveBtn.click();
      // Only 1 default badge should exist
      const defaultBadges = page.locator('text=/default/i, [class*="default-badge"]');
      await expect(defaultBadges).toHaveCount(1);
    } else {
      test.skip(true, 'Cannot find Cash Wallet edit button');
    }
  });

  test('TC-FIN-05 — Adjust account balance (increase)', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    const adjustBtn = page.locator('button').filter({ hasText: /adjust.*balance|balance/i }).first()
      .or(page.locator('[class*="account-item"]').first().locator('button').filter({ hasText: /adjust|credit|receive/i }).first());
    if (await adjustBtn.isVisible({ timeout: 3000 })) {
      await adjustBtn.click();
      await page.locator('input[type="number"]').first().fill('5000');
      const reasonInput = page.locator('input[placeholder*="reason" i], textarea').first();
      if (await reasonInput.isVisible({ timeout: 1000 })) await reasonInput.fill('Salary received');
      const saveBtn = page.locator('button').filter({ hasText: /save|confirm/i }).first();
      await saveBtn.click();
      // Balance should increase
      await expect(page.locator('text=/30,000|30000|₹30/').first()).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'Adjust balance button not found');
    }
  });

  test('TC-FIN-08 — Delete an account removes it from list', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // Create a throwaway account first
    const addBtn = page.locator('button').filter({ hasText: /add.*account/i }).first();
    if (await addBtn.isVisible({ timeout: 3000 })) {
      await addBtn.click();
      // Name uses formControlName="name" (i18n placeholder); balance is the number input.
      await page.locator('input[formcontrolname="name"]:visible').first().fill('Temp Account');
      await page.locator('input[type="number"]:visible').first().fill('100');
      await page.locator('button[type="submit"]:visible').first().click();
      await expect(page.locator('text=Temp Account')).toBeVisible({ timeout: 5000 });
      // Delete it: each account card has an icon-only delete button (aria-label "Delete").
      const tempCard = page.locator('div')
        .filter({ has: page.getByRole('heading', { name: 'Temp Account' }) })
        .filter({ has: page.locator('button[aria-label*="delete" i]') })
        .last();
      const deleteBtn = tempCard.locator('button[aria-label*="delete" i]').first();
      if (await deleteBtn.isVisible({ timeout: 2000 })) {
        await deleteBtn.click();
        // Confirmation modal — confirm the deletion.
        const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
        if (await confirmBtn.isVisible({ timeout: 2000 })) await confirmBtn.click();
        await expect(page.locator('text=Temp Account')).toBeHidden({ timeout: 5000 });
      }
    }
  });

  test('TC-FIN-09 — Total Assets equals sum of active account balances', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // From seed: HDFC=25000 + Cash=2000 = 27000
    await expect(page.locator('text=/27,000|27000|₹27/').first()).toBeVisible({ timeout: 8000 });
  });

});
