import { expect, test } from '@playwright/test';
import { atActualSize, fontsReady, launchApp } from './launch';

test('clicking beside or below big text, outside its selection box, does not pick it', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  try {
    await fontsReady(page);
    // At 100 % the middle of the canvas is the white artboard on any screen size (the CI screens are small).
    await atActualSize(page);
    const b = (await page.getByTestId('canvas-surface').boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    await page.keyboard.press('t');
    await page.mouse.click(cx - 80, cy + 20);
    await page.keyboard.type('Bell');
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+t');
    const size = page.getByTestId('char-size');
    await size.fill('80');
    await size.press('Enter');

    // Ink of the letters: black pixels in a window around the text (CSS px, relative to the canvas), plus the middle
    // of the first stroke of ink on the row halfway down (a point surely on a letter, not between two).
    const measure = () => page.getByTestId('canvas-content').evaluate(
      (el, area) => {
        const c = el as HTMLCanvasElement;
        const dpr = c.width / c.getBoundingClientRect().width;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
        for (let y = Math.max(0, Math.floor(area.y0 * dpr)); y < Math.min(c.height, area.y1 * dpr); y++) {
          for (let x = Math.max(0, Math.floor(area.x0 * dpr)); x < Math.min(c.width, area.x1 * dpr); x++) {
            const i = (y * c.width + x) * 4;
            if (d[i]! < 60 && d[i + 1]! < 60 && d[i + 2]! < 60 && d[i + 3]! > 200) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
          }
        }
        const dark = (x: number, y: number) => {
          const i = (y * c.width + x) * 4;
          return d[i]! < 60 && d[i + 1]! < 60 && d[i + 2]! < 60 && d[i + 3]! > 200;
        };
        const row = Math.round((minY + maxY) / 2);
        let from = minX;
        while (from <= maxX && !dark(from, row)) from++;
        let to = from;
        while (to <= maxX && dark(to, row)) to++;
        return { minX: minX / dpr, minY: minY / dpr, maxX: maxX / dpr, maxY: maxY / dpr, onX: (from + to) / 2 / dpr, onY: row / dpr };
      },
      { x0: b.width / 2 - 120, x1: b.width / 2 + 200, y0: b.height / 2 - 120, y1: b.height / 2 + 60 },
    );
    // Wait for the repaint at 80 pt (slow runners): the letters are then well over 40 px tall.
    await expect.poll(async () => { const m = await measure(); return m.maxY - m.minY; }).toBeGreaterThan(40);
    const ink = await measure();
    const inkX = b.x + (ink.minX + ink.maxX) / 2;
    const midY = b.y + (ink.minY + ink.maxY) / 2;
    const picked = async (x: number, y: number) => {
      await page.keyboard.press('Control+Shift+a'); // deselect
      await expect(page.getByTestId('control-type')).toHaveCount(0);
      await page.mouse.click(x, y);
      await page.waitForTimeout(300); // the control bar follows the selection a moment later
      return (await page.getByTestId('control-type').count()) > 0;
    };

    expect(await picked(b.x + ink.onX, b.y + ink.onY)).toBe(true); // on a letter
    // The line box (ascender to descender) used to reach well past the drawn box: 25 px below the letters must be empty space.
    expect(await picked(inkX, b.y + ink.maxY + 25)).toBe(false);
    expect(await picked(inkX, b.y + ink.minY - 25)).toBe(false);
    // Beside the text, level with it.
    expect(await picked(b.x + ink.maxX + 25, midY)).toBe(false);
  } finally {
    await ctx.app.close();
  }
});
