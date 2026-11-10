import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  errorDefinitions,
  errorResponseSchema,
  noteDetailSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';
import {
  fixtureIds,
  seedWorkspace,
  temporaryApp,
} from '../../__test__/temporary-workspace.js';

const applications: ReturnType<typeof temporaryApp>[] = [];
afterEach(() => {
  for (const application of applications.splice(0)) application.cleanup();
});
function application(serveWeb = false) {
  const temporary = temporaryApp({ serveWeb });
  applications.push(temporary);
  return temporary;
}

describe('workspace read API', () => {
  it('returns an empty workspace and omits note bodies from populated trees', async () => {
    const { app, workspace } = application();
    const empty = await request(app).get('/api/tree').expect(200);
    expect(treeResponseSchema.parse(empty.body)).toEqual({
      folders: [],
      notes: [],
    });
    const folder = workspace.service.createFolder({
      name: 'Project',
      parentId: null,
    });
    const note = workspace.service.createNote({
      title: 'Example',
      folderId: folder.id,
      content: 'private content',
    });
    const result = await request(app).get('/api/tree').expect(200);
    const tree = treeResponseSchema.parse(result.body);
    expect(tree).toEqual({
      folders: [folder],
      notes: [
        {
          id: note.id,
          title: note.title,
          folderId: note.folderId,
          revision: note.revision,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
      ],
    });
    expect(result.text).not.toContain('private content');
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it.each([false, true])(
    'returns persisted raw Markdown in serveWeb=%s',
    async (serveWeb) => {
      const temporary = application(serveWeb);
      const database = temporary.open();
      const source = seedWorkspace(database);
      database.close();
      const response = await request(temporary.app)
        .get(`/api/notes/${fixtureIds.note}`)
        .expect(200);
      expect(noteDetailSchema.parse(response.body)).toMatchObject({
        id: fixtureIds.note,
        title: 'Example',
        content: source,
        revision: 1,
      });
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );

  it.each([
    ['/api/notes/not-an-id', ApiErrorCode.INVALID_INPUT, 400],
    ['/api/notes/%E0%A4%A', ApiErrorCode.INVALID_INPUT, 400],
    [`/api/notes/${fixtureIds.missing}`, ApiErrorCode.NOT_FOUND, 404],
    ['/api/missing', ApiErrorCode.NOT_FOUND, 404],
  ] as const)('returns a safe error for %s', async (path, code, status) => {
    const { app } = application(true);
    const response = await request(app)
      .get(path)
      .expect(status)
      .expect('Content-Type', /json/);
    expect(errorResponseSchema.parse(response.body)).toEqual({
      error: { code, message: errorDefinitions[code].message },
    });
  });

  it('sanitizes database failures on a real resource route', async () => {
    const { app, workspace } = application();
    workspace.close();
    const response = await request(app).get('/api/tree').expect(500);
    expect(errorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: errorDefinitions.INTERNAL_ERROR.message,
      },
    });
  });
});
