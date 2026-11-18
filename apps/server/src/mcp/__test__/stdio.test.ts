import { existsSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import {
  folderSchema,
  limits,
  noteDetailSchema,
} from '@markdown-note-taker/contracts';
import {
  fixtureIds,
  seedWorkspace,
  temporaryWorkspace,
} from '../../__test__/temporary-workspace.js';
import { workspaceMcpClient } from '../../__test__/workspace-mcp-client.js';
import { workspaceMigrations } from '../../database/migrations.js';
import { openWorkspace } from '../../workspace/open.js';
import {
  folderPageSchema,
  noteSearchPageSchema,
} from '../../workspace/queries.js';

const cleanup: (() => void | Promise<void>)[] = [];

function testWorkspace(options?: Parameters<typeof workspaceMcpClient>[1]) {
  const temporary = temporaryWorkspace();
  const mcp = workspaceMcpClient(temporary.dataDirectory, options);
  cleanup.push(
    () => temporary.cleanup(),
    () => mcp.close(),
  );
  return { ...temporary, mcp };
}

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

it.each(['auto', 'legacy'] as const)(
  'discovers read-only tools and returns exact raw Markdown over %s stdio without HTTP',
  async (mode) => {
    const { dataDirectory, mcp } = testWorkspace({ mode });
    const workspace = openWorkspace({ dataDirectory });
    const content =
      '# Fixture 📝\r\n\r\n```mermaid\ngraph LR\n```\n\n![Local](/api/images/123e4567-e89b-42d3-a456-426614174005)  \n';
    const note = workspace.service.createNote({
      title: 'Source',
      content,
      folderId: null,
    });
    workspace.close();

    await mcp.connect();
    const { tools } = await mcp.client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_note',
      'list_folder',
      'search_notes',
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    const result = await mcp.client.callTool({
      name: 'get_note',
      arguments: { id: note.id },
    });
    expect(noteDetailSchema.parse(result.structuredContent)).toEqual(note);
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(result.structuredContent) },
    ]);
    expect(mcp.diagnostics).toBe('');
  },
);

it('pages direct children through the folder-to-note boundary', async () => {
  const { mcp, open, dataDirectory } = testWorkspace();
  seedWorkspace(open());
  const workspace = openWorkspace({ dataDirectory });
  const sibling = workspace.service.createFolder({
    name: 'Sibling',
    parentId: null,
  });
  const rootNote = workspace.service.createNote({
    title: 'Root note',
    folderId: null,
  });
  workspace.close();

  await mcp.connect();
  const list = async (input: Record<string, unknown>) =>
    folderPageSchema.parse(
      (await mcp.client.callTool({ name: 'list_folder', arguments: input }))
        .structuredContent,
    );
  const [firstId, secondId] = [fixtureIds.folder, sibling.id].sort();
  const first = await list({ folderId: null, limit: 1 });
  expect(first.items).toMatchObject([{ kind: 'folder', id: firstId }]);
  const second = await list({
    folderId: null,
    limit: 1,
    cursor: first.nextCursor,
  });
  expect(second.items).toMatchObject([{ kind: 'folder', id: secondId }]);
  expect(
    await list({ folderId: null, limit: 1, cursor: second.nextCursor }),
  ).toMatchObject({
    items: [{ kind: 'note', id: rootNote.id }],
    nextCursor: null,
  });
  expect((await list({ folderId: fixtureIds.folder })).items).toMatchObject([
    { kind: 'folder', id: fixtureIds.child },
  ]);
  expect((await list({ folderId: fixtureIds.child })).items).toMatchObject([
    { kind: 'note', id: fixtureIds.note },
  ]);
});

it('searches saved titles and bodies literally with optional direct folder scope', async () => {
  const { mcp, dataDirectory } = testWorkspace();
  const workspace = openWorkspace({ dataDirectory });
  const folder = workspace.service.createFolder({
    name: 'Project',
    parentId: null,
  });
  const titled = workspace.service.createNote({
    title: 'Budget %_',
    folderId: null,
  });
  const writing = workspace.service.createNote({
    title: 'Body match',
    folderId: folder.id,
    content: 'See **budget %_**.',
  });
  workspace.service.createNote({ title: 'Budget 12', folderId: null });
  workspace.close();

  await mcp.connect();
  const search = async (input: Record<string, unknown>) =>
    noteSearchPageSchema.parse(
      (
        await mcp.client.callTool({
          name: 'search_notes',
          arguments: { query: 'BUDGET %_', ...input },
        })
      ).structuredContent,
    );
  const first = await search({ limit: 1 });
  const second = await search({ limit: 1, cursor: first.nextCursor });
  expect([...first.notes, ...second.notes].map((note) => note.id)).toEqual(
    [titled.id, writing.id].sort(),
  );
  expect(second.nextCursor).toBeNull();
  expect((await search({ folderId: null })).notes).toMatchObject([
    { id: titled.id },
  ]);
  expect((await search({ folderId: folder.id })).notes).toMatchObject([
    { id: writing.id },
  ]);
  expect(await search({ query: 'unmatched' })).toEqual({
    notes: [],
    nextCursor: null,
  });
});

it('rejects invalid requests and returns a sanitized missing-note error', async () => {
  const { mcp, open } = testWorkspace();
  open().close();
  await mcp.connect();
  for (const [name, args] of [
    ['list_folder', { folderId: null, limit: 101 }],
    ['search_notes', { query: ' ' }],
    ['get_note', { id: 'bad-id' }],
    ['get_note', { id: fixtureIds.missing, unexpected: 'extra' }],
  ] as const) {
    const result = await mcp.client.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
  }
  const missing = await mcp.client.callTool({
    name: 'get_note',
    arguments: { id: fixtureIds.missing },
  });
  expect(missing.isError).toBe(true);
  expect(missing.structuredContent).toMatchObject({
    error: { code: 'NOT_FOUND' },
  });
  expect(mcp.diagnostics).toBe('');
});

it('fails before opening stdio when the database is missing or requires an upgrade', async () => {
  const empty = testWorkspace();
  await expect(empty.mcp.connect()).rejects.toThrow();
  expect(empty.mcp.diagnostics).toContain('initialize the selected workspace');
  expect(empty.mcp.diagnostics).not.toContain(empty.directory);
  expect(existsSync(empty.dataDirectory)).toBe(false);

  const old = testWorkspace();
  const database = old.open({ migrations: workspaceMigrations.slice(0, 1) });
  await expect(old.mcp.connect()).rejects.toThrow();
  expect(old.mcp.diagnostics).toContain('needs a database upgrade');
  expect(database.pragma('user_version', { simple: true })).toBe(1);
});

it('rejects a current-version database with mismatched migration history', async () => {
  const { mcp, open } = testWorkspace();
  const database = open();
  database
    .prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1')
    .run('other');
  await expect(mcp.connect()).rejects.toThrow();
  expect(mcp.diagnostics).toContain('migration history does not match');
  expect(
    database
      .prepare('SELECT checksum FROM schema_migrations WHERE version = 1')
      .get(),
  ).toEqual({ checksum: 'other' });
});

it('creates folders and notes, then durably renames, moves, and edits a note in write mode', async () => {
  const { mcp, open, dataDirectory } = testWorkspace({ args: ['--write'] });
  open().close();
  await mcp.connect();
  expect(
    (await mcp.client.listTools()).tools.map((tool) => tool.name).sort(),
  ).toEqual([
    'create_folder',
    'create_note',
    'get_note',
    'list_folder',
    'search_notes',
    'update_note',
  ]);
  const { id: folderId } = folderSchema.parse(
    (
      await mcp.client.callTool({
        name: 'create_folder',
        arguments: { name: 'Project', parentId: null },
      })
    ).structuredContent,
  );
  const created = await mcp.client.callTool({
    name: 'create_note',
    arguments: { title: 'Draft', folderId },
  });
  expect(created.structuredContent).toEqual({
    id: expect.any(String),
    revision: 1,
  });
  const list = await mcp.client.callTool({
    name: 'list_folder',
    arguments: { folderId },
  });
  const [note] = folderPageSchema.parse(list.structuredContent).items;
  expect(note).toMatchObject({ kind: 'note', title: 'Draft', folderId });
  const id = note!.id;
  const content = '# Updated 📝\r\n\r\nDetails.  \n';
  const update = await mcp.client.callTool({
    name: 'update_note',
    arguments: {
      id,
      expectedRevision: 1,
      title: 'Summary',
      folderId: null,
      content,
    },
  });
  expect(update.structuredContent).toEqual({ id, revision: 2 });

  const stale = await mcp.client.callTool({
    name: 'update_note',
    arguments: {
      id,
      expectedRevision: 1,
      content: 'Stale edit',
    },
  });
  expect(stale.isError).toBe(true);
  expect(stale.structuredContent).toMatchObject({
    error: {
      code: 'REVISION_CONFLICT',
      noteId: id,
      expectedRevision: 1,
      currentRevision: 2,
    },
  });
  expect(JSON.stringify(stale)).not.toContain('Details.');
  const empty = await mcp.client.callTool({
    name: 'update_note',
    arguments: {
      id,
      expectedRevision: 2,
    },
  });
  expect(empty.isError).toBe(true);

  await mcp.close();
  const reopened = openWorkspace({ dataDirectory });
  try {
    expect(reopened.service.getNote(id)).toMatchObject({
      title: 'Summary',
      folderId: null,
      revision: 2,
      content,
    });
    expect(reopened.service.listFolder({ folderId }).items).toEqual([]);
  } finally {
    reopened.close();
  }
});

it('fails closed on unknown startup arguments', async () => {
  const { mcp, open } = testWorkspace({ args: ['--writable'] });
  open().close();
  await expect(mcp.connect()).rejects.toThrow();
  expect(mcp.diagnostics).toContain(
    'Usage: node apps/server/dist/mcp.js [--write]',
  );
});

it('returns complete structured Markdown when JSON escaping would make two copies exceed the stdio limit', async () => {
  const { dataDirectory, mcp } = testWorkspace();
  const workspace = openWorkspace({ dataDirectory });
  const content = '\u0001'.repeat(limits.markdownBytes);
  const note = workspace.service.createNote({
    title: 'Control characters',
    content,
    folderId: null,
  });
  workspace.close();

  await mcp.connect();
  const result = await mcp.client.callTool({
    name: 'get_note',
    arguments: { id: note.id },
  });
  expect(
    noteDetailSchema.parse(result.structuredContent).content === content,
  ).toBe(true);
  expect(result.content).toEqual([
    { type: 'text', text: 'The complete result is in structuredContent.' },
  ]);
});
