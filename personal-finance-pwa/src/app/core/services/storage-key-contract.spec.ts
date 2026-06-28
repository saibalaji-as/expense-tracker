// TC-KEYS-01 — The Android widget (Java) reads localStorage keys written by the
// Angular app (TS). Renaming a key on one side silently breaks the widget with
// no error. This test pins the shared key literals on BOTH sides and fails if
// they drift apart. Reads real source files via fs (no module imports needed).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd(); // vitest runs from personal-finance-pwa/

function read(relPath: string): string {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) throw new Error(`Expected source file missing: ${relPath}`);
  return readFileSync(full, 'utf8');
}

const TS_AUTH = 'src/app/core/services/auth.service.ts';
const TS_STORE = 'src/app/core/services/expense-store.service.ts';
const JAVA_CONSTANTS = 'android/app/src/main/java/com/spenza/app/WidgetExpenseConstants.java';
const JAVA_STREAK = 'android/app/src/main/java/com/spenza/app/StreakCalculator.java';

// Shared keys that MUST match across the TS and Java boundary.
const SHARED_KEYS = [
  'gapi_access_token',
  'gapi_access_token_expires_at',
  'spenza_drive_backup_snapshot_v1',
  'spenza_widget_expense_queue_v1',
];

describe('Storage-key contract (web ⇄ Android widget)', () => {
  const tsSources = [read(TS_AUTH), read(TS_STORE)].join('\n');
  const javaConstants = read(JAVA_CONSTANTS);

  it.each(SHARED_KEYS)('key "%s" exists on the TypeScript side', (key) => {
    expect(tsSources).toContain(`'${key}'`);
  });

  it.each(SHARED_KEYS)('key "%s" exists on the Java side (matches TS)', (key) => {
    expect(javaConstants).toContain(`"${key}"`);
  });

  it('streak best-score key is consistent in StreakCalculator', () => {
    expect(read(JAVA_STREAK)).toContain('"spenza_streak_best_v1"');
  });
});
