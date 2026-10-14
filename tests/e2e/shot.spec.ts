import { test } from '@playwright/test';
import { launchApp } from './launch';
test('shot', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  await page.waitForTimeout(500);
  await page.keyboard.press('m');
  const b = (await page.getByTestId('canvas-surface').boundingBox())!;
  await page.mouse.move(b.x + 300, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 500, b.y + 320, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('v');
  await page.keyboard.press('F6');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/shot-fill.png' });
  await ctx.app.close();
});
