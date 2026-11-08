import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDataDirectory } from '../../config.js';
import { DatabaseErrorCode, DatabaseInitializationError } from '../errors.js';
import {
  fixtureIds,
  fixtureTimestamp,
  seedWorkspace,
  temporaryWorkspace,
} from '../../__test__/temporary-workspace.js';

const workspaces: ReturnType<typeof temporaryWorkspace>[] = [];
function workspace() {
  const temporary = temporaryWorkspace();
  workspaces.push(temporary);
  return temporary;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const temporary of workspaces.splice(0)) temporary.cleanup();
});

describe('workspace database initialization', () => {
  it('initializes a missing directory with the required SQLite settings', () => {
    const temporary = workspace();
    expect(existsSync(temporary.dataDirectory)).toBe(false);
    const database = temporary.open();
    expect(existsSync(temporary.filePath)).toBe(true);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(database.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(database.pragma('synchronous', { simple: true })).toBe(2);
    expect(database.pragma('user_version', { simple: true })).toBe(2);
    expect(
      database.prepare('SELECT version, name FROM schema_migrations').all(),
    ).toEqual([
      { version: 1, name: 'initial_workspace' },
      { version: 2, name: 'raw_markdown_content' },
    ]);
  });

  it('preserves hierarchy, Markdown source, revisions, and timestamps after reopening', () => {
    const temporary = workspace();
    const database = temporary.open();
    const content = seedWorkspace(database);
    database.close();
    const reopened = temporary.open();
    const row = reopened
      .prepare<
        [],
        {
          content: string;
          title: string;
          revision: number;
          folder_id: string;
          created_at: string;
          updated_at: string;
        }
      >('SELECT * FROM notes')
      .get()!;
    expect(row.content).toBe(content);
    expect(row).toMatchObject({
      title: 'Example',
      folder_id: fixtureIds.child,
      revision: 1,
      created_at: fixtureTimestamp,
      updated_at: fixtureTimestamp,
    });
    expect(
      reopened.prepare('SELECT id, parent_id FROM folders ORDER BY id').all(),
    ).toEqual([
      { id: fixtureIds.folder, parent_id: null },
      { id: fixtureIds.child, parent_id: fixtureIds.folder },
    ]);
  });

  it('indexes both hierarchy references', () => {
    const database = workspace().open();
    expect(
      database
        .prepare(
          'EXPLAIN QUERY PLAN SELECT id FROM folders WHERE parent_id = ?',
        )
        .all(fixtureIds.folder),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringContaining('folders_parent_id_idx'),
        }),
      ]),
    );
    expect(
      database
        .prepare('EXPLAIN QUERY PLAN SELECT id FROM notes WHERE folder_id = ?')
        .all(fixtureIds.folder),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringContaining('notes_folder_id_idx'),
        }),
      ]),
    );
  });

  it('rejects missing references when inserting and updating folders and notes', () => {
    const database = workspace().open();
    seedWorkspace(database);
    expect(() =>
      database
        .prepare(
          'INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          fixtureIds.missing,
          'Invalid',
          fixtureIds.note,
          fixtureTimestamp,
          fixtureTimestamp,
        ),
    ).toThrow();
    expect(() =>
      database
        .prepare('UPDATE folders SET parent_id = ? WHERE id = ?')
        .run(fixtureIds.missing, fixtureIds.child),
    ).toThrow();
    expect(() =>
      database
        .prepare('UPDATE notes SET folder_id = ? WHERE id = ?')
        .run(fixtureIds.missing, fixtureIds.note),
    ).toThrow();
    expect(
      database
        .prepare('SELECT parent_id FROM folders WHERE id = ?')
        .get(fixtureIds.child),
    ).toEqual({ parent_id: fixtureIds.folder });
    expect(
      database
        .prepare('SELECT folder_id FROM notes WHERE id = ?')
        .get(fixtureIds.note),
    ).toEqual({ folder_id: fixtureIds.child });
  });

  it.each([
    ['UPDATE notes SET content = ? WHERE id = ?', null],
    ['UPDATE notes SET content = ? WHERE id = ?', Buffer.from('blob')],
    ['UPDATE notes SET revision = ? WHERE id = ?', 0],
    ['UPDATE notes SET revision = ? WHERE id = ?', Number.MAX_SAFE_INTEGER + 1],
  ] as const)(
    'rejects invalid stored content/revision values (%#)',
    (sql, value) => {
      const database = workspace().open();
      seedWorkspace(database);
      const before = database.prepare('SELECT * FROM notes').all();
      expect(() => database.prepare(sql).run(value, fixtureIds.note)).toThrow();
      expect(database.prepare('SELECT * FROM notes').all()).toEqual(before);
    },
  );

  it('allows duplicate names while rejecting a direct self-parent', () => {
    const database = workspace().open();
    seedWorkspace(database);
    database
      .prepare(
        'INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        fixtureIds.missing,
        'Project',
        null,
        fixtureTimestamp,
        fixtureTimestamp,
      );
    expect(
      database
        .prepare('SELECT count(*) AS count FROM folders WHERE name = ?')
        .get('Project'),
    ).toEqual({ count: 2 });
    expect(() =>
      database
        .prepare('UPDATE folders SET parent_id = id WHERE id = ?')
        .run(fixtureIds.child),
    ).toThrow();
  });

  it('reports an unavailable directory without replacing the blocking file', () => {
    const temporary = workspace();
    const blocker = join(temporary.directory, 'blocked');
    writeFileSync(blocker, 'fixture');
    expect(() => temporary.open({ dataDirectory: blocker })).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.DATA_DIRECTORY_UNAVAILABLE,
      }),
    );
    expect(readFileSync(blocker, 'utf8')).toBe('fixture');
  });

  it('reports an unopenable database path without replacing it', () => {
    const temporary = workspace();
    mkdirSync(temporary.filePath, { recursive: true });
    expect(() => temporary.open()).toThrow(
      expect.objectContaining({ code: DatabaseErrorCode.DATABASE_UNAVAILABLE }),
    );
    expect(existsSync(temporary.filePath)).toBe(true);
  });

  it('reports corruption without changing the existing file', () => {
    const temporary = workspace();
    mkdirSync(temporary.dataDirectory);
    const original = Buffer.alloc(128, 0x61);
    writeFileSync(temporary.filePath, original);
    expect(() => temporary.open()).toThrow(
      expect.objectContaining({ code: DatabaseErrorCode.DATABASE_CORRUPT }),
    );
    expect(readFileSync(temporary.filePath)).toEqual(original);
  });

  it('reports a real writer lock and recovers after it is released', () => {
    const temporary = workspace();
    const first = temporary.open();
    seedWorkspace(first);
    first.exec('BEGIN IMMEDIATE');
    try {
      expect(() => temporary.open({ busyTimeoutMs: 10 })).toThrow(
        expect.objectContaining({ code: DatabaseErrorCode.DATABASE_LOCKED }),
      );
    } finally {
      first.exec('ROLLBACK');
      first.close();
    }
    expect(temporary.open().prepare('SELECT title FROM notes').get()).toEqual({
      title: 'Example',
    });
  });

  it.each([-1, 1.5, 60001, Number.NaN])(
    'rejects invalid busy timeout %s before creating data',
    (busyTimeoutMs) => {
      const temporary = workspace();
      expect(() => temporary.open({ busyTimeoutMs })).toThrow(
        expect.objectContaining({
          code: DatabaseErrorCode.INVALID_BUSY_TIMEOUT,
        }),
      );
      expect(existsSync(temporary.dataDirectory)).toBe(false);
    },
  );

  it('resolves default, relative, absolute, and environment data paths consistently', () => {
    const temporary = workspace();
    vi.stubEnv('DATA_DIR', undefined);
    const standard = resolveDataDirectory();
    expect(standard).toBe(
      fileURLToPath(new URL('../../../../../data', import.meta.url)),
    );
    expect(standard).toBe(resolveDataDirectory('data'));
    expect(resolveDataDirectory('./data')).toBe(standard);
    expect(resolveDataDirectory(temporary.dataDirectory)).toBe(
      temporary.dataDirectory,
    );
    vi.stubEnv('DATA_DIR', './data');
    expect(resolveDataDirectory()).toBe(standard);
    vi.stubEnv('DATA_DIR', temporary.dataDirectory);
    expect(resolveDataDirectory()).toBe(temporary.dataDirectory);
  });

  it.each(['', '   ', 'bad\0path'])(
    'rejects invalid data directory input (%#)',
    (input) => {
      expect(() => resolveDataDirectory(input)).toThrow(
        DatabaseInitializationError,
      );
    },
  );
});
