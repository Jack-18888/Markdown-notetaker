import { afterEach, describe, expect, it } from 'vitest';
import {
  fixtureIds,
  fixtureTimestamp,
  temporaryWorkspace,
} from '../../../__test__/temporary-workspace.js';
import { DatabaseErrorCode } from '../../errors.js';
import { initialWorkspaceMigration } from '../001-workspace.js';
import { markdownMigration } from '../002-markdown.js';

const migrationsThroughMarkdown = [
  initialWorkspaceMigration,
  markdownMigration,
];

const directories: ReturnType<typeof temporaryWorkspace>[] = [];
function legacyWorkspace() {
  const temporary = temporaryWorkspace();
  directories.push(temporary);
  const database = temporary.open({ migrations: [initialWorkspaceMigration] });
  database
    .prepare(
      'INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)',
    )
    .run(fixtureIds.folder, 'Saved folder', fixtureTimestamp, fixtureTimestamp);
  const insert = database.prepare(
    'INSERT INTO notes (id, title, folder_id, document_json, document_schema_version, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  return { temporary, database, insert };
}

afterEach(() => {
  for (const temporary of directories.splice(0)) temporary.cleanup();
});

describe('raw Markdown migration', () => {
  it('unwraps paragraph text verbatim and preserves metadata across reopen', () => {
    const { temporary, database, insert } = legacyWorkspace();
    const first = '\ufeff# Heading\r\n**bold**  \n\u{1f4dd}\u0000';
    const last = '```mermaid\nflowchart LR\n A --> B\n```\n';
    insert.run(
      fixtureIds.note,
      'Original title',
      fixtureIds.folder,
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: first },
              { type: 'text', text: ' suffix' },
            ],
          },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: last }] },
        ],
      }),
      1,
      7,
      fixtureTimestamp,
      fixtureTimestamp,
    );
    insert.run(
      fixtureIds.missing,
      'Blank',
      null,
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      }),
      1,
      1,
      fixtureTimestamp,
      fixtureTimestamp,
    );
    database.close();

    const upgraded = temporary.open({ migrations: migrationsThroughMarkdown });
    const noteQuery =
      'SELECT id, title, folder_id AS folderId, content, revision, created_at AS createdAt, updated_at AS updatedAt FROM notes WHERE id = ?';
    const expected = {
      id: fixtureIds.note,
      title: 'Original title',
      folderId: fixtureIds.folder,
      content: first + ' suffix\n\n\n\n' + last,
      revision: 7,
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp,
    };
    expect(upgraded.prepare(noteQuery).get(fixtureIds.note)).toEqual(expected);
    expect(
      upgraded
        .prepare('SELECT content FROM notes WHERE id = ?')
        .get(fixtureIds.missing),
    ).toEqual({ content: '' });
    expect(upgraded.prepare('SELECT id FROM folders').get()).toEqual({
      id: fixtureIds.folder,
    });
    expect(
      upgraded.prepare('SELECT * FROM notes WHERE id = ?').get(fixtureIds.note),
    ).not.toHaveProperty('document_json');
    upgraded.close();
    expect(
      temporary
        .open({ migrations: migrationsThroughMarkdown })
        .prepare(noteQuery)
        .get(fixtureIds.note),
    ).toEqual(expected);
    expect(() =>
      temporary.open({ migrations: [initialWorkspaceMigration] }),
    ).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.MIGRATION_HISTORY_MISMATCH,
      }),
    );
  });

  it('restores the original format if a later pending migration fails', () => {
    const { temporary, database, insert } = legacyWorkspace();
    insert.run(
      fixtureIds.note,
      'Keep original',
      fixtureIds.folder,
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '# Saved source' }],
          },
        ],
      }),
      1,
      4,
      fixtureTimestamp,
      fixtureTimestamp,
    );
    const rows = database.prepare('SELECT * FROM notes').all();
    const history = database.prepare('SELECT * FROM schema_migrations').all();
    database.close();
    expect(() =>
      temporary.open({
        migrations: [
          ...migrationsThroughMarkdown,
          {
            version: 3,
            name: 'fail_after_conversion',
            sql: 'INSERT INTO missing_fixture_table VALUES (1);',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: DatabaseErrorCode.MIGRATION_FAILED,
        migrationVersion: 3,
      }),
    );
    const unchanged = temporary.open({
      migrations: [initialWorkspaceMigration],
    });
    expect(unchanged.prepare('SELECT * FROM notes').all()).toEqual(rows);
    expect(unchanged.prepare('SELECT * FROM schema_migrations').all()).toEqual(
      history,
    );
    expect(unchanged.pragma('user_version', { simple: true })).toBe(1);
  });

  it.each([
    { version: 2, document: { type: 'doc', content: [{ type: 'paragraph' }] } },
    {
      version: 1,
      document: {
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 } }],
      },
    },
    {
      version: 1,
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Keep', marks: [{ type: 'bold' }] },
            ],
          },
        ],
      },
    },
    {
      version: 1,
      document: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '\ud800' }] },
        ],
      },
    },
  ])(
    'rolls back every conversion when a legacy document cannot migrate (%#)',
    ({ version, document }) => {
      const { temporary, database, insert } = legacyWorkspace();
      insert.run(
        fixtureIds.note,
        'Convertible',
        fixtureIds.folder,
        JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Preserve' }],
            },
          ],
        }),
        1,
        3,
        fixtureTimestamp,
        fixtureTimestamp,
      );
      insert.run(
        fixtureIds.missing,
        'Keep original',
        null,
        JSON.stringify(document),
        version,
        2,
        fixtureTimestamp,
        fixtureTimestamp,
      );
      const rows = database.prepare('SELECT * FROM notes ORDER BY id').all();
      const history = database.prepare('SELECT * FROM schema_migrations').all();
      database.close();
      expect(() => temporary.open()).toThrow(
        expect.objectContaining({
          code: DatabaseErrorCode.MIGRATION_FAILED,
          migrationVersion: 2,
        }),
      );
      const unchanged = temporary.open({
        migrations: [initialWorkspaceMigration],
      });
      expect(
        unchanged.prepare('SELECT * FROM notes ORDER BY id').all(),
      ).toEqual(rows);
      expect(
        unchanged.prepare('SELECT * FROM schema_migrations').all(),
      ).toEqual(history);
      expect(unchanged.pragma('user_version', { simple: true })).toBe(1);
      expect(
        unchanged
          .prepare(
            "SELECT name FROM sqlite_schema WHERE name = 'notes_markdown'",
          )
          .all(),
      ).toEqual([]);
    },
  );
});
