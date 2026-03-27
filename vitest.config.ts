import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
