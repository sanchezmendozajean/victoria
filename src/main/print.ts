import { app, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrintJob } from './platform/types';
import { microns, pagesHtml, validateJob } from './printJob';

// Printing (specs/08 · Imprimir). Every page is an SVG at its real size (1 SVG unit = 1 pt = 1/72 in) shown by a
// hidden Chromium window whose `@page` is the paper, with no margins: what Chromium sends to the printer is vector
// and exactly as large as the SVG says. The same window can produce a PDF, which is how the tests see the result.

function lp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('lp', args, (error, _out, stderr) => (error ? reject(new Error(stderr || error.message)) : resolve()));
  });
}

export interface PrintOptions {
  /** On Linux, when Chromium cannot print, send a PDF to CUPS with `lp` (no scaling, the paper size of the job). */
  cupsFallback?: boolean;
}

/**
 * Sends the job to the printer. With `VICTORIA_PRINT_TO_PDF` set (tests, machines without a printer) nothing is
 * printed: the PDF Chromium would print is written to that path instead.
 */
export async function printJob(job: PrintJob, options: PrintOptions = {}): Promise<void> {
  validateJob(job);
  const dir = await mkdtemp(path.join(app.getPath('temp'), 'victoria-print-'));
  let win: BrowserWindow | null = null;
  try {
    await Promise.all([writeFile(path.join(dir, 'index.html'), pagesHtml(job), 'utf8'), ...job.pages.map((svg, i) => writeFile(path.join(dir, `page-${i + 1}.svg`), svg, 'utf8'))]);
    win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
    await win.loadFile(path.join(dir, 'index.html'));
    const pdf = () => win!.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });

    const toFile = process.env.VICTORIA_PRINT_TO_PDF;
    if (toFile) {
      await writeFile(toFile, await pdf());
      return;
    }
    const failure = await new Promise<string | null>((resolve) => {
      win!.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: job.printer ?? '',
          copies: job.copies,
          margins: { marginType: 'none' },
          pageSize: { width: microns(job.width), height: microns(job.height) },
        },
        (success, reason) => resolve(success ? null : reason || 'print failed'),
      );
    });
    if (failure === null) return;
    if (!options.cupsFallback) throw new Error(failure);
    const file = path.join(dir, 'job.pdf');
    await writeFile(file, await pdf());
    await lp([...(job.printer ? ['-d', job.printer] : []), '-n', String(job.copies), '-t', job.title.slice(0, 120), '-o', 'fit-to-page=false', '-o', `media=Custom.${Math.round(job.width)}x${Math.round(job.height)}`, file]);
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
