import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { noteDetailSchema } from '@markdown-note-taker/contracts';
// Data-only fixtures also exercised by the frontend conversion suite.
import { supportedFixtures } from '../../../../web/src/editor/__test__/fixtures.js';
import { temporaryApp } from '../../__test__/temporary-workspace.js';
import { createApp } from '../../app.js';
import { openWorkspace } from '../../workspace/open.js';

const sources = [
  ...supportedFixtures,
  ['empty', ''],
  [
    'CRLF diagram',
    '# Original\r\n\r\n```mermaid\r\nflowchart LR\r\n A --> B  \r\n```\r\n',
  ],
  [
    'unsupported source',
    '\ufeff---\r\ntitle: keep\r\n---\r\n| A | B |\r\n| --- | --- |\r\n![image](file.png)\r\n',
  ],
  [
    'hostile source',
    '<script>literal</script>\n[link](javascript:alert(1))\n\u0000',
  ],
] as const;

describe('T09 editor/backend checkpoint', () => {
  it.each(sources)(
    'preserves %s across HTTP updates, conflicts, and database reopen',
    async (_label, content) => {
      const temporary = temporaryApp();
      try {
        const created = await request(temporary.app)
          .post('/api/notes')
          .send({ title: 'Checkpoint', folderId: null, content })
          .expect(201);
        const note = noteDetailSchema.parse(created.body);
        expect(note.content).toBe(content);
        const next = content + '\n\nA later body edit.';
        const updated = await request(temporary.app)
          .patch(`/api/notes/${note.id}`)
          .send({ expectedRevision: note.revision, content: next })
          .expect(200);
        expect(noteDetailSchema.parse(updated.body).content).toBe(next);
        await request(temporary.app)
          .patch(`/api/notes/${note.id}`)
          .send({ expectedRevision: note.revision, content: 'Stale write' })
          .expect(409);
        temporary.workspace.close();
        const reopened = openWorkspace({
          dataDirectory: temporary.dataDirectory,
        });
        try {
          const response = await request(
            createApp({ workspace: reopened.service, serveWeb: false }),
          )
            .get(`/api/notes/${note.id}`)
            .expect(200);
          expect(noteDetailSchema.parse(response.body)).toMatchObject({
            content: next,
            revision: 2,
          });
        } finally {
          reopened.close();
        }
      } finally {
        temporary.cleanup();
      }
    },
  );
});
