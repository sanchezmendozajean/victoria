import { flattenSubPath } from '../geometry/path';
import type { Matrix, PathTextOptions, TextPath, Vec2 } from '../model/types';
import { layoutText, type PlacedGlyph, type TextLayout } from './layout';

// Text on a path (specs/07 · Texto en trazado): arc-length sampling of the path and, for each glyph, a
// matrix that moves its (origin at the baseline start) onto the path according to the chosen effect.

export const DEFAULT_PATH_OPTIONS: PathTextOptions = { effect: 'rainbow', align: 'baseline', spacing: 0, flip: false, start: 0, end: 1 };

export interface PathSampler {
  length: number;
  /** Point and tangent angle (radians, direction of travel) at a distance along the path. */
  at(distance: number): { point: Vec2; angle: number };
  /** Mean of the path's points (the "centre of gravity" of the Gravity effect). */
  centroid: Vec2;
}

export function samplerOf(path: TextPath, reverse = false): PathSampler {
  let points = flattenSubPath({ anchors: path.anchors, closed: path.closed }, 0.05).points.map((p) => ({ ...p }));
  if (path.closed && points.length > 0) points.push({ ...(points[0] as Vec2) });
  if (reverse) points = points.reverse();
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push((cumulative[i - 1] as number) + Math.hypot((points[i] as Vec2).x - (points[i - 1] as Vec2).x, (points[i] as Vec2).y - (points[i - 1] as Vec2).y));
  const length = cumulative[cumulative.length - 1] ?? 0;
  const centroid = points.length === 0 ? { x: 0, y: 0 } : { x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length };
  return {
    length,
    centroid,
    at(distance) {
      if (points.length < 2) return { point: points[0] ?? { x: 0, y: 0 }, angle: 0 };
      const d = Math.max(0, Math.min(length, distance));
      let lo = 0;
      let hi = cumulative.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if ((cumulative[mid] as number) <= d) lo = mid;
        else hi = mid;
      }
      const a = points[lo] as Vec2;
      const b = points[hi] as Vec2;
      const span = (cumulative[hi] as number) - (cumulative[lo] as number);
      const t = span === 0 ? 0 : (d - (cumulative[lo] as number)) / span;
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    },
  };
}

export interface PathGlyph {
  glyph: PlacedGlyph;
  /** Maps coordinates relative to the glyph origin (x along the baseline, y down from it) into the text's local space. */
  matrix: Matrix;
}

export interface PathTextResult {
  glyphs: PathGlyph[];
  /** Glyphs that fall outside [start, end] or beyond the path are not drawn: the first hidden index, or null. */
  overflowAt: number | null;
  layout: TextLayout;
}

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Lays a single-line story along `path`. */
export function layoutOnPath(layout: TextLayout, path: TextPath, options: PathTextOptions, align: 'left' | 'center' | 'right' = 'left'): PathTextResult {
  const sampler = samplerOf(path, options.flip);
  const L = sampler.length;
  const s0 = Math.max(0, Math.min(1, options.start)) * L;
  const e = Math.max(s0, Math.min(1, options.end) * L);
  const textWidth = layout.lines[0]?.width ?? 0;
  const room = e - s0;
  const offset = align === 'center' ? (room - textWidth) / 2 : align === 'right' ? room - textWidth : 0;
  const line = layout.lines[0];
  const ascent = line?.ascent ?? 0;
  const descent = line?.descent ?? 0;
  const dy = options.align === 'ascender' ? ascent : options.align === 'descender' ? -descent : options.align === 'center' ? (ascent - descent) / 2 : 0;
  const out: PathGlyph[] = [];
  let overflowAt: number | null = null;
  let extra = 0;
  let previousAngle: number | null = null;

  for (const g of layout.glyphs) {
    const startDistance = s0 + offset + g.x + extra;
    const centerDistance = startDistance + g.advance / 2;
    if (centerDistance > e + 1e-6 || centerDistance < s0 - 1e-6 || startDistance + g.advance / 2 > L + 1e-6) {
      overflowAt ??= g.index;
      continue;
    }
    const center = sampler.at(centerDistance);
    // Extra spacing on curves: proportional to how much the direction turns across the glyph.
    const turn = previousAngle === null ? 0 : Math.abs(Math.atan2(Math.sin(center.angle - previousAngle), Math.cos(center.angle - previousAngle)));
    previousAngle = center.angle;
    extra += options.spacing * turn;

    // The glyph box [0, advance] × baseline centred on the point; (cx, 0) in glyph space is the centre of the advance.
    const half = g.advance / 2;
    let m: Matrix;
    switch (options.effect) {
      case 'skew': {
        // Vertical strokes stay vertical; the baseline follows the path.
        m = multiply([1, 0, 0, 1, center.point.x, center.point.y], multiply([1, Math.tan(center.angle), 0, 1, 0, 0], [1, 0, 0, 1, -half, dy]));
        break;
      }
      case 'ribbon': {
        // Glyphs keep their orientation and only follow the path's height.
        m = [1, 0, 0, 1, center.point.x - half, center.point.y + dy];
        break;
      }
      case 'stair': {
        const start = sampler.at(startDistance);
        m = [1, 0, 0, 1, start.point.x, start.point.y + dy];
        break;
      }
      case 'gravity': {
        // The glyph's "up" points away from the centre of the path.
        const away = Math.atan2(center.point.y - sampler.centroid.y, center.point.x - sampler.centroid.x);
        const angle = away + Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        m = multiply([cos, sin, -sin, cos, center.point.x, center.point.y], [1, 0, 0, 1, -half, dy]);
        break;
      }
      default: {
        const cos = Math.cos(center.angle);
        const sin = Math.sin(center.angle);
        m = multiply([cos, sin, -sin, cos, center.point.x, center.point.y], [1, 0, 0, 1, -half, dy]);
      }
    }
    out.push({ glyph: g, matrix: m });
  }
  return { glyphs: out, overflowAt, layout };
}

/** Convenience: lay a story out as a single line and place it on the path. */
export function layoutTextOnPath(story: Parameters<typeof layoutText>[0]['story'], path: TextPath, options: PathTextOptions, paragraphs?: Parameters<typeof layoutText>[0]['paragraphs']): PathTextResult {
  // The line is laid out flush left from 0; alignment is applied along the path.
  const layout = layoutText({ story, kind: 'onPath', ...(paragraphs ? { paragraphs: paragraphs.map((p) => ({ ...p, align: 'left' as const })) } : {}) });
  const first = paragraphs?.[0]?.align;
  const align = first === 'center' || first === 'justifyCenter' ? 'center' : first === 'right' || first === 'justifyRight' ? 'right' : 'left';
  return layoutOnPath(layout, path, options, align);
}
