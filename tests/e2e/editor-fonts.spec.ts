import { expect, test } from './note-fixtures.js';

test('nested emphasis and italic controls load their local font faces without changing the note', async ({
  page,
  notes,
}) => {
  const note = await notes.create(
    'Local emphasis fonts',
    '**bold and *italic* text**',
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: `Open note ${note.title}`, exact: true })
    .click();
  const emphasis = page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .locator('strong em');
  await expect(emphasis).toHaveText('italic');
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() =>
    Array.from(document.fonts).map((face) => ({
      family: face.family.replaceAll(/['"]/g, ''),
      weight: face.weight,
      style: face.style,
      status: face.status,
    })),
  );
  expect(faces).toContainEqual({
    family: 'Spectral',
    weight: '700',
    style: 'italic',
    status: 'loaded',
  });
  expect(faces).toContainEqual({
    family: 'Instrument Sans Variable',
    weight: '400 700',
    style: 'italic',
    status: 'loaded',
  });
  expect(await notes.read(note.id)).toEqual(note);
});
