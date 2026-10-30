import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const b = (await page.getByTestId('canvas-surface').boundingBox())!;
  await page.mouse.move(b.x + from[0], b.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + (from[0] + to[0]) / 2, b.y + (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(b.x + to[0], b.y + to[1], { steps: 4 });
  await page.mouse.up();
}

test.describe('Artboard tool', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(500);
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('draws a new artboard, edits it from the control bar, adds one and deletes it', async () => {
    const { page } = ctx;
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+O');
    await expect(page.getByTestId('artboard-w')).toBeVisible();
    // The blank document fits its artboard in the middle: the top-left corner of the canvas is empty.
    await drag(page, [20, 20], [90, 70]);
    await expect(page.getByTestId('status-artboard')).toContainText('2');
    await expect(page.getByTestId('control-bar')).toContainText('2');
    await page.getByRole('button', { name: 'Nueva mesa de trabajo junto a la última' }).click();
    await page.getByTestId('status-artboard').click();
    await expect(page.getByRole('menuitem')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+O');
    await page.getByRole('button', { name: 'Eliminar la mesa activa (no su contenido)' }).click();
    await page.getByTestId('status-artboard').click();
    await expect(page.getByRole('menuitem')).toHaveCount(2);
  });
});
