import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';
import { redPng } from './png';

test.describe('cropping and linking images (Phase 11)', () => {
  let ctx: Launched;
  let dir: string;
  test.beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'victoria-imgobj-'));
    const file = path.join(dir, 'rojo.png');
    writeFileSync(file, redPng(200));
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

  const redPixels = () =>
    ctx.page.getByTestId('canvas-content').evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 255) < 40 && (data[i + 2] ?? 255) < 40) n++;
      return n;
    });

  test('crop hides part of the picture, applying it keeps the cut and undo brings the group back', async () => {
    const { page } = ctx;
    await expect(page.getByTestId('image-link')).toHaveAttribute('data-state', 'embedded');
    await expect(page.getByTestId('image-ppi')).toContainText('ppp');
    await expect.poll(redPixels).toBeGreaterThan(500);
    const whole = await redPixels();

    await page.getByTestId('image-crop').click();
    await expect(page.getByTestId('image-inset-left')).toBeVisible();
    const field = page.getByTestId('image-inset-left');
    await field.fill('35'); // mm: about half of the 200 pt picture
    await field.press('Enter');
    await expect.poll(async () => (await redPixels()) / whole).toBeGreaterThan(0.3);
    await expect.poll(async () => (await redPixels()) / whole).toBeLessThan(0.7);
    const cropped = await redPixels();

    await page.getByTestId('image-crop-apply').click();
    await expect(page.getByTestId('image-inset-left')).toHaveCount(0);
    await expect.poll(async () => Math.abs((await redPixels()) - cropped) / cropped).toBeLessThan(0.05);

    await page.keyboard.press('Control+z'); // back to the crop
    await expect(page.getByTestId('image-inset-left')).toBeVisible();
    await page.getByTestId('image-crop-remove').click();
    await expect.poll(redPixels).toBeGreaterThan(whole * 0.95);
  });

  test('Desincrustar saves the picture and links to it; Incrustar brings it back inside', async () => {
    const { app, page } = ctx;
    const target = path.join(dir, 'vinculada.png');
    await app.evaluate(({ dialog }, saved) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: saved });
    }, target);
    await page.getByTestId('image-unembed').click();
    await expect(page.getByTestId('image-link')).toHaveAttribute('data-state', 'linked');
    expect(existsSync(target)).toBe(true);
    await page.getByTestId('image-embed').click();
    await expect(page.getByTestId('image-link')).toHaveAttribute('data-state', 'embedded');
  });
});

test.describe('placing linked images (Phase 11)', () => {
  test('with the preference on, Colocar links the file; the .vict leaves the pixels out and reading it brings them back from disk', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'victoria-linked-'));
    const picture = path.join(dir, 'rojo.png');
    const doc = path.join(dir, 'doc.vict');
    writeFileSync(picture, redPng(200));
    const { app, page } = await launchApp();
    try {
      await app.evaluate(({ dialog }, files) => {
        dialog.showOpenDialog = async (...args: unknown[]) => {
          const options = (args[1] ?? args[0]) as { filters?: Array<{ extensions: string[] }> };
          const isImages = options.filters?.some((f) => f.extensions.includes('png'));
          return { canceled: false, filePaths: [isImages ? files.picture : files.doc] };
        };
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.doc });
      }, { picture, doc });

      await page.keyboard.press('v'); // the Pen would add a point where we click
      await page.keyboard.press('Control+k');
      await page.getByTestId('pref-place-linked').check();
      await page.keyboard.press('Escape');
      await page.getByTestId('panel-group').nth(0).locator('[data-panel="properties"]').click();
      await page.keyboard.press('Control+Shift+p');
      await expect(page.getByTestId('image-link')).toHaveAttribute('data-state', 'linked');

      await page.keyboard.press('Control+s');
      await expect.poll(() => existsSync(doc)).toBe(true);
      // The file does not carry the picture.
      expect(Object.keys(unzipSync(readFileSync(doc))).filter((name) => name.startsWith('images/'))).toEqual([]);

      await page.keyboard.press('Control+w');
      await expect(page.getByTestId('start-screen')).toBeVisible();
      await page.keyboard.press('Control+o');
      await expect(page.getByTestId('canvas-surface')).toBeVisible();
      await page.keyboard.press('v'); // the Pen would add a point where we click
      await page.keyboard.press('Control+a');
      await expect(page.getByTestId('image-link')).toHaveAttribute('data-state', 'linked');
    } finally {
      await app.close();
    }
  });
});
