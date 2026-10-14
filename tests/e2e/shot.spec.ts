import { test } from '@playwright/test';
import { launchApp } from './launch';
test('shot', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  await page.waitForTimeout(500);
  const b = (await page.getByTestId('canvas-surface').boundingBox())!;
  const at = (x: number, y: number) => ({ x: b.x + x, y: b.y + y });
  await page.keyboard.press('p');
  for (const [x, y] of [[300, 200], [400, 260], [520, 200]] as const) {
    const p = at(x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.keyboard.press('Control+F10');
  await page.waitForTimeout(300);
  await page.getByTestId('stroke-weight').fill('5');
  await page.keyboard.press('Enter');
  await page.getByTestId('stroke-arrow-end').selectOption('simple');
  await page.getByTestId('stroke-caps').locator('[data-value="round"]').click();
  // A second path: a tapered line, dashed rectangle with gradient.
  await page.keyboard.press('m');
  const r0 = at(300, 330), r1 = at(520, 430);
  await page.mouse.move(r0.x, r0.y);
  await page.mouse.down();
  await page.mouse.move(r1.x, r1.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('v');
  await page.getByTestId('stroke-dashed').check();
  await page.keyboard.press('F6');
  await page.getByTestId('paint-mode-gradient').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/shot-stroke.png' });
  await ctx.app.close();
});
