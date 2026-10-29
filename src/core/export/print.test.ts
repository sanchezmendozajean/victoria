import { describe, expect, it } from 'vitest';
import {
  addNode,
  buildScene,
  createArtboard,
  createDocument,
  createRect,
  DocumentSession,
  getActiveSpace,
  markLines,
  mmToPt,
  PAPER_SIZES,
  pageScene,
  parseRange,
  planPage,
  resolveOrientation,
  sequentialIds,
  setNodeAppearance,
  writeSvg,
  type Artboard,
  type PrintLayout,
} from '..';

const A4 = PAPER_SIZES.find((p) => p.id === 'a4')!;
const ids = sequentialIds('p');
const board = (w: number, h: number, bleed = 0): Artboard => ({ ...createArtboard(ids, { name: 'A', x: 50, y: 60, w, h }), bleed: { top: bleed, right: bleed, bottom: bleed, left: bleed } });
const layout = (extra: Partial<PrintLayout> = {}): PrintLayout => ({ paper: { w: A4.w, h: A4.h }, orientation: 'portrait', scale: { mode: 'none' }, anchor: { col: 1, row: 1 }, marks: null, includeBleed: false, ...extra });
const near = (a: number, b: number, digits = 4) => expect(a).toBeCloseTo(b, digits);

describe('planPage', () => {
  it('100 %: the artboard keeps its size and is centred on the paper', () => {
    const plan = planPage(board(mmToPt(100), mmToPt(100)), layout(), 'portrait');
    expect(plan.scale).toBe(1);
    expect(plan.page).toEqual({ w: A4.w, h: A4.h });
    near(plan.origin.x, (A4.w - mmToPt(100)) / 2);
    near(plan.origin.y, (A4.h - mmToPt(100)) / 2);
    near(plan.trimOnPage.maxX - plan.trimOnPage.minX, 283.4646, 3); // 100 mm
    expect(plan.overflow).toBe(false);
  });

  it('turns the paper for landscape and follows the artboard for auto', () => {
    const wide = board(400, 200);
    expect(resolveOrientation(wide, layout({ orientation: 'auto' }))).toBe('landscape');
    expect(resolveOrientation(board(200, 400), layout({ orientation: 'auto' }))).toBe('portrait');
    expect(resolveOrientation(wide, layout({ orientation: 'portrait' }))).toBe('portrait');
    expect(planPage(wide, layout(), 'landscape').page).toEqual({ w: A4.h, h: A4.w });
  });

  it('puts the artboard in any of the nine cells of the page', () => {
    const b = board(100, 100);
    const at = (col: 0 | 1 | 2, row: 0 | 1 | 2) => planPage(b, layout({ anchor: { col, row } }), 'portrait').origin;
    expect(at(0, 0)).toEqual({ x: 0, y: 0 });
    expect(at(2, 2)).toEqual({ x: A4.w - 100, y: A4.h - 100 });
    near(at(1, 0).x, (A4.w - 100) / 2);
    expect(at(1, 0).y).toBe(0);
    near(at(0, 2).y, A4.h - 100);
  });

  it('fit scales to the largest size that fits, up or down; custom takes a percentage', () => {
    const big = planPage(board(1000, 500), layout({ scale: { mode: 'fit' } }), 'portrait');
    near(big.scale, A4.w / 1000);
    expect(big.overflow).toBe(false);
    const small = planPage(board(100, 100), layout({ scale: { mode: 'fit' } }), 'portrait');
    near(small.scale, A4.w / 100);
    expect(planPage(board(100, 100), layout({ scale: { mode: 'custom', percent: 50 } }), 'portrait').scale).toBe(0.5);
  });

  it('reports artwork that does not fit instead of hiding it', () => {
    expect(planPage(board(1000, 1000), layout(), 'portrait').overflow).toBe(true);
    expect(planPage(board(1000, 1000), layout({ scale: { mode: 'fit' } }), 'portrait').overflow).toBe(false);
  });

  it('prints the bleed when asked, and keeps the trim where it belongs', () => {
    const b = board(200, 100, 10);
    const withBleed = planPage(b, layout({ includeBleed: true, anchor: { col: 0, row: 0 } }), 'portrait');
    expect(withBleed.region).toEqual({ minX: 40, minY: 50, maxX: 260, maxY: 170 });
    expect(withBleed.trimOnPage).toMatchObject({ minX: 10, minY: 10, maxX: 210, maxY: 110 });
    const without = planPage(b, layout({ anchor: { col: 0, row: 0 } }), 'portrait');
    expect(without.trimOnPage).toMatchObject({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
  });

  it('with marks the artwork stays inside a margin that fits them', () => {
    const marks = { style: 'western' as const, weight: 0.25, offset: 6 };
    const plan = planPage(board(100, 100), layout({ marks, anchor: { col: 0, row: 0 } }), 'portrait');
    expect(plan.origin).toEqual({ x: 24, y: 24 }); // offset 6 + mark length 18
    const fit = planPage(board(2000, 2000), layout({ marks, scale: { mode: 'fit' } }), 'portrait');
    near(fit.scale, (A4.w - 48) / 2000);
  });
});

describe('crop marks', () => {
  const marks = { style: 'western' as const, weight: 0.25, offset: 6 };

  it('western marks: two lines per corner, starting at the offset and pointing away from the trim', () => {
    const b = board(100, 100);
    const plan = planPage(b, layout({ marks, anchor: { col: 0, row: 0 } }), 'portrait');
    const lines = markLines(plan, marks, b);
    expect(lines).toHaveLength(8);
    // Top-left corner of the trim is at (24, 24): a horizontal mark to its left and a vertical one above it.
    expect(lines).toContainEqual([{ x: 18, y: 24 }, { x: 0, y: 24 }]);
    expect(lines).toContainEqual([{ x: 24, y: 18 }, { x: 24, y: 0 }]);
    // Bottom-right corner (124, 124): to the right and below.
    expect(lines).toContainEqual([{ x: 130, y: 124 }, { x: 148, y: 124 }]);
    expect(lines).toContainEqual([{ x: 124, y: 130 }, { x: 124, y: 148 }]);
  });

  it('Japanese marks add a second line at the bleed distance', () => {
    const b = board(100, 100, 10);
    const jp = { ...marks, style: 'japanese' as const };
    const plan = planPage(b, layout({ marks: jp, includeBleed: true, anchor: { col: 0, row: 0 } }), 'portrait');
    const lines = markLines(plan, jp, b);
    expect(lines).toHaveLength(16);
    // The trim's top-left corner is at (34, 34): the extra horizontal mark sits 10 pt above it (the bleed).
    expect(lines).toContainEqual([{ x: 28, y: 24 }, { x: 10, y: 24 }]);
  });
});

describe('pageScene', () => {
  it('a 100 mm square is 100 mm on the A4 page, at 100 %, as it will go to the printer', () => {
    const sid = sequentialIds('s');
    const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids: sid, now: '2026-01-01T00:00:00.000Z' });
    const session = new DocumentSession(doc, { ids: sid });
    const space = () => getActiveSpace(session.document);
    const size = mmToPt(100);
    const sheet = { ...space().artboards[0]!, x: 0, y: 0, w: size, h: size };
    session.run({ label: 'board', apply: (d) => void Object.assign(d.spaces[0]!.artboards[0]!, { x: 0, y: 0, w: size, h: size }) });
    const rect = createRect(sid, size, size);
    session.run(addNode(space().id, space().layers[0]!.id, rect));
    session.run(setNodeAppearance(space().id, rect.id, { items: [{ kind: 'fill', paint: { type: 'solid', color: { model: 'rgb', values: [255, 0, 0] } }, opacity: 1, modifiers: [] }] }));

    const lay = layout();
    const plan = planPage(sheet, lay, 'portrait');
    const content = buildScene(space(), { resources: session.document.resources, region: plan.region });
    const svg = writeSvg(pageScene(content, plan, lay, sheet), session.images, { minify: true }).svg;
    expect(svg).toContain(`width="${A4.w}" height="${A4.h}"`);
    expect(svg).toContain('d="M0 0L283.465 0L283.465 283.465L0 283.465Z"'); // 100 mm
    const x = (A4.w - size) / 2;
    const y = (A4.h - size) / 2;
    expect(svg).toContain(`matrix(1 0 0 1 ${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000})`);
    // The artwork is clipped to its region: nothing can print outside it.
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('<rect width="595.28" height="841.89" fill="#ffffff"/>');
  });
});

describe('parseRange', () => {
  it('reads lists and ranges, ascending and without repeats, clipped to the count', () => {
    expect(parseRange('', 4)).toEqual([1, 2, 3, 4]);
    expect(parseRange('1-3, 5', 6)).toEqual([1, 2, 3, 5]);
    expect(parseRange('5,2,2,3-4', 6)).toEqual([2, 3, 4, 5]);
    expect(parseRange('4-', 6)).toEqual([4, 5, 6]);
    expect(parseRange('-2', 6)).toEqual([1, 2]);
    expect(parseRange('3-99', 5)).toEqual([3, 4, 5]);
    expect(parseRange('9', 5)).toEqual([]);
  });

  it('refuses what is not a range', () => {
    for (const bad of ['a', '1--2', '3-1', '0', ',', '1,,2', '-', '1 2']) expect(parseRange(bad, 9)).toBeNull();
  });
});
