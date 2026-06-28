/**
 * Playwright global setup — runs once before all test suites.
 * Verifies the dev server is up and Firebase emulators are available.
 */
import { chromium, FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Quick smoke check: confirm the Angular app is reachable
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const response = await page.goto('http://localhost:4200', { timeout: 30_000 });
    if (!response || !response.ok()) {
      throw new Error(`Dev server not reachable: ${response?.status()}`);
    }
    console.log('[global-setup] Angular dev server is up ✓');
  } finally {
    await browser.close();
  }

  // Confirm Firebase emulators (optional — skip if not running)
  try {
    const http = await import('http');
    await new Promise<void>((resolve, reject) => {
      const req = http.get('http://localhost:9099', (res) => {
        if (res.statusCode! < 500) {
          console.log('[global-setup] Firebase Auth emulator is up ✓');
          resolve();
        } else {
          reject(new Error(`Auth emulator returned ${res.statusCode}`));
        }
      });
      req.on('error', () => {
        console.warn('[global-setup] Firebase Auth emulator not running — Firestore-dependent tests will use mocks.');
        resolve(); // non-fatal
      });
      req.setTimeout(3000, () => { req.destroy(); resolve(); });
    });
  } catch {
    // non-fatal
  }
}
