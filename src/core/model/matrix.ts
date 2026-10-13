import type { Matrix, Vec2 } from './types';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `multiply(a, b)` applies `b` first, then `a` (so a·b as column-vector matrices). */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function translation(dx: number, dy: number): Matrix {
  return [1, 0, 0, 1, dx, dy];
}

export function scaling(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}

/** Counter-clockwise on screen is positive when Y points up; here Y points down, so +angle turns clockwise. */
export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
}

export function applyToPoint(m: Matrix, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function determinant(m: Matrix): number {
  return m[0] * m[3] - m[1] * m[2];
}

/** Returns null for singular matrices. */
export function invert(m: Matrix): Matrix | null {
  const det = determinant(m);
  if (det === 0 || !Number.isFinite(det)) return null;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function isIdentity(m: Matrix): boolean {
  return m.every((v, i) => v === IDENTITY[i]);
}
