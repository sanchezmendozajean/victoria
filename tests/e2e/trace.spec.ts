import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';
import { squarePng } from './png';

test.describe('Calco de imagen (Phase 11)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'victoria-trace-')), 'cuadro.png');
    writeFileSync(file, squarePng(160));
    ctx = await launchApp();
    await ctx.app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
    }, file);
    await ctx.page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } });
    await ctx.page.keyboard.press('Control+Shift+p');
    await ctx.page.getByTestId('panel-group').nth(0).locator('[data-panel="properties"]').click();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  const colours = () =>
    ctx.page.getByTestId('canvas-content').evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let blue = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 255) < 40 && (data[i + 2] ?? 255) < 40) red++;
        if ((data[i + 2] ?? 0) > 200 && (data[i] ?? 255) < 40 && (data[i + 1] ?? 255) < 40) blue++;
      }
      return { red, blue };
    });

  test('traces the picture in a worker into live paths with the same look, retraces on a setting change and expands', async () => {
    const { page } = ctx;
    await expect.poll(async () => (await colours()).red).toBeGreaterThan(500);
    const before = await colours();

    await page.getByTestId('trace-run').click();
    // The picture is gone: what is on the canvas now is paths, in the same two colours.
    await expect(page.getByTestId('trace-preset')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => Math.abs((await colours()).red - before.red) / before.red).toBeLessThan(0.05);
    expect(Math.abs((await colours()).blue - before.blue) / before.blue).toBeLessThan(0.05);

    // Changing a setting traces again (one colour left: the red square disappears into the blue).
    await page.getByTestId('trace-colors').fill('2');
    await page.getByTestId('trace-colors').press('Enter');
    await expect(page.getByTestId('trace-progress')).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId('trace-mode').selectOption('bw');
    await expect(page.getByTestId('trace-threshold')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('trace-expand').click();
    await expect(page.getByTestId('trace-preset')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('trace-preset')).toBeVisible();
    await page.keyboard.press('Control+z'); // back through the retraces
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('trace-run')).toBeVisible();
    await expect.poll(async () => (await colours()).red).toBeGreaterThan(before.red * 0.95);
  });
});
