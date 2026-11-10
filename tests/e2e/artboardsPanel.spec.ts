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

    // Arrange in a single column.
    await page.getByTestId('artboards-arrange').click();
    await expect(page.getByTestId('arrange-dialog')).toBeVisible();
    await page.getByTestId('arrange-columns').fill('1');
    await page.keyboard.press('Enter');
    await page.getByTestId('arrange-ok').click();
    await expect(page.getByTestId('arrange-dialog')).toHaveCount(0);

    // A panel of the strip closes on outside clicks (the dialog was one): open it again.
    await page.locator('[data-panel="artboards"]').first().click();
    await expect(panel).toBeVisible();
    await page.getByTestId('artboards-fit-art').click(); // no artwork: nothing breaks
    await page.getByTestId('artboards-delete').click();
    await expect(rows(page)).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(rows(page)).toHaveCount(3);
  });
});
