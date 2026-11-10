import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  errorDefinitions,
  errorResponseSchema,
  limits,
  noteDetailSchema,
} from '@markdown-note-taker/contracts';
import {
  fixtureIds,
  temporaryApp,
} from '../../__test__/temporary-workspace.js';
import { createApp } from '../../app.js';
import { openWorkspace } from '../../workspace/open.js';

const applications: ReturnType<typeof temporaryApp>[] = [];
afterEach(() => {
  for (const application of applications.splice(0)) application.cleanup();
});
function application() {
  const temporary = temporaryApp();
  applications.push(temporary);
  return temporary;
}
function expectError(body: unknown, code: ApiErrorCode) {
  expect(errorResponseSchema.parse(body)).toEqual({
    error: { code, message: errorDefinitions[code].message },
  });
}

describe('note mutation API', () => {
  it('preserves raw Markdown through create, rename, move, and HTTP reopen', async () => {
    const temporary = application();
    const { app, workspace } = temporary;
    const folder = workspace.service.createFolder({
      name: 'Folder',
      parentId: null,
    });
    const source =
      '\ufeff---\r\nkey: value\r\n---\r\n# Note \u{1f4dd}\r\n\r\n<script>literal</script>\n\n```mermaid\nflowchart LR\n A --> B\n```\n\0  \n';
    const created = await request(app)
      .post('/api/notes')
      .send({ title: 'Original', folderId: folder.id, content: source })
      .expect(201);
    const note = noteDetailSchema.parse(created.body);
    expect(note).toMatchObject({ content: source, revision: 1 });
    const renamed = await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({ expectedRevision: 1, title: 'Renamed' })
      .expect(200);
    expect(noteDetailSchema.parse(renamed.body)).toMatchObject({
      content: source,
      folderId: folder.id,
      revision: 2,
    });
    const moved = await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({ expectedRevision: 2, folderId: null })
      .expect(200);
    expect(noteDetailSchema.parse(moved.body)).toMatchObject({
      title: 'Renamed',
      content: source,
      folderId: null,
      revision: 3,
      createdAt: note.createdAt,
    });
    workspace.close();
    const reopened = openWorkspace({ dataDirectory: temporary.dataDirectory });
    try {
      const result = await request(createApp({ workspace: reopened.service }))
        .get(`/api/notes/${note.id}`)
        .expect(200);
      expect(result.body).toEqual(moved.body);
      expect(Buffer.from(result.body.content)).toEqual(Buffer.from(source));
    } finally {
      reopened.close();
    }
  });

  it('defaults to blank content, applies atomic edits, and clears explicitly', async () => {
    const { app, workspace } = application();
    const folder = workspace.service.createFolder({
      name: 'Destination',
      parentId: null,
    });
    const created = await request(app)
      .post('/api/notes')
      .send({ title: 'Blank', folderId: null })
      .expect(201);
    const note = noteDetailSchema.parse(created.body);
    expect(note.content).toBe('');
    const changed = await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({
        expectedRevision: 1,
        title: 'Updated',
        folderId: folder.id,
        content: '**changed**\r\n',
      })
      .expect(200);
    expect(noteDetailSchema.parse(changed.body)).toMatchObject({
      title: 'Updated',
      folderId: folder.id,
      content: '**changed**\r\n',
      revision: 2,
    });
    await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({ expectedRevision: 2, title: 'Updated' })
      .expect(200);
    const cleared = await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({ expectedRevision: 3, content: '' })
      .expect(200);
    expect(noteDetailSchema.parse(cleared.body)).toMatchObject({
      title: 'Updated',
      folderId: folder.id,
      content: '',
      revision: 4,
    });
  });

  it('accepts exactly one competing write and protects stale delete confirmations', async () => {
    const { app, workspace } = application();
    const created = await request(app)
      .post('/api/notes')
      .send({ title: 'Race', folderId: null })
      .expect(201);
    const { id } = noteDetailSchema.parse(created.body);
    const results = await Promise.all(
      ['first source', 'second source'].map((content) =>
        request(app)
          .patch(`/api/notes/${id}`)
          .send({ expectedRevision: 1, content }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = noteDetailSchema.parse(
      results.find((response) => response.status === 200)!.body,
    );
    const conflict = errorResponseSchema.parse(
      results.find((response) => response.status === 409)!.body,
    );
    expect(conflict.error).toEqual({
      code: ApiErrorCode.REVISION_CONFLICT,
      message: errorDefinitions.REVISION_CONFLICT.message,
      noteId: id,
      expectedRevision: 1,
      currentRevision: 2,
    });
    const stale = await request(app)
      .delete(`/api/notes/${id}`)
      .send({ expectedRevision: 1 })
      .expect(409);
    expect(stale.body).toEqual(conflict);
    expect(workspace.service.getNote(id)).toEqual(winner);
    const deleted = await request(app)
      .delete(`/api/notes/${id}`)
      .send({ expectedRevision: 2 })
      .expect(204);
    expect(deleted.text).toBe('');
    await request(app).get(`/api/notes/${id}`).expect(404);
  });

  it.each([
    { title: 'Bad', folderId: null, content: null },
    { title: 'Bad', folderId: null, content: { version: 1 } },
    { title: 'Bad', folderId: null, content: '\ud800' },
    { title: 'Bad', folderId: null, revision: 1 },
    { title: 'Bad' },
  ])(
    'rejects invalid note creation %# without a partial record',
    async (body) => {
      const { app, workspace } = application();
      const response = await request(app)
        .post('/api/notes')
        .send(body)
        .expect(400);
      expectError(response.body, ApiErrorCode.INVALID_INPUT);
      expect(workspace.service.listTree().notes).toEqual([]);
    },
  );

  it('rejects invalid patches and deletes without changing saved content', async () => {
    const { app, workspace } = application();
    const note = workspace.service.createNote({
      title: 'Saved',
      folderId: null,
      content: 'saved source',
    });
    for (const body of [
      {},
      { expectedRevision: 1 },
      { title: 'Missing revision' },
      { expectedRevision: '1', title: 'Coerced' },
      { expectedRevision: 1, content: null },
      { expectedRevision: 1, title: 'Changed', revision: 9 },
    ]) {
      const response = await request(app)
        .patch(`/api/notes/${note.id}`)
        .send(body)
        .expect(400);
      expectError(response.body, ApiErrorCode.INVALID_INPUT);
    }
    for (const body of [
      {},
      { expectedRevision: '1' },
      { expectedRevision: 1, extra: true },
    ]) {
      const response = await request(app)
        .delete(`/api/notes/${note.id}`)
        .send(body)
        .expect(400);
      expectError(response.body, ApiErrorCode.INVALID_INPUT);
    }
    expect(workspace.service.getNote(note.id)).toEqual(note);
  });

  it('rejects invalid destinations, missing targets, and malformed IDs', async () => {
    const { app, workspace } = application();
    const note = workspace.service.createNote({
      title: 'Saved',
      folderId: null,
      content: 'saved source',
    });
    const create = await request(app)
      .post('/api/notes')
      .send({ title: 'Bad destination', folderId: fixtureIds.missing })
      .expect(409);
    expectError(create.body, ApiErrorCode.HIERARCHY_CONFLICT);
    const move = await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({
        expectedRevision: 1,
        title: 'Must not change',
        content: 'must not save',
        folderId: fixtureIds.missing,
      })
      .expect(409);
    expectError(move.body, ApiErrorCode.HIERARCHY_CONFLICT);
    for (const [id, status, code] of [
      ['bad-id', 400, ApiErrorCode.INVALID_INPUT],
      [fixtureIds.missing, 404, ApiErrorCode.NOT_FOUND],
    ] as const) {
      for (const method of ['patch', 'delete'] as const) {
        const mutation = request(app)[method](`/api/notes/${id}`);
        const response = await mutation
          .send(
            method === 'patch'
              ? { expectedRevision: 1, title: 'Changed' }
              : { expectedRevision: 1 },
          )
          .expect(status);
        expectError(response.body, code);
      }
    }
    expect(workspace.service.getNote(note.id)).toEqual(note);
    expect(workspace.service.listTree().notes).toHaveLength(1);
  });

  it('enforces raw UTF-8 and HTTP byte limits independently before saving', async () => {
    const { app, workspace } = application();
    const content = '\u00e9'.repeat(limits.markdownBytes / 2);
    const created = await request(app)
      .post('/api/notes')
      .send({ title: 'Boundary', folderId: null, content })
      .expect(201);
    const note = noteDetailSchema.parse(created.body);
    const tooLarge = await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({ expectedRevision: 1, content: content + 'a' })
      .expect(413);
    expectError(tooLarge.body, ApiErrorCode.PAYLOAD_TOO_LARGE);
    const escaped = JSON.stringify({
      expectedRevision: 1,
      content: '\0'.repeat(limits.markdownBytes / 2),
    });
    expect(Buffer.byteLength(escaped)).toBeGreaterThan(limits.requestBytes);
    const transport = await request(app)
      .patch(`/api/notes/${note.id}`)
      .type('json')
      .send(escaped)
      .expect(413);
    expectError(transport.body, ApiErrorCode.PAYLOAD_TOO_LARGE);
    expect(workspace.service.getNote(note.id)).toEqual(note);
  });
});
