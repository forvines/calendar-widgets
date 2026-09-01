import { expect, test } from '@playwright/test';

test('serves the calendar widget', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DAKboard Calendar Prototype');
  await expect(page.getByRole('main')).toBeVisible();
});

test('serves both standalone widgets', async ({ page }) => {
  await page.goto('/widgets/weather.html');
  await expect(page).toHaveTitle('Local Weather');

  await page.goto('/widgets/aviation.html');
  await expect(page).toHaveTitle('Aviation Weather');
});

test('exposes the Worker health endpoint', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: 'ok',
    version: 'development',
  });
});
