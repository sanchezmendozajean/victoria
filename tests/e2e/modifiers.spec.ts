import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;
async function at(page: Page, dx: number, dy: number) {
  const b = await surface(page);
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
const typeLabel = (page: Page) => page.getByTestId('control-type');
const modifierRows = (page: Page) => page.locator('[data-testid="appearance-row"][data-kind="modifier"]');

async function addFromFx(page: Page, category: RegExp, name: RegExp) {
  await page.getByTestId('appearance-fx').click();
  await page.getByRole('menuitem', { name: category }).hover();
  await page.getByRole('menuitem', { name }).click();
}

test.describe('modifiers (phase 9)', () => {
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
    await page.keyboard.press('m');
    await drag(page, [-100, -60], [20, 60]);
    await page.keyboard.press('Shift+F6');
    await expect(page.getByTestId('appearance-panel')).toBeVisible();
  });

  test('a modifier from the fx menu is a single undo step and shows in the Appearance list', async () => {
    const { page } = ctx;
    await expect(modifierRows(page)).toHaveCount(0);
    await addFromFx(page, /Distorsionar/, /Zigzag/);
    await expect(page.getByTestId('modifier-dialog')).toBeVisible();
    await page.getByTestId('mod-size').fill('10');
    await page.keyboard.press('Enter');
    await page.getByTestId('mod-ok').click();
    await expect(page.getByTestId('modifier-dialog')).toHaveCount(0);
    await expect(modifierRows(page)).toHaveCount(1);
    await expect(page.getByTestId('appearance-name').first()).toContainText('Zigzag');
    await page.keyboard.press('Control+z');
    await expect(modifierRows(page)).toHaveCount(0);
    await expect(typeLabel(page)).toContainText('Rectángulo'); // the rectangle itself survives
  });

  test('Cancelar rolls the preview back', async () => {
    const { page } = ctx;
    await addFromFx(page, /Distorsionar/, /Redondear/);
    await expect(modifierRows(page)).toHaveCount(1); // live preview
    await page.getByTestId('mod-cancel').click();
    await expect(modifierRows(page)).toHaveCount(0);
  });

  test('Aplicar modificadores (Alt+Ctrl+E) makes the result real geometry', async () => {
    const { page } = ctx;
    await addFromFx(page, /Distorsionar/, /Redondear/);
    await page.getByTestId('mod-ok').click();
    await expect(modifierRows(page)).toHaveCount(1);
    await page.keyboard.press('Control+Alt+e');
    await expect(modifierRows(page)).toHaveCount(0);
    await expect(typeLabel(page)).toContainText('Trazado');
  });

  test('Alt+click on a shape mode makes a live pathfinder that Expandir turns into a path', async () => {
    const { page } = ctx;
    await page.keyboard.press('m');
    await drag(page, [-40, -20], [100, 90]);
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+Shift+F9');
    await expect(page.getByTestId('pathfinder-panel')).toBeVisible();
    await page.keyboard.down('Alt');
    await page.getByTestId('pf-unite').click();
    await page.keyboard.up('Alt');
    await expect(typeLabel(page)).toContainText('Grupo');
    await page.getByTestId('pf-expand').click();
    await expect(typeLabel(page)).toContainText('Trazado');
  });
});
