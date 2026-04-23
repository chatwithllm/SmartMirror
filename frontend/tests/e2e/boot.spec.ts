import { expect, test } from '@playwright/test';

test.describe('boot', () => {
  test('renders the clock tile on /', async ({ page }) => {
    await page.goto('/');
    const clock = page.locator('[data-tile-id="clock"]');
    await expect(clock).toBeVisible({ timeout: 10_000 });

    const time = clock.locator('[data-testid="clock-time"]');
    await expect(time).toBeVisible();
    await expect(time).toHaveText(/\d{1,2}:\d{2}/);
  });
});
