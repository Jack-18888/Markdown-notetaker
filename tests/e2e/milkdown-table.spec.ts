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
  const table = body.locator('table.children');
  await expect(table.getByRole('columnheader')).toHaveCount(3);
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Status');
  const controls = page.getByRole('group', { name: 'Table controls' });
  await controls
    .getByRole('button', { name: 'Add column', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(table.getByRole('columnheader')).toHaveCount(4);
  await expect(
    controls.getByRole('button', { name: 'Delete row', exact: true }),
  ).toBeDisabled();
  await controls.getByRole('button', { name: 'Add row', exact: true }).focus();
  await page.keyboard.press('Enter');
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
