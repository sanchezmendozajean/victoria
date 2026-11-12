import { expect, test } from '@playwright/test';
import { fontsReady, launchApp } from './launch';

test('the font list opens over the panels, inside the window, and picking still works', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fontsReady(page);
    await page.keyboard.press('Control+t');
    await expect(page.getByTestId('character-panel')).toBeVisible();
    const picker = page.getByTestId('font-picker');
    await expect(picker).toBeVisible();
    await picker.click();
    const popup = page.locator('.vc-fontpicker__popup');
    await expect(popup).toBeVisible();

    // Not inside the panel (which would clip it): a child of the body, above everything.
    expect(await popup.evaluate((el) => el.parentElement === document.body)).toBe(true);
    const box = (await popup.boundingBox())!;
    const view = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    // The element at the centre of the list is the list itself, not a panel drawn over it.
    const covered = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.vc-fontpicker__popup'), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(covered).toBe(true);

    // Search for a family this machine has (Arial is missing on Linux runners).
    const options = page.locator('[data-testid^="font-option-"]');
    await expect(options.first()).toBeVisible();
    const family = ((await options.last().getAttribute('data-testid')) ?? '').replace('font-option-', '');
    await page.getByTestId('font-search').fill(family);
    await page.getByTestId(`font-option-${family}`).click();
    await expect(popup).toHaveCount(0);
  } finally {
    await ctx.app.close();
  }
});
