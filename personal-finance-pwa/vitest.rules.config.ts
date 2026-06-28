import { defineConfig } from 'vitest/config';

// Separate config for Firestore security-rules tests. These require the
// Firestore emulator and are intentionally excluded from the default
// `vitest run` (vitest.config.ts only includes src/**). Run via `npm run test:rules`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['firestore-tests/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
