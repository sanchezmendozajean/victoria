import { describe, expect, it } from 'vitest';
import { microns, pagesHtml, printSteps, runsOf, validateJob } from './printJob';

const A4 = { w: 595.28, h: 841.89 };
const job = { pages: ['<svg/>', '<svg/>'], sizes: [A4, A4], printer: null, copies: 1, collate: true, color: true, title: 'Doc' };

describe('validateJob', () => {
  it('accepts a normal job, with or without a named printer', () => {
    expect(() => validateJob(job)).not.toThrow();
    expect(() => validateJob({ ...job, printer: 'HP LaserJet', copies: 3 })).not.toThrow();
  });

  it.each([
    ['no pages', { pages: [] }],
    ['pages that are not text', { pages: [1] }],
    ['too many pages', { pages: Array.from({ length: 501 }, () => '<svg/>') }],
    ['a page smaller than half an inch', { sizes: [{ w: 10, h: 800 }, A4] }],
    ['a page larger than 200 inches', { sizes: [A4, { w: 500, h: 20000 }] }],
    ['a size that is not a number', { sizes: [{ w: Number.NaN, h: 800 }, A4] }],
    ['a size for each page missing', { sizes: [A4] }],
    ['options that are not flags', { color: 'yes' }],
    ['zero copies', { copies: 0 }],
    ['half a copy', { copies: 1.5 }],
    ['a thousand copies', { copies: 1000 }],
    ['an empty printer name', { printer: '' }],
    ['a printer that is not text', { printer: 7 }],
    ['a title that is not text', { title: null }],
  ])('refuses %s', (_name, patch) => {
    expect(() => validateJob({ ...job, ...patch })).toThrow();
  });

  it('refuses things that are not jobs at all', () => {
    for (const bad of [null, undefined, 'x', 7, []]) expect(() => validateJob(bad)).toThrow();
  });
});

describe('pagesHtml', () => {
  it('sets the paper as @page without margins and shows one image per page, in points', () => {
    const html = pagesHtml(job);
    expect(html).toContain('@page s0 { size: 595.28pt 841.89pt; margin: 0 }');
    expect(html).toContain('src="page-1.svg"');
    expect(html).toContain('src="page-2.svg"');
    expect(html).not.toContain('page-3.svg');
    expect(html).toContain('width: 595.28pt; height: 841.89pt');
  });

  it('gives each paper size its own named page, so a portrait and a landscape page can share a job', () => {
    const html = pagesHtml({ sizes: [A4, { w: A4.h, h: A4.w }, A4] });
    expect(html).toContain('@page s1 { size: 841.89pt 595.28pt; margin: 0 }');
    expect(html).toContain('style="page: s0; width: 595.28pt; height: 841.89pt"');
    expect(html).toContain('style="page: s1; width: 841.89pt; height: 595.28pt"');
  });

  it('shows only the pages asked for, keeping their numbers', () => {
    const html = pagesHtml({ sizes: [A4, A4, A4] }, 1, 3);
    expect(html).not.toContain('page-1.svg');
    expect(html).toContain('page-2.svg');
    expect(html).toContain('page-3.svg');
  });

  it('allows nothing but its own pictures and styles', () => {
    expect(pagesHtml(job)).toContain("default-src 'none'; img-src file:; style-src 'unsafe-inline'");
    expect(pagesHtml(job)).not.toContain('<script');
  });
});

describe('runsOf and printSteps', () => {
  const land = { w: A4.h, h: A4.w };
  it('groups consecutive pages of one size', () => {
    expect(runsOf([A4, A4, land, A4])).toEqual([
      { from: 0, to: 2, ...A4 },
      { from: 2, to: 3, ...land },
      { from: 3, to: 4, ...A4 },
    ]);
  });

  it('a single size goes in one job with its copies and collating', () => {
    expect(printSteps(runsOf([A4, A4]), 3, true)).toEqual([{ run: { from: 0, to: 2, ...A4 }, copies: 3, collate: true }]);
  });

  it('several sizes: whole copies in turn when collating, each run with its copies otherwise', () => {
    const runs = runsOf([A4, land]);
    expect(printSteps(runs, 2, true).map((s) => [s.run.from, s.copies])).toEqual([[0, 1], [1, 1], [0, 1], [1, 1]]);
    expect(printSteps(runs, 2, false).map((s) => [s.run.from, s.copies])).toEqual([[0, 2], [1, 2]]);
  });
});

describe('microns', () => {
  it('converts points to micrometres: A4 is 210 × 297 mm', () => {
    // The paper sizes are kept to 0.01 pt (A4 = 595.28 × 841.89), which is within 5 µm of the true size.
    expect(Math.abs(microns(595.28) - 210000)).toBeLessThan(5);
    expect(Math.abs(microns(841.89) - 297000)).toBeLessThan(5);
    expect(microns(72)).toBe(25400);
  });
});
