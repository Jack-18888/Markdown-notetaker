import { expect, test } from '@playwright/test';
import { noteDetailSchema } from '@markdown-note-taker/contracts';

test('idle edits batch title and body, while title-only saves omit untouched Markdown', async ({
  page,
  request,
}) => {
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: {
          title: 'Autosave batching',
          folderId: null,
          content: '# Original\r\n',
        },
      })
    ).json(),
  );
  const writes: Record<string, unknown>[] = [];
  page.on('request', (value) => {
    if (
      value.method() === 'PATCH' &&
      value.url().endsWith(`/api/notes/${note.id}`)
    )
      writes.push(value.postDataJSON());
  });
  try {
    await page.clock.install();
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Autosave batching', exact: true })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await expect(body).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await body.fill('A batched body');
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    const title = page.getByRole('textbox', {
      name: 'Note title',
      exact: true,
    });
    await title.fill('A batched title');
    await page.clock.runFor(749);
    expect(writes).toHaveLength(0);
    await page.clock.runFor(1);
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    expect(writes).toEqual([
      {
        title: 'A batched title',
        content: '# A batched body',
        expectedRevision: 1,
      },
    ]);
    await title.fill('Only the title changes');
    await page.clock.runFor(750);
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    expect(writes[1]).toEqual({
      title: 'Only the title changes',
      expectedRevision: 2,
    });
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    expect(saved).toMatchObject({
      title: 'Only the title changes',
      content: '# A batched body',
      revision: 3,
    });
    await expect(body).toHaveText('A batched body');
  } finally {
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});

test('edits during autosave retain the current editor, serialize writes, and keep the tab warning until acknowledged', async ({
  page,
  request,
}) => {
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: {
          title: 'Autosave ordering',
          folderId: null,
          content: 'Original',
        },
      })
    ).json(),
  );
  let release = () => {},
    started = false,
    active = 0,
    maximum = 0;
  const writes: Record<string, unknown>[] = [];
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await page.clock.install();
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Autosave ordering', exact: true })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await expect(body).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.route(`**/api/notes/${note.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      active++;
      maximum = Math.max(maximum, active);
      writes.push(route.request().postDataJSON());
      try {
        const response = await route.fetch();
        if (writes.length === 1) {
          started = true;
          await gate;
        }
        await route.fulfill({ response });
      } finally {
        active--;
      }
    });
    const warned = () =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    expect(await warned()).toBe(false);
    await body.fill('First snapshot');
    expect(await warned()).toBe(true);
    await page.clock.runFor(750);
    await expect.poll(() => started).toBe(true);
    await body.fill('Newer snapshot');
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Newer title');
    await page.clock.runFor(1000);
    expect(writes).toHaveLength(1);
    expect(await warned()).toBe(true);
    release();
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).toBeVisible();
    await expect(body).toHaveText('Newer snapshot');
    await page.clock.runFor(1);
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    expect(writes[1]).toEqual({
      title: 'Newer title',
      content: 'Newer snapshot',
      expectedRevision: 2,
    });
    expect(maximum).toBe(1);
    expect(await warned()).toBe(false);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(body).not.toHaveText('Newer snapshot');
    expect(await warned()).toBe(true);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});
