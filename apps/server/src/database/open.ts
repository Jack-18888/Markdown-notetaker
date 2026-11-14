import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { databaseFileName, resolveDataDirectory } from '../config.js';
import {
  databaseFailure,
  DatabaseErrorCode,
  DatabaseInitializationError,
} from './errors.js';
import {
  applyMigrations,
  workspaceMigrations,
  type Migration,
} from './migrations.js';

import { noteFiles } from './note-files.js';

export interface DatabaseOptions {
  dataDirectory?: string;
  busyTimeoutMs?: number;
  migrations?: readonly Migration[];
}

/** Open the workspace, configure SQLite, and migrate before exposing a connection. */
export function openDatabase(options: DatabaseOptions = {}): Database.Database {
  const directory = resolveDataDirectory(options.dataDirectory);
  const timeout = options.busyTimeoutMs ?? 5000;
  if (!Number.isInteger(timeout) || timeout < 0 || timeout > 60000) {
    throw new DatabaseInitializationError(
      DatabaseErrorCode.INVALID_BUSY_TIMEOUT,
    );
  }
  try {
    mkdirSync(directory, { recursive: true });
  } catch {
    throw new DatabaseInitializationError(
      DatabaseErrorCode.DATA_DIRECTORY_UNAVAILABLE,
    );
  }

  let database: Database.Database | undefined;
  try {
    const databasePath = join(directory, databaseFileName);
    if (!existsSync(databasePath) && noteFiles(directory).hasBodies())
      throw new DatabaseInitializationError(DatabaseErrorCode.MISSING_DATABASE);
    database = new Database(databasePath, { timeout });
    database.pragma('foreign_keys = ON');
    if (database.pragma('journal_mode = WAL', { simple: true }) !== 'wal') {
      throw new DatabaseInitializationError(
        DatabaseErrorCode.DATABASE_UNAVAILABLE,
      );
    }
    database.pragma('synchronous = FULL');
    applyMigrations(
      database,
      options.migrations ?? workspaceMigrations,
      directory,
    );
    return database;
  } catch (error) {
    if (database?.open) database.close();
    throw databaseFailure(error, DatabaseErrorCode.DATABASE_UNAVAILABLE);
  }
}
