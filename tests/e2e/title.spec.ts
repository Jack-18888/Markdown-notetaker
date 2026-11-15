import { ApiErrorCode, errorDefinitions } from '@markdown-note-taker/contracts';
import { expect, test } from './note-fixtures.js';
import { noteTitleButton } from './workspace-controls.js';

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
  const title = noteTitleButton(page, note.title);
  await expect(title).toBeVisible();
  const resting = (await title.boundingBox())!;
  await title.press('Enter');
  const input = page.getByRole('textbox', { name: 'Note title', exact: true });
  await expect(input).toBeFocused();
  const active = (await input.boundingBox())!;
  expect(active.x).toBeCloseTo(resting.x, 0);
  expect(active.y).toBeCloseTo(resting.y, 0);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await input.fill('A saved title');
  await input.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'A saved title', exact: true }),
  ).toBeVisible();
  expect(await notes.read(note.id)).toMatchObject({
    title: 'A saved title',
    revision: 2,
    content,
  });
  await expect(noteTitleButton(page, 'A saved title')).toBeFocused();
  await noteTitleButton(page, 'A saved title').click();
  await input.fill(' padded ');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    'Use 1–200 characters without surrounding spaces or control characters.',
  );
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.press('Escape');
  await expect(noteTitleButton(page, 'A saved title')).toBeFocused();
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
  await noteTitleButton(page, note.title).click();
  const input = page.getByRole('textbox', { name: 'Note title', exact: true });
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
  await input.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    errorDefinitions.INTERNAL_ERROR.message,
  );
  await expect(input).toHaveValue('Retained local title');
  await page.unrouteAll({ behavior: 'wait' });
  await input.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Retained local title', exact: true }),
  ).toBeVisible();
  await noteTitleButton(page, 'Retained local title').click();
  await input.fill('Competing title');
  const body = page.getByRole('textbox', { name: 'Paragraph', exact: true });
  await body.fill('Local body survives discarding the title');
  await request.patch(`/api/notes/${note.id}`, {
    data: { expectedRevision: 2, title: 'Other tab title' },
  });
  await noteTitleButton(page, 'Competing title').click();
  await input.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    errorDefinitions.REVISION_CONFLICT.message,
  );
  await expect(input).toHaveValue('Competing title');
  await input.press('Escape');
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
