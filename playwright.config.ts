import { defineConfig, devices } from '@playwright/test';

const dataDirectory = process.env.NOTE_TAKER_E2E_DATA_DIR;
if (!dataDirectory)
  throw new Error(
    'Run npm run test:e2e to use an isolated temporary database.',
  );

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'production.spec.ts',
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: '3001', DATA_DIR: dataDirectory },
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: '3001' },
    },
  ],
});
