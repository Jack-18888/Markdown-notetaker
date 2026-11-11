import { expect, test } from '@playwright/test';
import { folderSchema, noteDetailSchema } from '@markdown-note-taker/contracts';

test('opens deep notes on demand, shows breadcrumbs, and handles deleted selection', async ({
  page,
  request,
}) => {
  const root = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Navigation root', parentId: null },
      })
    ).json(),
  );
  try {
    const child = folderSchema.parse(
      await (
        await request.post('/api/folders', {
          data: { name: 'Depth two', parentId: root.id },
        })
      ).json(),
    );
    const leaf = folderSchema.parse(
      await (
        await request.post('/api/folders', {
          data: { name: 'Depth three', parentId: child.id },
        })
      ).json(),
    );
    const content =
      '# Saved body\r\n\r\n**Read safely**\r\n\r\n```mermaid\r\nA --> B\r\n```\r\n';
    const note = noteDetailSchema.parse(
      await (
        await request.post('/api/notes', {
          data: { title: 'Navigation note', folderId: leaf.id, content },
        })
      ).json(),
    );
    const noteReads: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'GET' && /\/api\/notes\//.test(request.url()))
        noteReads.push(request.url());
    });
    await page.goto('/');
    const sidebar = page.getByRole('navigation', { name: 'Workspace folders' });
    await expect(
      sidebar.getByRole('button', { name: 'Navigation root', exact: true }),
    ).toBeVisible();
    expect(noteReads).toEqual([]);
    for (const name of ['Navigation root', 'Depth two', 'Depth three'])
      await sidebar
        .getByRole('button', { name: `Expand ${name}`, exact: true })
        .click();
    expect(noteReads).toEqual([]);
    await sidebar
      .getByRole('button', { name: 'Navigation note', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Navigation note' }),
    ).toBeVisible();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await expect(body).toContainText('Read safely');
    await expect(body.locator('[data-mermaid]')).toHaveText('A --> B');
    expect(noteReads.length).toBeGreaterThan(0);
    expect(
      noteReads.every((url) => url.endsWith(`/api/notes/${note.id}`)),
    ).toBe(true);
    const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    for (const name of ['Workspace', 'Navigation root', 'Depth two'])
      await expect(
        breadcrumbs.getByRole('button', { name, exact: true }),
      ).toBeVisible();
    await expect(
      breadcrumbs.getByRole('button', { name: 'Depth three' }),
    ).toBeVisible();
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
      'Navigation note',
    );
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toBe(content);
    await page.screenshot({
      path: 'test-results/navigation-desktop.png',
      fullPage: true,
    });
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: 1 },
    });
    await page
      .getByRole('button', { name: 'Refresh workspace', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Workspace', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'The selected item is no longer available. Showing the workspace.',
      ),
    ).toBeVisible();
  } finally {
    await request.delete(`/api/folders/${root.id}`);
  }
});
