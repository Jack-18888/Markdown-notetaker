import { expect, test } from './note-fixtures.js';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [1280, 320]) {
    test(`writing canvas in ${colorScheme} at ${width}px`, async ({
      page,
      notes,
    }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      const note = await notes.create(
        `Release checklist ${colorScheme} ${width}`,
        'Confirm the build and update the installation notes before publishing. Use a fresh workspace to check first-run behavior.\n\n## Before publishing\n\n- [x] Confirm the production build\n- [ ] Check Markdown import and export\n\n```sh\nnpm run build\nnpm run test:production\n```\n\n```mermaid\nflowchart LR\n Build --> Verify --> Publish\n```',
      );
      await page.goto('/');
      await page
        .getByRole('button', {
          name: `Open note Release checklist ${colorScheme} ${width}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('img', { name: 'Mermaid diagram preview', exact: true }),
      ).toBeVisible({ timeout: 45_000 });
      await page.evaluate(() => document.fonts.ready);
      const checkbox = page.getByRole('checkbox', {
        name: 'Task item checkbox for Confirm the production build',
        exact: true,
      });
      const label = page
        .getByRole('textbox', { name: 'Note content', exact: true })
        .locator('p')
        .filter({ hasText: /^Confirm the production build$/ });
      const checkBounds = await checkbox.boundingBox();
      const textBounds = await label.boundingBox();
      expect(
        Math.abs(
          checkBounds!.y +
            checkBounds!.height / 2 -
            textBounds!.y -
            textBounds!.height / 2,
        ),
      ).toBeLessThan(12);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/editor-${colorScheme}-${width}.png`,
        fullPage: true,
      });
      expect(await notes.read(note.id)).toEqual(note);
    });
  }
}
