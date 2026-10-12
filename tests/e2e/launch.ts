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
  await page.waitForSelector('[data-testid="titlebar"]');
  return { app, page };
}
