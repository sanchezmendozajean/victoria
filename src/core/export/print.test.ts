import { describe, expect, it } from 'vitest';
import {
  addNode,
  buildScene,
  createArtboard,
  createDocument,
  createRect,
  DocumentSession,
  getActiveSpace,
  MARK_LENGTH,
  markLines,
  mmToPt,
  PAPER_SIZES,
  pageScene,
  parseArtboardRange,
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
type Line = Array<{ x: number; y: number }>;
const hasLine = (lines: Line[], [a, b]: [[number, number], [number, number]]) =>
  lines.some((l) => Math.abs(l[0]!.x - a[0]) < 1e-6 && Math.abs(l[0]!.y - a[1]) < 1e-6 && Math.abs(l[1]!.x - b[0]) < 1e-6 && Math.abs(l[1]!.y - b[1]) < 1e-6);

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
    near(plan.origin.x, 6 + MARK_LENGTH); // offset + mark length
    near(plan.origin.y, 6 + MARK_LENGTH);
    const fit = planPage(board(2000, 2000), layout({ marks, scale: { mode: 'fit' } }), 'portrait');
    near(fit.scale, (A4.w - 2 * (6 + MARK_LENGTH)) / 2000);
  });
});

describe('crop marks', () => {
  const marks = { style: 'western' as const, weight: 0.25, offset: 6 };

  it('western marks: two lines per corner, starting at the offset and pointing away from the trim', () => {
    const b = board(100, 100);
    const plan = planPage(b, layout({ marks, anchor: { col: 0, row: 0 } }), 'portrait');
    const lines = markLines(plan, marks, b);
    expect(lines).toHaveLength(8);
    const c = 6 + MARK_LENGTH;
    // Top-left corner of the trim is at (c, c): a horizontal mark to its left and a vertical one above it.
    expect(hasLine(lines, [[MARK_LENGTH, c], [0, c]])).toBe(true);
    expect(hasLine(lines, [[c, MARK_LENGTH], [c, 0]])).toBe(true);
    // Bottom-right corner (c + 100, c + 100): to the right and below.
    expect(hasLine(lines, [[c + 106, c + 100], [c + 106 + MARK_LENGTH, c + 100]])).toBe(true);
    expect(hasLine(lines, [[c + 100, c + 106], [c + 100, c + 106 + MARK_LENGTH]])).toBe(true);
  });

  it('Japanese marks add a second line at the bleed distance', () => {
    const b = board(100, 100, 10);
    const jp = { ...marks, style: 'japanese' as const };
    const plan = planPage(b, layout({ marks: jp, includeBleed: true, anchor: { col: 0, row: 0 } }), 'portrait');
    const lines = markLines(plan, jp, b);
    expect(lines).toHaveLength(16);
    // The trim's top-left corner is at (c, c), c = max(bleed, offset + length): the extra horizontal mark sits 10 pt above it (the bleed).
    const c = 6 + MARK_LENGTH;
    expect(hasLine(lines, [[c - 6, c - 10], [c - 6 - MARK_LENGTH, c - 10]])).toBe(true);
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

describe('planPage · printable area', () => {
  const margin = mmToPt(3.2);
  it('reports what falls into the unprintable margin, the marks that do not fit and the room left', () => {
    const full = planPage(board(A4.w, A4.h), layout({ unprintable: margin }), 'portrait');
    near(full.clip, margin);
    expect(full.overflow).toBe(true);
    expect(full.slack.x).toBeLessThan(0);
    const fits = planPage(board(200, 200), layout({ unprintable: margin }), 'portrait');
    expect(fits.clip).toBe(0);
    expect(fits.slack.x).toBeGreaterThan(0);
    const marks = { style: 'western' as const, weight: 0.25, offset: mmToPt(3) };
    const tight = planPage(board(A4.w - 2 * margin - 2, 300), layout({ marks, unprintable: margin }), 'portrait');
    expect(tight.clip).toBe(0);
    expect(tight.marksOut).toBe(true);
  });
  it('fit leaves the unprintable margin and the marks free', () => {
    const plan = planPage(board(1000, 100), layout({ scale: { mode: 'fit' }, unprintable: margin }), 'portrait');
    near(plan.scale, (A4.w - 2 * margin) / 1000);
    expect(plan.overflow).toBe(false);
  });
});

describe('parseArtboardRange', () => {
  it('reads lists and ranges in the order written, without repeats', () => {
    expect(parseArtboardRange('1-3, 5', 6)).toEqual({ pages: [1, 2, 3, 5] });
    expect(parseArtboardRange('5,2,2,3-4', 6)).toEqual({ pages: [5, 2, 3, 4] });
    expect(parseArtboardRange('3-1', 6)).toEqual({ pages: [1, 2, 3] });
  });

  it('explains what is wrong', () => {
    expect(parseArtboardRange('', 3)).toEqual({ error: { kind: 'empty' } });
    expect(parseArtboardRange(' , ', 3)).toEqual({ error: { kind: 'empty' } });
    expect(parseArtboardRange('1, x', 3)).toEqual({ error: { kind: 'token', token: 'x' } });
    expect(parseArtboardRange('1 2', 3)).toEqual({ error: { kind: 'token', token: '1 2' } });
    expect(parseArtboardRange('2-9', 3)).toEqual({ error: { kind: 'bounds', token: '2-9', count: 3 } });
    expect(parseArtboardRange('0', 3)).toEqual({ error: { kind: 'bounds', token: '0', count: 3 } });
  });
});
