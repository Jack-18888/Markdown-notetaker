import { expect, test } from '@playwright/test';
import {
  errorDefinitions,
  folderSchema,
  noteDetailSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';

test('moves notes between folders and root and preserves folder selection after moving', async ({
  page,
  request,
}) => {
  const source = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Move source', parentId: null },
      })
    ).json(),
  );
  const destination = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Move destination', parentId: null },
      })
    ).json(),
  );
  let noteId: string | undefined;
  try {
    const child = folderSchema.parse(
      await (
        await request.post('/api/folders', {
          data: { name: 'Move child', parentId: source.id },
        })
      ).json(),
    );
    const content = '# Preserve\r\n\r\n```mermaid\r\nA --> B\r\n```\r\n';
    const note = noteDetailSchema.parse(
      await (
        await request.post('/api/notes', {
          data: { title: 'Moving note', folderId: null, content },
        })
      ).json(),
    );
    noteId = note.id;
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Moving note', exact: true })
      .click();
    await page.getByRole('button', { name: 'Move note', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Move note', exact: true });
    await dialog
      .getByLabel('Destination folder', { exact: true })
      .selectOption(child.id);
    await dialog
      .getByRole('button', { name: 'Move here', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Moving note', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('button', { name: 'Move child', exact: true }),
    ).toBeVisible();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ),
    ).toMatchObject({ folderId: child.id, revision: 2, content });
    await page.getByRole('button', { name: 'Move note', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Move note', exact: true });
    await dialog
      .getByLabel('Destination folder', { exact: true })
      .selectOption('');
    await dialog
      .getByRole('button', { name: 'Move here', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    const tree = treeResponseSchema.parse(
      await (await request.get('/api/tree')).json(),
    );
    expect(tree.notes.filter((item) => item.id === note.id)).toHaveLength(1);
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ),
    ).toMatchObject({ folderId: null, revision: 3, content });
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('button', { name: 'Workspace', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Open folder Move source', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Move folder', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Move folder', exact: true });
    const picker = dialog.getByLabel('Destination folder', { exact: true });
    await expect(picker.locator(`option[value="${source.id}"]`)).toHaveCount(0);
    await expect(picker.locator(`option[value="${child.id}"]`)).toHaveCount(0);
    await picker.selectOption(destination.id);
    await dialog
      .getByRole('button', { name: 'Move here', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Move source', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('button', { name: 'Move destination', exact: true }),
    ).toBeVisible();
  } finally {
    if (noteId) {
      const saved = noteDetailSchema.parse(
        await (await request.get(`/api/notes/${noteId}`)).json(),
      );
      await request.delete(`/api/notes/${noteId}`, {
        data: { expectedRevision: saved.revision },
      });
    }
    await request.delete(`/api/folders/${source.id}`);
    await request.delete(`/api/folders/${destination.id}`);
  }
});

test('server rejects a destination that became a descendant while the picker was open', async ({
  page,
  request,
}) => {
  const source = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Stale move source', parentId: null },
      })
    ).json(),
  );
  const destination = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Stale destination', parentId: null },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open folder Stale move source',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Move folder', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Move folder',
      exact: true,
    });
    await dialog
      .getByLabel('Destination folder', { exact: true })
      .selectOption(destination.id);
    await request.patch(`/api/folders/${destination.id}`, {
      data: { parentId: source.id },
    });
    await dialog
      .getByRole('button', { name: 'Move here', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveText(
      errorDefinitions.HIERARCHY_CONFLICT.message,
    );
    await expect(
      dialog.getByLabel('Destination folder', { exact: true }),
    ).toHaveValue(destination.id);
    expect(
      treeResponseSchema
        .parse(await (await request.get('/api/tree')).json())
        .folders.find((folder) => folder.id === source.id)?.parentId,
    ).toBeNull();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Stale move source',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await request.delete(`/api/folders/${source.id}`);
    await request.delete(`/api/folders/${destination.id}`);
  }
});
