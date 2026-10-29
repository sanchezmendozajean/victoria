import { describe, expect, it } from 'vitest';
import { applyToPoint, sequentialIds, type ClipGroupNode, type CompoundNode, type ImageNode, type Matrix, type Node, type PathNode, type TextNode } from '../..';
import { importPdfPage, type PdfHost, type PdfPageData } from './pdf';

// A fake of pdf.js's OPS table: the importer only needs the numbers to agree with the lists it is given.
const OPS: Record<string, number> = {
  save: 10, restore: 11, transform: 12, constructPath: 13, setLineWidth: 14, setLineCap: 15, setLineJoin: 16, setMiterLimit: 17, setDash: 18, setGState: 19,
  stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, clip: 29, eoClip: 30,
  setFillRGBColor: 31, setStrokeRGBColor: 32, setFillColorN: 33, setStrokeColorN: 34, setFillTransparent: 35, setStrokeTransparent: 36,
  paintImageXObject: 37, paintInlineImageXObject: 38, paintImageMaskXObject: 39, paintInlineImageMaskXObject: 40, paintFormXObjectBegin: 41, paintFormXObjectEnd: 42, shadingFill: 43,
};

const FLIP_100: Matrix = [1, 0, 0, -1, 0, 100];
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 4, 0, 0, 0, 2, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80, 15, 0, 4, 133, 1, 128, 132, 169, 140, 33, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

type Op = [keyof typeof OPS, ...unknown[]];
/** The path data pdf.js writes: moveTo 0, lineTo 1, curveTo 2, closePath 4. */
const rectPath = (x0: number, y0: number, x1: number, y1: number) => [0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4];

function page(list: Op[], extra: Partial<PdfPageData> = {}): PdfPageData {
  return {
    width: 200,
    height: 100,
    viewTransform: FLIP_100,
    // pdf.js does not put the viewport transform in the list: the importer starts from `viewTransform`.
    fnArray: list.map(([name]) => OPS[name] as number),
    argsArray: list.map(([, ...args]) => args),
    ...extra,
  };
}
const host = (extra: Partial<PdfHost> = {}): PdfHost => ({ ops: OPS, getObject: async () => null, getImage: async () => null, ...extra });
const run = (list: Op[], h: Partial<PdfHost> = {}, p: Partial<PdfPageData> = {}) => importPdfPage(page(list, p), host(h), sequentialIds('p'));

const fillOf = (n: Node) => n.appearance.items.find((i) => i.kind === 'fill');
const strokeOf = (n: Node) => n.appearance.items.find((i) => i.kind === 'stroke');
const points = (n: Node) => (n as PathNode).anchors.map((a) => [a.p.x, a.p.y]);

describe('importPdfPage · paths and paint', () => {
  it('turns a filled and stroked rectangle into one path with both items, flipped to y down', async () => {
    const r = await run([
      ['setFillRGBColor', '#ff0000'],
      ['setStrokeRGBColor', '#0000ff'],
      ['setLineWidth', 3],
      ['constructPath', OPS.fillStroke, [rectPath(10, 20, 60, 50)], [10, 20, 60, 50]],
    ]);
    expect(r).toMatchObject({ width: 200, height: 100 });
    expect(r.nodes).toHaveLength(1);
    const n = r.nodes[0] as PathNode;
    expect(n.closed).toBe(true);
    expect(points(n)).toEqual([[10, 80], [60, 80], [60, 50], [10, 50]]);
    expect(fillOf(n)).toMatchObject({ paint: { type: 'solid', color: { values: [255, 0, 0] } }, opacity: 1 });
    expect(strokeOf(n)).toMatchObject({ paint: { color: { values: [0, 0, 255] } }, stroke: { width: 3 } });
  });

  it('keeps curves with their handles, and quadratic curves as cubics', async () => {
    const r = await run([['constructPath', OPS.stroke, [[0, 0, 0, 2, 0, 10, 10, 20, 20, 20, 3, 30, 0, 40, 20]], [0, 0, 40, 20]]]);
    const n = r.nodes[0] as PathNode;
    expect(n.anchors).toHaveLength(3);
    expect(n.anchors[0]!.out).toEqual({ x: 0, y: 90 });
    expect(n.anchors[1]!.in).toEqual({ x: 10, y: 80 });
    expect(n.anchors[2]!.p).toEqual({ x: 40, y: 80 });
    expect(n.anchors[2]!.in!.x).toBeCloseTo(33.333, 3);
    expect(n.closed).toBe(false);
  });

  it('even-odd fills of several contours are one compound path with that rule', async () => {
    const r = await run([['setFillRGBColor', '#00ff00'], ['constructPath', OPS.eoFill, [[...rectPath(0, 0, 50, 50), ...rectPath(10, 10, 20, 20)]], [0, 0, 50, 50]]]);
    const n = r.nodes[0] as CompoundNode;
    expect(n.type).toBe('compound');
    expect(n.fillRule).toBe('evenodd');
    expect(n.children).toHaveLength(2);
    expect(strokeOf(n)).toBeUndefined();
  });

  it('closeStroke closes the contour', async () => {
    const r = await run([['constructPath', OPS.closeStroke, [[0, 0, 0, 1, 30, 0, 1, 30, 30]], [0, 0, 30, 30]]]);
    expect((r.nodes[0] as PathNode).closed).toBe(true);
  });

  it('applies the current matrix to the geometry and scales line width and dashes by it', async () => {
    const r = await run([
      ['save'],
      ['transform', 2, 0, 0, 2, 5, 5],
      ['setLineWidth', 2],
      ['setLineCap', 1],
      ['setLineJoin', 2],
      ['setMiterLimit', 7],
      ['setDash', [3, 1], 0],
      ['constructPath', OPS.stroke, [[0, 0, 0, 1, 10, 0]], [0, 0, 10, 0]],
      ['restore'],
      ['constructPath', OPS.stroke, [[0, 0, 0, 1, 10, 0]], [0, 0, 10, 0]],
    ]);
    const [scaled, plain] = r.nodes;
    expect(points(scaled!)).toEqual([[5, 95], [25, 95]]);
    expect(strokeOf(scaled!)).toMatchObject({ stroke: { width: 4, cap: 'round', join: 'bevel', miterLimit: 7, dash: [6, 2] } });
    // After restore everything is back to the defaults: width 1, butt caps, no dashes.
    expect(strokeOf(plain!)).toMatchObject({ stroke: { width: 1, cap: 'butt', join: 'miter', dash: null } });
    expect(points(plain!)).toEqual([[0, 100], [10, 100]]);
  });

  it('keeps a hairline visible', async () => {
    const r = await run([['setLineWidth', 0], ['constructPath', OPS.stroke, [[0, 0, 0, 1, 10, 0]], [0, 0, 10, 0]]]);
    expect(strokeOf(r.nodes[0]!)).toMatchObject({ stroke: { width: 0.25 } });
  });

  it('reads alpha and blend mode from graphics states, and warns about soft masks', async () => {
    const r = await run([
      ['setGState', [['ca', 0.5], ['CA', 0.25], ['BM', 'Multiply']]],
      ['setStrokeRGBColor', '#000000'],
      ['constructPath', OPS.fillStroke, [rectPath(0, 0, 10, 10)], [0, 0, 10, 10]],
      ['setGState', [['SMask', { some: 'mask' }]]],
    ]);
    const n = r.nodes[0]!;
    expect(fillOf(n)!.opacity).toBe(0.5);
    expect(strokeOf(n)!.opacity).toBe(0.25);
    expect(n.blendMode).toBe('multiply');
    expect(r.warnings.map((w) => w.code)).toEqual(['soft-mask']);
  });

  it('a transparent colour space paints nothing', async () => {
    const r = await run([['setFillTransparent'], ['constructPath', OPS.fill, [rectPath(0, 0, 10, 10)], [0, 0, 10, 10]]]);
    expect(r.nodes).toHaveLength(0);
  });

  it('ignores operators it does not know and an unbalanced restore', async () => {
    const r = await run([['restore'], ['restore'], ['constructPath', OPS.fill, [rectPath(0, 0, 10, 10)], [0, 0, 10, 10]]]);
    expect(r.nodes).toHaveLength(1);
  });
});

describe('importPdfPage · clipping', () => {
  it('clip + endPath opens a clipping group with the mask first, closed by the matching restore', async () => {
    const r = await run([
      ['save'],
      ['clip'],
      ['constructPath', OPS.endPath, [rectPath(0, 0, 40, 40)], [0, 0, 40, 40]],
      ['constructPath', OPS.fill, [rectPath(0, 0, 100, 100)], [0, 0, 100, 100]],
      ['restore'],
      ['constructPath', OPS.fill, [rectPath(0, 0, 5, 5)], [0, 0, 5, 5]],
    ]);
    expect(r.nodes.map((n) => n.type)).toEqual(['clipGroup', 'path']);
    const clip = r.nodes[0] as ClipGroupNode;
    expect(clip.children).toHaveLength(2);
    expect(points(clip.children[0]!)).toEqual([[0, 100], [40, 100], [40, 60], [0, 60]]);
    expect(clip.children[1]!.type).toBe('path');
  });

  it('nested clips nest their groups; an empty clip leaves nothing behind', async () => {
    const r = await run([
      ['save'],
      ['clip'],
      ['constructPath', OPS.endPath, [rectPath(0, 0, 80, 80)], [0, 0, 80, 80]],
      ['clip'],
      ['constructPath', OPS.endPath, [rectPath(10, 10, 50, 50)], [10, 10, 50, 50]],
      ['constructPath', OPS.fill, [rectPath(0, 0, 100, 100)], [0, 0, 100, 100]],
      ['restore'],
      ['save'],
      ['clip'],
      ['constructPath', OPS.endPath, [rectPath(0, 0, 5, 5)], [0, 0, 5, 5]],
      ['restore'],
    ]);
    expect(r.nodes).toHaveLength(1);
    const outer = r.nodes[0] as ClipGroupNode;
    const inner = outer.children[1] as ClipGroupNode;
    expect(inner.type).toBe('clipGroup');
    expect(inner.children[1]!.type).toBe('path');
  });

  it('a form XObject with a box clips to it and restores the matrix at its end', async () => {
    const r = await run([
      ['paintFormXObjectBegin', [1, 0, 0, 1, 10, 0], [0, 0, 30, 30]],
      ['constructPath', OPS.fill, [rectPath(0, 0, 100, 100)], [0, 0, 100, 100]],
      ['paintFormXObjectEnd'],
      ['constructPath', OPS.fill, [rectPath(0, 0, 5, 5)], [0, 0, 5, 5]],
    ]);
    const [group, after] = r.nodes;
    expect(group!.type).toBe('clipGroup');
    expect(points((group as ClipGroupNode).children[0]!)[0]).toEqual([10, 100]);
    expect(points(after!)[0]).toEqual([0, 100]);
  });
});

describe('importPdfPage · gradients, pictures and text', () => {
  const axial = ['RadialAxial', 'axial', null, [[0, '#ff0000'], [1, '#0000ff']], [0, 0], [1, 0], null, null];

  it('turns a shading pattern into a gradient painted in page coordinates', async () => {
    const r = await run([['setFillColorN', 'Shading', 'p1', [50, 0, 0, -30, 0, 100]], ['constructPath', OPS.fill, [rectPath(0, 70, 50, 100)], [0, 70, 50, 100]]], { getObject: async (id) => (id === 'p1' ? axial : null) });
    expect(r.gradients).toHaveLength(1);
    expect(r.gradients[0]!.stops.map((s) => s.offset)).toEqual([0, 1]);
    const paint = fillOf(r.nodes[0]!)!.paint;
    expect(paint.type).toBe('linear');
    if (paint.type !== 'linear') return;
    // The same matrix the exporter wrote: the unit axis lands on the rectangle's top edge, 50 wide.
    expect(paint.transform).toEqual([50, 0, 0, 30, 0, 0]);
  });

  it('maps a radial shading onto its centre and radius', async () => {
    const radial = ['RadialAxial', 'radial', null, [[0, '#ffffff'], [1, '#000000']], [0, 0], [0, 0], 0, 1];
    const r = await run([['setFillColorN', 'Shading', 'r1', [20, 0, 0, 20, 30, 40]], ['constructPath', OPS.fill, [rectPath(0, 0, 60, 80)], [0, 0, 60, 80]]], { getObject: async () => radial });
    const paint = fillOf(r.nodes[0]!)!.paint;
    expect(paint.type).toBe('radial');
    if (paint.type !== 'radial') return;
    expect(applyToPoint(paint.transform, { x: 0, y: 0 })).toEqual({ x: 30, y: 60 });
    expect(applyToPoint(paint.transform, { x: 1, y: 0 })).toEqual({ x: 50, y: 60 });
    expect(r.warnings).toEqual([]);
  });

  it('warns about tiling patterns and unknown shadings, and keeps the previous colour', async () => {
    const r = await run([['setFillRGBColor', '#010203'], ['setFillColorN', 'TilingPattern', 'x'], ['setFillColorN', 'Shading', 'nope', [1, 0, 0, 1, 0, 0]], ['constructPath', OPS.fill, [rectPath(0, 0, 9, 9)], [0, 0, 9, 9]]]);
    expect(fillOf(r.nodes[0]!)).toMatchObject({ paint: { color: { values: [1, 2, 3] } } });
    expect(r.warnings.map((w) => w.code)).toEqual(['pattern', 'pattern']);
  });

  it('places a picture on the unit square, first row at the top, and shares the file', async () => {
    const r = await run(
      [
        ['save'],
        ['transform', 40, 0, 0, 20, 10, 30],
        ['paintImageXObject', 'img1', 4, 2],
        ['restore'],
        ['paintImageXObject', 'img1', 4, 2],
        ['paintImageXObject', 'gone', 1, 1],
      ],
      { getImage: async (id) => (id === 'img1' ? { bytes: PNG } : null) },
    );
    const [a] = r.nodes as ImageNode[];
    expect(r.nodes).toHaveLength(2);
    expect(Object.keys(r.images)).toHaveLength(1);
    expect(r.images[a!.resourceId]!.resource).toEqual({ width: 4, height: 2, format: 'png' });
    expect([a!.width, a!.height]).toEqual([4, 2]);
    // Pixel (0,0) is the top-left of the unit square: PDF (10, 50) → page (10, 50).
    expect(applyToPoint(a!.transform, { x: 0, y: 0 })).toEqual({ x: 10, y: 50 });
    // Pixel (4,2) is the bottom-right: PDF (50, 30) → page (50, 70).
    expect(applyToPoint(a!.transform, { x: 4, y: 2 })).toEqual({ x: 50, y: 70 });
    expect(r.warnings.map((w) => w.code)).toEqual(['image']);
  });

  it('warns about image masks and the sh operator', async () => {
    const r = await run([['paintImageMaskXObject', 'm'], ['shadingFill', 's']]);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['image-mask', 'shading']);
  });

  it('brings text in as upright point text at its baseline, with its size', async () => {
    const r = await run([], { text: [{ str: 'Hola', transform: [12, 0, 0, 12, 20, 70], fontFamily: 'Helvetica, sans-serif' }, { str: '  ', transform: [12, 0, 0, 12, 0, 0] }] });
    expect(r.nodes).toHaveLength(1);
    const t = r.nodes[0] as TextNode;
    expect(t.story[0]).toMatchObject({ text: 'Hola', style: { fontFamily: 'Helvetica', size: 12 } });
    // Baseline at PDF (20, 70) → page (20, 30); upright, not mirrored.
    expect(t.transform).toEqual([1, 0, 0, 1, 20, 30]);
    expect(r.warnings.map((w) => w.code)).toEqual(['text']);
  });
});
