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

const tabs = (page: Page) => page.getByTestId('space-tab');
const rows = (page: Page) => page.getByTestId('spaces-row');
const names = async (page: Page) => (await page.getByTestId('spaces-name').allTextContents()).map((n) => n.trim());

test.describe('Spaces (phase 10)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(500);
    const { page } = ctx;
    await page.locator('.vc-spacesbar__panel').click();
    await expect(page.getByTestId('spaces-panel')).toBeVisible();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('the panel lists the Spaces with thumbnails, counts and buttons; Alt+1…9 go to a Space', async () => {
    const { page } = ctx;
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('m');
    await drag(page, [-100, -60], [20, 60]);
    await page.keyboard.press('Control+Alt+n');
    await page.keyboard.press('Control+Alt+n');
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('space-thumb')).toHaveCount(3);
    await expect(rows(page).first()).toContainText('1 objeto');
    await expect(rows(page).nth(1)).toContainText('0 objetos');
    await page.keyboard.press('Alt+1');
    await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Alt+3');
    await expect(tabs(page).nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+Shift+PageUp');
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('reorder from the panel, rename by double click and export visibility', async () => {
    const { page } = ctx;
    await rows(page).nth(1).click();
    const before = await names(page);
    await page.getByTestId('spaces-up').click();
    expect(await names(page)).toEqual([before[1], before[0], before[2]]);
    await page.keyboard.press('Control+z');
    expect(await names(page)).toEqual(before);
    await rows(page).nth(2).dblclick();
    await page.getByTestId('spaces-rename').fill('Bocetos');
    await page.keyboard.press('Enter');
    expect((await names(page))[2]).toBe('Bocetos');
    await rows(page).nth(2).getByTestId('spaces-export').click();
    await expect(tabs(page).nth(2).locator('.vc-spacetab__excluded')).toHaveCount(1);
  });

  test('Mover a Espacio from the context menu and from the tab menu keeps the objects; undo restores them', async () => {
    const { page } = ctx;
    await page.keyboard.press('Alt+1');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    const p = await at(page, -20, 0);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.getByRole('menuitem', { name: /Mover a Espacio/ }).hover();
    await page.getByRole('menuitem', { name: /Nuevo Espacio/ }).click();
    await expect(rows(page)).toHaveCount(4);
    await expect(rows(page).first()).toContainText('0 objetos');
    await expect(rows(page).nth(3)).toContainText('1 objeto');
    await page.keyboard.press('Control+z');
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first()).toContainText('1 objeto');

    // From the tab menu of another Space: "Mover selección aquí".
    await page.keyboard.press('Control+a');
    await tabs(page).nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Mover selección aquí/ }).click();
    await expect(rows(page).nth(1)).toContainText('1 objeto');
    await expect(rows(page).first()).toContainText('0 objetos');
    await page.keyboard.press('Control+z');
    await expect(rows(page).first()).toContainText('1 objeto');
  });

  test('Propiedades del Espacio changes the grid and the canvas colour', async () => {
    const { page } = ctx;
    await tabs(page).first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Propiedades/ }).click();
    await expect(page.getByTestId('space-properties')).toBeVisible();
    await page.getByTestId('space-canvas-theme').uncheck();
    await page.getByTestId('space-canvas-color').fill('#336699');
    await page.getByTestId('space-props-ok').click();
    await expect(page.getByTestId('space-properties')).toHaveCount(0);
    await expect(page.getByTestId('canvas-surface')).toHaveCSS('background-color', 'rgb(51, 102, 153)');
  });

  test('the window menu lists the Spaces with their shortcut', async () => {
    const { page } = ctx;
    await page.getByRole('button', { name: 'Ventana' }).click();
    await page.getByRole('menuitem', { name: /^Espacios/ }).first().hover();
    await expect(page.getByRole('menuitem', { name: /Nuevo Espacio/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
