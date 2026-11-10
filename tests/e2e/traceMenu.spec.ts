import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp } from './launch';
import { squarePng } from './png';

test('Calcar is a split button: its menu lists the presets, picks one and remembers it', async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'victoria-tracemenu-')), 'cuadro.png');
  writeFileSync(file, squarePng(160));
  const ctx = await launchApp();
  const { page } = ctx;
  try {
    await ctx.app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
    }, file);
    await page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+Shift+p');
    await page.getByTestId('panel-group').nth(0).locator('[data-panel="properties"]').click();

    await page.getByTestId('trace-menu').click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(11);
    await expect(items.filter({ hasText: 'Logotipo' })).toHaveCount(1);
    await expect(items.filter({ hasText: '16 colores' })).toHaveAttribute('aria-checked', 'true');

    // Picking one traces with it at once.
    await items.filter({ hasText: 'Blanco y negro' }).click();
    await expect(page.getByTestId('trace-preset')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('trace-preset')).toHaveValue('bw');
    await expect(page.getByTestId('trace-mode')).toHaveValue('bw');

    // After undoing the trace, the plain button uses the last preset.
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('trace-run')).toBeVisible();
    await page.getByTestId('trace-run').click();
    await expect(page.getByTestId('trace-preset')).toHaveValue('bw', { timeout: 20_000 });
  } finally {
    await ctx.app.close();
  }
});
