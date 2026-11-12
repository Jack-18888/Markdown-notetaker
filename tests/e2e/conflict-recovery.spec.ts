import { openActionMenu } from './workspace-controls.js';
import { noteDetailSchema } from '@markdown-note-taker/contracts';
import { expect, test } from './note-fixtures.js';

test('two tabs preserve competing edits and retry opening a committed copy without creating another', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Two tab recovery');
  const local = await page.context().newPage();
  let copies = 0;
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Two tab recovery', exact: true })
      .click();
    await local.clock.install();
    await local.goto('/');
    await local
      .getByRole('button', { name: 'Open note Two tab recovery', exact: true })
      .click();
    const localBody = local.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await expect(localBody).toBeVisible();
    await local.clock.pauseAt(new Date(Date.now() + 1000));
    await page
      .getByRole('textbox', { name: 'Note content', exact: true })
      .fill('Other tab saved writing');
    await openActionMenu(page, 'Note actions');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await localBody.fill('Local writing to recover');
    await local
      .getByRole('button', { name: 'Edit title', exact: true })
      .click();
    await local
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Local recovery title');
    await openActionMenu(local, 'Note actions');
    await local.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(
      local.getByRole('button', { name: 'Save as new note', exact: true }),
    ).toBeVisible();
    await expect(localBody).toHaveText('Local writing to recover');
    await local
      .getByRole('button', { name: 'Save as new note', exact: true })
      .click();
    const dialog = local.getByRole('dialog', {
      name: 'Save as new note',
      exact: true,
    });
    await dialog
      .getByRole('textbox', { name: 'New note title', exact: true })
      .fill('Recovered local version');
    await local.route('**/api/notes', (route) => {
      copies++;
      return route.abort();
    });
    await dialog
      .getByRole('button', { name: 'Create copy', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText('Could not reach');
    expect((await notes.read(note.id)).content).toBe('Other tab saved writing');
    await local.unrouteAll({ behavior: 'wait' });
    let refreshes = 0;
    await local.route('**/api/tree', (route) => {
      refreshes++;
      return route.abort();
    });
    local.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/notes'))
        copies++;
    });
    const response = local.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/notes') &&
        response.status() === 201,
    );
    await dialog
      .getByRole('button', { name: 'Create copy', exact: true })
      .click();
    const copy = noteDetailSchema.parse(await (await response).json());
    notes.track(copy.id);
    await expect(dialog.getByRole('alert')).toContainText(
      'The change was saved',
    );
    await expect(
      dialog.getByRole('textbox', { name: 'New note title', exact: true }),
    ).toBeDisabled();
    await local.unrouteAll({ behavior: 'wait' });
    await dialog
      .getByRole('button', { name: 'Retry opening note', exact: true })
      .click();
    await expect(
      local.getByRole('heading', {
        name: 'Recovered local version',
        exact: true,
      }),
    ).toBeVisible();
    await expect(localBody).toHaveText('Local writing to recover');
    expect(copies).toBe(2);
    expect(refreshes).toBe(1);
    expect(await notes.read(copy.id)).toMatchObject({
      content: 'Local writing to recover',
      title: 'Recovered local version',
      folderId: null,
      revision: 1,
    });
    expect((await notes.read(note.id)).content).toBe('Other tab saved writing');
  } finally {
    await local.unrouteAll({ behavior: 'wait' });
    await local.close();
  }
});

test('reload requires confirmation, retains local edits on failure, and resets history only after success', async ({
  page,
  request,
  notes,
}) => {
  const note = await notes.create('Reload recovery');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Reload recovery', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await request.patch(`/api/notes/${note.id}`, {
    data: {
      expectedRevision: 1,
      title: 'Server version',
      content: 'Saved remote writing',
    },
  });
  await body.fill('Pending local writing');
  await openActionMenu(page, 'Note actions');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  const reload = page.getByRole('button', {
    name: 'Reload saved note',
    exact: true,
  });
  await reload.click();
  const dialog = page.getByRole('dialog', {
    name: 'Discard local changes?',
    exact: true,
  });
  await expect(dialog).toContainText('This cannot be undone');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(body).toHaveText('Pending local writing');
  await expect(reload).toBeFocused();
  await reload.click();
  await page.route(`**/api/notes/${note.id}`, (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  await dialog
    .getByRole('button', { name: 'Discard and reload', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('Could not reach');
  await page.unrouteAll({ behavior: 'wait' });
  await dialog
    .getByRole('button', { name: 'Discard and reload', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Server version', exact: true }),
  ).toBeVisible();
  await expect(body).toHaveText('Saved remote writing');
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit title', exact: true }),
  ).toBeFocused();
});

test('confirmed reload restores focus for a note with read-only source', async ({
  page,
  request,
  notes,
}) => {
  const content = '<script>Retained literal source</script>';
  const note = await notes.create('Fallback reload focus', content);
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Fallback reload focus',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Edit title', exact: true }).click();
  await request.patch(`/api/notes/${note.id}`, {
    data: { expectedRevision: 1, title: 'Remote fallback title' },
  });
  await page
    .getByRole('textbox', { name: 'Note title', exact: true })
    .fill('Conflicting local title');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  const reload = page.getByRole('button', {
    name: 'Reload saved note',
    exact: true,
  });
  await reload.focus();
  await page.keyboard.press('Enter');
  const confirm = page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard and reload', exact: true });
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Remote fallback title', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit title', exact: true }),
  ).toBeFocused();
  expect((await notes.read(note.id)).content).toBe(content);
  await openActionMenu(page, 'Workspace actions');
  await page
    .getByRole('button', { name: 'Refresh workspace', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Remote fallback title', exact: true }),
  ).toBeVisible();
});
