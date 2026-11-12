import { openActionMenu } from './workspace-controls.js';
import { folderSchema, noteDetailSchema } from '@markdown-note-taker/contracts';
import { expect, test } from './note-fixtures.js';

test('imports exact UTF-8 source into the selected folder and opens only after creation', async ({
  page,
  request,
  notes,
}) => {
  const folder = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Import destination', parentId: null },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open folder Import destination',
        exact: true,
      })
      .click();
    await openActionMenu(page, 'Workspace actions');
    await page
      .getByRole('button', { name: 'Import Markdown', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Import Markdown',
      exact: true,
    });
    await expect(dialog).toContainText('Workspace / Import destination');
    const source = '\ufeff---\r\nkind: example\r\n---\r\n\r\n# 雪 😀  \r\n';
    await dialog.getByLabel('Markdown file', { exact: true }).setInputFiles({
      name: 'Original.MD',
      mimeType: 'text/markdown',
      buffer: Buffer.from(source),
    });
    await expect(dialog.getByLabel('Note title', { exact: true })).toHaveValue(
      'Original',
    );
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/notes') &&
        response.request().method() === 'POST',
    );
    await dialog
      .getByRole('button', { name: 'Import note', exact: true })
      .click();
    const note = noteDetailSchema.parse(await (await created).json());
    notes.track(note.id);
    await expect(
      page.getByRole('heading', { name: 'Original', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Markdown source', exact: true }),
    ).toBeVisible();
    expect(await notes.read(note.id)).toMatchObject({
      content: source,
      folderId: folder.id,
      revision: 1,
    });
  } finally {
    await request.delete(`/api/folders/${folder.id}`);
  }
});

test('invalid files, cancellation, and a rejected create leave the workspace intact and support retry', async ({
  page,
  notes,
}) => {
  const original = await notes.create('Import failure sentinel');
  let creates = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/notes'))
      creates++;
  });
  await page.goto('/');
  await openActionMenu(page, 'Workspace actions');
  await page
    .getByRole('button', { name: 'Import Markdown', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Import Markdown',
    exact: true,
  });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await openActionMenu(page, 'Workspace actions');
  await page
    .getByRole('button', { name: 'Import Markdown', exact: true })
    .click();
  const picker = dialog.getByLabel('Markdown file', { exact: true });
  for (const [name, buffer, message] of [
    ['wrong.txt', Buffer.from('text'), 'Choose a .md'],
    ['invalid.md', Buffer.from([0xff]), 'valid UTF-8'],
    ['oversized.md', Buffer.alloc(256 * 1024 + 1), '256 KiB'],
  ] as const) {
    await picker.setInputFiles({ name, mimeType: 'text/markdown', buffer });
    await dialog
      .getByRole('button', { name: 'Import note', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText(message);
  }
  expect(creates).toBe(0);
  expect(await notes.read(original.id)).toEqual(original);
  await picker.setInputFiles({
    name: '.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Imported after retry'),
  });
  await expect(dialog.getByLabel('Note title', { exact: true })).toHaveValue(
    'Untitled',
  );
  await page.route('**/api/notes', (route) => route.abort());
  await dialog
    .getByRole('button', { name: 'Import note', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('Could not reach');
  expect(creates).toBe(1);
  expect(await notes.read(original.id)).toEqual(original);
  expect((await notes.read(original.id)).revision).toBe(1);
  await page.unrouteAll({ behavior: 'wait' });
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/notes') &&
      response.request().method() === 'POST',
  );
  await dialog
    .getByRole('button', { name: 'Import note', exact: true })
    .click();
  const note = noteDetailSchema.parse(await (await created).json());
  notes.track(note.id);
  await expect(
    page.getByRole('heading', { name: 'Untitled', exact: true }),
  ).toBeVisible();
  expect((await notes.read(note.id)).content).toBe('Imported after retry');
});
