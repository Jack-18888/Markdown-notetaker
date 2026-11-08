import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporaryRoot = realpathSync(tmpdir());
const directory = mkdtempSync(join(temporaryRoot, 'markdown-note-taker-e2e-'));
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
  const result = spawnSync(
    process.execPath,
    [cli, 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, NOTE_TAKER_E2E_DATA_DIR: directory },
    },
  );
  if (result.error) console.error('Could not launch browser checks.');
  process.exitCode = result.status ?? 1;
} finally {
  cleanup();
}
