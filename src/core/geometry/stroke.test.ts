import { describe, expect, it } from 'vitest';
import {
  alignedDash,
  arrowheadAt,
  ARROWS,
  cornerAnchor,
  defaultStroke,
  endTangent,
  segmentLength,
  segmentsOf,
  subPathLength,
  trimSegments,
  variableWidthOutline,
  WIDTH_PROFILES,
  type Anchor,
  type SubPath,
} from '..';

const line = (...pts: Array<[number, number]>): SubPath => ({ anchors: pts.map(([x, y]) => cornerAnchor({ x, y })), closed: false });

describe('lengths and trimming', () => {
  it('measures straight and curved spans', () => {
    expect(subPathLength(line([0, 0], [30, 40]))).toBe(50);
    const quarter: Anchor[] = [
      { p: { x: 100, y: 0 }, in: null, out: { x: 100, y: 55.2285 }, kind: 'smooth' },
      { p: { x: 0, y: 100 }, in: { x: 55.2285, y: 100 }, out: null, kind: 'smooth' },
    ];
    expect(segmentLength(segmentsOf({ anchors: quarter, closed: false })[0]!)).toBeCloseTo((Math.PI / 2) * 100, 0);
  });

  it('trims both ends of a polyline by length', () => {
    const segs = segmentsOf(line([0, 0], [100, 0], [100, 100]));
    const trimmed = trimSegments(segs, 10, 30);
    expect(trimmed[0]!.p0).toEqual({ x: 10, y: 0 });
    expect(trimmed[trimmed.length - 1]!.p3.x).toBeCloseTo(100, 6);
    expect(trimmed[trimmed.length - 1]!.p3.y).toBeCloseTo(70, 6);
  });

  it('drops whole spans when the trim is longer than they are', () => {
    const segs = segmentsOf(line([0, 0], [10, 0], [20, 0], [30, 0]));
    const trimmed = trimSegments(segs, 0, 25);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]!.p3.x).toBeCloseTo(5, 6);
    expect(trimSegments(segs, 0, 1000)).toEqual([]);
  });

  it('trims a curve keeping it a curve of the right length', () => {
    const arc: Anchor[] = [
      { p: { x: 100, y: 0 }, in: null, out: { x: 100, y: 55.2285 }, kind: 'smooth' },
      { p: { x: 0, y: 100 }, in: { x: 55.2285, y: 100 }, out: null, kind: 'smooth' },
    ];
    const seg = segmentsOf({ anchors: arc, closed: false });
    const total = segmentLength(seg[0]!);
    const cut = trimSegments(seg, 0, 40);
    expect(segmentLength(cut[0]!)).toBeCloseTo(total - 40, 1);
  });
});

describe('dashes that fit the path', () => {
  it('scales the pattern to repeat a whole number of times', () => {
    const dash = alignedDash([10, 5], 100); // pattern 15 → 7 repeats would be 105; 6.67 rounds to 7
    expect(dash.reduce((a, b) => a + b, 0) * 7).toBeCloseTo(100, 9);
    expect(dash[0]! / dash[1]!).toBeCloseTo(2, 9);
  });

  it('repeats an odd pattern and ignores empty ones', () => {
    expect(alignedDash([4], 40)).toEqual([4, 4]);
    expect(alignedDash([0, 0], 40)).toEqual([0, 0]);
    expect(alignedDash([6, 2], 3)).toHaveLength(2);
  });
});

describe('arrowheads', () => {
  it('has no head by default, on closed paths, or for unknown ids', () => {
    const stroke = defaultStroke();
    expect(arrowheadAt(line([0, 0], [100, 0]), stroke, 'end')).toBeNull();
    expect(arrowheadAt({ ...line([0, 0], [100, 0], [100, 100]), closed: true }, { ...stroke, endArrow: 'simple' }, 'end')).toBeNull();
    expect(arrowheadAt(line([0, 0], [100, 0]), { ...stroke, endArrow: 'nope' }, 'end')).toBeNull();
  });

  it('places the tip at the end of the path pointing out of it', () => {
    const head = arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), width: 2, endArrow: 'simple' }, 'end')!;
    const poly = head.fills[0]!;
    expect(poly[0]).toEqual({ x: 100, y: 0 });
    expect(poly[1]!.x).toBeLessThan(100); // the base is behind the tip
    expect(head.trim).toBeGreaterThan(0);
    const start = arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), width: 2, startArrow: 'simple' }, 'start')!;
    expect(start.fills[0]![0]).toEqual({ x: 0, y: 0 });
    expect(start.fills[0]![1]!.x).toBeGreaterThan(0);
  });

  it('turns with the last span of a curve and scales with the stroke weight and the arrow scale', () => {
    const turn = arrowheadAt(line([0, 0], [0, 100]), { ...defaultStroke(), width: 1, endArrow: 'simple' }, 'end')!;
    expect(turn.fills[0]![0]).toEqual({ x: 0, y: 100 });
    expect(turn.fills[0]![1]!.y).toBeLessThan(100);
    const small = arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), width: 1, endArrow: 'simple' }, 'end')!;
    const big = arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), width: 1, endArrow: 'simple', arrowScale: [200, 200] }, 'end')!;
    expect(100 - big.fills[0]![1]!.x).toBeCloseTo(2 * (100 - small.fills[0]![1]!.x), 9);
    const thick = arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), width: 4, endArrow: 'simple' }, 'end')!;
    expect(100 - thick.fills[0]![1]!.x).toBeCloseTo(4 * (100 - small.fills[0]![1]!.x), 9);
  });

  it("'extend' moves the whole head beyond the end", () => {
    const head = arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), width: 1, endArrow: 'simple', arrowAlign: 'extend' }, 'end')!;
    expect(head.fills[0]![0]!.x).toBeGreaterThan(100);
    expect(head.fills[0]![1]!.x).toBeCloseTo(100, 9);
    expect(head.trim).toBe(0);
  });

  it('every catalogue head produces geometry; open heads are lines', () => {
    for (const id of Object.keys(ARROWS)) {
      const head = arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), endArrow: id }, 'end')!;
      expect(head.fills.length + head.lines.length).toBeGreaterThan(0);
    }
    expect(arrowheadAt(line([0, 0], [100, 0]), { ...defaultStroke(), endArrow: 'open' }, 'end')!.lines).toHaveLength(1);
  });

  it('end tangent follows the handle of a curved last span', () => {
    const sub: SubPath = {
      anchors: [
        { p: { x: 0, y: 0 }, in: null, out: { x: 0, y: 50 }, kind: 'corner' },
        { p: { x: 100, y: 100 }, in: { x: 50, y: 100 }, out: null, kind: 'corner' },
      ],
      closed: false,
    };
    expect(endTangent(sub, 'end')!.direction).toEqual({ x: 1, y: 0 });
    expect(endTangent(sub, 'start')!.direction).toEqual({ x: 0, y: 1 });
  });
});

describe('width profiles', () => {
  it('a uniform profile gives a band of the stroke width', () => {
    const [poly] = variableWidthOutline(line([0, 0], [100, 0]), 10, WIDTH_PROFILES.uniform!);
    const ys = poly!.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10, 9);
  });

  it('a taper narrows towards the end and flip reverses it', () => {
    const sub = line([0, 0], [50, 0], [100, 0]);
    const width = (flip: boolean, x: number) => {
      const [poly] = variableWidthOutline(sub, 10, WIDTH_PROFILES.taper!, flip);
      const near = poly!.filter((p) => Math.abs(p.x - x) < 1);
      return Math.max(...near.map((p) => p.y)) - Math.min(...near.map((p) => p.y));
    };
    expect(width(false, 0)).toBeCloseTo(10, 6);
    expect(width(false, 100)).toBeLessThan(1);
    expect(width(true, 0)).toBeLessThan(1);
    expect(width(true, 100)).toBeCloseTo(10, 6);
  });

  it('closed contours give an outer and an inner loop', () => {
    const square: SubPath = { anchors: [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 }), cornerAnchor({ x: 100, y: 100 }), cornerAnchor({ x: 0, y: 100 })], closed: true };
    expect(variableWidthOutline(square, 4, WIDTH_PROFILES.uniform!)).toHaveLength(2);
  });

  it('degenerate contours give nothing, and the catalogue has uniform plus six profiles', () => {
    expect(variableWidthOutline({ anchors: [], closed: false }, 4, WIDTH_PROFILES.uniform!)).toEqual([]);
    expect(variableWidthOutline(line([5, 5], [5, 5]), 4, WIDTH_PROFILES.uniform!)).toEqual([]);
    expect(Object.keys(WIDTH_PROFILES)).toHaveLength(7);
    for (const p of Object.values(WIDTH_PROFILES)) for (const t of [0, 0.25, 0.5, 1]) expect(p.at(t)).toBeGreaterThan(0);
  });
});
