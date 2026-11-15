import { noteDetailSchema } from '@markdown-note-taker/contracts';
import { noteTitleButton } from './workspace-controls.js';
import { expect, test } from './note-fixtures.js';

test('Enter on the first line autosaves and keeps the blank line on reopen', async ({
  page,
  notes,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New note', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Note title' })
    .fill('Blank line test');
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/notes') &&
      response.status() === 201,
  );
  await dialog
    .getByRole('button', { name: 'Create note', exact: true })
    .click();
  const note = noteDetailSchema.parse(await (await created).json());
  notes.track(note.id);

  const body = page.getByRole('group', { name: 'Note content', exact: true });
  const paragraphs = body.getByRole('textbox', {
    name: 'Paragraph',
    exact: true,
  });
  await paragraphs.first().click();
  await page.keyboard.press('Enter');
  await expect(paragraphs).toHaveCount(2);
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toBe('<br />\n\n<br />');

  await expect(paragraphs.last()).toBeFocused();
  await page.keyboard.type('Writing after the blank line.');
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toBe('<br />\n\nWriting after the blank line.');
  await page.reload();
  await page
    .getByRole('button', { name: 'Open note Blank line test', exact: true })
    .click();
  await expect(paragraphs).toHaveText(['', 'Writing after the blank line.']);
  await paragraphs.last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second paragraph.');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toBe(
      '<br />\n\nWriting after the blank line.\n\n<br />\n\nSecond paragraph.\n\n<br />',
    );
  await page.reload();
  await page
    .getByRole('button', { name: 'Open note Blank line test', exact: true })
    .click();
  await expect(paragraphs).toHaveText([
    '',
    'Writing after the blank line.',
    '',
    'Second paragraph.',
    '',
  ]);
});

test('body edits preserve Mermaid payloads and title-only writes retain the acknowledged source', async ({
  page,
  notes,
}) => {
  const diagram = 'flowchart LR\r\n A --> B  ';
  const content =
    '# Original\r\n\r\n```mermaid\r\n' +
    diagram +
    '\r\n```\r\n\r\nClosing paragraph';
  const note = await notes.create('Body source retention', content);
  const writes: Record<string, unknown>[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'PATCH' &&
      request.url().endsWith(`/api/notes/${note.id}`)
    )
      writes.push(request.postDataJSON());
  });
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Body source retention',
      exact: true,
    })
    .click();
  const body = page.getByRole('group', { name: 'Note content', exact: true });
  await expect(body).toContainText('Closing paragraph');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  expect((await notes.read(note.id)).content).toBe(content);
  await body.locator('.folio-block > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Latest writing.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  const acknowledged = (await notes.read(note.id)).content;
  expect(acknowledged).toContain(diagram);
  expect(acknowledged).toContain('Closing paragraph Latest writing.');
  await noteTitleButton(page, note.title).click();
  await page
    .getByRole('textbox', { name: 'Note title', exact: true })
    .fill('Stored writing title');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Stored writing title', exact: true }),
  ).toBeVisible();
  expect(writes[1]).toEqual({
    title: 'Stored writing title',
    expectedRevision: 2,
  });
  expect((await notes.read(note.id)).content).toBe(acknowledged);
  await page.clock.resume();
  await page.reload();
  await page
    .getByRole('button', {
      name: 'Open note Stored writing title',
      exact: true,
    })
    .click();
  await expect(body).toContainText('Closing paragraph Latest writing.');
  await body
    .getByRole('textbox', { name: 'Paragraph', exact: true })
    .last()
    .focus();
  await page.keyboard.press('Control+z');
  await expect(body).toContainText('Closing paragraph Latest writing.');
});

test('failed and conflicting body saves retain local writing without replacing the remote revision', async ({
  page,
  request,
  notes,
}) => {
  const note = await notes.create('Body failure recovery');
  await page.setViewportSize({ width: 320, height: 820 });
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Body failure recovery',
      exact: true,
    })
    .click();
  const body = page.getByRole('textbox', { name: 'Paragraph', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route(`**/api/notes/${note.id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await body.fill('Retained writing');
  const bodyTop = (await body.boundingBox())!.y;
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach your local workspace',
  );
  expect((await body.boundingBox())!.y).toBe(bodyTop);
  await expect(body).toHaveText('Retained writing');
  await page.screenshot({ path: 'test-results/save-failure-stable.png' });
  const saveIssue = page.getByRole('button', {
    name: 'Save failed',
    exact: true,
  });
  await page
    .getByRole('button', { name: 'Dismiss save details', exact: true })
    .click();
  await expect(saveIssue).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await saveIssue.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Could not reach');
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await body.fill('Competing local writing');
  await request.patch(`/api/notes/${note.id}`, {
    data: { expectedRevision: 2, content: 'Other tab writing' },
  });
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  expect((await body.boundingBox())!.y).toBe(bodyTop);
  await expect(body).toHaveText('Competing local writing');
  expect((await notes.read(note.id)).content).toBe('Other tab writing');
});
