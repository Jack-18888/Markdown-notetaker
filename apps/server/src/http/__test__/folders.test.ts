import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  errorDefinitions,
  errorResponseSchema,
  folderSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';
import {
  fixtureIds,
  temporaryApp,
} from '../../__test__/temporary-workspace.js';
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

describe('folder mutation API', () => {
  it('creates, renames, and moves folders with committed metadata', async () => {
    const { app } = application();
    const created = await request(app)
      .post('/api/folders')
      .send({ name: 'Project', parentId: null })
      .expect(201);
    const root = folderSchema.parse(created.body);
    const nested = await request(app)
      .post('/api/folders')
      .send({ name: 'Nested', parentId: root.id })
      .expect(201);
    const child = folderSchema.parse(nested.body);
    const renamed = await request(app)
      .patch(`/api/folders/${child.id}`)
      .send({ name: 'Notes' })
      .expect(200);
    expect(folderSchema.parse(renamed.body)).toMatchObject({
      id: child.id,
      name: 'Notes',
      parentId: root.id,
      createdAt: child.createdAt,
    });
    const moved = await request(app)
      .patch(`/api/folders/${child.id}`)
      .send({ name: 'At root', parentId: null })
      .expect(200);
    const updated = folderSchema.parse(moved.body);
    expect(updated).toMatchObject({
      id: child.id,
      name: 'At root',
      parentId: null,
    });
    const tree = await request(app).get('/api/tree').expect(200);
    expect(treeResponseSchema.parse(tree.body).folders).toEqual(
      expect.arrayContaining([root, updated]),
    );
    const duplicate = await request(app)
      .post('/api/folders')
      .send({ name: 'Project', parentId: null })
      .expect(201);
    expect(duplicate.body.id).not.toBe(root.id);
  });

  it('deletes a subtree with its notes, preserving siblings after reopening', async () => {
    const temporary = application();
    const { app, workspace } = temporary;
    const root = workspace.service.createFolder({
      name: 'Delete',
      parentId: null,
    });
    const child = workspace.service.createFolder({
      name: 'Child',
      parentId: root.id,
    });
    const sibling = workspace.service.createFolder({
      name: 'Keep',
      parentId: null,
    });
    workspace.service.createNote({
      title: 'Nested note',
      folderId: child.id,
      content: 'raw source',
    });
    const kept = workspace.service.createNote({
      title: 'Keep note',
      folderId: sibling.id,
    });
    const response = await request(app)
      .delete(`/api/folders/${root.id}`)
      .expect(204);
    expect(response.text).toBe('');
    const tree = await request(app).get('/api/tree').expect(200);
    expect(treeResponseSchema.parse(tree.body)).toMatchObject({
      folders: [sibling],
      notes: [{ id: kept.id }],
    });
    workspace.close();
    const reopened = openWorkspace({ dataDirectory: temporary.dataDirectory });
    try {
      expect(reopened.service.listTree()).toEqual(tree.body);
    } finally {
      reopened.close();
    }
  });

  it('rejects self, descendant, missing, and note destinations without changes', async () => {
    const { app, workspace } = application();
    const root = workspace.service.createFolder({
      name: 'Root',
      parentId: null,
    });
    const child = workspace.service.createFolder({
      name: 'Child',
      parentId: root.id,
    });
    const note = workspace.service.createNote({
      title: 'Note',
      folderId: null,
    });
    const before = workspace.service.listTree();
    for (const parentId of [root.id, child.id, fixtureIds.missing, note.id]) {
      const response = await request(app)
        .patch(`/api/folders/${root.id}`)
        .send({ name: 'Must not rename', parentId })
        .expect(409);
      expectError(response.body, ApiErrorCode.HIERARCHY_CONFLICT);
      expect(workspace.service.listTree()).toEqual(before);
    }
    const create = await request(app)
      .post('/api/folders')
      .send({ name: 'Invalid destination', parentId: fixtureIds.missing })
      .expect(409);
    expectError(create.body, ApiErrorCode.HIERARCHY_CONFLICT);
    expect(workspace.service.listTree()).toEqual(before);
  });

  it.each([
    {},
    { name: '', parentId: null },
    { name: ' padded ', parentId: null },
    { name: 'Valid' },
    { name: 'Valid', parentId: 'root' },
    { name: 'Valid', parentId: null, id: fixtureIds.folder },
    { name: null, parentId: null },
  ])('rejects invalid creation %# without saving', async (body) => {
    const { app, workspace } = application();
    const response = await request(app)
      .post('/api/folders')
      .send(body)
      .expect(400);
    expectError(response.body, ApiErrorCode.INVALID_INPUT);
    expect(workspace.service.listTree()).toEqual({ folders: [], notes: [] });
  });

  it('rejects empty patches, invalid IDs, and missing targets', async () => {
    const { app, workspace } = application();
    const folder = workspace.service.createFolder({
      name: 'Saved',
      parentId: null,
    });
    const empty = await request(app)
      .patch(`/api/folders/${folder.id}`)
      .send({})
      .expect(400);
    expectError(empty.body, ApiErrorCode.INVALID_INPUT);
    for (const [id, status, code] of [
      ['bad-id', 400, ApiErrorCode.INVALID_INPUT],
      [fixtureIds.missing, 404, ApiErrorCode.NOT_FOUND],
    ] as const) {
      for (const method of ['patch', 'delete'] as const) {
        const call = request(app)[method](`/api/folders/${id}`);
        if (method === 'patch') call.send({ name: 'Changed' });
        const response = await call.expect(status);
        expectError(response.body, code);
      }
    }
    expect(workspace.service.listTree().folders).toEqual([folder]);
  });

  it('rejects hostile writes, malformed JSON, and non-JSON bodies before mutation', async () => {
    const { app, workspace } = application();
    const folder = workspace.service.createFolder({
      name: 'Saved',
      parentId: null,
    });
    const denied = await request(app)
      .delete(`/api/folders/${folder.id}`)
      .set('Origin', 'https://attacker.example')
      .expect(403);
    expectError(denied.body, ApiErrorCode.ORIGIN_FORBIDDEN);
    const malformed = await request(app)
      .post('/api/folders')
      .type('json')
      .send('{private malformed source')
      .expect(400);
    expectError(malformed.body, ApiErrorCode.INVALID_INPUT);
    const plain = await request(app)
      .patch(`/api/folders/${folder.id}`)
      .type('text')
      .send('{"name":"Lost"}')
      .expect(415);
    expectError(plain.body, ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
    expect(workspace.service.listTree().folders).toEqual([folder]);
  });

  it('rolls back failed subtree deletion and hides SQLite diagnostics', async () => {
    const { app, workspace, open } = application();
    const folder = workspace.service.createFolder({
      name: 'Saved',
      parentId: null,
    });
    workspace.service.createNote({
      title: 'Saved note',
      folderId: folder.id,
      content: 'private source',
    });
    const before = workspace.service.listTree();
    const database = open();
    database.exec(
      "CREATE TRIGGER reject_note_delete BEFORE DELETE ON notes BEGIN SELECT RAISE(ABORT, 'private SQL diagnostic'); END",
    );
    database.close();
    const response = await request(app)
      .delete(`/api/folders/${folder.id}`)
      .expect(500);
    expectError(response.body, ApiErrorCode.INTERNAL_ERROR);
    expect(workspace.service.listTree()).toEqual(before);
    const note = await request(app)
      .get(`/api/notes/${before.notes[0]!.id}`)
      .expect(200);
    expect(note.body.content).toBe('private source');
  });
});
