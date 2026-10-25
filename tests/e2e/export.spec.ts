import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;

async function drawRect(page: Page) {
  await page.keyboard.press('m');
  const b = await surface(page);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx - 150, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy - 50, { steps: 3 });
  await page.mouse.move(cx - 90, cy - 30, { steps: 3 });
  await page.mouse.up();
}

async function openFileMenu(page: Page, item: RegExp) {
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Makes the native save dialog answer with `file` (the real one cannot be driven from a test). */
const answerSave = (ctx: Launched, file: string) =>
  ctx.app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);

const answerFolder = (ctx: Launched, folder: string) =>
  ctx.app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, folder);

/** Dismisses the "se exportó…" message. */
async function confirmDone(page: Page) {
  await expect(page.getByTestId('dialog').filter({ hasText: /Se export/ })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('dialog-ok').click();
}

/** Width, height and ppi of a PNG, read from its IHDR and pHYs chunks. */
function pngInfo(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const at = bytes.indexOf('pHYs');
  const ppi = at > 0 ? Math.round(bytes.readUInt32BE(at + 4) * 0.0254) : null;
  return { width, height, ppi };
}

test.describe('export (Phase 11)', () => {
  let ctx: Launched;
  let out: string;
  test.beforeAll(async () => {
    out = mkdtempSync(path.join(tmpdir(), 'victoria-export-'));
    ctx = await launchApp();
    await drawRect(ctx.page);
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('Exportar como… PNG at 150 ppi writes a picture of the artboard size with its resolution', async () => {
    const { page } = ctx;
    const file = path.join(out, 'mesa.png');
    await answerSave(ctx, file);
    await openFileMenu(page, /^Exportar…/);
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.getByTestId('export-ppi-150').click();
    await page.getByTestId('export-run').click();
    await confirmDone(page);
    const info = pngInfo(readFileSync(file));
    expect(info.ppi).toBe(150);
    // The default artboard is an A4 sheet: 595.28 × 841.89 pt → 150 ppi.
    expect(info.width).toBe(Math.round((595.28 * 150) / 72));
    expect(info.height).toBe(Math.round((841.89 * 150) / 72));
    await expect(page.getByTestId('export-dialog')).toBeHidden();
  });

  test('SVG and PDF come out as valid documents with the drawing in them', async () => {
    const { page } = ctx;
    const svg = path.join(out, 'mesa.svg');
    await answerSave(ctx, svg);
    await openFileMenu(page, /^Exportar…/);
    await page.getByTestId('export-format').selectOption('svg');
    await page.getByTestId('export-run').click();
    await confirmDone(page);
    const text = readFileSync(svg, 'utf8');
    expect(text.startsWith('<?xml')).toBe(true);
    expect(text).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(text).toMatch(/viewBox="0 0 595\.28 841\.89"|viewBox="0 0 595\.\d+ 841\.\d+"/);
    expect(text).toContain('<path');

    const pdf = path.join(out, 'mesa.pdf');
    await answerSave(ctx, pdf);
    await openFileMenu(page, /^Exportar…/);
    await page.getByTestId('export-format').selectOption('pdf');
    await page.getByTestId('export-run').click();
    await confirmDone(page);
    const bytes = readFileSync(pdf);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('/Type /Page');
  });

  test('Exportar para pantallas writes every chosen format of every chosen artboard into the folder', async () => {
    const { page } = ctx;
    const folder = mkdtempSync(path.join(out, 'screens-'));
    await answerFolder(ctx, folder);
    await openFileMenu(page, /^Exportar para pantallas…/);
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await expect(page.getByTestId('export-run')).toBeDisabled(); // no folder yet
    await page.getByTestId('export-choose-folder').click();
    await expect(page.getByTestId('export-folder')).toContainText(path.basename(folder));
    await page.getByTestId('export-add-format').click(); // PNG 2x
    await page.getByTestId('export-add-format').click();
    await page.getByTestId('export-row-format-2').selectOption('svg');
    await page.getByTestId('export-open').uncheck();
    await page.getByTestId('export-run').click();
    await confirmDone(page);
    const names = readdirSync(folder).sort();
    expect(names).toHaveLength(3);
    expect(names.some((n) => n.endsWith('Mesa 1.png'))).toBe(true);
    expect(names.some((n) => n.endsWith('Mesa 1@2x.png'))).toBe(true);
    expect(names.some((n) => n.endsWith('Mesa 1@2x.svg'))).toBe(true);
    const png2x = readFileSync(path.join(folder, names.find((n) => n.endsWith('@2x.png')) as string));
    expect(pngInfo(png2x).ppi).toBe(144);
    expect(existsSync(path.join(folder, names[0] as string))).toBe(true);
  });

  test('text is exported as outlines in the SVG, not as live text', async () => {
    const { page } = ctx;
    await page.keyboard.press('t');
    const b = await surface(page);
    await page.mouse.click(b.x + b.width / 2 - 100, b.y + b.height / 2 + 120);
    await page.keyboard.type('Victoria');
    await page.keyboard.press('Escape');
    const svg = path.join(out, 'texto.svg');
    await answerSave(ctx, svg);
    await openFileMenu(page, /^Exportar…/);
    await page.getByTestId('export-format').selectOption('svg');
    await page.getByTestId('export-run').click();
    await confirmDone(page);
    const text = readFileSync(svg, 'utf8');
    expect(text).not.toContain('<text');
    // The rectangle plus the glyphs of "Victoria": curves, which the rectangle does not have.
    expect((text.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/d="M[^"]*C[^"]*"/);
  });

  test('Guardar una copia… writes a .vict and the document stays unsaved', async () => {
    const { page } = ctx;
    const file = path.join(out, 'copia.vict');
    await answerSave(ctx, file);
    await openFileMenu(page, /^Guardar una copia/);
    await expect.poll(() => existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 2).toString()).toBe('PK'); // a ZIP, like every .vict
    await expect(page.getByTestId('doc-dirty')).toHaveCount(1);
  });
});
