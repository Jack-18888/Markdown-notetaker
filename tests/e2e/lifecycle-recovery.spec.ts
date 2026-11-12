import { openActionMenu, openExplorer } from './workspace-controls.js';
import { expect, test } from '@playwright/test';
import {
  ApiErrorCode,
  errorDefinitions,
  folderSchema,
  noteDetailSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';

test('failed create and conflicting rename retain names and selection for recovery', async ({
  page,
  request,
}) => {
  const parent = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Lifecycle recovery', parentId: null },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open folder Lifecycle recovery',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'New note', exact: true });
    await dialog
      .getByLabel('Note title', { exact: true })
      .fill('Retained creation');
    await page.route('**/api/notes', (route) =>
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
    await expect(dialog.getByRole('alert')).toHaveText(
      errorDefinitions.INTERNAL_ERROR.message,
    );
    await expect(dialog.getByLabel('Note title', { exact: true })).toHaveValue(
      'Retained creation',
    );
    expect(
      treeResponseSchema
        .parse(await (await request.get('/api/tree')).json())
        .notes.filter((note) => note.folderId === parent.id),
    ).toHaveLength(0);
    await page.unroute('**/api/notes');
    await dialog
      .getByRole('button', { name: 'Create note', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Retained creation',
        exact: true,
      }),
    ).toBeVisible();
    const created = treeResponseSchema
      .parse(await (await request.get('/api/tree')).json())
      .notes.filter((note) => note.folderId === parent.id);
    expect(created).toHaveLength(1);
    await openActionMenu(page, 'Note actions');
    await page
      .getByRole('button', { name: 'Rename note', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Rename note', exact: true });
    await dialog
      .getByLabel('Note title', { exact: true })
      .fill('Retained rename');
    expect(
      (
        await request.patch(`/api/notes/${created[0]!.id}`, {
          data: {
            expectedRevision: 1,
            title: 'Other client name',
            content: 'Other client source.',
          },
        })
      ).status(),
    ).toBe(200);
    await dialog
      .getByRole('button', { name: 'Save name', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveText(
      errorDefinitions.REVISION_CONFLICT.message,
    );
    await expect(dialog.getByLabel('Note title', { exact: true })).toHaveValue(
      'Retained rename',
    );
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Retained creation',
        exact: true,
      }),
    ).toBeVisible();
    await openActionMenu(page, 'Workspace actions');
    await page
      .getByRole('button', { name: 'Refresh workspace', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Other client name',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${created[0]!.id}`)).json(),
      ),
    ).toMatchObject({ revision: 2, content: 'Other client source.' });
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    await request.delete(`/api/folders/${parent.id}`);
  }
});

test('lifecycle dialogs remain keyboard-operable and contained on a narrow screen', async ({
  page,
  request,
}) => {
  const parent = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Narrow destination', parentId: null },
      })
    ).json(),
  );
  let noteId: string | undefined;
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await openExplorer(page);
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'New note', exact: true });
    await dialog
      .getByLabel('Note title', { exact: true })
      .fill('Narrow lifecycle note');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Narrow lifecycle note',
        exact: true,
      }),
    ).toBeVisible();
    noteId = treeResponseSchema
      .parse(await (await request.get('/api/tree')).json())
      .notes.find((note) => note.title === 'Narrow lifecycle note')!.id;
    await page
      .getByRole('button', { name: 'Show folders', exact: true })
      .click();
    await openActionMenu(page, 'Note actions');
    await page.getByRole('button', { name: 'Move note', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Move note', exact: true });
    const picker = dialog.getByLabel('Destination folder', { exact: true });
    await expect(picker).toBeFocused();
    await picker.selectOption(parent.id);
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', { name: 'Move here', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(
      page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('button', { name: 'Narrow destination', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Show folders', exact: true })
      .click();
    await openActionMenu(page, 'Note actions');
    await page
      .getByRole('button', { name: 'Delete note', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Delete note', exact: true });
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Narrow destination',
        exact: true,
      }),
    ).toBeVisible();
    expect((await request.get(`/api/notes/${noteId}`)).status()).toBe(404);
    noteId = undefined;
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    if (noteId) {
      const response = await request.get(`/api/notes/${noteId}`);
      if (response.ok())
        await request.delete(`/api/notes/${noteId}`, {
          data: {
            expectedRevision: noteDetailSchema.parse(await response.json())
              .revision,
          },
        });
    }
    await request.delete(`/api/folders/${parent.id}`);
  }
});
