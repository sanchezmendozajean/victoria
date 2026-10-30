import { expect, test } from '@playwright/test';
import { launchApp, type Launched } from './launch';

test.describe('Atajos de teclado (Phase 12)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  const open = async () => {
    await ctx.page.getByTestId('menu-edit').click();
    await ctx.page.getByRole('menuitem', { name: /^Atajos de teclado…/ }).click();
    await expect(ctx.page.getByTestId('shortcuts-dialog')).toBeVisible();
  };
  const pressed = (name: string) => ctx.page.getByRole('button', { name, pressed: true });

  test('a shortcut can be changed by pressing the new keys, the old key stops working and it survives a reload', async () => {
    const { page } = ctx;
    await open();
    await page.getByTestId('shortcuts-search').fill('Pluma');
    const keys = page.getByTestId('shortcut-keys-tool.tool-pen');
    await expect(keys).toHaveText('P');
    await keys.click();
    await expect(keys).toContainText('Pulsa');
    await page.keyboard.press('Shift+P');
    await expect(keys).toHaveText('Mayús+P');
    await expect(page.getByTestId('shortcut-reset-tool.tool-pen')).toBeEnabled();
    await page.getByTestId('shortcuts-close').click();

    // The tooltip and the keyboard follow: P no longer picks the Pen, Mayús+P does.
    await page.keyboard.press('v');
    await expect(pressed('Selección')).toBeVisible();
    await page.keyboard.press('p');
    await expect(pressed('Selección')).toBeVisible();
    await page.keyboard.press('Shift+P');
    await expect(pressed('Pluma')).toBeVisible();

    await page.reload();
    await page.waitForSelector('[data-testid="titlebar"]');
    await page.keyboard.press('v');
    await page.keyboard.press('Shift+P');
    await expect(pressed('Pluma')).toBeVisible();
  });

  test('a key that is taken asks before moving: swapping gives the other action the key given up', async () => {
    const { page } = ctx;
    await open();
    await page.getByTestId('shortcuts-search').fill('Lazo');
    await page.getByTestId('shortcut-keys-tool.tool-lasso').click();
    await page.keyboard.press('v'); // the Selection tool's key
    await expect(page.getByTestId('shortcuts-clash')).toContainText('Selección');
    await page.getByTestId('shortcuts-swap').click();
    await expect(page.getByTestId('shortcut-keys-tool.tool-lasso')).toHaveText('V');
    await page.getByTestId('shortcuts-search').fill('Selección');
    await expect(page.getByTestId('shortcut-keys-tool.tool-select')).toHaveText('Q'); // the Lazo's old key

    // Resetting everything puts the defaults back.
    await page.getByTestId('shortcuts-reset-all').click();
    await expect(page.getByTestId('shortcut-keys-tool.tool-select')).toHaveText('V');
    await page.getByTestId('shortcuts-search').fill('Pluma');
    await expect(page.getByTestId('shortcut-keys-tool.tool-pen')).toHaveText('P');
    await page.getByTestId('shortcuts-close').click();
    await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0);
  });
});
