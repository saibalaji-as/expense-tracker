/**
 * Playwright global teardown — runs once after all suites complete.
 */
export default async function globalTeardown(): Promise<void> {
  console.log('[global-teardown] E2E run complete.');
}
