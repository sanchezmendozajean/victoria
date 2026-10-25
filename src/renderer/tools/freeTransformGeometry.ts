import { multiply, rectQuad, rotation, type Matrix, type Quad, type Rect, type Vec2 } from '../../core';
import type { HandleId } from './boxGeometry';

/** The four modes of the Free Transform widget (specs/03 · Transformación libre). */
export type FreeTransformMode = 'constrain' | 'free' | 'perspective' | 'distort';

type Corner = 'nw' | 'ne' | 'se' | 'sw';

const isCorner = (h: HandleId): h is Corner => h.length === 2;

/** The corner that shares the horizontal edge (same row) with `c`, and the one that shares the vertical edge (same column). */
const ROW_PARTNER: Record<Corner, Corner> = { nw: 'ne', ne: 'nw', sw: 'se', se: 'sw' };
const COLUMN_PARTNER: Record<Corner, Corner> = { nw: 'sw', sw: 'nw', ne: 'se', se: 'ne' };

const SIDE_CORNERS: Record<'n' | 'e' | 's' | 'w', [Corner, Corner]> = { n: ['nw', 'ne'], s: ['sw', 'se'], w: ['nw', 'sw'], e: ['ne', 'se'] };

const move = (p: Vec2, dx: number, dy: number): Vec2 => ({ x: p.x + dx, y: p.y + dy });

/**
 * The quad after dragging `handle` of the box by `delta` (Space units), from the box as it was when the drag began.
 * - `distort`: a corner follows the pointer; a side handle takes both its corners along.
 * - `perspective`: a corner moves along one edge only (the dominant direction of the drag) and its neighbour on that
 *   edge moves the opposite way, so the result is a symmetric trapezoid; side handles do nothing.
 */
export function dragQuad(mode: 'distort' | 'perspective', handle: HandleId, rect: Rect, delta: Vec2): Quad {
  const q: Quad = rectQuad(rect);
  if (isCorner(handle)) {
    if (mode === 'distort') {
      q[handle] = move(q[handle], delta.x, delta.y);
    } else if (Math.abs(delta.x) >= Math.abs(delta.y)) {
      q[handle] = move(q[handle], delta.x, 0);
      const partner = ROW_PARTNER[handle];
      q[partner] = move(q[partner], -delta.x, 0);
    } else {
      q[handle] = move(q[handle], 0, delta.y);
      const partner = COLUMN_PARTNER[handle];
      q[partner] = move(q[partner], 0, -delta.y);
    }
    return q;
  }
  if (mode === 'distort') for (const c of SIDE_CORNERS[handle]) q[c] = move(q[c], delta.x, delta.y);
  return q;
}

/**
 * Skew by dragging a side handle (Ctrl in Free Transform): the opposite side stays put and the dragged side
 * slides along itself. `rect` and `delta` live in the box's own (turned by `theta`) space; the result is in Space.
 * Null for corners and for a box with no size.
 */
export function skewFromHandle(handle: HandleId, rect: Rect, delta: Vec2, theta: number): Matrix | null {
  const w = rect.maxX - rect.minX;
  const h = rect.maxY - rect.minY;
  if (isCorner(handle) || !(w > 0) || !(h > 0)) return null;
  let local: Matrix;
  if (handle === 'n' || handle === 's') {
    const k = delta.x / h;
    local = handle === 'n' ? [1, 0, -k, 1, k * rect.maxY, 0] : [1, 0, k, 1, -k * rect.minY, 0];
  } else {
    const k = delta.y / w;
    local = handle === 'w' ? [1, -k, 0, 1, 0, k * rect.maxX] : [1, k, 0, 1, 0, -k * rect.minX];
  }
  return multiply(rotation(theta), multiply(local, rotation(-theta)));
}
