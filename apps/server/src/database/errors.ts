export enum DatabaseErrorCode {
  INVALID_DATA_DIRECTORY = 'invalid_data_directory',
  DATA_DIRECTORY_UNAVAILABLE = 'data_directory_unavailable',
  INVALID_BUSY_TIMEOUT = 'invalid_busy_timeout',
  INVALID_MIGRATIONS = 'invalid_migrations',
  DATABASE_UNAVAILABLE = 'database_unavailable',
  MISSING_DATABASE = 'missing_database',
  DATABASE_LOCKED = 'database_locked',
  DATABASE_CORRUPT = 'database_corrupt',
  MIGRATION_HISTORY_MISMATCH = 'migration_history_mismatch',
  MIGRATION_FAILED = 'migration_failed',
}

const messages: Record<DatabaseErrorCode, string> = {
  [DatabaseErrorCode.INVALID_DATA_DIRECTORY]:
    'DATA_DIR must be a non-empty path without null characters.',
  [DatabaseErrorCode.DATA_DIRECTORY_UNAVAILABLE]:
    'Cannot prepare the data directory. Check DATA_DIR and its permissions.',
  [DatabaseErrorCode.INVALID_BUSY_TIMEOUT]:
    'Database busy timeout must be an integer between 0 and 60000 milliseconds.',
  [DatabaseErrorCode.INVALID_MIGRATIONS]:
    'Migration definitions must start at 1, increase by 1, and contain names and SQL.',
  [DatabaseErrorCode.DATABASE_UNAVAILABLE]:
    'Cannot open or configure the database. Check DATA_DIR, file permissions, and available disk space.',
  [DatabaseErrorCode.MISSING_DATABASE]:
    'Note files exist but their SQLite database is missing. Restore the complete data directory from a verified backup.',
  [DatabaseErrorCode.DATABASE_LOCKED]:
    'The database is locked. Close the other writer and retry startup.',
  [DatabaseErrorCode.DATABASE_CORRUPT]:
    'The database is corrupt or is not a SQLite file. Keep the file and restore a verified backup.',
  [DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH]:
    'Database migration history does not match this app. Use matching migration files or a compatible app version.',
  [DatabaseErrorCode.MIGRATION_FAILED]:
    'Database migration failed. Check the migration code and retry without deleting the database.',
};

/** Startup diagnostics exclude SQL, note contents, and underlying exception text. */
export class DatabaseInitializationError extends Error {
  constructor(
    readonly code: DatabaseErrorCode,
    readonly migrationVersion?: number,
  ) {
    super(
      messages[code] +
        (migrationVersion === undefined
          ? ''
          : ` Migration version: ${migrationVersion}.`),
    );
    this.name = 'DatabaseInitializationError';
  }
}

export function databaseFailure(
  error: unknown,
  fallback: DatabaseErrorCode,
): DatabaseInitializationError {
  if (error instanceof DatabaseInitializationError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  if (typeof code === 'string') {
    if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED'))
      return new DatabaseInitializationError(DatabaseErrorCode.DATABASE_LOCKED);
    if (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB')
      return new DatabaseInitializationError(
        DatabaseErrorCode.DATABASE_CORRUPT,
      );
  }
  return new DatabaseInitializationError(fallback);
}
