import { describe, expect, it } from 'vitest';
import { applyToPoint, type Rect } from '../../../core';
import { dragQuad, skewFromHandle } from '../freeTransformGeometry';

const box: Rect = { minX: 0, minY: 0, maxX: 100, maxY: 50 };

describe('dragQuad', () => {
  it('distort: a corner follows the drag and the others stay', () => {
    const q = dragQuad('distort', 'se', box, { x: 20, y: -10 });
    expect(q).toEqual({ nw: { x: 0, y: 0 }, ne: { x: 100, y: 0 }, se: { x: 120, y: 40 }, sw: { x: 0, y: 50 } });
  });

  it('distort: a side handle carries both its corners', () => {
    const q = dragQuad('distort', 'n', box, { x: 15, y: -5 });
    expect(q.nw).toEqual({ x: 15, y: -5 });
    expect(q.ne).toEqual({ x: 115, y: -5 });
    expect(q.sw).toEqual({ x: 0, y: 50 });
  });

  it('perspective: a mostly horizontal drag squeezes the edge symmetrically (a trapezoid)', () => {
    const q = dragQuad('perspective', 'nw', box, { x: 20, y: 4 });
    expect(q.nw).toEqual({ x: 20, y: 0 });
    expect(q.ne).toEqual({ x: 80, y: 0 });
    expect(q.sw).toEqual({ x: 0, y: 50 });
    expect(q.se).toEqual({ x: 100, y: 50 });
  });

  it('perspective: a mostly vertical drag moves the corner along its column and mirrors on the neighbour', () => {
    const q = dragQuad('perspective', 'ne', box, { x: 2, y: 10 });
    expect(q.ne).toEqual({ x: 100, y: 10 });
    expect(q.se).toEqual({ x: 100, y: 40 });
    expect(q.nw).toEqual({ x: 0, y: 0 });
  });

  it('perspective: side handles do nothing', () => {
    expect(dragQuad('perspective', 'e', box, { x: 30, y: 30 })).toEqual(dragQuad('perspective', 'e', box, { x: 0, y: 0 }));
  });
});

describe('skewFromHandle', () => {
  it('the dragged side slides by the drag and the opposite side stays', () => {
    const top = skewFromHandle('n', box, { x: 10, y: 0 }, 0)!;
    expect(applyToPoint(top, { x: 0, y: 0 })).toEqual({ x: 10, y: 0 });
    expect(applyToPoint(top, { x: 40, y: 50 })).toEqual({ x: 40, y: 50 });
    const right = skewFromHandle('e', box, { x: 0, y: -20 }, 0)!;
    expect(applyToPoint(right, { x: 100, y: 10 })).toEqual({ x: 100, y: -10 });
    expect(applyToPoint(right, { x: 0, y: 10 })).toEqual({ x: 0, y: 10 });
    const left = skewFromHandle('w', box, { x: 0, y: 25 }, 0)!;
    expect(applyToPoint(left, { x: 0, y: 0 })).toEqual({ x: 0, y: 25 });
    expect(applyToPoint(left, { x: 100, y: 0 })).toEqual({ x: 100, y: 0 });
    const bottom = skewFromHandle('s', box, { x: -10, y: 0 }, 0)!;
    expect(applyToPoint(bottom, { x: 20, y: 50 })).toEqual({ x: 10, y: 50 });
  });

  it('works in a turned box: the fixed side stays fixed in Space', () => {
    const theta = Math.PI / 2;
    const m = skewFromHandle('n', box, { x: 10, y: 0 }, theta)!;
    // A point on the bottom side of the box, expressed in Space, must not move.
    const bottom = applyToPoint([Math.cos(theta), Math.sin(theta), -Math.sin(theta), Math.cos(theta), 0, 0], { x: 30, y: 50 });
    const out = applyToPoint(m, bottom);
    expect(out.x).toBeCloseTo(bottom.x, 9);
    expect(out.y).toBeCloseTo(bottom.y, 9);
  });

  it('is null for corners and for an empty box', () => {
    expect(skewFromHandle('ne', box, { x: 5, y: 5 }, 0)).toBeNull();
    expect(skewFromHandle('n', { minX: 0, minY: 0, maxX: 10, maxY: 0 }, { x: 5, y: 0 }, 0)).toBeNull();
  });
});
