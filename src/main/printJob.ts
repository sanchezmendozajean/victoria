import type { PrintJob } from './platform/types';

// The parts of printing that need no Electron: checking a job and writing the HTML that shows its pages.

const MAX_PAGES = 500;
const MAX_BYTES = 512 * 1024 * 1024;
/** pt → micrometres, the unit Electron wants for a page size. */
export const microns = (pt: number): number => Math.round((pt / 72) * 25400);
const MIN_SIDE = 36;
const MAX_SIDE = 14400;

export function validateJob(job: unknown): asserts job is PrintJob {
  const j = job as Partial<PrintJob> | null;
  if (!j || !Array.isArray(j.pages) || j.pages.length < 1 || j.pages.length > MAX_PAGES || !j.pages.every((p) => typeof p === 'string')) throw new Error('Invalid print pages');
  if (j.pages.reduce((n, p) => n + p.length, 0) > MAX_BYTES) throw new Error('Print job too large');
  for (const side of [j.width, j.height]) if (typeof side !== 'number' || !Number.isFinite(side) || side < MIN_SIDE || side > MAX_SIDE) throw new Error('Invalid page size');
  if (typeof j.copies !== 'number' || !Number.isInteger(j.copies) || j.copies < 1 || j.copies > 999) throw new Error('Invalid copies');
  if (j.printer !== null && (typeof j.printer !== 'string' || j.printer.length === 0 || j.printer.length > 256)) throw new Error('Invalid printer');
  if (typeof j.title !== 'string') throw new Error('Invalid title');
}

export function pagesHtml(job: Pick<PrintJob, 'pages' | 'width' | 'height'>): string {
  const { width: w, height: h } = job;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file:; style-src 'unsafe-inline'">
<style>
@page { size: ${w}pt ${h}pt; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff }
.page { width: ${w}pt; height: ${h}pt; overflow: hidden; break-after: page }
.page:last-child { break-after: auto }
img { display: block; width: ${w}pt; height: ${h}pt }
</style></head><body>
${job.pages.map((_, i) => `<div class="page"><img src="page-${i + 1}.svg" alt=""></div>`).join('\n')}
</body></html>`;
}

