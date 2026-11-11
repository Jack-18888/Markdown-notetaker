import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  ApiErrorCode,
  errorDefinitions,
  folderSchema,
  noteDetailSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';

async function folder(
  request: APIRequestContext,
  name: string,
  parentId: string | null,
) {
  return folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name, parentId },
      })
    ).json(),
  );
}
async function note(
  request: APIRequestContext,
  title: string,
  folderId: string,
) {
  return noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title, folderId, content: 'Keep this saved source.' },
      })
    ).json(),
  );
}

test('cancels deletion by default and permanently removes only the confirmed subtree', async ({
  page,
  request,
}) => {
  const parent = await folder(request, 'Delete parent', null);
  try {
    const victim = await folder(request, 'Delete subtree', parent.id);
    const child = await folder(request, 'Delete descendant', victim.id);
    const sibling = await folder(request, 'Delete sibling', parent.id);
    const direct = await note(request, 'Delete direct note', victim.id);
    const nested = await note(request, 'Delete nested note', child.id);
    const retained = await note(request, 'Delete retained note', sibling.id);
    let deletes = 0;
    page.on('request', (request) => {
      if (request.method() === 'DELETE') deletes++;
    });
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open folder Delete parent', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Open folder Delete subtree', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Delete folder', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Delete folder',
      exact: true,
    });
    await expect(dialog).toContainText(
      'permanently deleted. This cannot be undone.',
    );
    await expect(dialog).toContainText('1 subfolder and 2 notes');
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    expect(deletes).toBe(0);
    expect((await request.get(`/api/notes/${nested.id}`)).status()).toBe(200);
    await expect(
      page.getByRole('button', { name: 'Delete folder', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', { name: 'Delete permanently', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Delete parent',
        exact: true,
      }),
    ).toBeVisible();
    expect(deletes).toBe(1);
    const tree = treeResponseSchema.parse(
      await (await request.get('/api/tree')).json(),
    );
    expect(
      tree.folders.some(
        (item) => item.id === victim.id || item.id === child.id,
      ),
    ).toBe(false);
    expect(tree.folders.some((item) => item.id === sibling.id)).toBe(true);
    for (const removed of [direct, nested])
      expect((await request.get(`/api/notes/${removed.id}`)).status()).toBe(
        404,
      );
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${retained.id}`)).json(),
      ),
    ).toMatchObject({ revision: 1, content: retained.content });
  } finally {
    await request.delete(`/api/folders/${parent.id}`);
  }
});

test('refuses to delete a newer note revision until it is reopened', async ({
  page,
  request,
}) => {
  const parent = await folder(request, 'Delete revision parent', null);
  try {
    const created = await note(request, 'Delete revision note', parent.id);
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open folder Delete revision parent',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: 'Open note Delete revision note',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Delete note', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Delete note',
      exact: true,
    });
    expect(
      (
        await request.patch(`/api/notes/${created.id}`, {
          data: { content: 'Newer saved source.', expectedRevision: 1 },
        })
      ).status(),
    ).toBe(200);
    await dialog
      .getByRole('button', { name: 'Delete permanently', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveText(
      errorDefinitions.REVISION_CONFLICT.message,
    );
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${created.id}`)).json(),
      ),
    ).toMatchObject({ revision: 2, content: 'Newer saved source.' });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Delete revision note',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Refresh workspace', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'Note content', exact: true }),
    ).toContainText('Newer saved source.');
    await page
      .getByRole('button', { name: 'Delete note', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Delete permanently', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Delete revision parent',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('This folder is empty.', { exact: true }),
    ).toBeVisible();
    expect((await request.get(`/api/notes/${created.id}`)).status()).toBe(404);
  } finally {
    await request.delete(`/api/folders/${parent.id}`);
  }
});

test('failed deletion retains the subtree and pending deletion blocks dismissal and duplicate writes', async ({
  page,
  request,
}) => {
  const parent = await folder(request, 'Delete failure parent', null);
  let release = () => {};
  try {
    const created = await note(request, 'Delete failure note', parent.id);
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open folder Delete failure parent',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Delete folder', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Delete folder',
      exact: true,
    });
    await page.route(`**/api/folders/${parent.id}`, (route) =>
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
      .getByRole('button', { name: 'Delete permanently', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveText(
      errorDefinitions.INTERNAL_ERROR.message,
    );
    expect((await request.get(`/api/notes/${created.id}`)).status()).toBe(200);
    await page.unrouteAll({ behavior: 'wait' });
    let deletes = 0;
    let started!: () => void;
    const captured = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/folders/${parent.id}`, async (route) => {
      deletes++;
      started();
      await gate;
      await route.continue();
    });
    await dialog
      .getByRole('button', { name: 'Delete permanently', exact: true })
      .click();
    await captured;
    await expect(
      dialog.getByRole('button', { name: 'Deleting…', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog).toBeHidden();
    expect(deletes).toBe(1);
    expect((await request.get(`/api/notes/${created.id}`)).status()).toBe(404);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Workspace',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await request.delete(`/api/folders/${parent.id}`);
  }
});
