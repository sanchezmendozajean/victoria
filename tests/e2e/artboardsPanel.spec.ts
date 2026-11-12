import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

const rows = (page: Page) => page.getByTestId('artboards-row');

test.describe('Panel Mesas de trabajo', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(500);
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('lists the artboards; new, duplicate, rename, reorder, arrange and delete work and undo', async () => {
    const { page } = ctx;
    await page.locator('[data-panel="artboards"]').first().click();
    const panel = page.getByTestId('artboards-panel');
    await expect(panel).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('artboards-size').first()).toContainText('×');

    await page.getByTestId('artboards-new').click();
    await page.getByTestId('artboards-duplicate').click();
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('artboards-delete')).toBeEnabled();

    // Rename by double click.
    await rows(page).nth(1).dblclick();
    await page.getByTestId('artboards-rename').fill('Portada');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('artboards-name').nth(1)).toHaveText('Portada');

    // The selected row moves down (order of export and print).
    await page.getByTestId('artboards-up').click();
    await expect(page.getByTestId('artboards-name').first()).toHaveText('Portada');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('artboards-name').nth(1)).toHaveText('Portada');

    // Drag the last row to the top.
    await rows(page).nth(2).dragTo(rows(page).first(), { targetPosition: { x: 40, y: 2 } });
    await expect(page.getByTestId('artboards-index').first()).toHaveText('1');
    await expect(page.getByTestId('artboards-name').first()).not.toHaveText('Mesa 1');

    // Arrange in a single column.
    await page.getByTestId('artboards-arrange').click();
    await expect(page.getByTestId('arrange-dialog')).toBeVisible();
    await page.getByTestId('arrange-columns').fill('1');
    await page.keyboard.press('Enter');
    await page.getByTestId('arrange-ok').click();
    await expect(page.getByTestId('arrange-dialog')).toHaveCount(0);

    // The dialog belongs to the window: it stays open behind it.
    await expect(panel).toBeVisible();
    await page.getByTestId('artboards-fit-art').click(); // no artwork: nothing breaks
    await page.getByTestId('artboards-delete').click();
    await expect(rows(page)).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(rows(page)).toHaveCount(3);
  });

  test('the units selector changes the document units: the sizes follow, one undo step each', async () => {
    const { page } = ctx;
    if (!(await page.getByTestId('artboards-panel').isVisible())) await page.locator('[data-panel="artboards"]').first().click();
    const units = page.getByTestId('artboards-units');
    await expect(units).toBeVisible();
    const before = await units.inputValue();
    await units.selectOption('pt');
    await expect(page.getByTestId('artboards-size').first()).toContainText('pt');
    await units.selectOption('in');
    await expect(page.getByTestId('artboards-size').first()).toContainText('in');
    await page.keyboard.press('Control+z');
    await expect(units).toHaveValue('pt');
    await page.keyboard.press('Control+z');
    await expect(units).toHaveValue(before);
  });

  test('the move-artwork toggle and the Rearrange values survive a reload', async () => {
    const { page } = ctx;
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+O');
    const toggle = page.getByTestId('artboard-move-art');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await page.locator('[data-panel="artboards"]').first().click();
    await page.getByTestId('artboards-arrange').click();
    await page.getByTestId('arrange-direction').selectOption('column');
    await page.getByTestId('arrange-artwork').uncheck();
    await page.getByTestId('arrange-ok').click();

    await page.reload();
    await page.waitForSelector('[data-testid="titlebar"]');
    await page.keyboard.press('Shift+O');
    await expect(page.getByTestId('artboard-move-art')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-panel="artboards"]').first().click();
    await page.getByTestId('artboards-new').click();
    await page.getByTestId('artboards-arrange').click();
    await expect(page.getByTestId('arrange-direction')).toHaveValue('column');
    await expect(page.getByTestId('arrange-artwork')).not.toBeChecked();
    await page.keyboard.press('Escape');

    // Preferencias shows the same setting and can change it.
    await page.keyboard.press('Control+k');
    const pref = page.getByTestId('pref-move-artwork');
    await expect(pref).not.toBeChecked();
    await pref.check();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+O');
    await expect(page.getByTestId('artboard-move-art')).toHaveAttribute('aria-pressed', 'true');
  });
});
