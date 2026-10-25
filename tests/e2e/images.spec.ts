import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';
import { redPng } from './png';

test.describe('placing images (Phase 11)', () => {
  let ctx: Launched;
  let file: string;
  test.beforeAll(async () => {
    file = path.join(mkdtempSync(path.join(tmpdir(), 'victoria-img-')), 'rojo.png');
    writeFileSync(file, redPng(200));
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('Archivo › Colocar puts the picture on the artboard, paints it, selects it and is undoable', async () => {
    const { app, page } = ctx;
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
    }, file);

    const redPixels = () =>
      page.getByTestId('canvas-content').evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 255) < 40 && (data[i + 2] ?? 255) < 40) n++;
        return n;
      });

    expect(await redPixels()).toBe(0);
    await page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } }); // focus the canvas
    await page.keyboard.press('Control+Shift+p');
    await expect.poll(redPixels).toBeGreaterThan(500);
    await expect(page.getByTestId('doc-dirty')).toHaveCount(1);

    await page.keyboard.press('Control+z');
    await expect.poll(redPixels).toBe(0);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(redPixels).toBeGreaterThan(500);
  });
});
