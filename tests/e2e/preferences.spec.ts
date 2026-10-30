import { expect, test } from '@playwright/test';
import { launchApp, type Launched } from './launch';

test.describe('Preferencias (Phase 12)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('Ctrl+K opens the dialog; changes are remembered after reloading and Restablecer brings the defaults back', async () => {
    const { page } = ctx;
    await page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('preferences-dialog')).toBeVisible();
    await expect(page.getByTestId('prefs-reset')).toBeDisabled();
    await page.getByTestId('pref-auto-add-delete').uncheck();
    const fidelity = page.getByTestId('pref-pencil-fidelity');
    await fidelity.fill('5');
    await fidelity.press('Enter');
    await page.getByTestId('pref-autosave').fill('7');
    await page.getByTestId('pref-autosave').press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preferences-dialog')).toHaveCount(0);

    await page.reload();
    await page.waitForSelector('[data-testid="titlebar"]');
    await page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('pref-auto-add-delete')).not.toBeChecked();
    await expect(page.getByTestId('pref-pencil-fidelity')).toHaveValue('5');
    await expect(page.getByTestId('pref-autosave')).toHaveValue('7');

    await page.getByTestId('prefs-reset').click();
    await expect(page.getByTestId('pref-auto-add-delete')).toBeChecked();
    await expect(page.getByTestId('pref-pencil-fidelity')).toHaveValue('3');
    await expect(page.getByTestId('pref-autosave')).toHaveValue('1');
    await page.getByTestId('prefs-close').click();
    await expect(page.getByTestId('preferences-dialog')).toHaveCount(0);
  });
});
