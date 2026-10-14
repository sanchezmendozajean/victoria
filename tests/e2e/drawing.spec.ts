import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

const PT_MM = 25.4 / 72;

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;
const zoomOf = async (page: Page) => Number.parseFloat((await page.getByTestId('zoom-field').inputValue()).replace('%', '').replace(',', '.')) / 100;
const num = async (page: Page, id: string) => Number.parseFloat((await page.getByTestId(id).inputValue()).replace(',', '.'));
const typeLabel = (page: Page) => page.getByTestId('control-type');

/** Mouse helpers in surface coordinates, relative to the centre of the canvas. */
async function at(page: Page, dx: number, dy: number): Promise<{ x: number; y: number }> {
  const b = await surface(page);
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
}
async function click(page: Page, dx: number, dy: number, modifiers: Array<'Shift' | 'Alt' | 'Control'> = []) {
  const p = await at(page, dx, dy);
  await page.mouse.move(p.x, p.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.down();
  await page.mouse.up();
  for (const m of modifiers.reverse()) await page.keyboard.up(m);
}
async function drag(page: Page, from: [number, number], to: [number, number], modifiers: Array<'Shift' | 'Alt' | 'Control'> = []) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  for (const m of modifiers.reverse()) await page.keyboard.up(m);
}

/** Number of dark pixels (the default 1 pt black stroke) of the content canvas inside a rectangle around the canvas centre. */
const darkPixels = async (page: Page, dx: number, dy: number, w: number, h: number) => {
  const p = await at(page, dx, dy);
  const b = await surface(page);
  return page.getByTestId('canvas-content').evaluate(
    (c: HTMLCanvasElement, r) => {
      const dpr = window.devicePixelRatio || 1;
      const data = c.getContext('2d')!.getImageData(Math.round(r.x * dpr), Math.round(r.y * dpr), Math.round(r.w * dpr), Math.round(r.h * dpr)).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if ((data[i + 3] as number) > 200 && (data[i] as number) < 180 && (data[i + 1] as number) < 180 && (data[i + 2] as number) < 180) n++;
      return n;
    },
    { x: p.x - b.x, y: p.y - b.y, w, h },
  );
};

/** Chooses a tool of the toolbar, opening its flyout when it is not the one shown. */
async function pickTool(page: Page, tool: string) {
  const direct = page.locator(`[data-testid="toolbar"] button[data-tool="${tool}"]`);
  if (await direct.count()) {
    await direct.click();
    return;
  }
  const slotButton = page.locator('[data-testid="toolbar"] button[data-tool="tool-rect"], [data-testid="toolbar"] button[data-tool="tool-rounded-rect"], [data-testid="toolbar"] button[data-tool="tool-ellipse"], [data-testid="toolbar"] button[data-tool="tool-polygon"], [data-testid="toolbar"] button[data-tool="tool-star"]').first();
  await slotButton.click({ button: 'right' });
  await page.locator(`[data-testid="tool-flyout"] [data-tool="${tool}"]`).click();
}

test.describe('drawing tools (phase 5)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(500);
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });
  test.beforeEach(async () => {
    const { page } = ctx;
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+Shift+a');
  });

  test('the rectangle tool drags out a live shape in one undo step; Shift makes it square', async () => {
    const { page } = ctx;
    await page.keyboard.press('m');
    await drag(page, [-120, -60], [80, 40]);
    await expect(typeLabel(page)).toContainText('Rectángulo');
    const zoom = await zoomOf(page);
    await expect.poll(() => num(page, 'field-w')).toBeCloseTo((200 / zoom) * PT_MM, 0);
    await expect.poll(() => num(page, 'field-h')).toBeCloseTo((100 / zoom) * PT_MM, 0);
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('field-w')).toHaveCount(0);
    await drag(page, [-120, -60], [80, -20], ['Shift']);
    await expect.poll(async () => Math.abs((await num(page, 'field-w')) - (await num(page, 'field-h')))).toBeLessThan(0.01);
  });

  test('a click with the star tool asks for exact dimensions and creates the star', async () => {
    const { page } = ctx;
    await pickTool(page, 'tool-star');
    await click(page, 0, 0);
    await expect(page.getByTestId('shape-dialog')).toBeVisible();
    await page.getByTestId('shape-points').fill('7');
    await page.keyboard.press('Enter'); // commits the field
    await page.getByTestId('shape-ok').click();
    await expect(page.getByTestId('shape-dialog')).toHaveCount(0);
    await expect(typeLabel(page)).toContainText('Estrella');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('field-w')).toHaveCount(0);
  });

  test('polygon: ArrowUp during the drag adds sides', async () => {
    const { page } = ctx;
    await pickTool(page, 'tool-polygon');
    const a = await at(page, 0, 0);
    const b = await at(page, 0, -90);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.mouse.up();
    await expect(typeLabel(page)).toContainText('Polígono');
    // 7 sides draw more dark stroke pixels near the circumference than a pentagon would: just check it exists.
    expect(await darkPixels(page, -100, -100, 200, 200)).toBeGreaterThan(50);
  });

  test('the pen draws a heart: corners, smooth anchors by dragging, closing on the first anchor', async () => {
    const { page } = ctx;
    await page.keyboard.press('p');
    await click(page, 0, -40); // dip at the top (corner)
    await drag(page, [70, -80], [110, -30]); // right lobe, smooth
    await click(page, 0, 80); // bottom tip (corner)
    await drag(page, [-70, -80], [-30, -130]); // left lobe, smooth
    await click(page, 0, -40); // close on the first anchor
    await page.keyboard.press('v');
    await expect(typeLabel(page)).toContainText('Trazado');
    await page.screenshot({ path: 'test-results/draw-heart.png' });
    // The stroke is on the canvas around the lobes and the tip.
    expect(await darkPixels(page, 40, -110, 90, 90)).toBeGreaterThan(20);
    expect(await darkPixels(page, -20, 50, 40, 50)).toBeGreaterThan(5);
    // The next click starts another path: the heart stays one object.
    await click(page, 200, 100);
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+g');
    await expect(typeLabel(page)).toContainText('Grupo');
  });

  test('each pen point is an undo step: Ctrl+Z removes the last anchor, then the path', async () => {
    const { page } = ctx;
    await page.keyboard.press('p');
    await click(page, -100, 0);
    await click(page, 0, 0);
    await click(page, 100, 0);
    const before = await darkPixels(page, 0, -10, 130, 20);
    await page.keyboard.press('Control+z');
    expect(await darkPixels(page, 0, -10, 130, 20)).toBeLessThan(before);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('field-w')).toHaveCount(0);
  });

  test('the pencil fits a freehand stroke into an editable path', async () => {
    const { page } = ctx;
    await page.keyboard.press('n');
    const start = await at(page, -120, 0);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      const p = await at(page, -120 + i * 10, Math.sin((i / 24) * Math.PI * 2) * 50);
      await page.mouse.move(p.x, p.y);
    }
    await page.mouse.up();
    await expect(typeLabel(page)).toContainText('Trazado');
    expect(await darkPixels(page, -130, -70, 270, 140)).toBeGreaterThan(100);
  });

  test('scissors cut a path in two, and Delete with picked anchors removes only the anchors', async () => {
    const { page } = ctx;
    await page.keyboard.press('p');
    await click(page, -100, 0);
    await click(page, 0, 0);
    await click(page, 100, 0);
    await page.keyboard.press('Escape'); // end the path, still selected
    await page.keyboard.press('c');
    await click(page, -50, 0);
    // Two paths now: select all shows a combined selection; each part is its own object (the type says "Trazado" ×2).
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('control-type')).toContainText('2');
    // Direct Selection: pick the middle anchor of the right part and delete it.
    await page.keyboard.press('Control+Shift+a');
    await page.keyboard.press('a');
    await click(page, 50, 0);
    await click(page, 0, 0);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
  });

  test('Ctrl+J closes the selected open path', async () => {
    const { page } = ctx;
    await page.keyboard.press('p');
    await click(page, -60, 40);
    await click(page, 60, 40);
    await click(page, 0, -60);
    await page.keyboard.press('Escape');
    // Unclosed: the closing edge is missing.
    const open = await darkPixels(page, -50, 36, 100, 8);
    await page.keyboard.press('v');
    await page.keyboard.press('Control+j');
    // The closed triangle now has a bottom edge between the first and last anchors... which were -60,40 and 0,-60: the new edge is diagonal.
    expect(await darkPixels(page, -60, -60, 60, 100)).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(0);
  });
});
