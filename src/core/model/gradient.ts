import { colorToRgb } from './color';
import type { Color, Gradient, GradientStop, Matrix, Vec2 } from './types';
import type { IdGenerator } from './ids';

// Gradient geometry (specs/02 · Convenciones): the axis is the unit segment (0,0)→(1,0) (radial: the unit
// circle at the origin), and `Paint.transform` maps it into the object's local space.

export interface GradientAxis {
  start: Vec2;
  end: Vec2;
  /** Radial only: the second semi-axis over the first (1 = circle). */
  aspect: number;
}

/** Matrix of a gradient running from `start` to `end`; `aspect` squashes the perpendicular axis (radial). */
export function gradientTransform(start: Vec2, end: Vec2, aspect = 1): Matrix {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  return [vx, vy, -vy * aspect, vx * aspect, start.x, start.y];
}

/** Start, end and aspect of a gradient transform. */
export function gradientAxis(m: Matrix): GradientAxis {
  const length = Math.hypot(m[0], m[1]);
  return {
    start: { x: m[4], y: m[5] },
    end: { x: m[4] + m[0], y: m[5] + m[1] },
    aspect: length === 0 ? 1 : Math.hypot(m[2], m[3]) / length,
  };
}

export interface BoundsLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Transform that makes a gradient fill the object's bounds at `angle` degrees (counter-clockwise, as in
 * Illustrator): a linear gradient spans the bounds projected on its direction; a radial one is centred.
 */
export function defaultGradientTransform(bounds: BoundsLike, type: 'linear' | 'radial', angle = 0): Matrix {
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const c = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const a = (-angle * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  if (type === 'radial') {
    const r = Math.max(w, h) / 2;
    return gradientTransform(c, { x: c.x + u.x * r, y: c.y + u.y * r }, 1);
  }
  const half = (Math.abs(u.x) * w + Math.abs(u.y) * h) / 2;
  return gradientTransform({ x: c.x - u.x * half, y: c.y - u.y * half }, { x: c.x + u.x * half, y: c.y + u.y * half }, 1);
}

/** Angle in degrees (counter-clockwise) of the gradient direction. */
export function gradientAngle(m: Matrix): number {
  return (-Math.atan2(m[1], m[0]) * 180) / Math.PI;
}

/** The same gradient turned to `angle` degrees around its centre (linear) or its start (radial). */
export function rotateGradient(m: Matrix, angle: number, type: 'linear' | 'radial'): Matrix {
  const axis = gradientAxis(m);
  const length = Math.hypot(m[0], m[1]);
  const a = (-angle * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  if (type === 'radial') return gradientTransform(axis.start, { x: axis.start.x + u.x * length, y: axis.start.y + u.y * length }, axis.aspect);
  const c = { x: (axis.start.x + axis.end.x) / 2, y: (axis.start.y + axis.end.y) / 2 };
  return gradientTransform({ x: c.x - (u.x * length) / 2, y: c.y - (u.y * length) / 2 }, { x: c.x + (u.x * length) / 2, y: c.y + (u.y * length) / 2 }, axis.aspect);
}

// ── Stops ───────────────────────────────────────────────────────────────────────

export function makeGradient(ids: IdGenerator, type: Gradient['type'], from: Color, to: Color, name = ''): Gradient {
  return {
    id: ids(),
    name,
    type,
    stops: [
      { offset: 0, color: from, opacity: 1 },
      { offset: 1, color: to, opacity: 1 },
    ],
  };
}

export const sortStops = (stops: readonly GradientStop[]): GradientStop[] => [...stops].sort((a, b) => a.offset - b.offset);

/** Colour between two stops (linear in sRGB), honouring the midpoint of the first. */
export function colorBetween(a: GradientStop, b: GradientStop, offset: number): { color: Color; opacity: number } {
  const span = b.offset - a.offset;
  let t = span <= 0 ? 0 : (offset - a.offset) / span;
  const mid = a.midpoint ?? 0.5;
  // The midpoint bends the blend so that it reaches 50 % at `mid`.
  if (mid !== 0.5 && mid > 0 && mid < 1) t = t <= mid ? (t / mid) * 0.5 : 0.5 + ((t - mid) / (1 - mid)) * 0.5;
  const ca = colorToRgb(a.color);
  const cb = colorToRgb(b.color);
  const values = ca.map((v, i) => Math.round((v + ((cb[i] as number) - v) * t) * 100) / 100);
  return { color: { model: 'rgb', values }, opacity: a.opacity + (b.opacity - a.opacity) * t };
}

/** The colour of the gradient at `offset` (0..1). */
export function gradientColorAt(stops: readonly GradientStop[], offset: number): { color: Color; opacity: number } {
  const sorted = sortStops(stops);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return { color: { model: 'rgb', values: [0, 0, 0] }, opacity: 1 };
  if (offset <= first.offset) return { color: first.color, opacity: first.opacity };
  if (offset >= last.offset) return { color: last.color, opacity: last.opacity };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i] as GradientStop;
    const b = sorted[i + 1] as GradientStop;
    if (offset >= a.offset && offset <= b.offset) return colorBetween(a, b, offset);
  }
  return { color: last.color, opacity: last.opacity };
}

/** Mirrors the gradient (Invertir degradado): offsets flip and each midpoint moves to the other side of its pair. */
export function reversedStops(stops: readonly GradientStop[]): GradientStop[] {
  const sorted = sortStops(stops);
  const n = sorted.length;
  return sorted
    .map((_, i) => {
      const source = sorted[n - 1 - i] as GradientStop;
      const flipped: GradientStop = { ...source, offset: 1 - source.offset };
      // A midpoint belongs to the blend between a stop and the next one.
      const before = sorted[n - 2 - i];
      if (before?.midpoint !== undefined) flipped.midpoint = 1 - before.midpoint;
      else delete flipped.midpoint;
      return flipped;
    });
}
