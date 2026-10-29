import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
  <rect x="20" y="20" width="120" height="80" fill="#ff0000"/>
  <circle cx="220" cy="100" r="50" fill="url(#g)"/>
</svg>`;

const tabs = (page: Page) => page.locator('[data-testid="doc-tabs"] [role="tab"]');

/** Pixels of the content canvas that pass `test` (red, or any blue-ish colour of the gradient). */
const count = (page: Page, kind: 'red' | 'blue') =>
  page.getByTestId('canvas-content').evaluate((el, which) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i] as number, data[i + 1] as number, data[i + 2] as number, data[i + 3] as number];
      if (a < 250) continue;
      if (which === 'red' ? r > 200 && g < 60 && b < 60 : b > 150 && r < 90 && g < 60) n++;
    }
    return n;
  }, kind);

const answerOpen = (ctx: Launched, file: string) =>
  ctx.app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, file);

const answerSave = (ctx: Launched, file: string) =>
  ctx.app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);

test.describe('importing SVG and PDF (Phase 11)', () => {
  let ctx: Launched;
  let dir: string;
  let svgFile: string;
  test.beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'victoria-import-'));
    svgFile = path.join(dir, 'dibujo.svg');
    writeFileSync(svgFile, SVG);
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('Abrir an SVG gives a new unsaved document that paints the drawing', async () => {
    const { page } = ctx;
    await answerOpen(ctx, svgFile);
    await page.keyboard.press('Control+o');
    await expect(tabs(page).last()).toContainText('dibujo');
    await expect.poll(() => count(page, 'red')).toBeGreaterThan(300);
    await expect.poll(() => count(page, 'blue')).toBeGreaterThan(100); // the right end of the gradient
    await expect(page.getByTestId('doc-dirty')).toHaveCount(0); // opened, nothing changed yet
  });

  test('a PDF exported from it opens again, in the real app with the real pdf.js worker', async () => {
    const { page } = ctx;
    const pdf = path.join(dir, 'vuelta.pdf');
    await answerSave(ctx, pdf);
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: /^Exportar…/ }).click();
    await page.getByTestId('export-format').selectOption('pdf');
    await page.getByTestId('export-run').click();
    await expect(page.getByTestId('dialog').filter({ hasText: /Se export/ })).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('dialog-ok').click();

    await answerOpen(ctx, pdf);
    await page.keyboard.press('Control+o');
    await expect(tabs(page).last()).toContainText('vuelta', { timeout: 30_000 });
    await expect.poll(() => count(page, 'red'), { timeout: 15_000 }).toBeGreaterThan(300);
    await expect.poll(() => count(page, 'blue')).toBeGreaterThan(100); // the gradient survived the round trip
  });

  test('Colocar an SVG puts it in the current document as one object, centred, undoable', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+n');
    await expect(tabs(page).last()).toContainText('Sin título');
    await expect.poll(() => count(page, 'red')).toBe(0); // the new, empty document
    await answerOpen(ctx, svgFile);
    await page.keyboard.press('v'); // the Selection tool: a click on the empty canvas must not start a path
    await page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+Shift+p');
    await expect.poll(() => count(page, 'red')).toBeGreaterThan(300);
    await expect(page.getByTestId('control-type')).toContainText('dibujo.svg'); // one object, named after the file
    await page.keyboard.press('Control+z');
    await expect.poll(() => count(page, 'red')).toBe(0);
  });

  test('an SVG that is not an SVG is refused with a message', async () => {
    const { page } = ctx;
    const bad = path.join(dir, 'roto.svg');
    writeFileSync(bad, '<svg><g></svg>');
    await answerOpen(ctx, bad);
    const before = await tabs(page).count();
    await page.keyboard.press('Control+o');
    await expect(page.getByTestId('dialog').filter({ hasText: /No se pudo abrir/ })).toBeVisible();
    await page.getByTestId('dialog-ok').click();
    expect(await tabs(page).count()).toBe(before);
  });
});
