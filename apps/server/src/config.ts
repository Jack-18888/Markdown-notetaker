import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DatabaseErrorCode,
  DatabaseInitializationError,
} from './database/errors.js';

// src/config.ts and bundled dist/index.js have the same depth below the project root.
const projectDirectory = fileURLToPath(new URL('../../../', import.meta.url));
export const databaseFileName = 'workspace.sqlite';

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
