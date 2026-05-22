import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'netlify/functions-tests/**/*.test.ts'],
    tsconfig: './tsconfig.spec.json',
  },
});
