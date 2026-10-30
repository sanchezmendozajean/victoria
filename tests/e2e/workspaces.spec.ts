import { expect, test } from '@playwright/test';
import { launchApp, type Launched } from './launch';

test.describe('workspaces (Phase 12)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  const pick = async (name: string) => {
    await ctx.page.getByTestId('workspace-selector').click();
    await ctx.page.getByRole('menuitem', { name }).click();
  };

  test('each workspace arranges the panels its own way, keeps what you changed, and is remembered after a reload', async () => {
    const { page } = ctx;
    await expect(page.getByTestId('workspace-selector')).toContainText('Esenciales');
    await expect(page.locator('[data-group="g1"] [data-panel="layers"]')).toBeVisible();

    await pick('Texto');
    await expect(page.getByTestId('workspace-selector')).toContainText('Texto');
    // Texto opens Carácter first.
    await expect(page.locator('[data-group="g1"] [data-panel="character"]')).toBeVisible();
    await expect(page.getByTestId('panel-body-character')).toBeVisible();

    // A change made here (closing the first group) stays with this workspace.
    await page.locator('[data-group="g1"]').getByTestId('group-toggle').click();
    await expect(page.getByTestId('panel-body-character')).toHaveCount(0);

    await pick('Esenciales');
    await expect(page.locator('[data-group="g1"] [data-panel="layers"]')).toBeVisible();
    await pick('Texto');
    await expect(page.getByTestId('panel-body-character')).toHaveCount(0);

    await page.reload();
    await page.waitForSelector('[data-testid="titlebar"]');
    await expect(page.getByTestId('workspace-selector')).toContainText('Texto');
    await expect(page.locator('[data-group="g1"] [data-panel="character"]')).toBeVisible();
    await expect(page.getByTestId('panel-body-character')).toHaveCount(0);
  });

  test('a workspace can be saved with a name, brings the arrangement back, is remembered and can be deleted', async () => {
    const { page } = ctx;
    await pick('Esenciales');
    // Arrange the panels: close the first group, then save it.
    await page.locator('[data-group="g1"]').getByTestId('group-toggle').click();
    await expect(page.getByTestId('panel-body-layers')).toHaveCount(0);

    await page.getByTestId('workspace-selector').click();
    await page.getByRole('menuitem', { name: /^Guardar espacio de trabajo…/ }).click();
    await page.getByTestId('text-prompt-input').fill('Mi diseño');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('workspace-selector')).toContainText('Mi diseño');

    // Another workspace, then back: the saved arrangement returns.
    await pick('Impresión');
    await expect(page.getByTestId('workspace-selector')).toContainText('Impresión');
    await pick('Mi diseño');
    await expect(page.locator('[data-group="g1"] [data-panel="layers"]')).toBeVisible();
    await expect(page.getByTestId('panel-body-layers')).toHaveCount(0);

    await page.reload();
    await page.waitForSelector('[data-testid="titlebar"]');
    await expect(page.getByTestId('workspace-selector')).toContainText('Mi diseño');

    await page.getByTestId('workspace-selector').click();
    await page.getByRole('menuitem', { name: /^Eliminar «Mi diseño»/ }).click();
    await expect(page.getByTestId('workspace-selector')).toContainText('Esenciales');
    await page.getByTestId('workspace-selector').click();
    await expect(page.getByRole('menuitem', { name: 'Mi diseño' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});
