import { defineConfig, devices } from '@playwright/test';

const dataDirectory = process.env.NOTE_TAKER_E2E_DATA_DIR;
const webPort = process.env.NOTE_TAKER_E2E_WEB_PORT;
const apiPort = process.env.NOTE_TAKER_E2E_API_PORT;
if (!dataDirectory || !webPort || !apiPort)
  throw new Error(
    'Run npm run test:e2e to use an isolated temporary database.',
  );

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'production.spec.ts',
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: 'http://127.0.0.1:' + webPort,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://127.0.0.1:' + apiPort + '/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: apiPort, DATA_DIR: dataDirectory },
    },
    {
      command: 'npm run dev -w @markdown-note-taker/web -- --port ' + webPort,
      url: 'http://127.0.0.1:' + webPort,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: apiPort },
    },
  ],
});
