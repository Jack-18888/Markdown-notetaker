import { ApiErrorCode, errorDefinitions } from '@markdown-note-taker/contracts';
import { expect, test } from './note-fixtures.js';

test('title edits validate, discard, and save without changing untouched source', async ({
  page,
  notes,
}) => {
  const content = '# Original\r\n\r\n```mermaid\r\nA --> B  \r\n```\r\n';
  const note = await notes.create('Title source retention', content);
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Title source retention',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Edit title', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Note title', exact: true });
  await expect(input).toBeFocused();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await input.fill('A saved title');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A saved title', exact: true }),
  ).toBeVisible();
  expect(await notes.read(note.id)).toMatchObject({
    title: 'A saved title',
    revision: 2,
    content,
  });
  await page.getByRole('button', { name: 'Edit title', exact: true }).click();
  await input.fill(' padded ');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Use 1–200 characters without surrounding spaces or control characters.',
  );
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await page
    .getByRole('button', { name: 'Discard title changes', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Edit title', exact: true }),
  ).toBeFocused();
  expect((await notes.read(note.id)).content).toBe(content);
});

test('failed and competing title saves retain the draft until retry or confirmed reload', async ({
  page,
  request,
  notes,
}) => {
  const note = await notes.create('Title recovery', 'Untouched source\r\n');
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Title recovery', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit title', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Note title', exact: true });
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route(`**/api/notes/${note.id}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          json: {
            error: {
              code: ApiErrorCode.INTERNAL_ERROR,
              message: errorDefinitions.INTERNAL_ERROR.message,
            },
          },
        })
      : route.continue(),
  );
  await input.fill('Retained local title');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    errorDefinitions.INTERNAL_ERROR.message,
  );
  await expect(input).toHaveValue('Retained local title');
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Retained local title', exact: true }),
  ).toBeVisible();
  const acknowledged = await notes.read(note.id);
  const competing = await request.patch(`/api/notes/${note.id}`, {
    data: { expectedRevision: acknowledged.revision, title: 'Other tab title' },
  });
  expect(competing.ok()).toBe(true);
  await page.getByRole('button', { name: 'Edit title', exact: true }).click();
  await input.fill('Competing title');
  await body.fill('Local body survives discarding the title');
  await page.clock.runFor(750);
  await expect(page.getByRole('alert')).toHaveText(
    errorDefinitions.REVISION_CONFLICT.message,
  );
  await expect(input).toHaveValue('Competing title');
  await page
    .getByRole('button', { name: 'Discard title changes', exact: true })
    .click();
  await expect(body).toHaveText('Local body survives discarding the title');
  await expect(
    page.getByRole('button', { name: 'Save as new note', exact: true }),
  ).toBeVisible();
  expect((await notes.read(note.id)).content).toBe('Untouched source\r\n');
  await page
    .getByRole('button', { name: 'Reload saved note', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard and reload', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Other tab title', exact: true }),
  ).toBeVisible();
  expect((await notes.read(note.id)).content).toBe('Untouched source\r\n');
});
