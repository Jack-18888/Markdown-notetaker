import { openActionMenu, openExplorer } from './workspace-controls.js';
import type { Page } from '@playwright/test';
import { folderSchema, noteDetailSchema } from '@markdown-note-taker/contracts';
import { expect, test } from './note-fixtures.js';

async function checkControlNames(page: Page) {
  const client = await page.context().newCDPSession(page);
  try {
    const { nodes } = (await client.send('Accessibility.getFullAXTree')) as {
      nodes: {
        ignored: boolean;
        role?: { value: string };
        name?: { value: string };
      }[];
    };
    const actionable = new Set([
      'button',
      'link',
      'textbox',
      'combobox',
      'checkbox',
    ]);
    expect(
      nodes.filter(
        (node) =>
          !node.ignored &&
          actionable.has(node.role?.value ?? '') &&
          !node.name?.value.trim(),
      ),
    ).toEqual([]);
  } finally {
    await client.detach();
  }
}

for (const width of [1280, 320]) {
  test(`keyboard file controls, modal focus, and accessible names at ${width}px`, async ({
    page,
    notes,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const note = await notes.create(
      `Keyboard accessibility ${width}`,
      '- [ ] Review task\n\nA paragraph.',
    );
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Skip to notes', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    const open = page.getByRole('button', {
      name: `Open note Keyboard accessibility ${width}`,
      exact: true,
    });
    await open.focus();
    await page.keyboard.press('Enter');
    const checkbox = page.getByRole('checkbox', {
      name: 'Task item checkbox for Review task',
      exact: true,
    });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await expect(
      page.getByRole('status').filter({ hasText: 'Saved.' }),
    ).toBeVisible();
    await checkControlNames(page);
    const exported = page.waitForEvent('download');
    await openActionMenu(page, 'Note actions');
    await page
      .getByRole('button', { name: 'Export Markdown', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    expect((await exported).suggestedFilename()).toBe(
      `Keyboard accessibility ${width}.md`,
    );
    expect((await notes.read(note.id)).content).toContain('- [x]');
    if (width < 760) {
      await page
        .getByRole('button', { name: 'Show folders', exact: true })
        .focus();
      await page.keyboard.press('Enter');
    }
    const importButton = page.getByRole('button', {
      name: 'Import Markdown',
      exact: true,
    });
    await openActionMenu(page, 'Workspace actions');
    await importButton.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {
      name: 'Import Markdown',
      exact: true,
    });
    const file = dialog.getByLabel('Markdown file', { exact: true });
    await expect(file).toBeFocused();
    await file.setInputFiles({
      name: 'x'.repeat(201) + '.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Keyboard imported source'),
    });
    const submit = dialog.getByRole('button', {
      name: 'Import note',
      exact: true,
    });
    await submit.focus();
    await page.keyboard.press('Enter');
    const title = dialog.getByLabel('Note title', { exact: true });
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('alert')).toContainText('1–200');
    await title.fill(`Keyboard imported ${width}`);
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    await page.keyboard.press('Tab');
    // Chromium may visit browser chrome when cycling a native modal. Page content stays inert.
    const atBrowserChrome = await page.evaluate(
      () => document.activeElement === document.body,
    );
    if (atBrowserChrome) await page.keyboard.press('Tab');
    await expect(file).toBeFocused();
    await checkControlNames(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(importButton).toBeFocused();
    await page.keyboard.press('Enter');
    await file.setInputFiles({
      name: `Keyboard imported ${width}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from('Keyboard imported source'),
    });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/notes') &&
        response.request().method() === 'POST',
    );
    await page.keyboard.press('Enter');
    const copy = noteDetailSchema.parse(await (await created).json());
    notes.track(copy.id);
    await expect(
      page.getByRole('heading', { name: copy.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/accessibility-${width}.png`,
      fullPage: true,
    });
  });
}

test('long titles, deep breadcrumbs, literal code, and wide diagrams stay contained at 320px', async ({
  page,
  request,
}) => {
  const folder = folderSchema.parse(
    await (
      await request.post('/api/folders', {
        data: { name: 'Accessible hierarchy', parentId: null },
      })
    ).json(),
  );
  try {
    let parentId = folder.id;
    for (let index = 0; index < 7; index++) {
      const child = folderSchema.parse(
        await (
          await request.post('/api/folders', {
            data: { name: `Level ${index} ${'long'.repeat(30)}`, parentId },
          })
        ).json(),
      );
      parentId = child.id;
    }
    const title = 'Long note '.repeat(20).trim();
    await request.post('/api/notes', {
      data: {
        title,
        folderId: parentId,
        content:
          '```text\n' +
          'literal_code_'.repeat(100) +
          '\n```\n\n```mermaid\nflowchart LR\n A[Beginning] --> B[Middle] --> C[Another] --> D[End]\n```',
      },
    });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await openExplorer(page);
    const navigation = page.getByRole('navigation', {
      name: 'Workspace folders',
      exact: true,
    });
    await navigation
      .getByRole('button', { name: 'Accessible hierarchy', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    for (let index = 0; index < 7; index++)
      await page
        .getByRole('button', {
          name: `Open folder Level ${index} ${'long'.repeat(30)}`,
          exact: true,
        })
        .click();
    await page
      .getByRole('button', { name: `Open note ${title}`, exact: true })
      .click();
    await expect(
      page.getByRole('img', { name: 'Mermaid diagram preview', exact: true }),
    ).toBeVisible();
    await checkControlNames(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const code = page
      .getByRole('textbox', { name: 'Note content', exact: true })
      .locator('pre');
    await expect(code).toHaveText('literal_code_'.repeat(100));
    await page
      .getByRole('button', { name: 'Show folders', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      navigation.getByRole('button', { name: 'Workspace', exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: 'test-results/accessibility-long-content.png',
      fullPage: true,
    });
  } finally {
    await request.delete(`/api/folders/${folder.id}`);
  }
});
