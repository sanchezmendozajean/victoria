import type { Rect, Vec2 } from '../../core';

/** The eight tiradores of the bounding box (specs/03 · Selección). */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const HANDLE_SIZE = 7;
/** How far outside a corner handle the rotate cursor still applies. */
export const ROTATE_ZONE = 16;

export function handlePoints(r: Rect): Record<HandleId, Vec2> {
  const cx = (r.minX + r.maxX) / 2;
  const cy = (r.minY + r.maxY) / 2;
  return {
    nw: { x: r.minX, y: r.minY },
    n: { x: cx, y: r.minY },
    ne: { x: r.maxX, y: r.minY },
    e: { x: r.maxX, y: cy },
    se: { x: r.maxX, y: r.maxY },
    s: { x: cx, y: r.maxY },
    sw: { x: r.minX, y: r.maxY },
    w: { x: r.minX, y: cy },
  };
}

const OPPOSITE: Record<HandleId, HandleId> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };
export const oppositeHandle = (h: HandleId): HandleId => OPPOSITE[h];

export const isCorner = (h: HandleId): boolean => h.length === 2;

/** The handle under `p` (all in screen px), or null. Corners win when handles overlap on tiny boxes. */
export function handleAt(box: Rect, p: Vec2, size = HANDLE_SIZE): HandleId | null {
  const points = handlePoints(box);
  const reach = size / 2 + 1.5;
  const order: HandleId[] = ['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'];
  for (const id of order) {
    const h = points[id];
    if (Math.abs(p.x - h.x) <= reach && Math.abs(p.y - h.y) <= reach) return id;
  }
  return null;
}

/** Just outside a corner handle: the cursor turns into the rotate cursor. */
export function rotateCornerAt(box: Rect, p: Vec2): HandleId | null {
  if (handleAt(box, p)) return null;
  const points = handlePoints(box);
  for (const id of ['nw', 'ne', 'se', 'sw'] as const) {
    const h = points[id];
    const outwardX = id.includes('w') ? -1 : 1;
    const outwardY = id.startsWith('n') ? -1 : 1;
    const dx = (p.x - h.x) * outwardX;
    const dy = (p.y - h.y) * outwardY;
    // Outside the box on both axes (a quadrant beyond the corner), within the zone.
    if (dx > -HANDLE_SIZE / 2 && dy > -HANDLE_SIZE / 2 && Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) <= ROTATE_ZONE && (dx > 0 || dy > 0)) return id;
  }
  return null;
}

const CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};
export const cursorForHandle = (h: HandleId): string => CURSORS[h];

export interface ScaleOptions {
  /** Shift on a corner: keep the proportions. */
  proportional?: boolean;
  /** Alt: scale around the centre instead of the opposite handle. */
  fromCenter?: boolean;
}

export interface ScaleResult {
  sx: number;
  sy: number;
  /** Fixed point of the scale, in the same space as the inputs. */
  pivot: Vec2;
}

const EPSILON = 1e-6;

/**
 * Scale factors for dragging `handle` of `box` from `start` to `current` (all in Space coordinates).
 * Edge handles scale one axis; a negative factor mirrors the objects, as in Illustrator.
 */
export function scaleFromHandle(box: Rect, handle: HandleId, start: Vec2, current: Vec2, options: ScaleOptions = {}): ScaleResult {
  const points = handlePoints(box);
  const centre = points.nw && { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const pivot = options.fromCenter ? centre : points[oppositeHandle(handle)];
  const affectsX = handle.includes('e') || handle.includes('w');
  const affectsY = handle.includes('n') || handle.includes('s');

  const ratio = (axis: 'x' | 'y'): number => {
    const denominator = start[axis] - pivot[axis];
    if (Math.abs(denominator) < EPSILON) return 1;
    return (current[axis] - pivot[axis]) / denominator;
  };

  let sx = affectsX ? ratio('x') : 1;
  let sy = affectsY ? ratio('y') : 1;
  if (options.proportional && affectsX && affectsY) {
    const m = Math.max(Math.abs(sx), Math.abs(sy));
    sx = Math.sign(sx || 1) * m;
    sy = Math.sign(sy || 1) * m;
  } else if (options.proportional) {
    // Edge handle with Shift: the other axis follows.
    const m = affectsX ? sx : sy;
    sx = affectsX ? sx : m;
    sy = affectsY ? sy : m;
  }
  return { sx, sy, pivot };
}

/** Snaps a drag vector to multiples of 45° (Shift). */
export function constrainTo45(delta: Vec2): Vec2 {
  const length = Math.hypot(delta.x, delta.y);
  if (length === 0) return delta;
  const angle = Math.round(Math.atan2(delta.y, delta.x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: length * Math.cos(angle), y: length * Math.sin(angle) };
}

/** Rotation in radians between two points as seen from `center`. */
export function angleBetween(center: Vec2, from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - center.y, to.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x);
}

export const snapAngle45 = (radians: number): number => Math.round(radians / (Math.PI / 4)) * (Math.PI / 4);

/** Expands a Space rectangle to screen pixels. */
export function toScreenRect(r: Rect, zoom: number, panX: number, panY: number): Rect {
  return { minX: r.minX * zoom + panX, minY: r.minY * zoom + panY, maxX: r.maxX * zoom + panX, maxY: r.maxY * zoom + panY };
}
