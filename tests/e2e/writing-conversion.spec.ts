import { expect, test } from './note-fixtures.js';

test('an oversized Markdown edit stays in the draft until undo restores a saveable note', async ({
  page,
  notes,
}) => {
  const note = await notes.create(
    'Folio conversion recovery',
    'Original paragraph',
  );
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Folio conversion recovery',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Raw Markdown source' });
  const value = 'é'.repeat(512 * 1024 + 1);
  let writes = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'PATCH' &&
      request.url().endsWith('/api/notes/' + note.id)
    )
      writes++;
  });
  await field.fill(value);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('alert')).toContainText('at most 1 MiB');
  expect((await field.inputValue()).length).toBe(value.length);
  expect(writes).toBe(0);
  await field.press('Control+z');
  await expect(field).toHaveValue(note.content);
  await expect(page.getByRole('button', { name: 'Save note' })).toBeDisabled();
  expect((await notes.read(note.id)).content).toBe(note.content);
});
