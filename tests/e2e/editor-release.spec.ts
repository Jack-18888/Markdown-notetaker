import { expect, test } from './note-fixtures.js';
import { openActionMenu } from './workspace-controls.js';

test('sticky save status reaches retained drafts, retry, and conflict recovery at 320px', async ({
  page,
  notes,
  request,
}) => {
  const note = await notes.create('Sticky recovery');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.clock.install();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Sticky recovery', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/notes/${note.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await gate;
    await route.abort();
  });
  try {
    await body.fill('Keep this local writing. '.repeat(180));
    await openActionMenu(page, 'Note actions');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    const header = page.getByRole('banner');
    await expect(header.getByRole('status')).toHaveText('Saving…');
    await body.press('Control+End');
    await expect(header.getByRole('status')).toBeInViewport();
    release();
    const recovery = header.getByRole('link', { name: 'Save needs attention' });
    await expect(recovery).toBeVisible();
    await recovery.click();
    await expect(page.locator('#save-recovery')).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Retry save', exact: true }),
    ).toBeInViewport();
    await expect(body).toContainText('Keep this local writing.');
    expect(await notes.read(note.id)).toEqual(note);
    await page.unroute(`**/api/notes/${note.id}`);
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(header.getByRole('status')).toHaveText('Saved.');
    const saved = await notes.read(note.id);
    expect(saved.content).toContain('Keep this local writing.');

    const competing = await request.patch(`/api/notes/${note.id}`, {
      data: {
        expectedRevision: saved.revision,
        content: 'Competing saved writing',
      },
    });
    expect(competing.ok()).toBe(true);
    await body.fill('Keep the conflicting draft');
    await openActionMenu(page, 'Note actions');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(recovery).toBeVisible();
    await recovery.click();
    await expect(page.locator('#save-recovery')).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Reload saved note', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save as new note', exact: true }),
    ).toBeVisible();
    await expect(body).toHaveText('Keep the conflicting draft');
    expect((await notes.read(note.id)).content).toBe('Competing saved writing');
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('system-theme changes rerender diagrams without writing notes or losing source', async ({
  page,
  notes,
}) => {
  test.setTimeout(45_000);
  const source = '```mermaid\nflowchart LR\n Build --> Verify --> Publish\n```';
  const note = await notes.create('Live diagram theme', source);
  await page.emulateMedia({ colorScheme: 'light' });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET')
      writes.push(request.method());
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: `Open note ${note.title}`, exact: true })
    .click();
  const preview = page.getByRole('img', {
    name: 'Mermaid diagram preview',
    exact: true,
  });
  await expect(preview).toBeVisible({ timeout: 15_000 });
  const firstFill = await preview
    .locator('rect')
    .first()
    .evaluate((element) => getComputedStyle(element).fill);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      preview
        .locator('rect')
        .first()
        .evaluate((element) => getComputedStyle(element).fill),
    )
    .not.toBe(firstFill);
  await page.getByRole('button', { name: 'Edit source', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Mermaid source', exact: true }),
  ).toHaveValue('flowchart LR\n Build --> Verify --> Publish');
  expect(writes).toEqual([]);
  expect(await notes.read(note.id)).toEqual(note);
});
