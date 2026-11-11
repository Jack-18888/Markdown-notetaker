import { expect, test } from '@playwright/test';
import {
  ApiErrorCode,
  errorDefinitions,
  noteDetailSchema,
} from '@markdown-note-taker/contracts';

test('title saves retain in-flight edits and protect navigation without changing source', async ({
  page,
  request,
}) => {
  const content = '# Original\r\n\r\n```mermaid\r\nA --> B\r\n```\r\n';
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title: 'Title guard note', folderId: null, content },
      })
    ).json(),
  );
  let release = () => {};
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Title guard note', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    const input = page.getByRole('textbox', {
      name: 'Note title',
      exact: true,
    });
    await expect(input).toBeFocused();
    await input.fill('First saved title');
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
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await started;
    await input.fill('Newer pending title');
    await page
      .getByRole('button', { name: 'Refresh workspace', exact: true })
      .click();
    await expect(
      page.getByText(
        'Save your writing and finish title changes before leaving this note.',
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
    release();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'First saved title',
        exact: true,
      }),
    ).toBeVisible();
    await expect(input).toHaveValue('Newer pending title');
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Newer pending title',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Workspace folders' })
        .getByRole('button', { name: 'Newer pending title', exact: true }),
    ).toBeVisible();
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    expect(saved.content).toBe(content);
    expect(saved.revision).toBe(3);
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    await input.fill(' padded ');
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(
      page.getByText(
        'Use 1–200 characters without surrounding spaces or control characters.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Discard title changes', exact: true })
      .click();
    await page.reload();
    await expect(
      page.getByRole('button', {
        name: 'Open note Newer pending title',
        exact: true,
      }),
    ).toBeVisible();
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

test('failed and conflicting title saves retain the draft for recovery', async ({
  page,
  request,
}) => {
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: {
          title: 'Title recovery note',
          folderId: null,
          content: 'untouched source',
        },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open note Title recovery note',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    const input = page.getByRole('textbox', {
      name: 'Note title',
      exact: true,
    });
    await input.fill('Retained local title');
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
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(
      page.getByText(errorDefinitions.INTERNAL_ERROR.message, { exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue('Retained local title');
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Retained local title',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    await input.fill('Competing local title');
    await request.patch(`/api/notes/${note.id}`, {
      data: { expectedRevision: 2, title: 'Other tab title' },
    });
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(
      page.getByText(errorDefinitions.REVISION_CONFLICT.message, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(input).toHaveValue('Competing local title');
    await page
      .getByRole('button', { name: 'Discard title changes', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Refresh workspace', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Other tab title',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toBe('untouched source');
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
