import { expect, test } from '@playwright/test';
import { noteDetailSchema } from '@markdown-note-taker/contracts';

test('body saves retain newer edits, guard navigation, and share revisions with title saves', async ({
  page,
  request,
}) => {
  const content =
    '# Original\r\n\r\n```mermaid\r\nflowchart LR\r\n A --> B  \r\n```\r\n';
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title: 'Body save ordering', folderId: null, content },
      })
    ).json(),
  );
  let release = () => {};
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open note Body save ordering',
        exact: true,
      })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    const save = page.getByRole('button', { name: 'Save note', exact: true });
    await expect(save).toBeDisabled();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toBe(content);
    await body.press('Control+End');
    await body.press('ArrowDown');
    await body.press('Enter');
    await page.keyboard.type('First snapshot');
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Body and title saved');
    let captured!: () => void;
    const started = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/notes/${note.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
    });
    await save.click();
    await started;
    await expect(
      page.getByRole('button', { name: 'Save title', exact: true }),
    ).toBeDisabled();
    await body.press('Control+End');
    await page.keyboard.type(' and newer writing');
    await page
      .getByRole('button', { name: 'Refresh workspace', exact: true })
      .click();
    await expect(
      page.getByText(
        'Save your writing and finish title changes before leaving this note.',
      ),
    ).toBeVisible();
    await expect(body).toContainText('and newer writing');
    release();
    await expect(
      page.getByText('Saved. Newer changes are still pending.'),
    ).toBeVisible();
    await expect(body).toContainText('and newer writing');
    await page.unrouteAll({ behavior: 'wait' });
    await save.click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Body and title saved', exact: true }),
    ).toBeVisible();
    await expect(body).toContainText('First snapshot and newer writing');
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    expect(saved.revision).toBe(4);
    expect(saved.content).toContain('flowchart LR\r\n A --> B  ');
    expect(saved.content).toContain('First snapshot and newer writing');
    await page.reload();
    await page
      .getByRole('button', {
        name: 'Open note Body and title saved',
        exact: true,
      })
      .click();
    await expect(body).toContainText('First snapshot and newer writing');
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
    ).toBeDisabled();
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

test('failed and conflicting body saves keep the editor and do not overwrite another revision', async ({
  page,
  request,
}) => {
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: {
          title: 'Body failure recovery',
          folderId: null,
          content: 'Original',
        },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open note Body failure recovery',
        exact: true,
      })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.fill('Retained writing');
    await page.route(`**/api/notes/${note.id}`, (route) =>
      route.request().method() === 'PATCH' ? route.abort() : route.continue(),
    );
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not reach your local workspace',
    );
    await expect(body).toHaveText('Retained writing');
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await body.fill('Competing local writing');
    await request.patch(`/api/notes/${note.id}`, {
      data: { expectedRevision: 2, content: 'Other tab writing' },
    });
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('changed');
    await expect(body).toHaveText('Competing local writing');
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toBe('Other tab writing');
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});
