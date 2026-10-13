import { multiply, rotation, scaling, translation } from './matrix';
import type { Matrix, Vec2 } from './types';

/** Conjugates `m` so it acts around `center` instead of the origin. */
export function about(center: Vec2, m: Matrix): Matrix {
  return multiply(translation(center.x, center.y), multiply(m, translation(-center.x, -center.y)));
}

/** Rotation by `radians` around `center` (clockwise on screen: Y points down). */
export const rotateAbout = (radians: number, center: Vec2): Matrix => about(center, rotation(radians));

export const scaleAbout = (sx: number, sy: number, center: Vec2): Matrix => about(center, scaling(sx, sy));

/** Reflection across the line through `center` at angle `axis` (radians; 0 = a horizontal mirror line). */
export function reflectAbout(axis: number, center: Vec2): Matrix {
  const cos = Math.cos(2 * axis);
  const sin = Math.sin(2 * axis);
  return about(center, [cos, sin, sin, -cos, 0, 0]);
}

/** Shear-free move by (dx, dy). */
export const moveBy = (dx: number, dy: number): Matrix => translation(dx, dy);

/** Rotation angle of a matrix in radians (of its X axis). */
export const angleOf = (m: Matrix): number => Math.atan2(m[1], m[0]);

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
