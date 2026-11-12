import { openActionMenu } from './workspace-controls.js';
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
  const menu = page.getByRole('listbox', { name: 'Insert block' });
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

for (const [label, source, selector] of [
  ['Bullet list', '- **Keep my text**', 'ul'],
  ['Numbered list', '1. **Keep my text**', 'ol'],
  ['Checklist', '- [ ] **Keep my text**', 'ul'],
  ['Quote', '> **Keep my text**', 'blockquote'],
] as const) {
  test(`Text removes ${label} formatting and persists the plain block`, async ({
    page,
    notes,
  }) => {
    const note = await notes.create(`Plain block from ${label}`, source);
    await page.goto('/');
    await page
      .getByRole('button', {
        name: `Open note Plain block from ${label}`,
        exact: true,
      })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.locator('p').first().click();
    const select = page.getByRole('combobox', {
      name: 'Block type',
      exact: true,
    });
    await expect(select.locator('option:checked')).toHaveText(label);
    await select.selectOption({ label: 'Text' });
    await expect(body.locator(selector)).toHaveCount(0);
    await expect(body.locator('strong')).toHaveText('Keep my text');
    await expect(select).toHaveValue('paragraph');
    await expect
      .poll(async () => (await notes.read(note.id)).content)
      .toBe('**Keep my text**');
    await page.reload();
    await page
      .getByRole('button', {
        name: `Open note Plain block from ${label}`,
        exact: true,
      })
      .click();
    await expect(body.locator(selector)).toHaveCount(0);
    await expect(body.locator('strong')).toHaveText('Keep my text');
  });
}

test('slash insertion supports keyboard, pointer, dismissal, and fresh note history', async ({
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
    await body.fill('/heading');
    const menu = page.getByRole('listbox', { name: 'Insert block' });
    await expect(menu.getByRole('option')).toHaveCount(6);
    await body.press('ArrowDown');
    await body.press('Enter');
    await page.keyboard.type('A considered heading');
    await expect(body.locator('h2')).toHaveText('A considered heading');
    await body.press('Enter');
    await page.keyboard.type('/quote');
    await menu.getByRole('option', { name: 'Quote', exact: true }).click();
    await page.keyboard.type('A useful quotation');
    await expect(body.locator('blockquote')).toHaveText('A useful quotation');
    await body.press('Enter');
    await body.press('Enter');
    await page.keyboard.type('/nothing-matches');
    await expect(
      page.getByText('No matching blocks. Keep typing or press Escape.'),
    ).toBeVisible();
    await body.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(body).toContainText('/nothing-matches');
    await body.press('Control+Backspace');
    await body.press('Control+a');
    await page.keyboard.type('/code');
    await menu.getByRole('option', { name: 'Code block', exact: true }).click();
    await page.keyboard.type('/literal');
    await expect(menu).toHaveCount(0);
    await expect(body.locator('pre code')).toHaveText('/literal');
    await openActionMenu(page, 'Note actions');
    const save = page.getByRole('button', { name: 'Save note', exact: true });
    if (await save.isEnabled()) await save.click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Workspace folders' })
      .getByRole('button', { name: 'Separate history', exact: true })
      .click();
    await expect(body).toHaveText('');
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
    ).toBeDisabled();
    await body.fill('Only this note');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(body).toHaveText('');
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
    ).toBeDisabled();
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

test('formatting and link controls preserve selection, reject unsafe links, and restore keyboard focus', async ({
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
    await body.focus();
    await body.press('Control+a');
    for (const [label, tag] of [
      ['Bold', 'strong'],
      ['Italic', 'em'],
      ['Strikethrough', 's'],
      ['Inline code', 'code'],
    ] as const) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(body.locator(tag)).toHaveText('Selected words');
      await button.click();
      await expect(body.locator(tag)).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Link', exact: true }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Edit link' });
    const address = dialog.getByRole('textbox', { name: 'Link address' });
    await expect(address).toBeFocused();
    await address.fill('javascript:alert(1)');
    await dialog
      .getByRole('button', { name: 'Apply link', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText('Use an http');
    await expect(body.locator('a')).toHaveCount(0);
    await address.fill('#safe-section');
    await dialog
      .getByRole('button', { name: 'Apply link', exact: true })
      .click();
    await expect(body.locator('a')).toHaveAttribute('href', '#safe-section');
    await expect(body).toBeFocused();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(address).toHaveValue('#safe-section');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(body).toBeFocused();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Remove link', exact: true })
      .click();
    await expect(body.locator('a')).toHaveCount(0);
    await body.press('Control+Home');
    await body.press('Control+a');
    await body.press('Control+b');
    await expect(body.locator('strong')).toHaveText('Selected words');
    await openActionMenu(page, 'Note actions');
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
    await expect(
      page.getByRole('group', { name: 'Text formatting' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Save note', exact: true }),
    ).toHaveCount(0);
    await expect(source.locator('img, a, script, iframe')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Note title', exact: true })
      .fill('Preserved source title');
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
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
