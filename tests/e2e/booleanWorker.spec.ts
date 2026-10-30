import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cornerAnchor, createDocument, createPath, sequentialIds, writeVict } from '../../src/core';
import { launchApp } from './launch';

/** A closed polygon of `sides` corners (a circle in practice), so one object carries hundreds of segments. */
function polygon(ids: ReturnType<typeof sequentialIds>, cx: number, cy: number, radius: number, sides: number) {
  const anchors = Array.from({ length: sides }, (_, i) => cornerAnchor({ x: cx + radius * Math.cos((2 * Math.PI * i) / sides), y: cy + radius * Math.sin((2 * Math.PI * i) / sides) }));
  return createPath(ids, anchors, true);
}

test.describe('Buscatrazos of big shapes (Phase 12 · rendimiento)', () => {
  test('two shapes of 400 segments each are united in a Worker and the result is one object', async () => {
    const ids = sequentialIds('w');
    const document = createDocument({ name: 'Grande', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
    const layer = document.spaces[0]!.layers[0]!;
    layer.children.push(polygon(ids, 300, 300, 120, 400), polygon(ids, 380, 300, 120, 400));
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'victoria-big-')), 'grande.vict');
    writeFileSync(file, writeVict({ document, app: 'test' }));

    const { app, page } = await launchApp();
    try {
      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
      }, file);
      await page.keyboard.press('Control+o');
      await expect(page.getByTestId('doc-tabs')).toContainText('grande.vict');
      await page.keyboard.press('v');
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Control+Shift+F9'); // the Buscatrazos panel
      await expect(page.getByTestId('pathfinder-panel')).toBeVisible();

      let workers = 0;
      page.on('worker', () => workers++);
      await page.getByTestId('pf-unite').click();
      // Two objects became one (a single object cannot be united again), and the status bar is not left busy.
      await expect(page.getByTestId('pf-unite')).toBeDisabled({ timeout: 30_000 });
      await expect(page.getByTestId('status-busy')).toHaveCount(0);
      expect(workers).toBeGreaterThan(0); // it ran in a Worker, not on the interface thread
      await page.keyboard.press('Control+a');

      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+a');
      await expect(page.getByTestId('pf-unite')).toBeEnabled(); // undo brought the two shapes back
    } finally {
      await app.close();
    }
  });
});
