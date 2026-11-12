import { openActionMenu } from './workspace-controls.js';
import { expect, test } from './note-fixtures.js';
import { noteDetailSchema } from '@markdown-note-taker/contracts';

test('a real dirty-tab navigation prompts before leaving and a clean tab does not', async ({
  page,
  notes,
}) => {
  await notes.create('Tab warning');
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Tab warning', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await body.click();
  await body.fill('Unsaved tab content');
  const prompt = page.waitForEvent('dialog');
  const attempted = page.evaluate(() => location.reload()).catch(() => null);
  const dialog = await prompt;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await attempted;
  await expect(body).toHaveText('Unsaved tab content');
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.clock.resume();
  let unexpected = 0;
  page.on('dialog', (dialog) => {
    unexpected++;
    void dialog.dismiss();
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open note Tab warning', exact: true }),
  ).toBeVisible();
  expect(unexpected).toBe(0);
});

test('a failed title request on source fallback can be retried after discarding its local title', async ({
  page,
  notes,
}) => {
  const content = '| A | B |\r\n| --- | --- |\r\n| keep | source |\r\n';
  const note = await notes.create('Fallback save retry', content);
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Fallback save retry', exact: true })
    .click();
  await expect(page.getByLabel('Read-only Markdown source')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route(`**/api/notes/${note.id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await page.getByRole('button', { name: 'Edit title', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Note title', exact: true })
    .fill('Unconfirmed title');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not reach');
  await page
    .getByRole('button', { name: 'Discard title changes', exact: true })
    .click();
  await page.unrouteAll({ behavior: 'wait' });
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  expect(await notes.read(note.id)).toMatchObject({
    title: 'Fallback save retry',
    content,
    revision: 2,
  });
  await expect(
    page.getByRole('textbox', { name: 'Note content', exact: true }),
  ).toHaveCount(0);
});

test('a note deleted by another client retains local writing for recovery as a new note', async ({
  page,
  request,
  notes,
}) => {
  const note = await notes.create('Deleted note recovery');
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Deleted note recovery',
      exact: true,
    })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await request.delete(`/api/notes/${note.id}`, {
    data: { expectedRevision: 1 },
  });
  await body.fill('Local writing survives remote deletion');
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save as new note', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Save as new note',
    exact: true,
  });
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/notes') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );
  await dialog
    .getByRole('button', { name: 'Create copy', exact: true })
    .click();
  const copy = noteDetailSchema.parse(await (await response).json());
  notes.track(copy.id);
  await expect(
    page.getByRole('heading', {
      name: 'Deleted note recovery (copy)',
      exact: true,
    }),
  ).toBeVisible();
  await expect(body).toHaveText('Local writing survives remote deletion');
  expect((await notes.read(copy.id)).content).toBe(
    'Local writing survives remote deletion',
  );
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('main')
    .screenshot({ path: 'test-results/autosave-recovered.png' });
});
