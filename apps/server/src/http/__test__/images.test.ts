import request from 'supertest';
import { afterEach, expect, it } from 'vitest';
import {
  imageLimits,
  imageUploadResponseSchema,
} from '@markdown-note-taker/contracts';
import {
  fixtureIds,
  temporaryApp,
} from '../../__test__/temporary-workspace.js';
import { pngImage } from '../../__test__/image-fixture.js';
import { openWorkspace } from '../../workspace/open.js';
import { createApp } from '../../app.js';

const applications: ReturnType<typeof temporaryApp>[] = [];
afterEach(() => {
  for (const app of applications.splice(0)) app.cleanup();
});
function application() {
  const app = temporaryApp();
  applications.push(app);
  return app;
}

it('uploads, deduplicates, serves exact bytes, and reopens images with notes', async () => {
  const temp = application();
  const upload = () =>
    request(temp.app)
      .post('/api/images')
      .type('image/png')
      .send(pngImage)
      .expect(201);
  const result = imageUploadResponseSchema.parse((await upload()).body);
  expect((await upload()).body).toEqual(result);
  const note = temp.workspace.service.createNote({
    title: 'Image',
    folderId: null,
    content: `![Pasted image](${result.url})`,
  });
  temp.workspace.close();
  const reopened = openWorkspace({ dataDirectory: temp.dataDirectory });
  try {
    const response = await request(createApp({ workspace: reopened.service }))
      .get(result.url)
      .expect(200)
      .expect('Content-Type', 'image/png')
      .expect('X-Content-Type-Options', 'nosniff');
    expect(response.body).toEqual(pngImage);
    expect(reopened.service.getNote(note.id)).toEqual(note);
  } finally {
    reopened.close();
  }
});

it('rejects unsupported, empty, mismatched, oversized, and cross-origin uploads', async () => {
  const { app } = application();
  await request(app)
    .post('/api/images')
    .type('image/svg+xml')
    .send('<svg/>')
    .expect(415);
  await request(app)
    .post('/api/images')
    .type('image/png')
    .send(Buffer.alloc(0))
    .expect(400);
  await request(app)
    .post('/api/images')
    .type('image/jpeg')
    .send(pngImage)
    .expect(400);
  await request(app)
    .post('/api/images')
    .type('image/png')
    .send(Buffer.alloc(imageLimits.bytes + 1))
    .expect(413);
  await request(app)
    .post('/api/images')
    .set('Origin', 'https://example.com')
    .type('image/png')
    .send(pngImage)
    .expect(403);
  await request(app).get(`/api/images/${fixtureIds.missing}`).expect(404);
  await request(app).get('/api/images/invalid').expect(400);
});
