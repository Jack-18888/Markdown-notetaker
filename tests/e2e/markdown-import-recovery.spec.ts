import { openActionMenu } from './workspace-controls.js';
import {
  folderSchema,
  noteDetailSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';
import { expect, test } from './note-fixtures.js';

test('a deleted import destination is rejected by the real API without a partial note', async ({
  page,
  request,
  notes,
}) => {
  const sentinel = await notes.create('Missing import destination sentinel');
  const folder = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Temporary import destination', parentId: null },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open folder Temporary import destination',
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
    await dialog.getByLabel('Markdown file', { exact: true }).setInputFiles({
      name: 'Missing destination import.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Never partially created'),
    });
    await request.delete(`/api/folders/${folder.id}`);
    await dialog
      .getByRole('button', { name: 'Import note', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText('existing folder');
    await expect(dialog.getByLabel('Note title', { exact: true })).toHaveValue(
      'Missing destination import',
    );
    const tree = treeResponseSchema.parse(
      await (await request.get('/api/tree')).json(),
    );
    expect(
      tree.notes.filter((note) => note.title === 'Missing destination import'),
    ).toEqual([]);
    expect(await notes.read(sentinel.id)).toEqual(sentinel);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    await request.delete(`/api/folders/${folder.id}`);
  }
});

test('import flush failures retain writing and confirmed imports retry opening without another create', async ({
  page,
  notes,
}) => {
  const original = await notes.create('Import flush recovery');
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Import flush recovery',
      exact: true,
    })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await body.fill('Writing before import');
  await page.route(`**/api/notes/${original.id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await openActionMenu(page, 'Workspace actions');
  await page
    .getByRole('button', { name: 'Import Markdown', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not continue' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(body).toHaveText('Writing before import');
  await page.unrouteAll({ behavior: 'wait' });
  await openActionMenu(page, 'Workspace actions');
  await page
    .getByRole('button', { name: 'Import Markdown', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Import Markdown',
    exact: true,
  });
  const title = dialog.getByLabel('Note title', { exact: true });
  await dialog.getByLabel('Markdown file', { exact: true }).setInputFiles({
    name: 'x'.repeat(201) + '.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('One imported note'),
  });
  await dialog
    .getByRole('button', { name: 'Import note', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('1–200 characters');
  await title.fill('Confirmed imported note');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(title).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Import note', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: 'test-results/markdown-import-narrow.png' });
  expect((await notes.read(original.id)).content).toContain(
    'Writing before import',
  );
  let creates = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/notes'))
      creates++;
  });
  await page.route('**/api/tree', (route) => route.abort());
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/notes') &&
      response.request().method() === 'POST',
  );
  await dialog
    .getByRole('button', { name: 'Import note', exact: true })
    .click();
  const imported = noteDetailSchema.parse(await (await created).json());
  notes.track(imported.id);
  await expect(dialog.getByRole('alert')).toContainText('The change was saved');
  await expect(title).toBeDisabled();
  await page.unrouteAll({ behavior: 'wait' });
  await dialog
    .getByRole('button', { name: 'Retry opening note', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Confirmed imported note', exact: true }),
  ).toBeVisible();
  expect(creates).toBe(1);
  expect((await notes.read(imported.id)).content).toBe('One imported note');
});
