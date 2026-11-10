import { expect, test } from '@playwright/test';
import {
  ApiErrorCode,
  errorDefinitions,
  noteDetailSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';

test('creates nested items and renames by keyboard without dropping pending titles', async ({
  page,
  request,
}) => {
  let rootId: string | undefined;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'New folder', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'New folder', exact: true });
    const name = dialog.getByRole('textbox', {
      name: 'Folder name',
      exact: true,
    });
    await expect(name).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', { name: 'Create folder', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(name).toBeFocused();
    await name.fill('Lifecycle root');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Lifecycle root',
        exact: true,
      }),
    ).toBeVisible();
    const initial = treeResponseSchema.parse(
      await (await request.get('/api/tree')).json(),
    );
    rootId = initial.folders.find(
      (folder) => folder.name === 'Lifecycle root',
    )!.id;
    await page.getByRole('button', { name: 'New folder', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'New folder', exact: true });
    await expect(dialog).toContainText('Workspace / Lifecycle root');
    await dialog
      .getByRole('textbox', { name: 'Folder name', exact: true })
      .fill('Lifecycle child');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Lifecycle child',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'New note', exact: true });
    await dialog
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Lifecycle note');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Lifecycle note',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Rename note', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Rename note', exact: true });
    await dialog
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Renamed lifecycle note');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Renamed lifecycle note',
        exact: true,
      }),
    ).toBeVisible();
    const tree = treeResponseSchema.parse(
      await (await request.get('/api/tree')).json(),
    );
    const metadata = tree.notes.find(
      (note) => note.title === 'Renamed lifecycle note',
    )!;
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${metadata.id}`)).json(),
    );
    expect(saved.content).toBe('');
    expect(saved.revision).toBe(2);
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Protected draft');
    await page.getByRole('button', { name: 'New folder', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByText(
        'Save or discard the title changes before leaving this note.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Discard title changes', exact: true })
      .click();
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('button', { name: 'Lifecycle child', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Rename folder', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Rename folder', exact: true });
    await dialog
      .getByRole('textbox', { name: 'Folder name', exact: true })
      .fill('Renamed child');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Renamed child',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'New folder', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'New folder', exact: true });
    await dialog
      .getByRole('textbox', { name: 'Folder name', exact: true })
      .fill(' padded ');
    await dialog
      .getByRole('button', { name: 'Create folder', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Use 1–200 characters',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'New folder', exact: true }),
    ).toBeFocused();
  } finally {
    if (rootId) await request.delete(`/api/folders/${rootId}`);
  }
});

test('retries metadata after a committed create without creating a duplicate', async ({
  page,
  request,
}) => {
  let id: string | undefined;
  let creates = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/notes'))
      creates++;
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New note', exact: true });
    await dialog
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Refresh-once note');
    await page.route('**/api/tree', (route) =>
      route.fulfill({
        status: 500,
        json: {
          error: {
            code: ApiErrorCode.INTERNAL_ERROR,
            message: errorDefinitions.INTERNAL_ERROR.message,
          },
        },
      }),
    );
    await dialog
      .getByRole('button', { name: 'Create note', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText(
      'The change was saved',
    );
    const tree = treeResponseSchema.parse(
      await (await request.get('/api/tree')).json(),
    );
    const matches = tree.notes.filter(
      (note) => note.title === 'Refresh-once note',
    );
    expect(matches).toHaveLength(1);
    id = matches[0]!.id;
    await page.unroute('**/api/tree');
    await dialog
      .getByRole('button', { name: 'Retry refresh', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Refresh-once note',
        exact: true,
      }),
    ).toBeVisible();
    expect(creates).toBe(1);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    if (id)
      await request.delete(`/api/notes/${id}`, {
        data: { expectedRevision: 1 },
      });
  }
});
