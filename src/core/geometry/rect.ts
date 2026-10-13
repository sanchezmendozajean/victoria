import type { Matrix, Vec2 } from '../model/types';

/** Axis-aligned rectangle (also the bbox shape rbush expects). */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const rectWidth = (r: Rect) => r.maxX - r.minX;
export const rectHeight = (r: Rect) => r.maxY - r.minY;

export function rectFromPoints(points: readonly Vec2[]): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export const intersects = (a: Rect, b: Rect) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export const containsPoint = (r: Rect, p: Vec2) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

export const inflateRect = (r: Rect, d: number): Rect => ({ minX: r.minX - d, minY: r.minY - d, maxX: r.maxX + d, maxY: r.maxY + d });

/** Bounding box of a rectangle after an affine transform (conservative for rotations). */
export function transformRect(m: Matrix, r: Rect): Rect {
  const xs = [r.minX, r.maxX, r.minX, r.maxX];
  const ys = [r.minY, r.minY, r.maxY, r.maxY];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = m[0] * (xs[i] as number) + m[2] * (ys[i] as number) + m[4];
    const y = m[1] * (xs[i] as number) + m[3] * (ys[i] as number) + m[5];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
