import { openActionMenu } from './workspace-controls.js';
import { expect, test } from './note-fixtures.js';

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
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toContainText('Closing paragraph');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  expect((await notes.read(note.id)).content).toBe(content);
  await body.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Latest writing.');
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  const acknowledged = (await notes.read(note.id)).content;
  expect(acknowledged).toContain(diagram);
  expect(acknowledged).toContain('Closing paragraph Latest writing.');
  await page.getByRole('button', { name: 'Edit title', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Note title', exact: true })
    .fill('Stored writing title');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
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
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeDisabled();
});

test('failed and conflicting body saves retain local writing without replacing the remote revision', async ({
  page,
  request,
  notes,
}) => {
  const note = await notes.create('Body failure recovery');
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Body failure recovery',
      exact: true,
    })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route(`**/api/notes/${note.id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await body.fill('Retained writing');
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach your local workspace',
  );
  await expect(body).toHaveText('Retained writing');
  await page.unrouteAll({ behavior: 'wait' });
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await body.fill('Competing local writing');
  await request.patch(`/api/notes/${note.id}`, {
    data: { expectedRevision: 2, content: 'Other tab writing' },
  });
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(body).toHaveText('Competing local writing');
  expect((await notes.read(note.id)).content).toBe('Other tab writing');
});
