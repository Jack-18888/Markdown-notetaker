import { join, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DatabaseErrorCode,
  DatabaseInitializationError,
} from './database/errors.js';

// src/config.ts and bundled dist/index.js have the same depth below the project root.
const projectDirectory = fileURLToPath(new URL('../../../', import.meta.url));
export const databaseFileName = 'workspace.sqlite';
export const frontendDirectory = fileURLToPath(
  new URL('../../web/dist/', import.meta.url),
);

export class RuntimeConfigurationError extends Error {}

export function parsePort(value = process.env.PORT ?? '3001') {
  const port = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new RuntimeConfigurationError(
      'PORT must be an integer between 1 and 65535.',
    );
  return port;
}

export function checkFrontendAssets(directory = frontendDirectory) {
  try {
    if (
      statSync(join(directory, 'index.html')).isFile() &&
      statSync(join(directory, 'assets')).isDirectory()
    )
      return;
  } catch {
    /* Use a fixed actionable error without exposing filesystem paths. */
  }
  throw new RuntimeConfigurationError(
    'Built frontend is missing or unreadable. Run npm run build before npm start.',
  );
}

/** Resolve relative data paths from the project root in both dev and production. */
export function resolveDataDirectory(
  value: string | undefined = process.env.DATA_DIR,
): string {
  if (
    value !== undefined &&
    (value.trim().length === 0 || value.includes('\0'))
  ) {
    throw new DatabaseInitializationError(
      DatabaseErrorCode.INVALID_DATA_DIRECTORY,
    );
  }
  return resolve(projectDirectory, value ?? 'data');
}
