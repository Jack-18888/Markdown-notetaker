import { noteTitleButton } from './workspace-controls.js';
import { expect, test } from './note-fixtures.js';
import { noteDetailSchema } from '@markdown-note-taker/contracts';

test('a fresh slash invocation reopens after dismissal in the same paragraph', async ({
  page,
  notes,
}) => {
  await notes.create('Fresh slash invocation', '');
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Fresh slash invocation',
      exact: true,
    })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  const menu = page.locator('.milkdown-slash-menu');
  await body.fill('/');
  await expect(menu).toBeVisible();
  await body.press('Escape');
  await expect(menu).toBeHidden();
  await body.press('Backspace');
  await expect(body).toHaveText('');
  await body.press('/');
  await expect(menu).toBeVisible();
  await body.press('Enter');
  await expect(menu).toBeHidden();
  await body.type('First block');
  await body.press('Enter');
  await body.press('/');
  await expect(menu).toBeVisible();
});

test('slash insertion supports keyboard, pointer, CodeMirror code, Mermaid Diagram, and fresh note history', async ({
  page,
  request,
}) => {
  const notes = [];
  for (const title of ['Slash writing', 'Separate history'])
    notes.push(
      noteDetailSchema.parse(
        await (
          await request.post('/api/notes', {
            data: { title, folderId: null, content: '' },
          })
        ).json(),
      ),
    );
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Slash writing', exact: true })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.fill('/Heading');
    const menu = page.locator('.milkdown-slash-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.menu-group li')).toHaveCount(6);
    await body.press('ArrowDown');
    await body.press('Enter');
    await page.keyboard.type('A considered heading');
    await expect(body.locator('h2')).toHaveText('A considered heading');

    await body.press('Enter');
    await page.keyboard.type('/quote');
    await menu.locator('.menu-group li', { hasText: 'Quote' }).first().click();
    await page.keyboard.type('A useful quotation');
    await expect(body.locator('blockquote')).toHaveText('A useful quotation');

    await body.press('Enter');
    await body.press('Enter');
    await page.keyboard.type('/nothing-matches');
    await expect(menu).toBeHidden();
    await expect(body).toContainText('/nothing-matches');
    for (let i = 0; i < '/nothing-matches'.length; i++)
      await page.keyboard.press('Backspace');

    await page.keyboard.type('/code');
    await expect(menu).toBeVisible();
    await menu.locator('.menu-group li', { hasText: 'Code' }).first().click();
    const codeEditor = body.locator('.milkdown-code-block .cm-content');
    await expect(codeEditor).toBeVisible();
    await page.keyboard.type('/literal');
    await expect(menu).toBeHidden();
    await expect(codeEditor).toHaveText('/literal');

    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

    await codeEditor.press('Control+Enter');
    await page.keyboard.type('/mermaid');
    await expect(menu).toBeVisible();
    await menu
      .locator('.menu-group li', { hasText: 'Mermaid Diagram' })
      .first()
      .click();
    await expect(body.locator('[data-mermaid-editor]')).toBeVisible();
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Workspace folders' })
      .getByRole('button', { name: 'Separate history', exact: true })
      .click();
    await expect(body).toHaveText('');
    await body.press('Control+z');
    await expect(body).toHaveText('');
    await body.fill('Only this note');
    await body.press('Control+z');
    await expect(body).toHaveText('');
  } finally {
    for (const note of notes) {
      const saved = noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      );
      await request.delete(`/api/notes/${note.id}`, {
        data: { expectedRevision: saved.revision },
      });
    }
  }
});

test('floating toolbar formatting, math, link tooltip, unsafe link rejection, and mobile width', async ({
  page,
  request,
}) => {
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: {
          title: 'Formatting writing',
          folderId: null,
          content: 'Selected words',
        },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open note Formatting writing',
        exact: true,
      })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    const toolbar = page.locator('.milkdown-toolbar');
    await body.locator('p').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await expect(toolbar).toBeVisible();

    for (const [label, tag] of [
      ['Bold', 'strong'],
      ['Italic', 'em'],
      ['Strikethrough', 'del'],
      ['Inline code', 'code'],
    ] as const) {
      const button = toolbar.getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(body.locator(tag)).toHaveText('Selected words');
      await button.click();
      await expect(body.locator(tag)).toHaveCount(0);
    }

    await toolbar
      .getByRole('button', { name: 'Inline math', exact: true })
      .click();
    await expect(body.locator('[data-type="math_inline"]')).toHaveCount(1);
    await body.press('Control+z');
    await expect(body.locator('[data-type="math_inline"]')).toHaveCount(0);

    await body.locator('p').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole('button', { name: 'Link', exact: true }).click();
    const linkEdit = page.locator('.milkdown-link-edit');
    await expect(linkEdit).toBeVisible();
    const address = linkEdit.getByRole('textbox', {
      name: 'Link destination',
      exact: true,
    });
    await expect(address).toBeFocused();
    await address.fill('javascript:alert(1)');
    await address.press('Enter');
    await expect(linkEdit.getByRole('alert')).toContainText('Use an http');
    await expect(body.locator('a')).toHaveCount(0);
    await address.fill('#safe-section');
    await address.press('Enter');
    await expect(body.locator('a')).toHaveAttribute('href', '#safe-section');

    await body.locator('a').hover();
    const linkPreview = page.locator('.milkdown-link-preview');
    await expect(linkPreview).toBeVisible();
    await linkPreview
      .getByRole('button', { name: 'Edit link', exact: true })
      .click();
    await expect(address).toHaveValue('#safe-section');
    await page.keyboard.press('Escape');
    await expect(linkEdit).toBeHidden();

    await body.locator('a').hover();
    await expect(linkPreview).toBeVisible();
    await linkPreview
      .getByRole('button', { name: 'Remove link', exact: true })
      .click();
    await expect(body.locator('a')).toHaveCount(0);

    await body.press('Control+Home');
    await body.press('Control+a');
    await body.press('Control+b');
    await expect(body.locator('strong')).toHaveText('Selected words');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toBe('**Selected words**');

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(body).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('main')
      .screenshot({ path: 'test-results/writing-canvas.png' });
  } finally {
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});

test('unsupported and hostile saved Markdown exposes only literal source and preserves bytes through title edits', async ({
  page,
  request,
}) => {
  const content =
    '---\r\ntitle: source\r\n---\r\n<img src=x onerror=alert(1)>\r\n[unsafe](javascript:alert(1))\r\n';
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title: 'Source-only writing', folderId: null, content },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open note Source-only writing',
        exact: true,
      })
      .click();
    const source = page.getByLabel('Read-only Markdown source');
    await expect(source).toBeVisible();
    expect(await source.textContent()).toBe(content);
    await expect(
      page.getByRole('textbox', { name: 'Note content', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.milkdown-toolbar')).toHaveCount(0);
    await expect(page.locator('.milkdown-slash-menu')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Save note', exact: true }),
    ).toHaveCount(0);
    await expect(source.locator('img, a, script, iframe')).toHaveCount(0);
    await noteTitleButton(page, 'Source-only writing').click();
    await page
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Preserved source title');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        name: 'Preserved source title',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toBe(content);
  } finally {
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});
