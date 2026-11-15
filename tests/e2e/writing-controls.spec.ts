import { expect, test } from './note-fixtures.js';

test('Folio slash shortcuts, selection formatting, and block movement round-trip', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Folio keyboard controls', '');
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Folio keyboard controls',
      exact: true,
    })
    .click();
  const paragraph = page.getByRole('textbox', {
    name: 'Paragraph',
    exact: true,
  });
  await paragraph.press('/');
  const command = page.getByRole('textbox', { name: 'Find block type' });
  await expect(command).toBeFocused();
  await command.press('Escape');
  await expect(command).toHaveCount(0);
  await paragraph.press('/');
  await command.fill('heading 2');
  await command.press('Enter');
  const heading = page.getByRole('textbox', { name: 'Heading 2', exact: true });
  await expect(heading).toBeFocused();
  await heading.fill('A section');
  await heading.press('Enter');
  await expect(paragraph).toBeFocused();
  await paragraph.fill('A short paragraph');
  await paragraph.press('Home');
  await paragraph.press('Shift+End');
  const format = page.getByRole('toolbar', { name: 'Format selection' });
  await expect(format).toBeVisible();
  await format.getByRole('button', { name: 'Bold' }).click();
  await expect(paragraph.locator('strong')).toHaveText('A short paragraph');
  await paragraph.press('Alt+ArrowUp');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toBe('**A short paragraph**\n\n## A section');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A section', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Raw Markdown source' }),
  ).toHaveValue('## A section\n\n**A short paragraph**');
});

test('Folio adds Mermaid and persists its workspace appearance preferences', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Folio preferences', '');
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Quick search' });
  await search.getByRole('searchbox').fill('Folio preferences');
  await search.getByRole('searchbox').press('Enter');
  await page.getByRole('button', { name: 'Favorite note' }).click();
  await expect(page.getByRole('region', { name: 'Favorites' })).toContainText(
    'Folio preferences',
  );
  const theme = page.getByRole('button', { name: 'Dark theme' });
  const mode = await theme.getAttribute('aria-pressed');
  await theme.click();
  await expect(theme).toHaveAttribute(
    'aria-pressed',
    mode === 'true' ? 'false' : 'true',
  );
  await page.getByLabel('Change note icon').click();
  await page
    .getByRole('button', { name: 'Set note icon ✦', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Paragraph', exact: true })
    .press('/');
  await page.getByRole('textbox', { name: 'Find block type' }).fill('Mermaid');
  await page
    .getByRole('button', { name: 'Mermaid Diagram', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Mermaid source', exact: true })
    .fill('flowchart LR\n A --> B');
  await expect(
    page.getByRole('img', { name: 'Mermaid diagram preview' }),
  ).toBeVisible();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('A --> B');
  await page.reload();
  await expect(theme).toHaveAttribute(
    'aria-pressed',
    mode === 'true' ? 'false' : 'true',
  );
  await page
    .getByRole('region', { name: 'Favorites' })
    .getByRole('button', { name: 'Folio preferences', exact: true })
    .click();
  await expect(page.getByLabel('Change note icon')).toHaveText('✦');
  await expect(
    page.getByRole('button', { name: 'Favorite note' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
