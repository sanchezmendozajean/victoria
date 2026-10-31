import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { geometryBounds, nodeGeometry, sequentialIds, type Node } from '../../src/core';
import { launchApp, type Launched } from './launch';

const MM = 72 / 25.4;
const A4 = { w: 595.28, h: 841.89 };

/** What Chromium prints: the PDF it makes of the pages, read back with the app's own PDF importer (Node build of pdf.js). */
async function readPrinted(file: string) {
  const [{ readPdf }, pdfjs] = await Promise.all([import('../../src/renderer/import/pdfjs'), import('pdfjs-dist/legacy/build/pdf.mjs')]);
  return readPdf(new Uint8Array(readFileSync(file)), sequentialIds('t'), pdfjs as never);
}

const boundsOf = (n: Node): [number, number, number, number] => {
  const geometry = nodeGeometry(n);
  const b = geometry ? geometryBounds(geometry) : null;
  if (!b) return [0, 0, 0, 0];
  const t = n.transform;
  const xs = [b.minX, b.maxX].flatMap((x) => [b.minY, b.maxY].map((y) => t[0] * x + t[2] * y + t[4]));
  const ys = [b.minX, b.maxX].flatMap((x) => [b.minY, b.maxY].map((y) => t[1] * x + t[3] * y + t[5]));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => (n.type === 'group' || n.type === 'clipGroup' ? walk(n.children) : [n]));

async function openPrint(page: Page) {
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: /^Imprimir…/ }).click();
  await expect(page.getByTestId('print-dialog')).toBeVisible();
}

test.describe('printing (Phase 11)', () => {
  let ctx: Launched;
  let dir: string;
  let out: string;
  /** Where the square sits on the artboard (its centre, mm), as the control bar shows it. */
  let centreMm = { x: 0, y: 0 };
  test.beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'victoria-print-'));
    out = path.join(dir, 'job.pdf');
    ctx = await launchApp({ VICTORIA_PRINT_TO_PDF: out });
    const { page } = ctx;
    // A 100 mm × 100 mm square (the acceptance case of the plan), made with the exact-size dialog of the Rectangle tool.
    await page.keyboard.press('m');
    const b = (await page.getByTestId('canvas-surface').boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.getByTestId('shape-dialog')).toBeVisible();
    for (const id of ['shape-w', 'shape-h']) {
      await page.getByTestId(id).fill('100');
      await page.keyboard.press('Enter');
    }
    await page.getByTestId('shape-ok').click();
    await expect(page.getByTestId('shape-dialog')).toHaveCount(0);
    const field = async (id: string) => Number.parseFloat((await page.getByTestId(id).inputValue()).replace(',', '.'));
    centreMm = { x: await field('field-x'), y: await field('field-y') };
  });
  test.afterAll(async () => {
    await ctx.app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('a 100 mm square is 100 mm on an A4 page at 100 %, in the place it has on the artboard, as Chromium prints it', async () => {
    const { page } = ctx;
    await openPrint(page);
    await expect(page.getByTestId('print-preview').locator('img')).toBeVisible();
    await expect(page.getByTestId('print-page')).toContainText('Página 1 de 1');
    await page.getByTestId('print-run').click();
    await expect(page.getByTestId('print-dialog')).toBeHidden({ timeout: 30_000 });
    expect(existsSync(out)).toBe(true);

    const { pages } = await readPrinted(out);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.width).toBeCloseTo(A4.w, 0);
    expect(pages[0]!.height).toBeCloseTo(A4.h, 0);
    const square = walk(pages[0]!.nodes).map(boundsOf).find(([x0, , x1]) => Math.abs(x1 - x0 - 100 * MM) < 1.5);
    expect(square, 'a shape 100 mm wide').toBeDefined();
    const [x0, y0, x1, y1] = square!;
    expect(x1 - x0).toBeCloseTo(100 * MM, 0);
    expect(y1 - y0).toBeCloseTo(100 * MM, 0);
    // The artboard is the sheet (A4 on A4, 100 %): the square is where it is on the artboard.
    expect((x0 + x1) / 2).toBeCloseTo(centreMm.x * MM, 0);
    expect((y0 + y1) / 2).toBeCloseTo(centreMm.y * MM, 0);
  });

  test('crop marks go outside the trim, and the position grid moves the artwork', async () => {
    const { page } = ctx;
    rmSync(out, { force: true });
    await openPrint(page);
    // The artboard is the sheet: with nothing to spare the position grid does nothing (and says so).
    await page.getByTestId('print-marks').check();
    await expect(page.getByTestId('print-anchor-00')).toBeDisabled();
    await page.getByTestId('print-scale-custom').click();
    await page.getByTestId('print-percent').fill('50');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('print-dialog')).toBeVisible();
    await page.getByTestId('print-anchor-00').click(); // top left
    await page.getByTestId('print-run').click();
    await expect(page.getByTestId('print-dialog')).toBeHidden({ timeout: 30_000 });
    const { pages } = await readPrinted(out);
    const boxes = walk(pages[0]!.nodes).map(boundsOf);
    // Marks start 3 mm from the trim and are 5 mm long: the artboard starts 8 mm in (top left); the square is 50 mm now.
    const margin = 8 * MM;
    const square = boxes.find(([x0, , x1]) => Math.abs(x1 - x0 - 50 * MM) < 1.5)!;
    expect((square[0] + square[2]) / 2).toBeCloseTo(margin + (centreMm.x * MM) / 2, 0);
    expect((square[1] + square[3]) / 2).toBeCloseTo(margin + (centreMm.y * MM) / 2, 0);
    // The marks are one stroked path of eight lines that starts at the page edge (a mark begins 3 mm before the trim, 5 mm long).
    expect(boxes.some(([x0, y0, x1]) => x0 < 1 && y0 < 1 && x1 - x0 > 100)).toBe(true);
  });

  test('the dialog checks the range, warns about artwork that does not fit, and the warning fixes it', async () => {
    const { page } = ctx;
    await openPrint(page);
    await expect(page.getByTestId('print-warnings')).toHaveCount(0);
    await page.getByTestId('print-scope-range').click();
    await page.getByTestId('print-range').fill('x');
    await expect(page.getByTestId('print-range-error')).toHaveText('«x» no es un número ni un rango válido.');
    await expect(page.getByTestId('print-run')).toBeDisabled();
    await page.getByTestId('print-range').fill('5');
    await expect(page.getByTestId('print-range-error')).toContainText('se sale de ese rango');
    await page.getByTestId('print-range').fill('1');
    await expect(page.getByTestId('print-range-error')).toHaveCount(0);
    await expect(page.getByTestId('print-run')).toBeEnabled();
    await page.getByTestId('print-scope-active').click();

    await page.getByTestId('print-paper').selectOption('a5');
    await page.getByTestId('print-scale-custom').click();
    await page.getByTestId('print-percent').fill('300'); // an A4 artboard on A5 at 300 %
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('print-dialog')).toBeVisible();
    await expect(page.getByTestId('print-warnings')).toHaveText('1 advertencia');
    await page.getByTestId('print-warnings').click();
    await expect(page.getByTestId('print-warning-clip')).toContainText('se sale del área imprimible');
    await page.getByTestId('print-warning-clip-action').click();
    // Fitting the sheet solves it: no warnings left, the popover is gone and the scale shown is the real one.
    await expect(page.getByTestId('print-warnings')).toHaveCount(0);
    await expect(page.getByTestId('print-warnings-popover')).toHaveCount(0);
    await expect(page.getByTestId('print-percent')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('print-dialog')).toBeHidden();
  });

  test('the dialog keeps its size, remembers the paper per document, and Escape cancels', async () => {
    const { page } = ctx;
    await openPrint(page);
    await expect(page.getByTestId('print-paper')).toHaveValue('a5');
    const box = async () => (await page.getByRole('dialog', { name: 'Imprimir' }).boundingBox())!;
    const before = await box();
    await page.getByTestId('print-scope-range').click();
    await page.getByTestId('print-copies').fill('2');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('print-collate')).toBeVisible();
    await page.getByTestId('print-scope-all').click();
    const after = await box();
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
    await expect(page.getByTestId('print-summary')).toContainText('2 copias intercaladas');
    await page.getByTestId('print-cancel').click();
    await expect(page.getByTestId('print-dialog')).toBeHidden();
  });
});
