import { expect, test } from './note-fixtures.js';

test('Milkdown tables can be inserted, edited by keyboard, saved, and reopened', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Table editing', '');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Table editing', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await body.focus();
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');

  const tableBlock = body.locator('.milkdown-table-block');
  const table = tableBlock.locator('table.children');
  await expect(table.getByRole('columnheader')).toHaveCount(3);

  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Status');

  const lastHeader = table.getByRole('columnheader').last();
  const headerBox = await lastHeader.boundingBox();
  if (!headerBox) throw new Error('Expected table header bounding box');
  await page.mouse.move(
    headerBox.x + headerBox.width - 2,
    headerBox.y + headerBox.height / 2,
  );
  const addCol = tableBlock.getByRole('button', {
    name: 'Add column',
    exact: true,
  });
  await expect(addCol).toBeVisible();
  await addCol.click();
  await expect(table.getByRole('columnheader')).toHaveCount(4);

  const lastCell = table.locator('tbody tr').last().locator('td').last();
  const cellBox = await lastCell.boundingBox();
  if (!cellBox) throw new Error('Expected table cell bounding box');
  await page.mouse.move(
    cellBox.x + cellBox.width / 2,
    cellBox.y + cellBox.height - 2,
  );
  const addRow = tableBlock.getByRole('button', {
    name: 'Add row',
    exact: true,
  });
  await expect(addRow).toBeVisible();
  await addRow.click();
  await expect(table.getByRole('row')).toHaveCount(4);

  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toMatch(/\| Name\s+\| Status\s+\|/);

  await page.reload();
  await page
    .getByRole('button', { name: 'Open note Table editing', exact: true })
    .click();
  await expect(
    table.getByRole('columnheader', { name: 'Status' }),
  ).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveCount(4);
  await expect(table.getByRole('row')).toHaveCount(4);
});
