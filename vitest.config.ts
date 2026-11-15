import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./apps/web/src/editor/__test__/dom-setup.ts'],
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
  },
});
