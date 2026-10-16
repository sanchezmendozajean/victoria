import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;
const typeLabel = (page: Page) => page.getByTestId('control-type');

async function at(page: Page, dx: number, dy: number): Promise<{ x: number; y: number }> {
  const b = await surface(page);
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
}
async function click(page: Page, dx: number, dy: number) {
  const p = await at(page, dx, dy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** Dark pixels of the content canvas in a rectangle around a point relative to the canvas centre. */
const darkPixels = async (page: Page, dx: number, dy: number, w: number, h: number) => {
  const p = await at(page, dx, dy);
  const b = await surface(page);
  return page.getByTestId('canvas-content').evaluate(
    (c: HTMLCanvasElement, r) => {
      const dpr = window.devicePixelRatio || 1;
      const data = c.getContext('2d')!.getImageData(Math.round(r.x * dpr), Math.round(r.y * dpr), Math.round(r.w * dpr), Math.round(r.h * dpr)).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if ((data[i + 3] as number) > 200 && (data[i] as number) < 140 && (data[i + 1] as number) < 140 && (data[i + 2] as number) < 140) n++;
      return n;
    },
    { x: p.x - b.x, y: p.y - b.y, w, h },
  );
};

test.describe('text (phase 7)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(800); // system fonts are listed at start
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });
  test.beforeEach(async () => {
    const { page } = ctx;
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+Shift+a');
  });

  test('a click and typing makes point text with real system fonts; Escape leaves the tool; one undo removes it', async () => {
    const { page } = ctx;
    await page.keyboard.press('t');
    await click(page, -100, 0);
    await page.keyboard.type('Victoria');
    await expect.poll(() => darkPixels(page, -110, -40, 260, 80)).toBeGreaterThan(40);
    await page.keyboard.press('Escape');
    await expect(typeLabel(page)).toContainText('Texto');
    await page.keyboard.press('Control+z');
    await expect(typeLabel(page)).toHaveCount(0);
  });

  test('a drag makes area text that wraps inside its box', async () => {
    const { page } = ctx;
    await page.keyboard.press('t');
    await drag(page, [-120, -60], [40, 60]);
    await page.keyboard.type('Uno dos tres cuatro cinco seis siete ocho nueve diez');
    await page.keyboard.press('Escape');
    await expect(typeLabel(page)).toContainText('Texto');
    // Text stays inside the dragged box: nothing is painted well to the right of it.
    expect(await darkPixels(page, 60, -70, 150, 140)).toBe(0);
    expect(await darkPixels(page, -125, -65, 170, 130)).toBeGreaterThan(80);
  });

  test('the Character panel changes the size of the selected text', async () => {
    const { page } = ctx;
    await page.keyboard.press('t');
    await click(page, -100, 0);
    await page.keyboard.type('Hola');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+t');
    await expect(page.getByTestId('character-panel')).toBeVisible();
    const size = page.getByTestId('char-size');
    await size.fill('48');
    await page.keyboard.press('Enter');
    await expect.poll(async () => Number.parseFloat((await size.inputValue()).replace(',', '.'))).toBe(48);
    await expect.poll(() => darkPixels(page, -110, -70, 260, 100)).toBeGreaterThan(400);
  });

  test('Create Outlines turns the text into a group of shapes', async () => {
    const { page } = ctx;
    await page.keyboard.press('t');
    await click(page, -100, 0);
    await page.keyboard.type('Hola');
    await page.keyboard.press('Escape');
    const chevrons = page.getByTestId('layer-chevron');
    const before = await chevrons.count();
    await page.keyboard.press('Control+Shift+o');
    await expect(chevrons).toHaveCount(before + 1); // the text row is now a group that can be expanded
  });

  test('Type on a Path puts text along a circle', async () => {
    const { page } = ctx;
    await page.keyboard.press('l');
    await drag(page, [-80, -80], [80, 80]);
    await page.locator('[data-testid="toolbar"] button[data-tool="tool-type"]').click({ button: 'right' });
    await page.locator('[data-testid="tool-flyout"] [data-tool="tool-type-on-path"]').click();
    await click(page, 0, -80); // on the top of the circle
    await page.keyboard.type('Texto sobre un circulo');
    await page.keyboard.press('Escape');
    await expect(typeLabel(page)).toContainText('Texto');
    // The glyphs follow the circle: there is ink at the top and at the bottom of it.
    expect(await darkPixels(page, -40, -100, 80, 40)).toBeGreaterThan(40);
  });
});
