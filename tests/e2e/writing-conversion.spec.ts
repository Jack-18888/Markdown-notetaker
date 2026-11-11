import { expect, test } from '@playwright/test';
import { noteDetailSchema } from '@markdown-note-taker/contracts';

test('an unrepresentable edit retains writing and source until undo restores a safe document', async ({
  page,
  request,
}) => {
  const content =
    '```mermaid\r\nflowchart LR\r\n A --> B\r\n```\r\n\r\nOriginal paragraph';
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title: 'Conversion recovery', folderId: null, content },
      })
    ).json(),
  );
  let writes = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'PATCH' &&
      request.url().endsWith(`/api/notes/${note.id}`)
    )
      writes++;
  });
  try {
    await page.goto('/');
    await page
      .getByRole('button', {
        name: 'Open note Conversion recovery',
        exact: true,
      })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.focus();
    await body.press('Control+a');
    await page
      .getByRole('combobox', { name: 'Block type' })
      .selectOption('blockquote');
    await expect(body.locator('blockquote [data-mermaid]')).toContainText(
      'flowchart LR',
    );
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'This edit cannot be saved safely',
    );
    await expect(body).toContainText('Original paragraph');
    expect(writes).toBe(0);
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toBe(content);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(body.locator('blockquote')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Save note', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});
