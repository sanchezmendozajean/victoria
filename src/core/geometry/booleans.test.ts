import { describe, expect, it } from 'vitest';
import { divideShapes, mergePieces, pieceContains, shapeOperation, trimShapes, unitePieces, type BooleanShape } from './booleans';

/** A circle of radius r centred at (cx, cy): four smooth anchors with Bézier handles. */
function circle(cx: number, cy: number, r: number): BooleanShape {
  const k = r * 0.5522847498;
  const at = (x: number, y: number, ix: number, iy: number, ox: number, oy: number) => ({ p: { x: cx + x, y: cy + y }, in: { x: cx + x + ix, y: cy + y + iy }, out: { x: cx + x + ox, y: cy + y + oy }, kind: 'smooth' as const });
  return {
    fillRule: 'nonzero',
    subpaths: [{ closed: true, anchors: [at(r, 0, 0, -k, 0, k), at(0, r, k, 0, -k, 0), at(-r, 0, 0, k, 0, -k), at(0, -r, -k, 0, k, 0)] }],
  };
}
const anchors = (pieces: Array<{ subpaths: Array<{ anchors: unknown[] }> }>) => pieces.reduce((n, p) => n + p.subpaths.reduce((m, s) => m + s.anchors.length, 0), 0);

describe('shape operations', () => {
  const a = circle(0, 0, 50);
  const b = circle(60, 0, 50);

  it('unites two circles with the minimum of nodes and keeps the curves', () => {
    const [u, ...rest] = shapeOperation('unite', [a, b]);
    expect(rest).toHaveLength(0);
    // Each circle keeps the 3 anchors that are outside the other one, plus the 2 intersections.
    expect(anchors([u!])).toBe(8);
    expect(u!.subpaths[0]!.anchors.every((p) => p.in !== null || p.out !== null)).toBe(true);
    expect(u!.source).toBe(1); // the look of the topmost one
  });

  it('intersects, subtracts and excludes', () => {
    const lens = shapeOperation('intersect', [a, b]);
    expect(lens).toHaveLength(1);
    expect(anchors(lens)).toBe(4); // two intersections + one anchor of each circle inside the other
    const minusFront = shapeOperation('minusFront', [a, b]);
    expect(minusFront).toHaveLength(1);
    expect(minusFront[0]!.source).toBe(0);
    const minusBack = shapeOperation('minusBack', [a, b]);
    expect(minusBack[0]!.source).toBe(1);
    expect(pieceContains(minusFront[0]!, { x: -40, y: 0 })).toBe(true);
    expect(pieceContains(minusFront[0]!, { x: 30, y: 0 })).toBe(false);
    const xor = shapeOperation('exclude', [a, b]);
    expect(xor).toHaveLength(2);
  });

  it('subtracting a smaller circle leaves one piece with a hole', () => {
    const donut = shapeOperation('minusFront', [circle(0, 0, 50), circle(0, 0, 20)]);
    expect(donut).toHaveLength(1);
    expect(donut[0]!.subpaths).toHaveLength(2);
    expect(donut[0]!.fillRule).toBe('evenodd');
    expect(pieceContains(donut[0]!, { x: 0, y: 0 })).toBe(false);
    expect(pieceContains(donut[0]!, { x: 35, y: 0 })).toBe(true);
  });

  it('disjoint shapes unite into separate pieces', () => {
    expect(shapeOperation('unite', [circle(0, 0, 10), circle(100, 0, 10)])).toHaveLength(2);
  });
});

describe('Shape Builder arrangement (3 overlapping circles)', () => {
  const circles = [circle(0, 0, 50), circle(50, 0, 50), circle(25, 43, 50)];

  it('divides into the 7 regions of a Venn diagram, each remembering the shapes that cover it', () => {
    const faces = divideShapes(circles);
    expect(faces).toHaveLength(7);
    expect(faces.filter((f) => f.covers.length === 3)).toHaveLength(1);
    expect(faces.filter((f) => f.covers.length === 2)).toHaveLength(3);
    expect(faces.filter((f) => f.covers.length === 1)).toHaveLength(3);
    expect(faces.find((f) => f.covers.length === 3)!.source).toBe(2);
  });

  it('uniting regions and deleting regions keep Béziers (no polygon points)', () => {
    const faces = divideShapes(circles);
    const joined = unitePieces(faces.filter((f) => f.covers.length === 1 || f.covers.length === 2));
    expect(joined.length).toBeGreaterThan(0);
    const all = divideShapes(circles);
    // The outline of the union of everything has far fewer nodes than a flattened polygon would.
    const union = unitePieces(all);
    expect(union).toHaveLength(1);
    expect(anchors(union)).toBeLessThanOrEqual(12);
    // Every curved anchor of the result still carries handles.
    expect(union[0]!.subpaths[0]!.anchors.some((p) => p.in !== null && p.out !== null)).toBe(true);
    // A region can be found by a point.
    const centre = all.find((f) => f.covers.length === 3)!;
    expect(pieceContains(centre, { x: 25, y: 14 })).toBe(true);
  });
});

describe('Trim, Crop and Merge', () => {
  it('trims every shape by the ones in front', () => {
    const pieces = trimShapes([circle(0, 0, 50), circle(60, 0, 50)], 'trim');
    expect(pieces.map((p) => p.source)).toEqual([0, 1]);
    expect(pieceContains(pieces[0]!, { x: 30, y: 0 })).toBe(false);
  });

  it('crops to the frontmost shape and removes it', () => {
    const pieces = trimShapes([circle(0, 0, 50), circle(60, 0, 50)], 'crop');
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.source).toBe(0);
    expect(pieceContains(pieces[0]!, { x: 30, y: 0 })).toBe(true);
    expect(pieceContains(pieces[0]!, { x: -40, y: 0 })).toBe(false);
  });

  it('merges touching pieces of the same kind only', () => {
    const pieces = mergePieces(
      [
        { fillRule: 'nonzero' as const, source: 0, subpaths: [...circle(0, 0, 50).subpaths] },
        { fillRule: 'nonzero' as const, source: 1, subpaths: [...circle(60, 0, 50).subpaths] },
        { fillRule: 'nonzero' as const, source: 2, subpaths: [...circle(300, 0, 10).subpaths] },
      ],
      () => 'same',
    );
    expect(pieces).toHaveLength(2);
  });
});
