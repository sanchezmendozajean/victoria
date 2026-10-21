import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

const SAMPLES = path.join(__dirname, '../../samples');
const DARK = [31, 33, 36];

async function openSample(ctx: Launched, file: string): Promise<void> {
  const target = path.join(SAMPLES, file);
  await ctx.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, target);
  await ctx.page.keyboard.press('Control+o');
  await expect(ctx.page.locator('[data-testid="doc-tabs"] [role="tab"]').last()).toContainText(file);
  await ctx.page.waitForTimeout(250);
}

type Layer = 'canvas-content' | 'canvas-overlay';

/** RGBA of one CSS pixel of a canvas layer. */
const pixel = (page: Page, layer: Layer, x: number, y: number) =>
  page.getByTestId(layer).evaluate(
    (c: HTMLCanvasElement, [px, py]) => {
      const dpr = window.devicePixelRatio || 1;
      return Array.from(c.getContext('2d')!.getImageData(Math.round((px as number) * dpr), Math.round((py as number) * dpr), 1, 1).data);
    },
    [x, y],
  );

/** First CSS pixel (scanning rows) whose colour is within 6 of `rgb`, searched on a coarse grid. */
const findPixel = (page: Page, rgb: number[]) =>
  page.getByTestId('canvas-content').evaluate(
    (c: HTMLCanvasElement, target) => {
      const dpr = window.devicePixelRatio || 1;
      const ctx = c.getContext('2d')!;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let y = 40; y < c.height - 40; y += 4) {
        for (let x = 40; x < c.width - 40; x += 4) {
          const i = (y * c.width + x) * 4;
          if ((data[i + 3] as number) === 255 && target.every((v, k) => Math.abs((data[i + k] as number) - v) <= 6)) {
            return { x: Math.round(x / dpr), y: Math.round(y / dpr) };
          }
        }
      }
      return null;
    },
    rgb,
  );

/** Number of non-transparent pixels of the overlay (what the tools and guides drew). */
const overlayInk = (page: Page) =>
  page.getByTestId('canvas-overlay').evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] as number) > 0) n++;
    return n;
  });

const zoomOf = async (page: Page) => Number.parseFloat((await page.getByTestId('zoom-field').inputValue()).replace('%', '').replace(',', '.'));
/** The status bar follows the canvas one frame later, so zoom assertions wait for it. */
const expectZoom = (page: Page, value: number, digits = 1) => expect.poll(() => zoomOf(page)).toBeCloseTo(value, digits);
const settle = (page: Page) => page.waitForTimeout(180);
const resetView = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.keyboard.press('Control+0');
  await settle(page);
};
const surfaceBox = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;
const moveTo = async (page: Page, x: number, y: number) => {
  const box = await surfaceBox(page);
  await page.mouse.move(box.x + x, box.y + y);
};


test.describe('canvas on a blank document', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });
  test.beforeEach(async () => {
    await resetView(ctx.page);
  });

  test('a new document opens fitted on its artboard, drawn white on the canvas colour', async () => {
    const { page } = ctx;
    const box = await surfaceBox(page);
    // The first paint can land a moment after the window shows: wait for it instead of racing it.
    await expect.poll(async () => (await pixel(page, 'canvas-content', Math.round(box.width / 2), Math.round(box.height / 2))).slice(0, 3)).toEqual([255, 255, 255]);
    expect((await pixel(page, 'canvas-content', 3, 3))[3]).toBe(0); // outside the artboard: the CSS canvas colour shows
    expect(await zoomOf(page)).toBeGreaterThan(30);
    await page.screenshot({ path: 'test-results/canvas-new.png' });
  });

  test('zoom shortcuts: 100 %, steps, fit artboard', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+1');
    await expectZoom(page, 100);
    await page.keyboard.press('Control+=');
    await expectZoom(page, 150);
    await page.keyboard.press('Control+-');
    await page.keyboard.press('Control+-');
    await expectZoom(page, 66.67);
    await page.keyboard.press('Control+0');
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(30);
  });

  test('the zoom field takes a typed value and the menu lists the ladder', async () => {
    const { page } = ctx;
    const field = page.getByTestId('zoom-field');
    await field.click();
    await field.fill('50');
    await page.keyboard.press('Enter');
    await expectZoom(page, 50);
    await page.getByTestId('zoom-menu').click();
    await expect(page.getByRole('menuitem', { name: '1200%', exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: '200%', exact: true }).click();
    await expectZoom(page, 200);
  });

  test('rulers and artboards can be hidden from the View menu', async () => {
    const { page } = ctx;
    const withRulers = await surfaceBox(page);
    await page.keyboard.press('Control+r');
    await expect(page.getByTestId('ruler-h')).toBeHidden();
    const without = await surfaceBox(page);
    expect(without.x).toBeLessThan(withRulers.x);
    expect(without.width).toBeGreaterThan(withRulers.width);
    await page.keyboard.press('Control+r');
    await expect(page.getByTestId('ruler-h')).toBeVisible();

    await page.keyboard.press('Control+Shift+h');
    await settle(page);
    const none = await pixel(page, 'canvas-content', Math.round(withRulers.width / 2), Math.round(withRulers.height / 2));
    expect(none[3]).toBe(0); // no white sheet any more: only the canvas colour
    await page.keyboard.press('Control+Shift+h');
  });

  test("grid (Ctrl+') draws lines over the artboard", async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+1');
    await settle(page);
    const greyPixels = () =>
      page.getByTestId('canvas-content').evaluate((c: HTMLCanvasElement) => {
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Over the white sheet grid lines show as greys: neither the pure white nor the artboard border/label.
          if (data[i + 3] === 255 && data[i] === data[i + 1] && data[i + 1] === data[i + 2] && (data[i] as number) > 120 && (data[i] as number) < 250) n++;
        }
        return n;
      });
    const before = await greyPixels();
    await page.keyboard.press("Control+'");
    await settle(page);
    expect(await greyPixels()).toBeGreaterThan(before + 200);
    await page.keyboard.press("Control+'");
  });

  test('guides: pulled from a ruler, undoable, hideable, and deleted by dropping them back', async () => {
    const { page } = ctx;
    const box = await surfaceBox(page);
    const rulerH = (await page.getByTestId('ruler-h').boundingBox())!;
    await page.mouse.move(rulerH.x + 300, rulerH.y + 9);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 250, { steps: 5 });
    expect(await overlayInk(page)).toBeGreaterThan(300); // the preview line while dragging
    await page.mouse.up();
    await settle(page);
    expect((await pixel(page, 'canvas-overlay', 100, 250))[3]).toBeGreaterThan(0);

    await page.keyboard.press('Control+z');
    await settle(page);
    expect(await overlayInk(page)).toBe(0);
    await page.keyboard.press('Control+Shift+z');
    await settle(page);
    expect(await overlayInk(page)).toBeGreaterThan(300);

    await page.keyboard.press('Control+;'); // hide guides
    await settle(page);
    expect(await overlayInk(page)).toBe(0);
    await page.keyboard.press('Control+;');
    await settle(page);

    // Grab it and drop it on the ruler.
    await page.mouse.move(box.x + 300, box.y + 250);
    await expect(page.getByTestId('canvas-overlay')).toHaveCSS('cursor', 'row-resize');
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 120, { steps: 3 });
    await page.mouse.move(box.x + 300, box.y - 10, { steps: 3 });
    await page.mouse.up();
    await settle(page);
    expect(await overlayInk(page)).toBe(0);
  });

  test('locked guides cannot be grabbed', async () => {
    const { page } = ctx;
    const box = await surfaceBox(page);
    const rulerV = (await page.getByTestId('ruler-v').boundingBox())!;
    await page.mouse.move(rulerV.x + 9, rulerV.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 420, box.y + 200, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    await page.keyboard.press('Control+Alt+;'); // lock guides
    await page.mouse.move(box.x + 421, box.y + 200);
    await settle(page);
    await expect(page.getByTestId('canvas-overlay')).not.toHaveCSS('cursor', 'col-resize');
    await page.keyboard.press('Control+Alt+;');
    await page.mouse.move(box.x + 420, box.y + 201);
    await expect(page.getByTestId('canvas-overlay')).toHaveCSS('cursor', 'col-resize');
    await page.keyboard.press('Control+z');
  });

  test('each Space remembers its own view', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+1');
    await expectZoom(page, 100);
    await page.getByTestId('space-add').click();
    await expect.poll(() => zoomOf(page)).not.toBe(100); // the new Space opened fitted
    await page.locator('[data-testid="space-tab"]').first().click();
    await expectZoom(page, 100);
    await page.keyboard.press('Control+z');
  });
});

test.describe('canvas with artwork (demo document)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await openSample(ctx, 'demo.vict');
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });
  test.beforeEach(async () => {
    await resetView(ctx.page);
  });

  test('draws the artwork of the demo document', async () => {
    await expect(ctx.page.getByTestId('status-artboard')).toContainText('casa-24');
    expect(await findPixel(ctx.page, DARK)).not.toBeNull(); // the house stroke
    await ctx.page.screenshot({ path: 'test-results/canvas-demo.png' });
  });

  test('Ctrl+wheel zooms at the cursor: the point under it stays put', async () => {
    const { page } = ctx;
    const spot = (await findPixel(page, DARK))!;
    const box = await surfaceBox(page);
    await page.mouse.move(box.x + spot.x, box.y + spot.y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await settle(page);
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(260);
    expect((await pixel(page, 'canvas-content', spot.x, spot.y)).slice(0, 3)).toEqual(DARK);
  });

  test('the wheel pans vertically, Shift+wheel horizontally', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+1');
    await settle(page);
    const spot = (await findPixel(page, DARK))!;
    await moveTo(page, 300, 300);
    await page.mouse.wheel(0, 60); // scrolls the content up by 60 px
    await settle(page);
    expect((await pixel(page, 'canvas-content', spot.x, spot.y - 60)).slice(0, 3)).toEqual(DARK);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 40); // Shift+wheel: sideways
    await page.keyboard.up('Shift');
    await settle(page);
    expect((await pixel(page, 'canvas-content', spot.x - 40, spot.y - 60)).slice(0, 3)).toEqual(DARK);
  });

  test('Space turns any tool into the hand; the Hand tool pans too', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+1');
    await settle(page);
    const spot = (await findPixel(page, DARK))!;
    const box = await surfaceBox(page);
    await moveTo(page, 400, 400);
    await page.keyboard.down(' ');
    await expect(page.getByTestId('canvas-overlay')).toHaveCSS('cursor', 'grab');
    await page.mouse.down();
    await page.mouse.move(box.x + 460, box.y + 430, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    await settle(page);
    expect((await pixel(page, 'canvas-content', spot.x + 60, spot.y + 30)).slice(0, 3)).toEqual(DARK);
    await expect(page.getByTestId('canvas-overlay')).toHaveCSS('cursor', 'default'); // the tool is back

    await page.keyboard.press('h');
    await expect(page.getByTestId('status-tool')).toContainText('Mano');
    await moveTo(page, 400, 400);
    await page.mouse.down();
    await page.mouse.move(box.x + 380, box.y + 380, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    expect((await pixel(page, 'canvas-content', spot.x + 40, spot.y + 10)).slice(0, 3)).toEqual(DARK);
  });

  test('the Zoom tool: click zooms in, Alt+click out, a marquee zooms to it', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+1');
    await expectZoom(page, 100);
    await page.keyboard.press('z');
    await expect(page.getByTestId('canvas-overlay')).toHaveCSS('cursor', 'zoom-in');
    const box = await surfaceBox(page);
    await page.mouse.click(box.x + 300, box.y + 300);
    await expectZoom(page, 150);
    await page.keyboard.down('Alt');
    await expect(page.getByTestId('canvas-overlay')).toHaveCSS('cursor', 'zoom-out');
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.keyboard.up('Alt');
    await expectZoom(page, 100);
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 200, { steps: 4 });
    await settle(page);
    expect(await overlayInk(page)).toBeGreaterThan(0); // the marquee is drawn
    await page.mouse.up();
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(200);
    await settle(page);
    expect(await overlayInk(page)).toBe(0);
  });

  test('Outline mode (Ctrl+Y) draws only outlines and Ctrl+Y returns to the preview', async () => {
    const { page } = ctx;
    const darkPixels = () =>
      page.getByTestId('canvas-content').evaluate((c: HTMLCanvasElement) => {
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] === 31 && data[i + 1] === 33 && data[i + 2] === 36 && data[i + 3] === 255) n++;
        return n;
      });
    expect(await darkPixels()).toBeGreaterThan(2000); // the 18 pt house stroke
    await page.keyboard.press('Control+y');
    await settle(page);
    expect(await darkPixels()).toBeLessThan(200); // now a 1 px line (and it is the layer colour, not black)
    await page.getByTestId('menu-view').click();
    await expect(page.getByRole('menuitem', { name: /^Previsualizar(?! píxeles)/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+y');
    await settle(page);
    expect(await darkPixels()).toBeGreaterThan(2000);
  });

  test('hover with the Selection tool outlines the object under the cursor in its layer colour', async () => {
    const { page } = ctx;
    const spot = (await findPixel(page, DARK))!;
    await moveTo(page, 5, 5);
    await settle(page);
    expect(await overlayInk(page)).toBe(0);
    await moveTo(page, spot.x, spot.y);
    await settle(page);
    expect(await overlayInk(page)).toBeGreaterThan(50);
    await moveTo(page, 5, 5);
    await settle(page);
    expect(await overlayInk(page)).toBe(0);
  });

  test('the status bar shows the cursor in document units and the artboard navigator moves between artboards', async () => {
    const { page } = ctx;
    await moveTo(page, 200, 200);
    await expect(page.getByTestId('status-cursor')).toContainText('mm');
    await expect(page.getByTestId('status-cursor')).not.toContainText('—');
    await page.mouse.move(5, 500); // outside the canvas
    await expect(page.getByTestId('status-cursor')).toContainText('—');

    await expect(page.getByTestId('status-artboard')).toContainText('casa-24');
    const before = await zoomOf(page);
    await page.getByTestId('artboard-next').click();
    await expect(page.getByTestId('status-artboard')).toContainText('corazón-24');
    await expectZoom(page, before, 0); // same size boards: same fit
    await page.getByTestId('status-artboard').click();
    for (const name of ['casa-24', 'corazón-24', 'insignia-24', 'fusión-24']) await expect(page.getByRole('menuitem', { name })).toBeVisible();
    await page.getByRole('menuitem', { name: 'fusión-24' }).click();
    await expect(page.getByTestId('status-artboard')).toContainText('fusión-24');
    await page.keyboard.press('Control+Alt+0');
    await expect.poll(() => zoomOf(page)).toBeLessThan(before);
    await page.getByTestId('status-artboard').click();
    await page.getByRole('menuitem', { name: 'casa-24' }).click();
  });
});

test.describe('canvas performance (specs/01 · 10 000 nodes, 60 fps)', () => {
  test('pan and zoom a 10 000-object document at interactive frame rates', async () => {
    const stress = await launchApp();
    try {
      await openSample(stress, 'stress-10k.vict');
      const { page } = stress;
      await page.keyboard.press('Control+0');
      await page.waitForTimeout(500);
      expect(await findPixel(page, [255, 255, 255])).not.toBeNull();

      // Dispatch one wheel event per animation frame and record the frame intervals.
      const measure = (mode: 'pan' | 'zoom') =>
        page.getByTestId('canvas-overlay').evaluate(
          (overlay, kind) =>
            new Promise<{ avg: number; p95: number; max: number; frames: number }>((resolve) => {
              const rect = overlay.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const times: number[] = [];
              let last = performance.now();
              let n = 0;
              const step = () => {
                const now = performance.now();
                times.push(now - last);
                last = now;
                const dir = Math.floor(n / 30) % 2 === 0 ? 1 : -1; // back and forth so the view stays in range
                overlay.dispatchEvent(
                  new WheelEvent('wheel', {
                    bubbles: true,
                    cancelable: true,
                    clientX: cx,
                    clientY: cy,
                    deltaY: kind === 'zoom' ? -40 * dir : 30 * dir,
                    deltaX: kind === 'pan' ? 20 * dir : 0,
                    ctrlKey: kind === 'zoom',
                  }),
                );
                if (++n < 180) requestAnimationFrame(step);
                else {
                  const frames = times.slice(2).sort((a, b) => a - b);
                  resolve({
                    avg: frames.reduce((s, v) => s + v, 0) / frames.length,
                    p95: frames[Math.floor(frames.length * 0.95)] as number,
                    max: frames[frames.length - 1] as number,
                    frames: frames.length,
                  });
                }
              };
              requestAnimationFrame(step);
            }),
          mode,
        );

      // Full repaint cost: toggling Outline forces one, then read the diagnostics of the content canvas.
      const fullRepaint = async () => {
        await page.keyboard.press('Control+y');
        await page.waitForTimeout(150);
        return Number.parseFloat((await page.getByTestId('canvas-content').getAttribute('data-render-ms')) ?? 'NaN');
      };
      const outlineMs = await fullRepaint();
      const previewMs = await fullRepaint();
      console.log(`10 000 nodes · full repaint: preview ${previewMs} ms · outline ${outlineMs} ms`);
      expect(previewMs).toBeLessThan(250);

      const pan = await measure('pan');
      await page.waitForTimeout(300);
      const zoom = await measure('zoom');
      console.log(`10 000 nodes · pan  avg ${pan.avg.toFixed(1)} ms · p95 ${pan.p95.toFixed(1)} ms · max ${pan.max.toFixed(1)} ms`);
      console.log(`10 000 nodes · zoom avg ${zoom.avg.toFixed(1)} ms · p95 ${zoom.p95.toFixed(1)} ms · max ${zoom.max.toFixed(1)} ms`);
      expect(pan.avg).toBeLessThan(20); // 16.7 ms = 60 fps; a little headroom for CI machines
      expect(zoom.avg).toBeLessThan(20);
      expect(pan.p95).toBeLessThan(34);
      expect(zoom.p95).toBeLessThan(34);
      await page.screenshot({ path: 'test-results/canvas-stress.png' });
    } finally {
      await stress.app.close();
    }
  });
});
