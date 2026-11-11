import { defineConfig, devices } from '@playwright/test';

if (!process.env.NOTE_TAKER_E2E_DATA_DIR)
  throw new Error(
    'Run npm run test:production to use an isolated temporary database.',
  );

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'production.spec.ts',
  workers: 1,
  timeout: 60_000,
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
