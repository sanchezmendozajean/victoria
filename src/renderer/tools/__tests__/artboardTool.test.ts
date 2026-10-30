import { describe, expect, it } from 'vitest';
import { resizeRect } from '../artboardTool';

const start = { x: 100, y: 100, w: 200, h: 100 };

describe('resizeRect', () => {
  it('pulls the edges a handle touches and leaves the others', () => {
    expect(resizeRect(start, 'e', { x: 400, y: 0 }, false)).toEqual({ x: 100, y: 100, w: 300, h: 100 });
    expect(resizeRect(start, 'nw', { x: 50, y: 60 }, false)).toEqual({ x: 50, y: 60, w: 250, h: 140 });
  });

  it('never collapses or flips', () => {
    const r = resizeRect(start, 'e', { x: 0, y: 0 }, false);
    expect(r.w).toBe(1);
    expect(r.x).toBe(100);
  });

  it('Shift keeps the proportions on a corner', () => {
    const r = resizeRect(start, 'se', { x: 500, y: 150 }, true);
    expect(r.w / r.h).toBeCloseTo(2, 9);
    expect(r.x).toBe(100);
  });
});
