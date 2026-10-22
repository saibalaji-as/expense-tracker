import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script without types
import { expectedOutputs, OUT } from '../../scripts/sync-spenza-core.mjs';

describe('spenza-core copy', () => {
  it('matches the app source (run: node functions/scripts/sync-spenza-core.mjs)', () => {
    const expected: Map<string, string> = expectedOutputs();
    for (const [file, content] of expected) {
      expect(readFileSync(join(OUT, file), 'utf8'), file).toBe(content);
    }
  });
});
