import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseErrorCode } from './errors.js';
import { workspaceMigrations, type Migration } from './migrations.js';
import {
  seedWorkspace,
  temporaryWorkspace,
} from '../../test/temporary-workspace.js';

const workspaces: ReturnType<typeof temporaryWorkspace>[] = [];
function workspace() {
  const temporary = temporaryWorkspace();
  workspaces.push(temporary);
  return temporary;
}
afterEach(() => {
  for (const temporary of workspaces.splice(0)) temporary.cleanup();
});

const secondMigration: Migration = {
  version: 3,
  name: 'fixture_upgrade',
  sql: 'CREATE TABLE migration_probe (id INTEGER PRIMARY KEY) STRICT; INSERT INTO migration_probe VALUES (1);',
};

describe('workspace migrations through the connection factory', () => {
  it('does not rerun an applied migration or change its bookkeeping', () => {
    const temporary = workspace();
    const database = temporary.open();
    seedWorkspace(database);
    const history = database.prepare('SELECT * FROM schema_migrations').all();
    database.close();
    const reopened = temporary.open();
    expect(reopened.prepare('SELECT * FROM schema_migrations').all()).toEqual(
      history,
    );
    expect(reopened.prepare('SELECT title FROM notes').get()).toEqual({
      title: 'Example',
    });
  });

  it('upgrades an existing populated database and preserves it after reopening', () => {
    const temporary = workspace();
    const initial = temporary.open();
    seedWorkspace(initial);
    const before = initial.prepare('SELECT * FROM notes').all();
    initial.close();
    const migrations = [...workspaceMigrations, secondMigration];
    const upgraded = temporary.open({ migrations });
    expect(upgraded.prepare('SELECT * FROM notes').all()).toEqual(before);
    expect(upgraded.pragma('user_version', { simple: true })).toBe(3);
    upgraded.close();
    const reopened = temporary.open({ migrations });
    expect(reopened.prepare('SELECT * FROM migration_probe').all()).toEqual([
      { id: 1 },
    ]);
    expect(reopened.prepare('SELECT * FROM notes').all()).toEqual(before);
    expect(
      reopened
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
  });

  it('rolls back the entire pending batch and saved data on migration failure', () => {
    const temporary = workspace();
    const initial = temporary.open();
    seedWorkspace(initial);
    const notes = initial.prepare('SELECT * FROM notes').all();
    const history = initial.prepare('SELECT * FROM schema_migrations').all();
    initial.close();
    const migrations: Migration[] = [
      ...workspaceMigrations,
      {
        ...secondMigration,
        sql: secondMigration.sql + ' UPDATE notes SET revision = revision + 1;',
      },
      {
        version: 4,
        name: 'fixture_failure',
        sql: 'CREATE TABLE failed_probe (id INTEGER); INSERT INTO missing_fixture_table VALUES (1);',
      },
    ];
    expect(() => temporary.open({ migrations })).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.MIGRATION_FAILED,
        migrationVersion: 4,
      }),
    );
    const reopened = temporary.open();
    expect(reopened.prepare('SELECT * FROM notes').all()).toEqual(notes);
    expect(reopened.prepare('SELECT * FROM schema_migrations').all()).toEqual(
      history,
    );
    expect(reopened.pragma('user_version', { simple: true })).toBe(2);
    expect(
      reopened
        .prepare(
          "SELECT name FROM sqlite_schema WHERE name IN ('migration_probe', 'failed_probe')",
        )
        .all(),
    ).toEqual([]);
  });

  it('rolls back initial schema creation when the first batch fails', () => {
    const temporary = workspace();
    expect(() =>
      temporary.open({
        migrations: [
          ...workspaceMigrations,
          {
            ...secondMigration,
            sql: 'INSERT INTO missing_fixture_table VALUES (1);',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({ code: DatabaseErrorCode.MIGRATION_FAILED }),
    );
    const raw = temporary.raw();
    expect(raw.pragma('user_version', { simple: true })).toBe(0);
    expect(
      raw.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all(),
    ).toEqual([]);
    raw.close();
    expect(temporary.open().pragma('user_version', { simple: true })).toBe(2);
  });

  it.each(['sql', 'name'] as const)(
    'rejects an edited applied migration %s',
    (field) => {
      const temporary = workspace();
      const initial = temporary.open();
      seedWorkspace(initial);
      const notes = initial.prepare('SELECT * FROM notes').all();
      initial.close();
      const first = workspaceMigrations[0]!;
      const changed = { ...first, [field]: first[field] + ' changed' };
      expect(() =>
        temporary.open({
          migrations: [changed, ...workspaceMigrations.slice(1)],
        }),
      ).toThrow(
        expect.objectContaining({
          code: DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
        }),
      );
      expect(temporary.open().prepare('SELECT * FROM notes').all()).toEqual(
        notes,
      );
    },
  );

  it('rejects a newer database rather than downgrading it', () => {
    const temporary = workspace();
    temporary
      .open({ migrations: [...workspaceMigrations, secondMigration] })
      .close();
    expect(() => temporary.open()).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
      }),
    );
    expect(temporary.raw().pragma('user_version', { simple: true })).toBe(3);
  });

  it('reports an incompatible migration journal without changing saved notes', () => {
    const temporary = workspace();
    const initial = temporary.open();
    seedWorkspace(initial);
    const notes = initial.prepare('SELECT * FROM notes').all();
    initial.exec('ALTER TABLE schema_migrations DROP COLUMN checksum');
    initial.close();
    expect(() => temporary.open()).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
      }),
    );
    expect(temporary.raw().prepare('SELECT * FROM notes').all()).toEqual(notes);
  });

  it('rejects inconsistent journal/version metadata without repairing it silently', () => {
    const temporary = workspace();
    const initial = temporary.open();
    initial.pragma('user_version = 3');
    initial.close();
    expect(() => temporary.open()).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
      }),
    );
    const raw = temporary.raw();
    expect(raw.pragma('user_version', { simple: true })).toBe(3);
    expect(raw.prepare('SELECT version FROM schema_migrations').all()).toEqual([
      { version: 1 },
      { version: 2 },
    ]);
  });

  it.each([
    { migrations: [] },
    { migrations: [{ version: 2, name: 'gap', sql: 'SELECT 1' }] },
    { migrations: [{ version: 1, name: '', sql: 'SELECT 1' }] },
    { migrations: [{ version: 1, name: 'empty', sql: '' }] },
  ])('rejects invalid migration definitions (%#)', ({ migrations }) => {
    const temporary = workspace();
    expect(() => temporary.open({ migrations })).toThrow(
      expect.objectContaining({ code: DatabaseErrorCode.INVALID_MIGRATIONS }),
    );
  });
});
