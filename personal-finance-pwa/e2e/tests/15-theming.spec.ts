/**
 * Module 17 — Theming: Palette & Surface Style
 * TC-THEME-01 through TC-THEME-07
 */
import { test, expect } from '../fixtures/auth.fixture';
import { getCapacitorKey } from '../helpers/page-helpers';

test.describe('Theming — TC-THEME', () => {

  test('TC-THEME-01 — Changing palette updates data-palette on <html>', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    // Find Emerald palette button
    const emeraldBtn = page.locator('button, [role="radio"]').filter({ hasText: /emerald/i }).first();
    if (await emeraldBtn.isVisible({ timeout: 5000 })) {
      await emeraldBtn.click();
      const palAttr = await page.evaluate(() =>
        document.documentElement.getAttribute('data-palette')
        || document.body.getAttribute('data-palette')
      );
      expect(palAttr).toBe('emerald');
      // Storage should also reflect the change
      const stored = await getCapacitorKey(page, 'pf-palette');
      expect(stored).toBe('emerald');
    } else {
      test.skip(true, 'Emerald palette option not found');
    }
  });

  test('TC-THEME-02 — Changing surface style updates data-style on <html>', async ({ authenticatedPage: page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/settings/);
    const styleBtn = page.locator('button, [role="radio"]').filter({ hasText: /neumorphism/i }).first();
    if (await styleBtn.isVisible({ timeout: 5000 })) {
      await styleBtn.click();
      // setStyle() applies data-style inside a View Transition, which is async in
      // Chromium — reading synchronously right after the click observes a transient
      // null. Poll until the attribute settles (palette is applied synchronously, so
      // TC-THEME-01 doesn't need this).
      await expect.poll(
        () => page.evaluate(() =>
          document.documentElement.getAttribute('data-style')
          || document.body.getAttribute('data-style')
        ),
        { timeout: 5000 }
      ).toBe('neumorphism');
      const stored = await getCapacitorKey(page, 'pf-style');
      expect(stored).toBe('neumorphism');
    } else {
      test.skip(true, 'Neumorphism style option not found');
    }
  });

  test('TC-THEME-03 — Palette and style persist across page reload', async ({ authenticatedPage: page }) => {
    // Wait for app to be stable before manipulating localStorage
    await page.waitForURL(/daily/);
    await page.evaluate(() => {
      localStorage.setItem('CapacitorStorage.pf-palette', 'rose');
      localStorage.setItem('CapacitorStorage.pf-style', 'claymorphism');
    });
    await page.reload();
    await page.waitForURL(/daily/);
    const palAttr = await page.evaluate(() => document.documentElement.getAttribute('data-palette'));
    const styleAttr = await page.evaluate(() => document.documentElement.getAttribute('data-style'));
    expect(palAttr).toBe('rose');
    expect(styleAttr).toBe('claymorphism');
  });

  test('TC-THEME-04 — Invalid stored palette falls back to violet', async ({ authenticatedPage: page }) => {
    await page.waitForURL(/daily/);
    await page.evaluate(() => {
      localStorage.setItem('CapacitorStorage.pf-palette', 'invalidcolor');
    });
    await page.reload();
    await page.waitForURL(/daily/);
    const palAttr = await page.evaluate(() => document.documentElement.getAttribute('data-palette'));
    // Should fall back to default 'violet' (or null if not set, but the CSS default is violet)
    expect(palAttr === 'violet' || palAttr === null).toBe(true);
  });

  test('TC-THEME-05 — Palette applies in both light and dark mode', async ({ authenticatedPage: page }) => {
    await page.waitForURL(/daily/);
    await page.evaluate(() => {
      localStorage.setItem('CapacitorStorage.pf-palette', 'azure');
    });
    await page.reload();
    // Light mode
    const palLight = await page.evaluate(() => document.documentElement.getAttribute('data-palette'));
    expect(palLight).toBe('azure');
    // Simulate dark mode
    await page.emulateMedia({ colorScheme: 'dark' });
    const palDark = await page.evaluate(() => document.documentElement.getAttribute('data-palette'));
    expect(palDark).toBe('azure'); // Palette should not change with dark mode
  });

  test('TC-THEME-07 — All 20 palette/style combinations are selectable without error', async ({ authenticatedPage: page }) => {
    const palettes = ['violet', 'rose', 'azure', 'emerald', 'amber'];
    const styles = ['glass', 'neumorphism', 'claymorphism', 'neobrutalism'];
    for (const palette of palettes) {
      for (const style of styles) {
        await page.evaluate(({ p, s }) => {
          localStorage.setItem('CapacitorStorage.pf-palette', p);
          localStorage.setItem('CapacitorStorage.pf-style', s);
        }, { p: palette, s: style });
        await page.reload();
        await page.waitForURL(/daily/, { timeout: 10_000 });
        // Should not crash to an error page
        await expect(page).not.toHaveURL(/error/);
        // The theme service applies these attributes after Angular bootstrap, so poll
        // rather than reading immediately (which can observe a transient null).
        // The default palette ('violet') and style ('glass') are represented by
        // *removing* the attribute (see ThemeService #applyPalette/#applyStyle), so
        // for those values the expected attribute is null, not the name.
        const expectedPalette = palette === 'violet' ? null : palette;
        const expectedStyle = style === 'glass' ? null : style;
        await expect.poll(
          () => page.evaluate(() => document.documentElement.getAttribute('data-palette')),
          { timeout: 5000 }
        ).toBe(expectedPalette);
        await expect.poll(
          () => page.evaluate(() => document.documentElement.getAttribute('data-style')),
          { timeout: 5000 }
        ).toBe(expectedStyle);
      }
    }
  });

});
