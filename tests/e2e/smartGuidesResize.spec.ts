import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './launch';

/** The X field is the position of the reference point, which is the centre by default: edges are x ± w / 2. */
const num = async (page: Page, id: string) => Number.parseFloat((await page.getByTestId(id).inputValue()).replace(',', '.'));

async function draw(page: Page, from: [number, number], to: [number, number]) {
  const b = (await page.getByTestId('canvas-surface').boundingBox())!;
  await page.keyboard.press('m');
  await page.mouse.move(b.x + from[0], b.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + to[0], b.y + to[1], { steps: 6 });
  await page.mouse.up();
}

test('smart guides react while resizing an object: the edge lands on the neighbour edge', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const b = (await page.getByTestId('canvas-surface').boundingBox())!;
    await draw(page, [350, 250], [420, 330]); // A, inside the artboard
    await draw(page, [600, 300], [680, 400]); // B, to the right of A
    await page.keyboard.press('v');

    await page.mouse.click(b.x + 640, b.y + 350); // select B
    const bLeft = (await num(page, 'field-x')) - (await num(page, 'field-w')) / 2;
    await page.waitForTimeout(600); // not a double click

    await page.mouse.click(b.x + 385, b.y + 290); // select A
    const aRight = (await num(page, 'field-x')) + (await num(page, 'field-w')) / 2;
    const aHeight = await num(page, 'field-h');
    expect(aRight).toBeLessThan(bLeft - 5); // a gap between them

    // Drag A's east handle to 3 px short of B's left edge (A's right edge is at x = 420, B's left edge at 600).
    await page.mouse.move(b.x + 420, b.y + 290);
    await page.mouse.down();
    await page.mouse.move(b.x + 597, b.y + 291, { steps: 12 });
    await page.screenshot({ path: 'test-results/smart-guides-resize.png' });
    await page.mouse.up();

    // The edge snapped: it is exactly on B's left edge, not 3 px short.
    expect((await num(page, 'field-x')) + (await num(page, 'field-w')) / 2).toBeCloseTo(bLeft, 2);
    // The height was not touched by the east handle.
    expect(await num(page, 'field-h')).toBeCloseTo(aHeight, 2);
  } finally {
    await ctx.app.close();
  }
});
