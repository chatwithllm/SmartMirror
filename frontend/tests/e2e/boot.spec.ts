import { expect, test } from '@playwright/test';

test.describe('boot', () => {
  test('renders the clock tile on /', async ({ page }) => {
    await page.goto('/');
    // data-tile-id is rendered on both the Grid wrapper and the inner
    // BaseTile section. Narrow to the BaseTile via aria-label so
    // strict mode is satisfied.
    const clock = page.getByLabel('Clock');
    await expect(clock).toBeVisible({ timeout: 10_000 });

    const time = clock.locator('[data-testid="clock-time"]');
    await expect(time).toBeVisible();
    await expect(time).toHaveText(/\d{1,2}:\d{2}/);
  });
});
