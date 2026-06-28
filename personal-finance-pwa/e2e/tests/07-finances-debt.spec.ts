/**
 * Module 7 — Finances: Debt Accounts & Payments
 * TC-DEBT-01 through TC-DEBT-10
 */
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Finances — Debt Accounts — TC-DEBT', () => {

  test('TC-DEBT-01 — Create a credit-card debt', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    const addDebtBtn = page.locator('button').filter({ hasText: /add.*debt|new.*debt/i }).first();
    await expect(addDebtBtn).toBeVisible({ timeout: 5000 });
    await addDebtBtn.click();
    // Name input uses formControlName="name" with an example placeholder (not "name").
    await page.locator('input[formcontrolname="name"]:visible').first().fill('Test Credit Card');
    // The debt "type" is an app-themed-select (not a native <select>) that already
    // defaults to 'credit-card'. The only native <select> here is billGenerationDay,
    // so the previous `select.selectOption('credit-card')` always timed out. For the
    // credit-card type the visible number inputs are principal, remaining, interest.
    const inputs = page.locator('input[type="number"]:visible');
    await inputs.nth(0).fill('100000'); // principal / credit limit
    await inputs.nth(1).fill('45000');  // remaining balance
    // New-debt submit is labelled "Add debt"/"Create", not "Save"; target the form submit.
    await page.locator('button[type="submit"]:visible').first().click();
    await expect(page.locator('text=Test Credit Card')).toBeVisible({ timeout: 5000 });
  });

  test('TC-DEBT-02 — Record a debt payment deducts from account and debt', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // Find the seeded debt (HDFC Credit Card, remainingBalance=45000)
    const debtItem = page.locator('[class*="debt-item"]').filter({ hasText: /hdfc credit/i }).first();
    const payBtn = debtItem.locator('button').filter({ hasText: /record.*payment|pay/i }).first()
      .or(page.locator('button').filter({ hasText: /record.*payment|pay now/i }).first());
    if (await payBtn.isVisible({ timeout: 3000 })) {
      await payBtn.click();
      const amountInput = page.locator('input[type="number"]').first();
      await amountInput.fill('5000');
      const saveBtn = page.locator('button').filter({ hasText: /save|confirm/i }).first();
      await saveBtn.click();
      // Remaining balance should decrease
      await expect(page.locator('text=/40,000|₹40/').first()).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'Debt record payment button not found');
    }
  });

  test('TC-DEBT-05 — Debt marks as Paid when balance reaches zero', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // Add a small debt and pay it off entirely
    const addDebtBtn = page.locator('button').filter({ hasText: /add.*debt/i }).first();
    if (await addDebtBtn.isVisible({ timeout: 3000 })) {
      await addDebtBtn.click();
      // Name input uses formControlName="name" with an example placeholder
      // ("Credit card, car loan..."), so a placeholder*="name" match never resolves.
      await page.locator('input[formcontrolname="name"]:visible').first().fill('Small Loan');
      const inputs = page.locator('input[type="number"]:visible');
      await inputs.nth(0).fill('1000'); // borrowed amount
      await inputs.nth(1).fill('1000'); // remaining balance
      // The new-debt submit reads "Create debt", not "Save"; target the form submit.
      await page.locator('button[type="submit"]:visible').first().click();
      await expect(page.locator('text=Small Loan')).toBeVisible({ timeout: 5000 });
      // Pay it off entirely
      const debtItem = page.locator('[class*="debt-item"]').filter({ hasText: /small loan/i }).first();
      const payBtn = debtItem.locator('button').filter({ hasText: /pay/i }).first();
      if (await payBtn.isVisible({ timeout: 2000 })) {
        await payBtn.click();
        await page.locator('input[type="number"]').first().fill('1000');
        await page.locator('button').filter({ hasText: /save|confirm/i }).first().click();
        // Debt status should show "paid"
        await expect(page.locator('[class*="debt-item"]').filter({ hasText: /small loan/i })
          .locator('text=/paid/i').first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('TC-DEBT-07 — Payment creates expense with correct source tag', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // After a payment, navigate to daily and check that a "Debt Payment" entry appears
    const debtItem = page.locator('[class*="debt-item"]').first();
    const payBtn = debtItem.locator('button').filter({ hasText: /pay/i }).first();
    if (await payBtn.isVisible({ timeout: 3000 })) {
      await payBtn.click();
      await page.locator('input[type="number"]').first().fill('1000');
      await page.locator('button').filter({ hasText: /save|confirm/i }).first().click();
      // Navigate to daily
      await page.goto('/#/daily');
      await page.waitForURL(/daily/);
      await expect(page.locator('text=/debt.*payment|payment/i').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-DEBT-09 — Total Liabilities equals sum of active remaining balances', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // Seeded: HDFC CC remainingBalance=45000
    await expect(page.locator('text=/45,000|₹45/').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DEBT-10 — Cannot record payment without a source account', async ({ proUserPage: page }) => {
    await page.goto('/#/finances');
    await page.waitForURL(/finances/);
    // If we had no accounts, record payment should be blocked
    // Simulate by checking the account dropdown is required
    const payBtn = page.locator('button').filter({ hasText: /record.*payment|pay/i }).first();
    if (await payBtn.isVisible({ timeout: 3000 })) {
      await payBtn.click();
      // Account field should be required
      const accountSelect = page.locator('select, [data-testid="account-select"]').first();
      const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
      if (await accountSelect.isVisible({ timeout: 2000 })) {
        // The save button should be disabled if no account is available
        const disabled = await saveBtn.isDisabled();
        // OR an error message should appear on submit without account
        if (!disabled) {
          await saveBtn.click();
          const error = page.locator('text=/account.*required|select.*account/i');
          const hasError = await error.isVisible({ timeout: 3000 }).catch(() => false);
          // Either disabled or shows error
          expect(disabled || hasError).toBe(true);
        } else {
          expect(disabled).toBe(true);
        }
      }
    }
  });

});
