import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

test.describe('start screen (Phase 12)', () => {
  let ctx: Launched;
  let file: string;
  test.beforeAll(async () => {
    file = path.join(mkdtempSync(path.join(tmpdir(), 'victoria-start-')), 'cartel.vict');
    ctx = await launchApp();
    await ctx.app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, file);
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('closing the last document shows it; a card makes a new document; a saved one comes back from Recientes', async () => {
    const { page } = ctx;
    await page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+s');
    await expect.poll(() => existsSync(file)).toBe(true);

    await page.keyboard.press('Control+w');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await expect(page.getByTestId('canvas-surface')).toHaveCount(0);

    // The saved document is offered again, and opens.
    await expect(page.getByTestId('start-recent-item').first()).toContainText('cartel');
    // Saving put a preview inside the file; the list shows it.
    await expect(page.getByTestId('start-thumb').first()).toBeVisible();
    expect(await page.getByTestId('start-thumb').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.getByTestId('start-recent-item').first().click();
    await expect(page.getByTestId('start-screen')).toHaveCount(0);
    await expect(page.getByTestId('canvas-surface')).toBeVisible();
    await expect(page.getByTestId('doc-tabs')).toContainText('cartel');

    // A preset card creates a document with that artboard.
    await page.keyboard.press('Control+w');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await page.getByTestId('start-new-Instagram').click();
    await expect(page.getByTestId('canvas-surface')).toBeVisible();
  });
});
