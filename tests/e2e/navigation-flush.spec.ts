import { expect, test } from './note-fixtures.js';

test('reselecting the active note cancels a pending destination while its edits still save', async ({
  page,
  notes,
}) => {
  const active = await notes.create('Reselect active');
  const destination = await notes.create('Reselect destination');
  let release = () => {};
  let started = false;
  let destinationReads = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      request.url().endsWith(`/api/notes/${destination.id}`)
    )
      destinationReads++;
  });
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Reselect active', exact: true })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await page.route(`**/api/notes/${active.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      if (!started) {
        started = true;
        await gate;
      }
      await route.fulfill({ response });
    });
    await body.fill('First draft');
    const navigation = page.getByRole('navigation', {
      name: 'Workspace folders',
    });
    await navigation
      .getByRole('button', { name: 'Reselect destination', exact: true })
      .click();
    await expect.poll(() => started).toBe(true);
    await body.fill('Latest draft while waiting');
    await navigation
      .getByRole('button', { name: 'Reselect active', exact: true })
      .click();
    release();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Reselect active', exact: true }),
    ).toBeVisible();
    await expect(body).toHaveText('Latest draft while waiting');
    expect(destinationReads).toBe(0);
    expect(await notes.read(active.id)).toMatchObject({
      content: 'Latest draft while waiting',
      revision: 3,
    });
    await navigation
      .getByRole('button', { name: 'Reselect destination', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Reselect destination', exact: true }),
    ).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('navigation drains in-flight edits and honors the latest requested destination', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Flush active');
  const skipped = await notes.create('Flush skipped');
  await notes.create('Flush destination');
  let release = () => {},
    started = false,
    skippedReads = 0,
    writes = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      request.url().endsWith(`/api/notes/${skipped.id}`)
    )
      skippedReads++;
  });
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Flush active', exact: true })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await page.route(`**/api/notes/${note.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      writes++;
      const response = await route.fetch();
      if (writes === 1) {
        started = true;
        await gate;
      }
      await route.fulfill({ response });
    });
    await body.fill('First draft');
    const sidebar = page.getByRole('navigation', { name: 'Workspace folders' });
    await sidebar
      .getByRole('button', { name: 'Flush skipped', exact: true })
      .click();
    await expect.poll(() => started).toBe(true);
    await expect(
      page.getByRole('heading', { name: 'Flush active', exact: true }),
    ).toBeVisible();
    await body.fill('Latest draft while saving');
    await sidebar
      .getByRole('button', { name: 'Flush destination', exact: true })
      .click();
    release();
    await expect(
      page.getByRole('heading', { name: 'Flush destination', exact: true }),
    ).toBeVisible();
    expect(await notes.read(note.id)).toMatchObject({
      content: 'Latest draft while saving',
      revision: 3,
    });
    expect(writes).toBe(2);
    expect(skippedReads).toBe(0);
    await expect(body).toHaveText('Original');
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
    ).toBeDisabled();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('a failed flush keeps the note and supports retry before leaving', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Flush retry active');
  await notes.create('Flush retry destination');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Flush retry active', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await page.route(`**/api/notes/${note.id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await body.fill('Retained after failed navigation');
  const destination = page
    .getByRole('navigation', { name: 'Workspace folders' })
    .getByRole('button', { name: 'Flush retry destination', exact: true });
  await destination.click();
  await expect(
    page.getByText(
      'Could not continue. Your changes are still here. Retry saving or resolve the conflict, then try again.',
    ),
  ).toBeVisible();
  await expect(body).toHaveText('Retained after failed navigation');
  expect((await notes.read(note.id)).content).toBe('Original');
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await destination.click();
  await expect(
    page.getByRole('heading', { name: 'Flush retry destination', exact: true }),
  ).toBeVisible();
  expect((await notes.read(note.id)).content).toBe(
    'Retained after failed navigation',
  );
});

test('lifecycle dialogs use the revision acknowledged by their prerequisite flush', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Flush before rename');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Flush before rename', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill('Saved before renaming');
  await page.getByRole('button', { name: 'Rename note', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename note' });
  await dialog
    .getByRole('textbox', { name: 'Note title', exact: true })
    .fill('Renamed after flush');
  await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Renamed after flush', exact: true }),
  ).toBeVisible();
  expect(await notes.read(note.id)).toMatchObject({
    title: 'Renamed after flush',
    content: 'Saved before renaming',
    revision: 3,
  });
});
