import { applyCornerRadii } from '../geometry/anchors';
import { segmentsOf, pointOnSegment, type SubPath } from '../geometry/path';
import { segmentLength } from '../geometry/stroke';
import { applyToPoint, multiply, rotation, scaling, translation } from '../model/matrix';
import type { Anchor, Vec2 } from '../model/types';
import type { Geometry, ModifierDef, Params } from './types';
import { centerOf, cloneGeometry, mapGeometry, normalAt, num, polylineAnchors, seeded } from './util';

// Distort and transform: Round Corners, Zigzag, Pucker & Bloat, Roughen, Transform.

const mapSubpaths = (g: Geometry, fn: (s: SubPath) => SubPath): Geometry => ({ fillRule: g.fillRule, subpaths: g.subpaths.map(fn) });

export const roundCorners: ModifierDef = {
  id: 'round-corners',
  icon: 'round-corners',
  category: 'distort',
  affectsGeometry: true,
  defaults: { radius: 10 },
  schema: [{ type: 'number', key: 'radius', unit: 'length', min: 0, step: 1, decimals: 2 }],
  apply(input, params) {
    const radius = Math.max(0, num(params, 'radius', 10));
    if (radius === 0) return { geometry: input };
    return {
      geometry: mapSubpaths(input, (s) => applyCornerRadii({ closed: s.closed, anchors: s.anchors.map((a) => (!a.in && !a.out ? { ...a, p: { ...a.p }, cornerRadius: radius } : a)) })),
    };
  },
};

/** Spans of a contour with the point where each one starts. */
function spansOf(s: SubPath) {
  return segmentsOf(s).map((seg) => ({ seg, length: segmentLength(seg) }));
}

export const zigzag: ModifierDef = {
  id: 'zigzag',
  icon: 'zigzag',
  category: 'distort',
  affectsGeometry: true,
  defaults: { size: 5, sizeMode: 'absolute', ridges: 4, points: 'corner' },
  schema: [
    { type: 'number', key: 'size', unit: 'length', min: 0, step: 1, decimals: 2 },
    { type: 'select', key: 'sizeMode', options: ['absolute', 'relative'] },
    { type: 'number', key: 'ridges', unit: 'none', min: 1, max: 100, step: 1, decimals: 0 },
    { type: 'select', key: 'points', options: ['corner', 'smooth'] },
  ],
  apply(input, params) {
    const size = num(params, 'size', 5);
    const relative = params.sizeMode === 'relative';
    const ridges = Math.max(1, Math.round(num(params, 'ridges', 4)));
    const smooth = params.points === 'smooth';
    return {
      geometry: mapSubpaths(input, (sub) => {
        const spans = spansOf(sub);
        if (spans.length === 0) return sub;
        const points: Vec2[] = [];
        const corners = new Set<number>();
        let side = 1;
        spans.forEach(({ seg, length }) => {
          corners.add(points.length);
          points.push(seg.p0);
          const amount = relative ? (size / 100) * length : size;
          for (let j = 0; j < ridges; j++) {
            const t = (j + 1) / (ridges + 1);
            const base = pointOnSegment(seg, t);
            const n = normalAt(seg, t);
            points.push({ x: base.x + n.x * amount * side, y: base.y + n.y * amount * side });
            side = -side;
          }
        });
        if (!sub.closed) {
          corners.add(points.length);
          points.push((spans[spans.length - 1] as { seg: { p3: Vec2 } }).seg.p3);
        }
        return { closed: sub.closed, anchors: polylineAnchors(points, smooth ? new Set(sub.closed ? [] : [0, points.length - 1]) : corners, sub.closed, smooth) };
      }),
    };
  },
};

export const puckerBloat: ModifierDef = {
  id: 'pucker-bloat',
  icon: 'pucker-bloat',
  category: 'distort',
  affectsGeometry: true,
  defaults: { amount: 30 },
  schema: [{ type: 'number', key: 'amount', unit: 'percent', min: -200, max: 200, step: 1, decimals: 1, slider: true }],
  apply(input, params) {
    const a = num(params, 'amount', 0) / 100;
    if (a === 0) return { geometry: input };
    const c = centerOf(input);
    // Bloat (positive): anchors move toward the centre and handles swell outward; Pucker (negative) does the opposite.
    const anchorScale = Math.max(0.05, 1 - a * 0.4);
    const handleScale = Math.max(0.05, 1 + a * 0.8);
    const scaleAbout = (p: Vec2, k: number): Vec2 => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k });
    return {
      geometry: mapSubpaths(input, (sub) => {
        // Straight spans get handles so that they can bulge.
        const anchors: Anchor[] = sub.anchors.map((an, i) => {
          const next = sub.anchors[(i + 1) % sub.anchors.length] as Anchor;
          const hasNext = sub.closed || i < sub.anchors.length - 1;
          const p = scaleAbout(an.p, anchorScale);
          let out = an.out;
          if (!out && hasNext && !next.in) out = { x: an.p.x + (next.p.x - an.p.x) / 3, y: an.p.y + (next.p.y - an.p.y) / 3 };
          return { ...an, p, in: an.in && scaleAbout(an.in, anchorScale * 0 + handleScale * anchorScale), out: out && scaleAbout(out, handleScale * anchorScale) };
        });
        // The incoming handle of a straight span mirrors the outgoing one of the previous anchor.
        sub.anchors.forEach((an, i) => {
          const prevIndex = (i - 1 + sub.anchors.length) % sub.anchors.length;
          const hasPrev = sub.closed || i > 0;
          const prev = sub.anchors[prevIndex] as Anchor;
          if (hasPrev && !an.in && !prev.out) {
            const q = { x: an.p.x + (prev.p.x - an.p.x) / 3, y: an.p.y + (prev.p.y - an.p.y) / 3 };
            (anchors[i] as Anchor).in = scaleAbout(q, handleScale * anchorScale);
          }
        });
        return { closed: sub.closed, anchors: anchors.map((an) => ({ ...an, kind: 'corner' as const })) };
      }),
    };
  },
};

export const roughen: ModifierDef = {
  id: 'roughen',
  icon: 'roughen',
  category: 'distort',
  affectsGeometry: true,
  defaults: { size: 3, sizeMode: 'absolute', detail: 20, points: 'corner', seed: 1 },
  schema: [
    { type: 'number', key: 'size', unit: 'length', min: 0, step: 0.5, decimals: 2 },
    { type: 'select', key: 'sizeMode', options: ['absolute', 'relative'] },
    { type: 'number', key: 'detail', unit: 'none', min: 1, max: 200, step: 1, decimals: 0 },
    { type: 'select', key: 'points', options: ['corner', 'smooth'] },
    { type: 'number', key: 'seed', unit: 'none', min: 0, max: 99999, step: 1, decimals: 0 },
  ],
  apply(input, params) {
    const rand = seeded(Math.round(num(params, 'seed', 1)));
    const detail = Math.max(1, num(params, 'detail', 20));
    const spacing = 72 / detail; // detail = points per inch
    const smooth = params.points === 'smooth';
    return {
      geometry: mapSubpaths(input, (sub) => {
        const spans = spansOf(sub);
        if (spans.length === 0) return sub;
        const points: Vec2[] = [];
        const push = (p: Vec2, n: Vec2, amount: number) => {
          const d = (rand() * 2 - 1) * amount;
          const tang = (rand() * 2 - 1) * amount * 0.3;
          points.push({ x: p.x + n.x * d - n.y * tang, y: p.y + n.y * d + n.x * tang });
        };
        spans.forEach(({ seg, length }) => {
          const amount = params.sizeMode === 'relative' ? (num(params, 'size', 3) / 100) * length : num(params, 'size', 3);
          const count = Math.max(1, Math.ceil(length / spacing));
          for (let j = 0; j < count; j++) push(pointOnSegment(seg, j / count), normalAt(seg, j / count), amount);
        });
        if (!sub.closed) {
          const last = spans[spans.length - 1] as (typeof spans)[number];
          push(last.seg.p3, normalAt(last.seg, 1), num(params, 'size', 3));
        }
        return { closed: sub.closed, anchors: polylineAnchors(points, new Set(), sub.closed, smooth) };
      }),
    };
  },
};

export const transformModifier: ModifierDef = {
  id: 'transform',
  icon: 'mod-transform',
  category: 'distort',
  affectsGeometry: true,
  defaults: { scaleX: 100, scaleY: 100, moveX: 0, moveY: 0, angle: 0, reflectX: false, reflectY: false, copies: 0 },
  schema: [
    { type: 'number', key: 'scaleX', unit: 'percent', step: 1, decimals: 1 },
    { type: 'number', key: 'scaleY', unit: 'percent', step: 1, decimals: 1 },
    { type: 'number', key: 'moveX', unit: 'length', step: 1, decimals: 2 },
    { type: 'number', key: 'moveY', unit: 'length', step: 1, decimals: 2 },
    { type: 'number', key: 'angle', unit: 'angle', step: 1, decimals: 1 },
    { type: 'boolean', key: 'reflectX' },
    { type: 'boolean', key: 'reflectY' },
    { type: 'number', key: 'copies', unit: 'none', min: 0, max: 200, step: 1, decimals: 0 },
  ],
  apply(input, params: Params) {
    const c = centerOf(input);
    const sx = (num(params, 'scaleX', 100) / 100) * (params.reflectX === true ? -1 : 1);
    const sy = (num(params, 'scaleY', 100) / 100) * (params.reflectY === true ? -1 : 1);
    const step = multiply(
      translation(c.x + num(params, 'moveX', 0), c.y + num(params, 'moveY', 0)),
      multiply(rotation((-num(params, 'angle', 0) * Math.PI) / 180), multiply(scaling(sx, sy), translation(-c.x, -c.y))),
    );
    const copies = Math.max(0, Math.round(num(params, 'copies', 0)));
    const out: Geometry = { fillRule: input.fillRule, subpaths: [] };
    if (copies === 0) return { geometry: mapGeometry(input, (p) => applyToPoint(step, p)) };
    out.subpaths.push(...cloneGeometry(input).subpaths);
    let m = step;
    for (let i = 0; i < copies; i++) {
      out.subpaths.push(...mapGeometry(input, (p) => applyToPoint(m, p)).subpaths);
      m = multiply(step, m);
    }
    return { geometry: out };
  },
};
