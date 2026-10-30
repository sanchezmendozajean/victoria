import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Smoke test of the packaged application (the one users install). It only runs when `VICTORIA_PACKAGED_EXE` points at the
 * unpacked executable (CI sets it after `electron-builder`); everywhere else it is skipped.
 */
const exe = process.env.VICTORIA_PACKAGED_EXE;

test.describe('packaged application', () => {
  test.skip(!exe, 'set VICTORIA_PACKAGED_EXE to the packaged executable to run this');

  test('starts, shows the full window, draws and opens Preferencias without console errors', async () => {
    const userData = mkdtempSync(path.join(tmpdir(), 'victoria-packaged-'));
    const env = { ...process.env } as Record<string, string>;
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ executablePath: exe!, args: [`--user-data-dir=${userData}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], env });
    try {
      const page = await app.firstWindow();
      const problems: string[] = [];
      page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
      page.on('pageerror', (e) => problems.push(String(e)));
      await page.waitForSelector('[data-testid="titlebar"]');
      await expect(page.getByTestId('canvas-surface')).toBeVisible();
      await expect(page.getByTestId('doc-tabs')).toContainText('Sin título');

      // A shape drawn with the real tools.
      await page.keyboard.press('m');
      const box = (await page.getByTestId('canvas-surface').boundingBox())!;
      await page.mouse.move(box.x + 200, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 320, box.y + 300, { steps: 5 });
      await page.mouse.up();
      await expect(page.getByTestId('doc-dirty')).toHaveCount(1);

      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('preferences-dialog')).toBeVisible();
      expect(problems).toEqual([]);

      const info = await app.evaluate(({ app: a }) => ({ name: a.getName(), packaged: a.isPackaged }));
      expect(info).toEqual({ name: 'Victoria', packaged: true });
    } finally {
      await app.close();
    }
  });
});
