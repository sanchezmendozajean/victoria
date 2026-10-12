// Renders build/icon.svg to build/icon.png (1024 px) with the Electron that is already installed.
// Usage: pnpm icon:app
import { _electron as electron } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');

const dir = mkdtempSync(path.join(tmpdir(), 'victoria-icon-'));
const main = path.join(dir, 'main.cjs');
writeFileSync(
  main,
  `const { app, BrowserWindow } = require('electron');
   app.whenReady().then(() => {
     const win = new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, frame: false, transparent: true });
     win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(process.env.ICON_HTML));
   });`,
);

const env = { ...process.env, ICON_HTML: `<body style="margin:0;background:transparent">${svg}</body>` };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [main], env });
const page = await app.firstWindow();
await page.waitForLoadState('load');
await page.screenshot({ path: path.join(root, 'build', 'icon.png'), omitBackground: true });
await app.close();
console.log('Wrote build/icon.png');
