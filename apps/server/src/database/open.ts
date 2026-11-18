import { mkdirSync } from 'node:fs';
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
  requireCurrentSchema,
  workspaceMigrations,
  type Migration,
} from './migrations.js';

export interface DatabaseOptions {
  dataDirectory?: string;
  busyTimeoutMs?: number;
  migrations?: readonly Migration[];
}

export type ExistingDatabaseOptions = Omit<DatabaseOptions, 'migrations'> & {
  writable?: boolean;
};

function busyTimeout(timeout = 5000): number {
  if (!Number.isInteger(timeout) || timeout < 0 || timeout > 60000) {
    throw new DatabaseInitializationError(
      DatabaseErrorCode.INVALID_BUSY_TIMEOUT,
    );
  }
  return timeout;
}

/** Open the workspace, configure SQLite, and migrate before exposing a connection. */
export function openDatabase(options: DatabaseOptions = {}): Database.Database {
  const directory = resolveDataDirectory(options.dataDirectory);
  const timeout = busyTimeout(options.busyTimeoutMs);
  try {
    mkdirSync(directory, { recursive: true });
  } catch {
    throw new DatabaseInitializationError(
      DatabaseErrorCode.DATA_DIRECTORY_UNAVAILABLE,
    );
  }

  let database: Database.Database | undefined;
  try {
    database = new Database(join(directory, databaseFileName), { timeout });
    database.pragma('foreign_keys = ON');
    if (database.pragma('journal_mode = WAL', { simple: true }) !== 'wal') {
      throw new DatabaseInitializationError(
        DatabaseErrorCode.DATABASE_UNAVAILABLE,
      );
    }
    database.pragma('synchronous = FULL');
    applyMigrations(database, options.migrations ?? workspaceMigrations);
    return database;
  } catch (error) {
    if (database?.open) database.close();
    throw databaseFailure(error, DatabaseErrorCode.DATABASE_UNAVAILABLE);
  }
}

/** Connect to an initialized workspace without creating a file or migrating it. */
export function openExistingDatabase(
  options: ExistingDatabaseOptions = {},
): Database.Database {
  const directory = resolveDataDirectory(options.dataDirectory);
  const timeout = busyTimeout(options.busyTimeoutMs);
  let database: Database.Database | undefined;
  try {
    database = new Database(join(directory, databaseFileName), {
      timeout,
      fileMustExist: true,
      readonly: options.writable !== true,
    });
    database.pragma('foreign_keys = ON');
    if (options.writable) database.pragma('synchronous = FULL');
    requireCurrentSchema(database);
    return database;
  } catch (error) {
    if (database?.open) database.close();
    throw databaseFailure(error, DatabaseErrorCode.DATABASE_UNAVAILABLE);
  }
}
