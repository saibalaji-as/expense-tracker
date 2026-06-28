/**
 * Module 9 — AI Features (Hosted / BYOK / Disabled)
 * TC-AI-01 through TC-AI-11
 */
import { test, expect } from '../fixtures/auth.fixture';
import { getCapacitorKey } from '../helpers/page-helpers';

test.describe('AI Features — TC-AI', () => {

  test('TC-AI-01 — Default provider is Hosted (no key needed)', async ({ authenticatedPage: page }) => {
    // Fresh session from fixture has no explicit provider set → should default to 'hosted'
    const provider = await getCapacitorKey(page, 'spenza_ai_provider');
    expect(provider === null || provider === 'hosted').toBe(true);
    // Hosted is the active AI provider. Verify via the Settings AI provider card —
    // the "Hosted" option is selected (aria-pressed=true). The daily voice smart-fill
    // is a separate Pro-only feature, so it is intentionally not asserted here.
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    const hostedBtn = page.locator('button[aria-pressed]').filter({ hasText: /hosted/i }).first();
    await expect(hostedBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('TC-AI-02 — AI mode = Disabled hides AI features', async ({ authenticatedPage: page }) => {
    // Set AI to disabled via storage
    await page.evaluate(() => {
      localStorage.setItem('CapacitorStorage.spenza_ai_provider', 'disabled');
    });
    await page.reload();
    await page.waitForURL(/daily/);
    // Smart Fill and voice buttons should be hidden
    const smartFillBtn = page.locator('button').filter({ hasText: /smart.*fill|ai.*fill/i }).first();
    const micBtn = page.locator('[data-testid="voice-btn"], button[aria-label*="mic" i]').first();
    const smartFillVisible = await smartFillBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const micVisible = await micBtn.isVisible({ timeout: 1000 }).catch(() => false);
    expect(smartFillVisible || micVisible).toBe(false);
    // Dashboard insights should show AI unavailable
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    await expect(page.locator('text=/ai.*unavailable|disabled|enable.*ai/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-AI-02b — Legacy provider values migrate on load', async ({ authenticatedPage: page }) => {
    // Inject legacy value 'user-key' → should normalise to 'byok' / 'hosted'
    await page.evaluate(() => {
      localStorage.setItem('CapacitorStorage.spenza_ai_provider', 'user-key');
    });
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    // The UI should not show 'user-key'; it should show 'Use My Key' or 'BYOK'
    const legacyText = page.locator('text=user-key');
    const hasLegacy = await legacyText.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasLegacy).toBe(false);
  });

  test('TC-AI-08 — Daily AI insight cap is enforced (shows limit reached)', async ({ authenticatedPage: page }) => {
    // Simulate exhausted daily cap by injecting usage counter
    await page.evaluate(() => {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem('CapacitorStorage.spenza_ai_insight_calls', JSON.stringify({ date: today, total: 5, byLocale: { en: 2 } }));
    });
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    const aiBtn = page.locator('button').filter({ hasText: /get.*analysis|ai.*insight|generate/i }).first();
    if (await aiBtn.isVisible({ timeout: 3000 })) {
      await aiBtn.click();
      // Should show "limit reached" message
      await expect(page.locator('text=/limit.*reached|try.*tomorrow|daily.*limit|exhausted/i').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-AI-09 — BYOK mode without key shows "API Key Required"', async ({ authenticatedPage: page }) => {
    // Set BYOK mode with no key
    await page.evaluate(() => {
      localStorage.setItem('CapacitorStorage.spenza_ai_provider', 'byok');
      // Ensure no key is stored
      localStorage.removeItem('CapacitorStorage.spenza_gemini_api_key');
    });
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    const aiBtn = page.locator('button').filter({ hasText: /get.*analysis|generate/i }).first();
    if (await aiBtn.isVisible({ timeout: 3000 })) {
      await aiBtn.click();
      await expect(page.locator('text=/api.*key.*required|enter.*key|missing.*key/i').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-AI-11 — Local fallback when AI endpoint is unreachable', async ({ authenticatedPage: page }) => {
    // Override the Firebase Functions mock to return 5xx
    await page.route('**cloudfunctions.net**/generateInsights**', async (route) => {
      await route.fulfill({ status: 503, body: 'Service Unavailable' });
    });
    await page.goto('/#/dashboard');
    await page.waitForURL(/dashboard/);
    // App should still show local deterministic insights, not crash
    await expect(page).not.toHaveURL(/error/);
    // Either cached insights or local section headings visible
    await expect(page.locator('text=/insight|summary|wins|this.*month/i').first()).toBeVisible({ timeout: 8000 });
  });

});
