import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

const SAMPLES = path.join(__dirname, '../../samples');

async function openSample(ctx: Launched, file: string): Promise<void> {
  await ctx.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, path.join(SAMPLES, file));
  await ctx.page.keyboard.press('Control+o');
  await expect(ctx.page.locator('[data-testid="doc-tabs"] [role="tab"]').last()).toContainText(file);
  await ctx.page.waitForTimeout(250);
}

const answerSave = (ctx: Launched, file: string) =>
  ctx.app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);

async function exportAs(page: Page, ctx: Launched, file: string, format: 'png' | 'svg' | 'pdf', ppi?: number) {
  await answerSave(ctx, file);
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: /^Exportar…/ }).click();
  await page.getByTestId('export-format').selectOption(format);
  if (format === 'png') {
    await page.getByTestId('export-background').selectOption('white');
    if (ppi) {
      const field = page.getByTestId('export-ppi');
      await field.click();
      await field.fill(String(ppi));
      await field.press('Enter');
    }
  }
  await page.getByTestId('export-run').click();
  await expect(page.getByTestId('dialog').filter({ hasText: /Se export/ })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('dialog-ok').click();
}

/**
 * Specs/12 · Riesgos: "Diferencias lienzo/exportación → un único pipeline de geometría evaluada".
 * The PNG is painted by the canvas code; the SVG is drawn by Chromium from the exported file. Both come from
 * the same document, and they must look the same.
 */
test('the exported SVG, drawn by Chromium, matches the PNG painted by the canvas', async () => {
  const ctx = await launchApp();
  try {
    const { page } = ctx;
    await openSample(ctx, 'demo.vict');
    const dir = mkdtempSync(path.join(tmpdir(), 'victoria-parity-'));
    const png = path.join(dir, 'a.png');
    const svg = path.join(dir, 'a.svg');
    await exportAs(page, ctx, png, 'png', 144);
    await exportAs(page, ctx, svg, 'svg');

    const result = await ctx.app.evaluate(
      async ({ BrowserWindow, nativeImage }, files) => {
        const expected = nativeImage.createFromBuffer(Buffer.from(files.png, 'base64'));
        const { width, height } = expected.getSize();
        const win = new BrowserWindow({ show: false, width, height, useContentSize: true, frame: false, backgroundColor: '#ffffff', webPreferences: { offscreen: false, zoomFactor: 1 } });
        const html = `<html><body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${files.svg}" style="display:block;width:${width}px;height:${height}px"></body></html>`;
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        await new Promise((r) => setTimeout(r, 400));
        const shot = (await win.webContents.capturePage()).resize({ width, height });
        win.destroy();
        const a = expected.toBitmap();
        const b = shot.toBitmap();
        let sum = 0;
        let off = 0;
        for (let i = 0; i < a.length; i += 4) {
          const d = (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) + Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) + Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0))) / 3;
          sum += d;
          if (d > 64) off++;
        }
        const pixels = a.length / 4;
        const dark = (() => {
          let n = 0;
          for (let i = 0; i < a.length; i += 4) if ((a[i] ?? 255) < 128) n++;
          return n;
        })();
        return { width, height, mean: sum / pixels, offFraction: off / pixels, dark, same: a.length === b.length };
      },
      { png: readFileSync(png).toString('base64'), svg: readFileSync(svg).toString('base64') },
    );
    expect(result.same).toBe(true);
    expect(result.dark).toBeGreaterThan(200); // the drawing is really there
    expect(result.mean).toBeLessThan(3);
    expect(result.offFraction).toBeLessThan(0.02);
  } finally {
    await ctx.app.close();
  }
});
