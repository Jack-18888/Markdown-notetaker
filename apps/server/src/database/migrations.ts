import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  DatabaseErrorCode,
  DatabaseInitializationError,
  databaseFailure,
} from './errors.js';
import { initialWorkspaceMigration } from './migrations/001-workspace.js';
import { markdownMigration } from './migrations/002-markdown.js';
import { markdownFilesMigration } from './migrations/003-markdown-files.js';

/** Code-owned SQL; the runner owns the transaction and version bookkeeping. */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  /** Register versioned SQL helpers before this migration runs. */
  readonly registerFunctions?: (
    database: Database.Database,
    dataDirectory: string,
  ) => void;
}

export const workspaceMigrations: readonly Migration[] = [
  initialWorkspaceMigration,
  markdownMigration,
  markdownFilesMigration,
];

interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

function checksum(migration: Migration): string {
  return createHash('sha256').update(migration.sql).digest('hex');
}

function validateDefinitions(migrations: readonly Migration[]) {
  if (
    migrations.length === 0 ||
    migrations.some(
      (migration, index) =>
        migration.version !== index + 1 ||
        migration.version > 2147483647 ||
        !migration.name.trim() ||
        !migration.sql.trim(),
    )
  ) {
    throw new DatabaseInitializationError(DatabaseErrorCode.INVALID_MIGRATIONS);
  }
}

/** Apply all pending migrations together; any failure rolls back the whole batch. */
export function applyMigrations(
  database: Database.Database,
  migrations: readonly Migration[],
  dataDirectory: string,
) {
  validateDefinitions(migrations);
  database
    .transaction(() => {
      // Bootstrap the ledger before it can record application migrations.
      database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;`);
      let applied: AppliedMigration[];

      // get applied migrations from db
      try {
        applied = database
          .prepare<[], AppliedMigration>(
            'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
          )
          .all();
      } catch (error) {
        throw databaseFailure(
          error,
          DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
        );
      }

      // verify migration version and histories
      const latestAppliedVersion = applied.at(-1)?.version ?? 0;
      if (
        database.pragma('user_version', { simple: true }) !==
          latestAppliedVersion ||
        applied.length > migrations.length
      ) {
        throw new DatabaseInitializationError(
          DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
        );
      }
      for (const [index, record] of applied.entries()) {
        const expected = migrations[index];
        if (
          !expected ||
          record.version !== expected.version ||
          record.name !== expected.name ||
          record.checksum !== checksum(expected)
        ) {
          throw new DatabaseInitializationError(
            DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
          );
        }
      }

      // apply migrations
      const recordMigration = database.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      );
      for (const migration of migrations.slice(applied.length)) {
        try {
          migration.registerFunctions?.(database, dataDirectory);
          database.exec(migration.sql);
          recordMigration.run(
            migration.version,
            migration.name,
            checksum(migration),
            new Date().toISOString(),
          );
          // The version is a validated integer; PRAGMAs cannot bind parameters.
          database.pragma(`user_version = ${migration.version}`);
        } catch (error) {
          const failure = databaseFailure(
            error,
            DatabaseErrorCode.MIGRATION_FAILED,
          );
          if (failure.code !== DatabaseErrorCode.MIGRATION_FAILED)
            throw failure;
          throw new DatabaseInitializationError(
            failure.code,
            migration.version,
          );
        }
      }
    })
    .immediate();
}
