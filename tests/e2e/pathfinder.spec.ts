import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;
async function at(page: Page, dx: number, dy: number) {
  const b = await surface(page);
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
}
async function drag(page: Page, from: [number, number], to: [number, number], alt = false) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}
async function click(page: Page, dx: number, dy: number, alt = false) {
  const p = await at(page, dx, dy);
  await page.mouse.move(p.x, p.y);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}

test.describe('pathfinder and Shape Builder (phase 8)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(500);
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
    // Two overlapping circles, both selected.
    await page.keyboard.press('l');
    await drag(page, [-100, -50], [0, 50]);
    await drag(page, [-40, -50], [60, 50]);
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
  });

  const rows = (page: Page) => page.getByTestId('layer-row');

  test('Unir from the Buscatrazos panel makes one object, undone in one step', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+Shift+F9');
    await expect(page.getByTestId('pathfinder-panel')).toBeVisible();
    const before = await rows(page).count();
    await page.getByTestId('pf-unite').click();
    await expect(rows(page)).toHaveCount(before - 1);
    await page.keyboard.press('Control+z');
    await expect(rows(page)).toHaveCount(before);
  });

  test('Dividir groups the three regions', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+Shift+F9');
    await page.getByTestId('pf-divide').click();
    await expect(page.getByTestId('control-type')).toContainText('Grupo');
  });

  test('the Shape Builder: a click splits into regions; dragging unites; Alt deletes', async () => {
    const { page } = ctx;
    const before = await rows(page).count();
    await page.keyboard.press('Shift+m');
    await click(page, -20, 0); // the lens between the circles
    await expect(rows(page)).toHaveCount(before + 1); // 2 circles -> 3 regions
    await page.keyboard.press('Control+a');
    await drag(page, [-80, 0], [-20, 0]); // left crescent, then the lens
    await expect(rows(page)).toHaveCount(before); // united: 2 objects again
    await page.keyboard.press('Control+a');
    await click(page, -20, 0, true); // Alt: delete the lens
    await expect(rows(page)).toHaveCount(before - 1);
  });
});
