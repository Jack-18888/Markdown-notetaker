import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporaryRoot = realpathSync(tmpdir());
const directory = mkdtempSync(join(temporaryRoot, 'markdown-note-taker-e2e-'));
function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(String(port))));
    });
  });
}
function cleanup() {
  if (
    dirname(directory) !== temporaryRoot ||
    !basename(directory).startsWith('markdown-note-taker-e2e-')
  )
    throw new Error('Unexpected browser-test cleanup path.');
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
try {
  const cli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
  const args = process.argv.slice(2);
  if (args[0] === '--production') {
    args.splice(0, 1, '--config=playwright.production.config.ts');
  }
  const [webPort, apiPort] = await Promise.all([
    availablePort(),
    availablePort(),
  ]);
  const result = spawnSync(process.execPath, [cli, 'test', ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NOTE_TAKER_E2E_DATA_DIR: directory,
      NOTE_TAKER_E2E_WEB_PORT: webPort,
      NOTE_TAKER_E2E_API_PORT: apiPort,
    },
  });
  if (result.error) console.error('Could not launch browser checks.');
  process.exitCode = result.status ?? 1;
} finally {
  cleanup();
}
