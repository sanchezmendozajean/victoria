import { expect, test, type Page } from '@playwright/test';
import { atActualSize, launchApp } from './launch';

const field = async (page: Page, id: string) => Number.parseFloat((await page.getByTestId(id).inputValue()).replace(',', '.'));

test('Objeto › Transformar › Restablecer cuadro delimitador lines the box of a drawn diagonal up with the page; undo turns it back', async () => {
  const { app, page } = await launchApp();
  try {
    await atActualSize(page);
    const b = (await page.getByTestId('canvas-surface').boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // A diagonal with the Line Segment tool: its box turns with it (the Transform panel shows the angle).
    await page.keyboard.press('\\');
    await page.mouse.move(cx - 100, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 60, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('v');
    await page.keyboard.press('Shift+F8');
    await expect.poll(() => field(page, 'transform-angle')).not.toBe(0);
    const turned = await field(page, 'transform-angle');

    await page.getByTestId('menu-object').click();
    await page.getByRole('menuitem', { name: /^Transformar$/ }).hover();
    await page.getByRole('menuitem', { name: /Restablecer cuadro delimitador/ }).click();
    // Upright now: no angle, and the box spans the whole diagonal.
    await expect.poll(() => field(page, 'transform-angle')).toBe(0);
    expect(await field(page, 'transform-h')).toBeGreaterThan(30);

    await page.keyboard.press('Control+z');
    await expect.poll(() => field(page, 'transform-angle')).toBeCloseTo(turned, 2);
  } finally {
    await app.close();
  }
});
