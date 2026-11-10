import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './launch';

async function draw(page: Page, from: [number, number], to: [number, number]) {
  const b = (await page.getByTestId('canvas-surface').boundingBox())!;
  await page.keyboard.press('m');
  await page.mouse.move(b.x + from[0], b.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + to[0], b.y + to[1], { steps: 6 });
  await page.mouse.up();
}

test('Objeto › Trazado compuesto › Crear (Ctrl+8) makes one object from several; Liberar gives them back', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  try {
    await draw(page, [350, 250], [420, 330]);
    await draw(page, [500, 300], [580, 400]);
    await draw(page, [350, 450], [420, 520]);
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('control-type')).toContainText('3 objetos');

    await page.keyboard.press('Control+8');
    await expect(page.getByTestId('control-type')).toContainText('Trazado compuesto');

    // Back to separate paths from the menu.
    await page.getByTestId('menu-object').click();
    await page.getByRole('menuitem', { name: /Trazado compuesto/ }).hover();
    await page.getByRole('menuitem', { name: 'Liberar' }).first().click();
    await expect(page.getByTestId('control-type')).toContainText('3 objetos');

    // One undo brings the compound path back.
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('control-type')).toContainText('Trazado compuesto');
  } finally {
    await ctx.app.close();
  }
});
