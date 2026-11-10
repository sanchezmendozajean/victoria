import { expect, test } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

const SAMPLES = path.join(__dirname, '../../samples');

/** Replaces the native open dialog in the main process: records the options it was given and picks `next`. */
const stubOpenDialog = (ctx: Launched) =>
  ctx.app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __opts: Array<{ defaultPath?: string }>; __next: string };
    g.__opts = [];
    dialog.showOpenDialog = (async (_win: unknown, options: { defaultPath?: string }) => {
      g.__opts.push(options);
      return { canceled: false, filePaths: [g.__next] };
    }) as never;
  });
const pick = (ctx: Launched, file: string) => ctx.app.evaluate((_electron, f) => ((globalThis as unknown as { __next: string }).__next = f), file);
const defaultPaths = (ctx: Launched) => ctx.app.evaluate(() => (globalThis as unknown as { __opts: Array<{ defaultPath?: string }> }).__opts.map((o) => o.defaultPath));

test.describe('Last folder and unpainted SVG', () => {
  test('file dialogs start where the previous one ended, also after restarting', async () => {
    const work = mkdtempSync(path.join(tmpdir(), 'victoria-lastfolder-'));
    const userData = path.join(work, 'profile');
    const folder = path.join(work, 'Trabajos', 'Cliente');
    mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'demo.vict');
    copyFileSync(path.join(SAMPLES, 'demo.vict'), file);

    const first = await launchApp({ VICTORIA_USER_DATA: userData });
    try {
      await stubOpenDialog(first);
      await pick(first, file);
      await first.page.keyboard.press('Control+o');
      await expect(first.page.locator('[data-testid="doc-tabs"] [role="tab"]').last()).toContainText('demo.vict');
      await first.page.keyboard.press('Control+o');
      await expect.poll(async () => (await defaultPaths(first)).length).toBe(2);
      const [one, two] = await defaultPaths(first);
      expect(one).not.toBe(folder); // nothing remembered yet: the system folder
      expect(two).toBe(folder);
    } finally {
      await first.app.close();
    }

    // A new session of the same profile remembers it.
    const second = await launchApp({ VICTORIA_USER_DATA: userData });
    try {
      await stubOpenDialog(second);
      await pick(second, file);
      await second.page.keyboard.press('Control+o');
      await expect.poll(async () => (await defaultPaths(second)).length).toBe(1);
      expect((await defaultPaths(second))[0]).toBe(folder);
    } finally {
      await second.app.close();
    }
  });

  test('an SVG whose shapes are all fill:none opens as unpainted outlines, not as an error', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'victoria-svg-'));
    const svg = path.join(dir, 'Textura.svg');
    writeFileSync(
      svg,
      '<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style type="text/css">.st0{fill:none;}</style><path class="st0" d="M10 10L90 10L90 90Z"/><path class="st0" d="M10 20L50 20L50 80Z"/></svg>',
    );
    const ctx = await launchApp();
    try {
      await stubOpenDialog(ctx);
      await pick(ctx, svg);
      await ctx.page.keyboard.press('Control+o');
      await expect(ctx.page.locator('[data-testid="doc-tabs"] [role="tab"]').last()).toContainText('Textura');
      await ctx.page.waitForTimeout(500);
      await expect(ctx.page.getByTestId('dialog')).toHaveCount(0);
      // Select everything: the two outlines are there to be selected.
      await ctx.page.keyboard.press('v');
      await ctx.page.keyboard.press('Control+a');
      await expect(ctx.page.getByTestId('control-bar')).toContainText('2');
    } finally {
      await ctx.app.close();
    }
  });
});
