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
});
