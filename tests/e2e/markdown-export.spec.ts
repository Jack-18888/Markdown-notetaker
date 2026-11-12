import { openActionMenu } from './workspace-controls.js';
import { readFile } from 'node:fs/promises';
import { expect, test } from './note-fixtures.js';

test('exports untouched source bytes with a safe filename, including BOM and mixed line endings', async ({
  page,
  notes,
}) => {
  const source =
    '\ufeff---\r\ntitle: Example\r\n---\r\n\r\n<script>alert(1)</script>\r\n雪 😀\rLast\n';
  const note = await notes.create('CON', source);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note CON', exact: true })
    .click();
  const downloaded = page.waitForEvent('download');
  await openActionMenu(page, 'Note actions');
  await page
    .getByRole('button', { name: 'Export Markdown', exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('_CON.md');
  expect(await readFile((await download.path())!)).toEqual(Buffer.from(source));
  expect(await notes.read(note.id)).toEqual(note);
});

test('export drains delayed saves and newer title/body edits before downloading', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Export pending edits');
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Export pending edits',
      exact: true,
    })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(`**/api/notes/${note.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    requests++;
    const response = await route.fetch();
    if (requests === 1) await gate;
    await route.fulfill({ response });
  });
  try {
    await body.fill('First pending version');
    const downloaded = page.waitForEvent('download');
    await openActionMenu(page, 'Note actions');
    await page
      .getByRole('button', { name: 'Export Markdown', exact: true })
      .click();
    await expect.poll(() => requests).toBe(1);
    await body.fill('Latest pending version');
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Latest export title');
    release();
    const download = await downloaded;
    const saved = await notes.read(note.id);
    expect(download.suggestedFilename()).toBe('Latest export title.md');
    expect(await readFile((await download.path())!)).toEqual(
      Buffer.from(saved.content),
    );
    expect(saved.content).toContain('Latest pending version');
    expect(saved.revision).toBe(3);
    expect(requests).toBe(2);
    await expect(body).toHaveText('Latest pending version');
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('a failed prerequisite save prevents download, retains writing, and can be retried', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Export save failure');
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Export save failure', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  let downloads = 0;
  page.on('download', () => {
    downloads++;
  });
  await body.fill('Retain this draft');
  await page.route(`**/api/notes/${note.id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await openActionMenu(page, 'Note actions');
  await page
    .getByRole('button', { name: 'Export Markdown', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not export' }),
  ).toBeVisible();
  expect(downloads).toBe(0);
  expect(await notes.read(note.id)).toEqual(note);
  await expect(body).toHaveText('Retain this draft');
  await page.unrouteAll({ behavior: 'wait' });
  const downloaded = page.waitForEvent('download');
  await openActionMenu(page, 'Note actions');
  await page
    .getByRole('button', { name: 'Export Markdown', exact: true })
    .click();
  const download = await downloaded;
  expect(await readFile((await download.path())!)).toEqual(
    Buffer.from((await notes.read(note.id)).content),
  );
  expect(downloads).toBe(1);
});
