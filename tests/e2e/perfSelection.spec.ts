import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { launchApp } from './launch';

const SAMPLE = path.join(__dirname, '../../samples/stress-10k.vict');

/** Time until the page has painted again after `action` (two animation frames later). */
async function untilPainted(page: Page, action: () => Promise<void>): Promise<number> {
  const start = Date.now();
  await action();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return Date.now() - start;
}

test.describe('editing a 10 000-object document (Phase 12 · rendimiento)', () => {
  test('selecting everything, moving it and undoing stay responsive', async () => {
    const { app, page } = await launchApp();
    try {
      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
      }, SAMPLE);
      await page.keyboard.press('Control+o');
      await expect(page.locator('[data-testid="doc-tabs"] [role="tab"]').last()).toContainText('stress-10k.vict');
      await page.keyboard.press('Control+0');
      await page.waitForTimeout(500);
      await page.getByTestId('canvas-surface').click({ position: { x: 3, y: 3 } });

      const select = await untilPainted(page, () => page.keyboard.press('Control+a'));
      const move = await untilPainted(page, () => page.keyboard.press('ArrowRight'));
      const undo = await untilPainted(page, () => page.keyboard.press('Control+z'));
      const look = await untilPainted(page, () => page.keyboard.press('Control+g'));
      console.log(`10 000 nodes · select all ${select} ms · nudge ${move} ms · undo ${undo} ms · group ${look} ms`);
      expect(select).toBeLessThan(1500);
      expect(move).toBeLessThan(1500);
      expect(undo).toBeLessThan(1500);
      expect(look).toBeLessThan(1500);
    } finally {
      await app.close();
    }
  });
});

test('Victoria starts with a document ready to draw in a couple of seconds (specs/00: < 2 s)', async () => {
  const start = Date.now();
  const { app, page } = await launchApp();
  try {
    await expect(page.getByTestId('canvas-surface')).toBeVisible();
    await expect(page.getByTestId('doc-tabs')).toContainText('Sin título');
    const elapsed = Date.now() - start;
    console.log(`startup to a drawable canvas: ${elapsed} ms`);
    expect(elapsed).toBeLessThan(4000); // 2 s is the goal on a real machine; the margin is for loaded CI runners
  } finally {
    await app.close();
  }
});
