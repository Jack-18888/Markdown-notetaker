import {
  readFileSync,
  existsSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fixtureIds,
  fixtureTimestamp,
  temporaryWorkspace,
} from '../../../__test__/temporary-workspace.js';
import { openWorkspace } from '../../../workspace/open.js';
import { DatabaseErrorCode } from '../../errors.js';
import { workspaceMigrations } from '../../migrations.js';

const previousMigrations = workspaceMigrations.slice(0, 2);
const workspaces: ReturnType<typeof temporaryWorkspace>[] = [];
const source = '\ufeff# Heading\r\n\r\n```mermaid\nA-->B  \r```\n\u{1f4dd}\0';
const metadata = {
  id: fixtureIds.note,
  title: 'Existing note',
  folderId: fixtureIds.folder,
  revision: 7,
  createdAt: fixtureTimestamp,
  updatedAt: '2026-11-08T12:00:00.000Z',
};

function populatedWorkspace() {
  const temporary = temporaryWorkspace();
  workspaces.push(temporary);
  const database = temporary.open({ migrations: previousMigrations });
  database
    .prepare('INSERT INTO folders VALUES (?, ?, NULL, ?, ?)')
    .run(
      fixtureIds.folder,
      'Existing folder',
      fixtureTimestamp,
      fixtureTimestamp,
    );
  const insert = database.prepare(
    'INSERT INTO notes (id, title, folder_id, content, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run(
    metadata.id,
    metadata.title,
    metadata.folderId,
    source,
    metadata.revision,
    metadata.createdAt,
    metadata.updatedAt,
  );
  insert.run(
    fixtureIds.child,
    'Blank',
    null,
    '',
    1,
    fixtureTimestamp,
    fixtureTimestamp,
  );
  database.close();
  return temporary;
}

afterEach(() => {
  for (const temporary of workspaces.splice(0)) temporary.cleanup();
});

describe('Markdown file migration', () => {
  it('writes both populated and empty files and preserves records after moving the data directory', () => {
    const temporary = populatedWorkspace();
    const upgraded = temporary.open();
    const paths = upgraded.prepare<[string], { content_path: string }>(
      'SELECT content_path FROM notes WHERE id = ?',
    );
    const directory = join(temporary.dataDirectory, 'notes');
    for (const [id, expected] of [
      [metadata.id, source],
      [fixtureIds.child, ''],
    ] as const) {
      const path = paths.get(id)!.content_path;
      expect(path).toMatch(new RegExp(`^${id}-[a-f0-9]{64}\\.md$`));
      expect(readFileSync(join(directory, path))).toEqual(
        Buffer.from(expected),
      );
    }
    expect(upgraded.prepare('SELECT * FROM notes').get()).not.toHaveProperty(
      'content',
    );
    upgraded.close();

    const relocated = join(temporary.directory, 'relocated');
    renameSync(temporary.dataDirectory, relocated);
    const reopened = openWorkspace({ dataDirectory: relocated });
    try {
      expect(reopened.service.getNote(metadata.id)).toEqual({
        ...metadata,
        content: source,
      });
      expect(reopened.service.getNote(fixtureIds.child).content).toBe('');
    } finally {
      reopened.close();
    }
  });

  it('keeps SQLite content after a blocked migration and upgrades successfully on retry', () => {
    const temporary = populatedWorkspace();
    const directory = join(temporary.dataDirectory, 'notes');
    writeFileSync(directory, 'unrelated file');
    expect(() => temporary.open()).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.MIGRATION_FAILED,
        migrationVersion: 3,
      }),
    );
    const original = temporary.open({ migrations: previousMigrations });
    expect(
      original
        .prepare('SELECT content, revision FROM notes WHERE id = ?')
        .get(metadata.id),
    ).toEqual({ content: source, revision: metadata.revision });
    original.close();
    expect(readFileSync(directory, 'utf8')).toBe('unrelated file');
    unlinkSync(directory);
    expect(temporary.open().pragma('user_version', { simple: true })).toBe(3);
  });

  it('preserves note files when their database is missing', () => {
    const temporary = populatedWorkspace();
    temporary.open().close();
    renameSync(temporary.filePath, join(temporary.directory, 'saved.sqlite'));
    const directory = join(temporary.dataDirectory, 'notes');
    const before = readdirSync(directory);
    expect(() => temporary.open()).toThrow(
      expect.objectContaining({ code: DatabaseErrorCode.MISSING_DATABASE }),
    );
    expect(existsSync(temporary.filePath)).toBe(false);
    expect(readdirSync(directory)).toEqual(before);
  });

  it('reuses a staged file when the migration transaction rolls back and then retries', () => {
    const temporary = populatedWorkspace();
    const directory = join(temporary.dataDirectory, 'notes');
    expect(() =>
      temporary.open({
        migrations: [
          ...workspaceMigrations,
          {
            version: 4,
            name: 'fixture_failure',
            sql: 'INSERT INTO missing_fixture_table VALUES (1);',
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ migrationVersion: 4 }));
    const staged = readdirSync(directory).filter(
      (entry) => !entry.startsWith('.'),
    );
    expect(staged).toHaveLength(2);
    const original = temporary.open({ migrations: previousMigrations });
    expect(
      original
        .prepare('SELECT content FROM notes WHERE id = ?')
        .get(metadata.id),
    ).toEqual({ content: source });
    original.close();
    const reopened = openWorkspace({ dataDirectory: temporary.dataDirectory });
    try {
      expect(reopened.service.getNote(metadata.id).content).toBe(source);
      expect(readdirSync(directory)).toEqual(staged);
    } finally {
      reopened.close();
    }
  });
});
