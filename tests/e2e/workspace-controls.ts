import type { Page } from '@playwright/test';

export function noteTitleButton(page: Page, title: string) {
  return page
    .getByRole('main')
    .getByRole('button', { name: title, exact: true });
}

export async function openActionDisclosure(
  page: Page,
  label: 'Workspace actions' | 'Folder actions' | 'Note actions',
) {
  if (label === 'Workspace actions') {
    const toggle = page.getByRole('button', {
      name: 'Show folders',
      exact: true,
    });
    if (await toggle.count()) await toggle.click();
  }

  const trigger = page.getByRole('button', { name: label, exact: true });
  const disclosure = page.locator('details').filter({ has: trigger });
  if ((await disclosure.getAttribute('open')) === null) await trigger.click();
}
