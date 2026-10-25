import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;
const typeLabel = (page: Page) => page.getByTestId('control-type');

async function centre(page: Page) {
  const b = await surface(page);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const c = await centre(page);
  await page.mouse.move(c.x + from[0], c.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(c.x + (from[0] + to[0]) / 2, c.y + (from[1] + to[1]) / 2, { steps: 3 });
  await page.mouse.move(c.x + to[0], c.y + to[1], { steps: 3 });
  await page.mouse.up();
}

const canvasData = (page: Page) => page.getByTestId('canvas-content').evaluate((c: HTMLCanvasElement) => c.toDataURL());

test.describe('Free Transform and pixel preview (Phase 11)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('Free Distort from the widget turns a live rectangle into a path, one undo step', async () => {
    const { page } = ctx;
    await page.keyboard.press('m');
    await drag(page, [-150, -80], [-90, -30]);
    await expect(typeLabel(page)).toContainText('Rectángulo');

    await page.keyboard.press('e');
    // The widget is a column of four buttons right of the box: constrain, free, perspective, free distort.
    const c = await centre(page);
    await page.mouse.click(c.x - 90 + 16 + 11, c.y - 80 + 11 + 3 * 26);
    await expect(typeLabel(page)).toContainText('Rectángulo'); // choosing a mode changes nothing

    await drag(page, [-90, -30], [-70, -20]);
    await expect(typeLabel(page)).toContainText('Trazado');
    await page.keyboard.press('Control+z');
    await expect(typeLabel(page)).toContainText('Rectángulo');
  });

  test('Previsualizar píxeles (Alt+Ctrl+Y) rasterises at 72 ppi once zoomed in, and toggles back', async () => {
    const { page } = ctx;
    await page.getByTestId('zoom-menu').click();
    await page.getByRole('menuitem', { name: '800%', exact: true }).click();
    await expect(page.getByTestId('zoom-field')).toHaveValue(/^800/);
    // A circle drawn at 800 %: its edge is smooth normally and made of 72 ppi pixels in the preview.
    await page.keyboard.press('l');
    await drag(page, [-60, -60], [60, 60]);
    await page.keyboard.press('v');
    await page.waitForTimeout(150);
    const normal = await canvasData(page);

    await page.keyboard.press('Control+Alt+y');
    await expect.poll(() => canvasData(page)).not.toBe(normal);
    await page.getByTestId('menu-view').click();
    await expect(page.getByRole('menuitem', { name: /Previsualizar píxeles/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+Alt+y');
    await expect.poll(() => canvasData(page)).toBe(normal);
  });
});
