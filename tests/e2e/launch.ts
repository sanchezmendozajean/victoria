import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface Launched {
  app: ElectronApplication;
  page: Page;
}

/** Starts the built app (run `pnpm build:app` first; `pnpm test:e2e` does). */
export async function launchApp(env: Record<string, string> = {}): Promise<Launched> {
  const userData = mkdtempSync(path.join(tmpdir(), 'victoria-e2e-'));
  const childEnv = { ...process.env, VICTORIA_USER_DATA: userData, ...env } as Record<string, string>;
  // Some hosts (VS Code terminals) set this and make Electron start as plain Node.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.join(__dirname, '../..')], env: childEnv });
  const page = await app.firstWindow();
  // E2E_SIZE=1024x728 reproduces the window of the CI runners (their screen is 1024×768).
  if (process.env.E2E_SIZE) {
    const [w, h] = process.env.E2E_SIZE.split('x').map(Number);
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setSize(size[0] as number, size[1] as number), [w, h]);
  }
  await page.waitForSelector('[data-testid="titlebar"]');
  // Fresh profiles open on the start screen; most specs want an empty document instead.
  await page.evaluate(() => localStorage.setItem('victoria.preferences', JSON.stringify({ startScreen: false })));
  await page.reload();
  await page.waitForSelector('[data-testid="titlebar"]');
  return { app, page };
}

/**
 * Shows the document at 100 %. A new document opens fitted to its artboard, so its zoom depends on the
 * screen (the CI runners have 1024×768): specs that count painted pixels pin the zoom first.
 */
export async function atActualSize(page: Page): Promise<void> {
  await page.keyboard.press('Control+1');
  await page.waitForFunction(() => {
    const field = document.querySelector<HTMLInputElement>('[data-testid="zoom-field"]');
    return !!field && Number.parseFloat(field.value.replace('%', '').replace(',', '.')) === 100;
  });
}

/** Waits until the system fonts are listed, so new text gets an installed family instead of a missing one. */
export async function fontsReady(page: Page): Promise<void> {
  await page.waitForSelector('html[data-fonts="ready"]', { state: 'attached' });
}
