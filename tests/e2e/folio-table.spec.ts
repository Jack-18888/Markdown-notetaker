import { expect, test } from './note-fixtures.js';

test('Folio inserts and edits tables by keyboard, adds rows and persists alignment', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Folio table controls', '');
  await page.goto('/');
  const open = page.getByRole('button', {
    name: 'Open note Folio table controls',
    exact: true,
  });
  await open.click();
  await page
    .getByRole('textbox', { name: 'Paragraph', exact: true })
    .press('/');
  await page.getByRole('textbox', { name: 'Find block type' }).fill('Table');
  await page.getByRole('textbox', { name: 'Find block type' }).press('Enter');
  const table = page.getByRole('region', { name: 'Markdown table' });
  const first = table.getByRole('textbox', { name: 'Row 1, column 1' });
  const second = table.getByRole('textbox', { name: 'Row 1, column 2' });
  await first.fill('Metric');
  await first.press('Tab');
  await expect(second).toBeFocused();
  await second.fill('Result');
  await table
    .getByRole('combobox', { name: 'Align column 2' })
    .selectOption('right');
  await table.getByRole('button', { name: 'Add row' }).click();
  await table.getByRole('textbox', { name: 'Row 3, column 1' }).fill('Total');
  await table.getByRole('textbox', { name: 'Row 3, column 2' }).fill('42');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toMatch(/-:\s*\|/);
  await page.reload();
  await open.click();
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(
    table.getByRole('textbox', { name: 'Row 3, column 2' }),
  ).toHaveText('42');
});
