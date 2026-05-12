/**
 * Static-check test: no direct localStorage usage outside storage.service.ts
 *
 * Validates: Requirements 9.1, 9.2, 9.3
 *
 * Scans all .ts files under src/app/ (excluding storage.service.ts and .spec.ts
 * files) and asserts that none of them call localStorage.getItem,
 * localStorage.setItem, or localStorage.removeItem directly.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Resolve the absolute path to src/app/ using import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname);

const BANNED_PATTERNS = [
  'localStorage.getItem',
  'localStorage.setItem',
  'localStorage.removeItem',
];

/** Recursively collect all .ts files under a directory */
function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('No direct localStorage usage outside storage.service.ts', () => {
  it('should not find banned localStorage calls in any non-excluded .ts file', () => {
    const allTsFiles = collectTsFiles(appDir);

    // Exclude storage.service.ts (the only file allowed to touch the storage layer)
    // and all .spec.ts test files
    const filesToCheck = allTsFiles.filter((f) => {
      const basename = path.basename(f);
      return basename !== 'storage.service.ts' && !basename.endsWith('.spec.ts');
    });

    const violations: { file: string; pattern: string; line: number }[] = [];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of BANNED_PATTERNS) {
          if (lines[i].includes(pattern)) {
            violations.push({
              file: path.relative(appDir, filePath),
              pattern,
              line: i + 1,
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} — "${v.pattern}"`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} banned localStorage call(s):\n${report}`
      );
    }

    expect(violations).toHaveLength(0);
  });
});
