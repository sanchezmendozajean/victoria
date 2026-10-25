import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';
import { redPng } from './png';

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;

async function dragFromCentre(page: Page, from: [number, number], to: [number, number]) {
  const b = await surface(page);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx + from[0], cy + from[1]);
  await page.mouse.down();
  await page.mouse.move(cx + (from[0] + to[0]) / 2, cy + (from[1] + to[1]) / 2, { steps: 3 });
  await page.mouse.move(cx + to[0], cy + to[1], { steps: 3 });
  await page.mouse.up();
}

/** Pixels of the content canvas inside a rectangle given relative to the centre of the surface, that pass `test`. */
const count = async (page: Page, rect: [number, number, number, number], kind: 'dark' | 'red') => {
  const b = await surface(page);
  return page.getByTestId('canvas-content').evaluate(
    (c: HTMLCanvasElement, r) => {
      const dpr = window.devicePixelRatio || 1;
      const x = Math.round((r.w0 + r.cx) * dpr);
      const y = Math.round((r.h0 + r.cy) * dpr);
      const data = c.getContext('2d')!.getImageData(Math.max(0, x), Math.max(0, y), Math.round(r.w * dpr), Math.round(r.h * dpr)).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [R, G, B, A] = [data[i] as number, data[i + 1] as number, data[i + 2] as number, data[i + 3] as number];
        if (r.kind === 'dark' ? A > 200 && R < 200 && G < 200 && B < 200 : R > 200 && G < 40 && B < 40) n++;
      }
      return n;
    },
    { w0: rect[0], h0: rect[1], w: rect[2], h: rect[3], cx: b.width / 2, cy: b.height / 2, kind },
  );
};

test.describe('clipboard (Phase 11)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  const ORIGINAL: [number, number, number, number] = [-200, -120, 130, 100]; // where the rectangle is drawn
  const MIDDLE: [number, number, number, number] = [-30, -30, 60, 60]; // where a plain paste lands (view centre)

  test('copy puts Victoria objects on the system clipboard, paste lands at the centre of the view and is undoable', async () => {
    const { app, page } = ctx;
    await page.keyboard.press('m');
    await dragFromCentre(page, [-150, -80], [-90, -30]);
    expect(await count(page, ORIGINAL, 'dark')).toBeGreaterThan(8);
    expect(await count(page, MIDDLE, 'dark')).toBe(0);

    await page.keyboard.press('Control+c');
    await expect
      .poll(() => app.evaluate(async ({ clipboard }) => (await clipboard.read()).some((i) => i.types.includes('web application/x-victoria-clip'))))
      .toBe(true);

    await page.keyboard.press('Control+v');
    await expect.poll(() => count(page, MIDDLE, 'dark')).toBeGreaterThan(8);
    expect(await count(page, ORIGINAL, 'dark')).toBeGreaterThan(8); // the original stays
    await page.keyboard.press('Control+z');
    await expect.poll(() => count(page, MIDDLE, 'dark')).toBe(0);
  });

  test('cut removes the objects and paste in place brings them back to the same spot', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+x');
    await expect.poll(() => count(page, ORIGINAL, 'dark')).toBe(0);
    await page.keyboard.press('Control+Shift+v');
    await expect.poll(() => count(page, ORIGINAL, 'dark')).toBeGreaterThan(8);
    expect(await count(page, MIDDLE, 'dark')).toBe(0);
  });

  test('a picture copied in another program is pasted as an image', async () => {
    const { app, page } = ctx;
    const png = redPng(80).toString('base64');
    await app.evaluate(async ({ clipboard, ClipboardItem }, data) => {
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(data, 'base64')], { type: 'image/png' }) })]);
    }, png);
    await page.keyboard.press('Control+v');
    await expect.poll(() => count(page, MIDDLE, 'red')).toBeGreaterThan(500);
  });
});
