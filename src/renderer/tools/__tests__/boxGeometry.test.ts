import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  constrainTo45,
  cursorForHandle,
  handleAt,
  handlePoints,
  isCorner,
  oppositeHandle,
  rotateCornerAt,
  scaleFromHandle,
  snapAngle45,
} from '../boxGeometry';

const box = { minX: 100, minY: 100, maxX: 300, maxY: 200 };

describe('bounding box handles', () => {
  it('has eight handles on the corners and edge midpoints', () => {
    const p = handlePoints(box);
    expect(p.nw).toEqual({ x: 100, y: 100 });
    expect(p.e).toEqual({ x: 300, y: 150 });
    expect(p.s).toEqual({ x: 200, y: 200 });
    expect(Object.keys(p)).toHaveLength(8);
  });

  it('knows opposites and corners', () => {
    expect(oppositeHandle('nw')).toBe('se');
    expect(oppositeHandle('e')).toBe('w');
    expect(isCorner('ne')).toBe(true);
    expect(isCorner('n')).toBe(false);
  });

  it('finds the handle under the pointer within a few pixels', () => {
    expect(handleAt(box, { x: 102, y: 98 })).toBe('nw');
    expect(handleAt(box, { x: 200, y: 101 })).toBe('n');
    expect(handleAt(box, { x: 210, y: 150 })).toBeNull();
    expect(handleAt(box, { x: 300, y: 203 })).toBe('se');
  });

  it('prefers corners when handles overlap on a tiny box', () => {
    const tiny = { minX: 0, minY: 0, maxX: 6, maxY: 6 };
    expect(handleAt(tiny, { x: 0, y: 0 })).toBe('nw');
  });

  it('turns the area just outside a corner into a rotate zone, not the handle itself nor the inside', () => {
    expect(rotateCornerAt(box, { x: 310, y: 90 })).toBe('ne');
    expect(rotateCornerAt(box, { x: 92, y: 208 })).toBe('sw');
    expect(rotateCornerAt(box, { x: 301, y: 100 })).toBeNull(); // on the handle
    expect(rotateCornerAt(box, { x: 200, y: 150 })).toBeNull(); // inside
    expect(rotateCornerAt(box, { x: 400, y: 400 })).toBeNull(); // too far
    expect(rotateCornerAt(box, { x: 200, y: 90 })).toBeNull(); // above an edge, not a corner
  });

  it('uses resize cursors that match the handle direction', () => {
    expect(cursorForHandle('nw')).toBe('nwse-resize');
    expect(cursorForHandle('ne')).toBe('nesw-resize');
    expect(cursorForHandle('n')).toBe('ns-resize');
    expect(cursorForHandle('w')).toBe('ew-resize');
  });
});

describe('scaling from a handle', () => {
  it('a corner scales both axes around the opposite corner', () => {
    const { sx, sy, pivot } = scaleFromHandle(box, 'se', { x: 300, y: 200 }, { x: 500, y: 300 });
    expect(pivot).toEqual({ x: 100, y: 100 });
    expect(sx).toBe(2);
    expect(sy).toBe(2);
  });

  it('an edge scales one axis only', () => {
    expect(scaleFromHandle(box, 'e', { x: 300, y: 150 }, { x: 400, y: 999 })).toMatchObject({ sx: 1.5, sy: 1 });
    expect(scaleFromHandle(box, 'n', { x: 200, y: 100 }, { x: 999, y: 50 })).toMatchObject({ sx: 1, sy: 1.5, pivot: { x: 200, y: 200 } });
  });

  it('Shift keeps the proportions, taking the larger factor and keeping signs', () => {
    const { sx, sy } = scaleFromHandle(box, 'se', { x: 300, y: 200 }, { x: 500, y: 150 }, { proportional: true });
    expect(sx).toBe(2);
    expect(sy).toBe(2); // the y factor was 0.5; the larger magnitude wins
    const flipped = scaleFromHandle(box, 'se', { x: 300, y: 200 }, { x: 0, y: 300 }, { proportional: true });
    expect(flipped.sx).toBeLessThan(0);
    expect(flipped.sy).toBeGreaterThan(0);
  });

  it('Shift on an edge makes the other axis follow', () => {
    expect(scaleFromHandle(box, 'e', { x: 300, y: 150 }, { x: 400, y: 150 }, { proportional: true })).toMatchObject({ sx: 1.5, sy: 1.5 });
  });

  it('Alt scales from the centre', () => {
    const { sx, pivot } = scaleFromHandle(box, 'e', { x: 300, y: 150 }, { x: 400, y: 150 }, { fromCenter: true });
    expect(pivot).toEqual({ x: 200, y: 150 });
    expect(sx).toBe(2);
  });

  it('dragging past the opposite side mirrors (negative factor)', () => {
    expect(scaleFromHandle(box, 'e', { x: 300, y: 150 }, { x: 0, y: 150 }).sx).toBeCloseTo(-0.5, 9);
  });

  it('does not blow up on a zero-size box', () => {
    const flat = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const { sx, sy } = scaleFromHandle(flat, 'se', { x: 0, y: 0 }, { x: 50, y: 50 });
    expect(Number.isFinite(sx) && Number.isFinite(sy)).toBe(true);
  });
});

describe('angles', () => {
  it('constrains vectors to 45°', () => {
    const c = constrainTo45({ x: 100, y: 10 });
    expect(c.y).toBeCloseTo(0, 9);
    expect(c.x).toBeCloseTo(Math.hypot(100, 10), 9);
    const d = constrainTo45({ x: 50, y: 60 });
    expect(Math.abs(d.x)).toBeCloseTo(Math.abs(d.y), 9);
    expect(constrainTo45({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('measures rotation around a centre and snaps to 45° steps', () => {
    const centre = { x: 0, y: 0 };
    expect(angleBetween(centre, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2, 9);
    expect(snapAngle45(0.7)).toBeCloseTo(Math.PI / 4, 9);
    expect(snapAngle45(0.3)).toBe(0);
  });
});
