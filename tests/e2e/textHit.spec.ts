import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

test('clicking beside or below big text, outside its selection box, does not pick it', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const b = (await page.getByTestId('canvas-surface').boundingBox())!;
    await page.keyboard.press('t');
    await page.mouse.click(b.x + 200, b.y + 300);
    await page.keyboard.type('Bell');
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.mouse.click(b.x + 215, b.y + 295);
    await page.keyboard.press('Control+t');
    const size = page.getByTestId('char-size');
    await size.fill('80');
    await size.press('Enter');
    await page.waitForTimeout(400);

    // Ink of the letters (left of the artboard, so its border is not counted).
    const ink = await page.getByTestId('canvas-content').evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const dpr = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      for (let y = Math.floor(90 * dpr); y < c.height; y++) {
        for (let x = 0; x < Math.floor(300 * dpr); x++) {
          const i = (y * c.width + x) * 4;
          if (d[i]! < 60 && d[i + 1]! < 60 && d[i + 2]! < 60 && d[i + 3]! > 200) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      return { minX: minX / dpr, minY: minY / dpr, maxX: maxX / dpr, maxY: maxY / dpr };
    });
    const cx = b.x + (ink.minX + ink.maxX) / 2;
    const picked = async (y: number) => {
      await page.mouse.click(b.x + b.width - 60, b.y + b.height - 60); // empty space: deselect
      await page.mouse.click(cx, y);
      return (await page.getByTestId('control-type').count()) > 0;
    };

    expect(await picked(b.y + (ink.minY + ink.maxY) / 2)).toBe(true); // on the letters
    // The line box (ascender to descender) used to reach well past the drawn box: 25 px below the letters must be empty space.
    expect(await picked(b.y + ink.maxY + 25)).toBe(false);
    expect(await picked(b.y + ink.minY - 25)).toBe(false);
    // Beside the text, level with it.
    await page.mouse.click(b.x + b.width - 60, b.y + b.height - 60);
    await page.mouse.click(b.x + ink.maxX + 25, b.y + (ink.minY + ink.maxY) / 2);
    expect(await page.getByTestId('control-type').count()).toBe(0);
  } finally {
    await ctx.app.close();
  }
});
