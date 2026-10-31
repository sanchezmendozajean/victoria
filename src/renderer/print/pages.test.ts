import { describe, expect, it } from 'vitest';
import { createArtboard, createDocument, mmToPt, sequentialIds, type Document } from '../../core';
import { DEFAULT_PRINT_SETTINGS, planPrint, printWarnings, rememberable, type PrintSettings } from './pages';

const ids = sequentialIds('pp');
/** A document with a portrait, a landscape and a square artboard, in that order. */
function sample(): Document {
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'Retrato', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const space = doc.spaces[0]!;
  Object.assign(space.artboards[0]!, { x: 0, y: 0, w: mmToPt(100), h: mmToPt(150) });
  space.artboards.push(createArtboard(ids, { name: 'Paisaje', x: 400, y: 0, w: mmToPt(200), h: mmToPt(100) }));
  space.artboards.push(createArtboard(ids, { name: 'Cuadro', x: 900, y: 0, w: mmToPt(80), h: mmToPt(80) }));
  return doc;
}
const settings = (patch: Partial<PrintSettings> = {}): PrintSettings => ({ ...DEFAULT_PRINT_SETTINGS, ...patch });

describe('planPrint', () => {
  it('Auto orientation is decided by each artboard, within one job', () => {
    const plan = planPrint(sample(), settings({ scope: 'all' }), null);
    expect(plan.total).toBe(3);
    expect(plan.pages.map((p) => p.plan.orientation)).toEqual(['portrait', 'landscape', 'portrait']);
    expect(plan.pages[1]!.plan.page.w).toBeGreaterThan(plan.pages[1]!.plan.page.h);
  });

  it('a range keeps the order written, and says what is wrong with it', () => {
    const doc = sample();
    expect(planPrint(doc, settings({ scope: 'range', range: '3, 1' }), null).pages.map((p) => p.number)).toEqual([3, 1]);
    expect(planPrint(doc, settings({ scope: 'range', range: '' }), null).error).toEqual({ kind: 'empty' });
    const bad = planPrint(doc, settings({ scope: 'range', range: '1-9' }), null);
    expect(bad.error).toEqual({ kind: 'bounds', token: '1-9', count: 3 });
    expect(bad.pages).toEqual([]);
  });

  it('the bleed of the dialog replaces the artboard\'s own and fit leaves room for it', () => {
    const doc = sample();
    const plain = planPrint(doc, settings({ scale: 'fit' }), null).pages[0]!.plan.scale;
    const bleed = planPrint(doc, settings({ scale: 'fit', includeBleed: true, bleedMm: 10 }), null).pages[0]!.plan;
    expect(bleed.scale).toBeLessThan(plain);
    expect(bleed.region.minX).toBeCloseTo(-mmToPt(10));
  });
});

describe('printWarnings', () => {
  const none = () => false;
  it('warns about artwork outside the sheet, with the artboard and by how much, and offers nothing when it fits', () => {
    const doc = sample();
    const big = printWarnings(doc, planPrint(doc, settings({ scale: 'custom', percent: 400 }), null), none);
    expect(big).toHaveLength(1);
    expect(big[0]).toMatchObject({ kind: 'clip', count: 1, name: 'Retrato' });
    expect(printWarnings(doc, planPrint(doc, settings({ scale: 'fit' }), null), none)).toEqual([]);
  });

  it('marks that do not fit are reported when nothing else is cut', () => {
    const doc = sample();
    // 200 mm wide on A4 landscape (297 mm): the artwork fits, the marks (8 mm each side) still do.
    const plan = planPrint(doc, settings({ scope: 'range', range: '2', marks: true, scale: 'custom', percent: 145 }), null);
    expect(printWarnings(doc, plan, none)).toEqual([{ kind: 'marks' }]);
  });

  it('reports an invalid range once', () => {
    const doc = sample();
    expect(printWarnings(doc, planPrint(doc, settings({ scope: 'range', range: 'x' }), null), none)).toEqual([{ kind: 'range', error: { kind: 'token', token: 'x' } }]);
  });
});

describe('rememberable', () => {
  it('keeps the printer and layout but not the copies, the collating, the scope or the range', () => {
    const kept = rememberable(settings({ copies: 5, collate: false, range: '1', scope: 'range', paper: 'a3', marks: true }));
    expect(kept).toMatchObject({ paper: 'a3', marks: true });
    expect(kept).not.toHaveProperty('copies');
    expect(kept).not.toHaveProperty('range');
    expect(kept).not.toHaveProperty('scope');
    expect(kept).not.toHaveProperty('collate');
  });
});
