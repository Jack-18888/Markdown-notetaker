import { expect, test } from '@playwright/test';

test('browser JSON writes reach SQLite through the development proxy', async ({
  page,
}) => {
  await page.goto('/');
  const source = '# Browser\r\n\r\n```mermaid\nA --> B\n```\n';
  const result = await page.evaluate(async (content) => {
    const created = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Browser note', folderId: null, content }),
    });
    if (created.status !== 201)
      throw new Error(`Create failed: ${created.status}`);
    const note = (await created.json()) as { id: string };
    const updated = await fetch(`/api/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 1,
        title: 'Renamed in browser',
      }),
    });
    const read = await fetch(`/api/notes/${note.id}`);
    const detail = (await read.json()) as {
      content: string;
      title: string;
      revision: number;
    };
    const stale = await fetch(`/api/notes/${note.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    const deleted = await fetch(`/api/notes/${note.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2 }),
    });
    return {
      updated: updated.status,
      read: read.status,
      detail,
      stale: stale.status,
      deleted: deleted.status,
    };
  }, source);
  expect(result).toEqual({
    updated: 200,
    read: 200,
    detail: expect.objectContaining({
      title: 'Renamed in browser',
      content: source,
      revision: 2,
    }),
    stale: 409,
    deleted: 204,
  });
});
