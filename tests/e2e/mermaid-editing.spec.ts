import { expect, test } from '@playwright/test';
import { noteDetailSchema } from '@markdown-note-taker/contracts';

test('multiple diagrams stay editable through invalid source, save/reopen, undo, and removal', async ({
  page,
  request,
}) => {
  const second = 'sequenceDiagram\r\n Alice->>Bob: Hello  ';
  const content =
    '```mermaid\nflowchart LR\n A --> B\n```\n\n```mermaid\n' +
    second +
    '\n```\n\nAfter diagrams.';
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: { title: 'Editable diagrams', folderId: null, content },
      })
    ).json(),
  );
  try {
    await page.goto('/');
    const open = page.getByRole('button', {
      name: 'Open note Editable diagrams',
      exact: true,
    });
    await open.click();
    const diagrams = page.getByRole('region', {
      name: 'Mermaid diagram',
      exact: true,
    });
    await expect(
      page.getByRole('img', { name: 'Mermaid diagram preview', exact: true }),
    ).toHaveCount(2);
    const first = diagrams.first();
    await first
      .getByRole('button', { name: 'Edit source', exact: true })
      .click();
    const source = first.getByRole('textbox', {
      name: 'Mermaid source',
      exact: true,
    });
    await source.fill('invalid Mermaid source');
    await expect(first.getByRole('status')).toContainText(
      'could not be previewed',
    );
    await expect(diagrams.nth(1).getByRole('img')).toBeVisible();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.locator(':scope > p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Edited body.');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    expect(saved.content).toContain('invalid Mermaid source');
    expect(saved.content).toContain(second);
    expect(saved.content).toContain('After diagrams. Edited body.');
    await page.reload();
    await open.click();
    await first
      .getByRole('button', { name: 'Edit source', exact: true })
      .click();
    await expect(source).toHaveValue('invalid Mermaid source');
    await source.fill('flowchart LR\n Recovered --> Preview');
    await expect(first.getByRole('img')).toContainText('Recovered');
    await source.press('Control+z');
    await expect(source).toHaveValue('invalid Mermaid source');
    await source.press('Control+Shift+z');
    await expect(source).toHaveValue('flowchart LR\n Recovered --> Preview');
    await first
      .getByRole('button', { name: 'Remove diagram', exact: true })
      .click();
    await expect(diagrams).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(diagrams).toHaveCount(2);
    await expect(first.getByRole('img')).toContainText('Recovered');
    await page
      .getByRole('main')
      .screenshot({ path: 'test-results/mermaid-editing.png' });
  } finally {
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});
