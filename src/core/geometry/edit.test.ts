import { describe, expect, it } from 'vitest';
import type { Anchor, Vec2 } from '../model/types';
import { moveAnchors, moveHandle, projectOnSegment, projectOnSubPath, reshapeControls, reshapeSpan, isStraightSegment } from './edit';
import { pointOnSegment, segmentsOf } from './path';

const v = (x: number, y: number): Vec2 => ({ x, y });
const smooth = (p: Vec2, inn: Vec2 | null, out: Vec2 | null): Anchor => ({ p, in: inn, out, kind: 'smooth' });
const corner = (p: Vec2, inn: Vec2 | null = null, out: Vec2 | null = null): Anchor => ({ p, in: inn, out, kind: 'corner' });
const len = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

describe('projection', () => {
  const seg = { p0: v(0, 0), c1: v(0, 100), c2: v(100, 100), p3: v(100, 0) };

  it('finds the closest point of a cubic', () => {
    const hit = projectOnSegment(seg, v(50, 90));
    expect(hit.t).toBeCloseTo(0.5, 2);
    expect(hit.point.y).toBeCloseTo(75, 1);
    expect(hit.distance).toBeCloseTo(15, 1);
  });

  it('clamps to the ends', () => {
    expect(projectOnSegment(seg, v(-50, -50)).t).toBeCloseTo(0, 4);
    expect(projectOnSegment(seg, v(150, -50)).t).toBeCloseTo(1, 4);
  });

  it('picks the nearest span of a contour', () => {
    const sub = { anchors: [corner(v(0, 0)), corner(v(100, 0)), corner(v(100, 100))], closed: false };
    expect(projectOnSubPath(sub, v(100, 60))?.segmentIndex).toBe(1);
    expect(projectOnSubPath(sub, v(40, 3))?.segmentIndex).toBe(0);
  });

  it('knows straight spans', () => {
    const [straight] = segmentsOf({ anchors: [corner(v(0, 0)), corner(v(10, 0))], closed: false });
    expect(isStraightSegment(straight!)).toBe(true);
    expect(isStraightSegment(seg)).toBe(false);
  });
});

describe('moving anchors', () => {
  it('moves the anchor with its handles and leaves the others alone', () => {
    const anchors = [corner(v(0, 0), null, v(10, 0)), corner(v(50, 0), v(40, 0), v(60, 0)), corner(v(100, 0), v(90, 0))];
    const moved = moveAnchors(anchors, [1], v(5, 7));
    expect(moved[1]).toMatchObject({ p: v(55, 7), in: v(45, 7), out: v(65, 7) });
    expect(moved[0]).toEqual(anchors[0]);
    expect(moved[2]).toEqual(anchors[2]);
    expect(anchors[1]?.p).toEqual(v(50, 0)); // input untouched
  });
});

describe('dragging a handle (specs/03 · Selección directa)', () => {
  const anchors = (kind: Anchor['kind']): Anchor[] => [{ p: v(100, 100), in: v(80, 100), out: v(130, 100), kind }];

  it('smooth anchor: the opposite handle turns to stay collinear and keeps its length', () => {
    const [a] = moveHandle(anchors('smooth'), 0, 'out', v(100, 160));
    expect(a?.out).toEqual(v(100, 160));
    expect(len(a!.in!, a!.p)).toBeCloseTo(20, 9); // was 20 long
    expect(a!.in!.x).toBeCloseTo(100, 9);
    expect(a!.in!.y).toBeCloseTo(80, 9); // straight opposite
    expect(a?.kind).toBe('smooth');
  });

  it('asymmetric anchor mirrors the length too', () => {
    const [a] = moveHandle(anchors('asymmetric'), 0, 'out', v(100, 160));
    expect(len(a!.in!, a!.p)).toBeCloseTo(60, 9);
  });

  it('corner anchor: handles are independent', () => {
    const [a] = moveHandle(anchors('corner'), 0, 'out', v(100, 160));
    expect(a?.in).toEqual(v(80, 100));
  });

  it('Alt breaks the symmetry: only this handle moves and the anchor becomes a corner', () => {
    const [a] = moveHandle(anchors('smooth'), 0, 'out', v(100, 160), { alt: true });
    expect(a?.in).toEqual(v(80, 100));
    expect(a?.out).toEqual(v(100, 160));
    expect(a?.kind).toBe('corner');
  });

  it('Shift constrains the handle to 45° steps around its anchor', () => {
    const [a] = moveHandle(anchors('corner'), 0, 'out', v(180, 118), { constrain: true });
    expect(a!.out!.y).toBeCloseTo(100, 9); // snapped to horizontal
    expect(a!.out!.x).toBeCloseTo(100 + Math.hypot(80, 18), 9);
    const [b] = moveHandle(anchors('corner'), 0, 'out', v(160, 165), { constrain: true });
    expect(b!.out!.x - 100).toBeCloseTo(b!.out!.y - 100, 9); // diagonal
  });

  it('a retracted opposite handle stays retracted', () => {
    const [a] = moveHandle([{ p: v(0, 0), in: null, out: v(10, 0), kind: 'smooth' }], 0, 'out', v(0, 20));
    expect(a?.in).toBeNull();
  });
});

describe('reshaping a span', () => {
  const curve = (): Anchor[] => [smooth(v(0, 0), null, v(0, 100)), smooth(v(100, 0), v(100, 100), null)];

  it('dragging the middle of a curve moves the curve point by the drag distance', () => {
    const before = segmentsOf({ anchors: curve(), closed: false })[0]!;
    const t = 0.5;
    const delta = v(0, 20);
    const after = reshapeSpan(curve(), false, 0, t, delta);
    const seg = segmentsOf({ anchors: after, closed: false })[0]!;
    const a = pointOnSegment(before, t);
    const b = pointOnSegment(seg, t);
    expect(b.x - a.x).toBeCloseTo(0, 9);
    expect(b.y - a.y).toBeCloseTo(20, 9);
    expect(after[0]?.p).toEqual(v(0, 0)); // anchors do not move
    expect(after[1]?.p).toEqual(v(100, 0));
  });

  it('moves the nearer handle more', () => {
    const { c1, c2 } = reshapeControls({ p0: v(0, 0), c1: v(0, 50), c2: v(100, 50), p3: v(100, 0) }, 0.2, v(0, 10));
    expect(c1.y - 50).toBeGreaterThan(c2.y - 50);
  });

  it('works for any t and any drag direction (the dragged point follows exactly)', () => {
    for (const t of [0.1, 0.3, 0.5, 0.8]) {
      for (const delta of [v(12, -7), v(-30, 4), v(0, 0.5)]) {
        const before = segmentsOf({ anchors: curve(), closed: false })[0]!;
        const after = segmentsOf({ anchors: reshapeSpan(curve(), false, 0, t, delta), closed: false })[0]!;
        const a = pointOnSegment(before, t);
        const b = pointOnSegment(after, t);
        expect(b.x - a.x).toBeCloseTo(delta.x, 9);
        expect(b.y - a.y).toBeCloseTo(delta.y, 9);
      }
    }
  });

  it('keeps smooth anchors smooth after the reshape', () => {
    const anchors: Anchor[] = [smooth(v(0, 0), v(-30, 0), v(0, 100)), smooth(v(100, 0), v(100, 100), v(130, 0))];
    const after = reshapeSpan(anchors, false, 0, 0.5, v(40, 0));
    const a = after[0]!;
    const cross = (a.out!.x - a.p.x) * (a.p.y - a.in!.y) - (a.out!.y - a.p.y) * (a.p.x - a.in!.x);
    expect(Math.abs(cross)).toBeLessThan(1e-9); // in and out stay collinear through the anchor
  });

  it('a straight span moves both of its anchors instead', () => {
    const anchors = [corner(v(0, 0)), corner(v(100, 0)), corner(v(100, 100))];
    const after = reshapeSpan(anchors, false, 0, 0.5, v(0, 10));
    expect(after[0]?.p).toEqual(v(0, 10));
    expect(after[1]?.p).toEqual(v(100, 10));
    expect(after[2]?.p).toEqual(v(100, 100));
  });

  it('the closing span of a closed contour wraps around', () => {
    const anchors = [corner(v(0, 0)), corner(v(100, 0)), corner(v(100, 100))];
    const after = reshapeSpan(anchors, true, 2, 0.5, v(5, 0));
    expect(after[2]?.p).toEqual(v(105, 100));
    expect(after[0]?.p).toEqual(v(5, 0));
  });
});
