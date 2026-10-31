import type { PrintJob } from './platform/types';

// The parts of printing that need no Electron: checking a job and writing the HTML that shows its pages.

const MAX_PAGES = 500;
const MAX_BYTES = 512 * 1024 * 1024;
/** pt → micrometres, the unit Electron wants for a page size. */
export const microns = (pt: number): number => Math.round((pt / 72) * 25400);
const MIN_SIDE = 36;
const MAX_SIDE = 14400;

type Size = PrintJob['sizes'][number];

export function validateJob(job: unknown): asserts job is PrintJob {
  const j = job as Partial<PrintJob> | null;
  if (!j || !Array.isArray(j.pages) || j.pages.length < 1 || j.pages.length > MAX_PAGES || !j.pages.every((p) => typeof p === 'string')) throw new Error('Invalid print pages');
  if (j.pages.reduce((n, p) => n + p.length, 0) > MAX_BYTES) throw new Error('Print job too large');
  if (!Array.isArray(j.sizes) || j.sizes.length !== j.pages.length) throw new Error('Invalid page size');
  for (const size of j.sizes as Array<Partial<Size> | null>) {
    for (const side of [size?.w, size?.h]) if (typeof side !== 'number' || !Number.isFinite(side) || side < MIN_SIDE || side > MAX_SIDE) throw new Error('Invalid page size');
  }
  if (typeof j.copies !== 'number' || !Number.isInteger(j.copies) || j.copies < 1 || j.copies > 999) throw new Error('Invalid copies');
  if (j.printer !== null && (typeof j.printer !== 'string' || j.printer.length === 0 || j.printer.length > 256)) throw new Error('Invalid printer');
  if (typeof j.collate !== 'boolean' || typeof j.color !== 'boolean') throw new Error('Invalid job options');
  if (typeof j.title !== 'string') throw new Error('Invalid title');
  if (j.pdfPath !== undefined && typeof j.pdfPath !== 'string') throw new Error('Invalid PDF path');
}

/** Consecutive pages of one size: a printer takes one paper size per job. */
export interface Run {
  from: number;
  to: number;
  w: number;
  h: number;
}

export function runsOf(sizes: readonly Size[]): Run[] {
  const runs: Run[] = [];
  sizes.forEach((s, i) => {
    const last = runs[runs.length - 1];
    if (last && last.w === s.w && last.h === s.h) last.to = i + 1;
    else runs.push({ from: i, to: i + 1, w: s.w, h: s.h });
  });
  return runs;
}

/** What to send to the printer, in order: each run with the copies it needs (whole copies in turn when collating several runs). */
export function printSteps(runs: readonly Run[], copies: number, collate: boolean): Array<{ run: Run; copies: number; collate: boolean }> {
  if (runs.length <= 1) return runs.map((run) => ({ run, copies, collate }));
  if (collate) return Array.from({ length: copies }, () => runs.map((run) => ({ run, copies: 1, collate: false }))).flat();
  return runs.map((run) => ({ run, copies, collate: false }));
}

/** The pages `from`..`to` of the job as an HTML document; the pictures are the job's page-N.svg, numbered from 1. */
export function pagesHtml(job: Pick<PrintJob, 'sizes'>, from = 0, to = job.sizes.length): string {
  const sizes = job.sizes.slice(from, to);
  const kinds = [...new Set(sizes.map((s) => `${s.w}pt ${s.h}pt`))];
  const kindOf = (s: Size) => kinds.indexOf(`${s.w}pt ${s.h}pt`);
  // One named @page per paper size, so a PDF made from the document keeps each page's own size.
  const pageRules = kinds.map((k, i) => `@page s${i} { size: ${k}; margin: 0 }`).join('\n');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file:; style-src 'unsafe-inline'">
<style>
${pageRules}
html, body { margin: 0; padding: 0; background: #fff }
.page { overflow: hidden; break-after: page }
.page:last-child { break-after: auto }
img { display: block; width: 100%; height: 100% }
</style></head><body>
${sizes.map((s, i) => `<div class="page" style="page: s${kindOf(s)}; width: ${s.w}pt; height: ${s.h}pt"><img src="page-${from + i + 1}.svg" alt=""></div>`).join('\n')}
</body></html>`;
}
