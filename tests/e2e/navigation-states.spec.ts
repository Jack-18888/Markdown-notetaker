import { expect, test } from '@playwright/test';
import { openExplorer } from './workspace-controls.js';
import {
  ApiErrorCode,
  errorDefinitions,
  folderSchema,
  noteDetailSchema,
} from '@markdown-note-taker/contracts';

test('narrow navigation works by keyboard and keeps the reading surface reachable', async ({
  page,
  request,
}) => {
  const root = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Mobile collection', parentId: null },
      })
    ).json(),
  );
  try {
    await request.post('/api/folders', {
      data: { name: 'Empty collection', parentId: root.id },
    });
    await request.post('/api/notes', {
      data: {
        title: 'Keyboard note',
        folderId: root.id,
        content:
          'Readable on a narrow screen.\n\n' +
          'More space for a longer thought.\n\n'.repeat(16),
      },
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await openExplorer(page);
    const sidebar = page.getByRole('navigation', { name: 'Workspace folders' });
    await sidebar
      .getByRole('button', { name: 'Mobile collection', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mobile collection' }),
    ).toBeVisible();
    await sidebar
      .getByRole('button', { name: 'Keyboard note', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('textbox', { name: 'Note content', exact: true }),
    ).toContainText('Readable on a narrow screen.');
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole('main')).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/navigation-mobile.png',
      fullPage: true,
    });
    await page
      .getByRole('textbox', { name: 'Note content', exact: true })
      .locator('p')
      .last()
      .scrollIntoViewIfNeeded();
    await page
      .getByRole('button', { name: 'Show folders', exact: true })
      .click();
    await expect(
      sidebar.getByRole('button', { name: 'Workspace', exact: true }),
    ).toBeInViewport();
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('button', { name: 'Mobile collection', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Open folder Empty collection',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'This folder is empty.' }),
    ).toBeVisible();
  } finally {
    await request.delete(`/api/folders/${root.id}`);
  }
});

test('workspace loading, failure, retry, and empty state remain usable', async ({
  page,
}) => {
  let mode: 'error' | 'empty' = 'error';
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/tree', async (route) => {
    await gate;
    await route
      .fulfill(
        mode === 'error'
          ? {
              status: 500,
              json: {
                error: {
                  code: ApiErrorCode.INTERNAL_ERROR,
                  message: errorDefinitions.INTERNAL_ERROR.message,
                },
              },
            }
          : { status: 200, json: { folders: [], notes: [] } },
      )
      .catch(() => {});
  });
  try {
    await page.goto('/');
    await expect(
      page.getByText('Loading your workspace…', { exact: true }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole('heading', { name: 'Could not load your workspace.' }),
    ).toBeVisible();
    mode = 'empty';
    await page
      .getByRole('button', { name: 'Retry workspace', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Your workspace is ready.' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Workspace folders' })
        .getByRole('button', { name: 'Workspace', exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
});

test('rapid selection and failed note retry preserve the current note and safe source', async ({
  page,
  request,
}) => {
  const first = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title: 'State alpha', folderId: null, content: 'Old response' },
      })
    ).json(),
  );
  const source =
    '---\r\ntitle: Preserve\r\n---\r\n<img src=x onerror=alert(1)>\r\n[unsafe](javascript:alert(1))';
  const second = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title: 'State beta', folderId: null, content: source },
      })
    ).json(),
  );
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route(`**/api/notes/${first.id}`, async (route) => {
    captured();
    try {
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    } catch {
      /* Superseded request is intentionally cancelled. */
    }
  });
  await page.route(`**/api/notes/${second.id}`, (route) =>
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
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note State alpha', exact: true })
      .click();
    await started;
    await page
      .getByRole('navigation', { name: 'Workspace folders' })
      .getByRole('button', { name: 'State beta', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Could not open this note.' }),
    ).toBeVisible();
    await page.unroute(`**/api/notes/${second.id}`);
    await page.getByRole('button', { name: 'Retry note', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'State beta', exact: true }),
    ).toBeVisible();
    release();
    const fallback = page.getByRole('region', { name: 'Markdown source' });
    expect(
      await fallback.getByLabel('Read-only Markdown source').textContent(),
    ).toBe(source);
    await expect(fallback.locator('img, script, iframe, a')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'State beta', exact: true }),
    ).toBeVisible();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${second.id}`)).json(),
      ).content,
    ).toBe(source);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    for (const note of [first, second])
      await request.delete(`/api/notes/${note.id}`, {
        data: { expectedRevision: 1 },
      });
  }
});
