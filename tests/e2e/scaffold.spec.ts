import { expect, test } from '@playwright/test';

test('opens the React scaffold and reaches Express through the Vite proxy', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Good ideasstart with a note.',
  );
  await expect(page.getByRole('status')).toHaveText('Local server connected');
});
