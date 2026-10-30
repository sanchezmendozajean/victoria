import { describe, expect, it } from 'vitest';
import { dragCropHandle } from '../cropGeometry';

const START = { x: 10, y: 20, w: 100, h: 60 };

describe('dragging a crop handle', () => {
  it('a side moves only its own edge', () => {
    expect(dragCropHandle('e', START, { x: 80, y: 999 })).toEqual({ x: 10, y: 20, w: 70, h: 60 });
    expect(dragCropHandle('w', START, { x: 30, y: -5 })).toEqual({ x: 30, y: 20, w: 80, h: 60 });
    expect(dragCropHandle('n', START, { x: 0, y: 30 })).toEqual({ x: 10, y: 30, w: 100, h: 50 });
    expect(dragCropHandle('s', START, { x: 0, y: 50 })).toEqual({ x: 10, y: 20, w: 100, h: 30 });
  });

  it('a corner moves two edges at once', () => {
    expect(dragCropHandle('nw', START, { x: 20, y: 40 })).toEqual({ x: 20, y: 40, w: 90, h: 40 });
    expect(dragCropHandle('se', START, { x: 60, y: 50 })).toEqual({ x: 10, y: 20, w: 50, h: 30 });
  });

  it('can grow outwards (the command clamps to the picture) but never turns inside out', () => {
    expect(dragCropHandle('e', START, { x: 400, y: 0 }).w).toBe(390);
    expect(dragCropHandle('e', START, { x: -50, y: 0 })).toEqual({ x: 10, y: 20, w: 1, h: 60 });
    expect(dragCropHandle('nw', START, { x: 500, y: 500 })).toEqual({ x: 109, y: 79, w: 1, h: 1 });
  });
});
