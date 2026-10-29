import { describe, expect, it } from 'vitest';
import { microns, pagesHtml, validateJob } from './printJob';

const job = { pages: ['<svg/>', '<svg/>'], width: 595.28, height: 841.89, printer: null, copies: 1, title: 'Doc' };

describe('validateJob', () => {
  it('accepts a normal job, with or without a named printer', () => {
    expect(() => validateJob(job)).not.toThrow();
    expect(() => validateJob({ ...job, printer: 'HP LaserJet', copies: 3 })).not.toThrow();
  });

  it.each([
    ['no pages', { pages: [] }],
    ['pages that are not text', { pages: [1] }],
    ['too many pages', { pages: Array.from({ length: 501 }, () => '<svg/>') }],
    ['a page smaller than half an inch', { width: 10 }],
    ['a page larger than 200 inches', { height: 20000 }],
    ['a size that is not a number', { width: Number.NaN }],
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
    expect(html).toContain('@page { size: 595.28pt 841.89pt; margin: 0 }');
    expect(html).toContain('src="page-1.svg"');
    expect(html).toContain('src="page-2.svg"');
    expect(html).not.toContain('page-3.svg');
    expect(html).toContain('width: 595.28pt; height: 841.89pt');
  });

  it('allows nothing but its own pictures and styles', () => {
    expect(pagesHtml(job)).toContain("default-src 'none'; img-src file:; style-src 'unsafe-inline'");
    expect(pagesHtml(job)).not.toContain('<script');
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
