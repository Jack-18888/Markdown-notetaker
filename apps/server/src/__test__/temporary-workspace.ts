import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { databaseFileName } from '../config.js';
import { openDatabase, type DatabaseOptions } from '../database/open.js';

/** Own every connection and file created by a persistence test. */
export function temporaryWorkspace() {
  const temporaryRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(
    join(temporaryRoot, 'markdown-note-taker-test-'),
  );
  const dataDirectory = join(directory, 'data');
  const filePath = join(dataDirectory, databaseFileName);
  const connections = new Set<Database.Database>();
  return {
    directory,
    dataDirectory,
    filePath,
    open(options: DatabaseOptions = {}) {
      const selected = resolve(options.dataDirectory ?? dataDirectory);
      if (selected !== directory && !selected.startsWith(directory + sep))
        throw new Error(
          'Test database must stay inside its temporary directory.',
        );
      const database = openDatabase({ ...options, dataDirectory: selected });
      connections.add(database);
      return database;
    },
    raw() {
      mkdirSync(dataDirectory, { recursive: true });
      const database = new Database(filePath, { timeout: 25 });
      connections.add(database);
      return database;
    },
    cleanup() {
      for (const database of connections) if (database.open) database.close();
      if (
        dirname(directory) !== temporaryRoot ||
        !basename(directory).startsWith('markdown-note-taker-test-')
      )
        throw new Error('Unexpected persistence-test cleanup path.');
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    },
  };
}

export const fixtureIds = {
  folder: '123e4567-e89b-42d3-a456-426614174000',
  child: '123e4567-e89b-42d3-a456-426614174001',
  note: '123e4567-e89b-42d3-a456-426614174002',
  missing: '123e4567-e89b-42d3-a456-426614174003',
};
export const fixtureTimestamp = '2026-11-07T12:00:00.000Z';

export function seedWorkspace(database: Database.Database) {
  const insertFolder = database.prepare(
    'INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  insertFolder.run(
    fixtureIds.folder,
    'Project',
    null,
    fixtureTimestamp,
    fixtureTimestamp,
  );
  insertFolder.run(
    fixtureIds.child,
    'Nested',
    fixtureIds.folder,
    fixtureTimestamp,
    fixtureTimestamp,
  );
  const content =
    '# Fixture \u{1f4dd}\r\n\r\n**Markdown**\n<script>literal</script>\n';
  database
    .prepare(
      'INSERT INTO notes (id, title, folder_id, content, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      fixtureIds.note,
      'Example',
      fixtureIds.child,
      content,
      1,
      fixtureTimestamp,
      fixtureTimestamp,
    );
  return content;
}
