import type { Anchor, ShapeNode, Vec2 } from '../model/types';
import type { SubPath } from './path';

const corner = (p: Vec2, out: Vec2 | null = null, inn: Vec2 | null = null): Anchor => ({ p, in: inn, out, kind: 'corner' });

type CornerType = 'round' | 'inverted' | 'chamfer';

const length = (v: Vec2) => Math.hypot(v.x, v.y);
const unit = (v: Vec2): Vec2 => {
  const l = length(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
const add = (a: Vec2, b: Vec2, s = 1): Vec2 => ({ x: a.x + b.x * s, y: a.y + b.y * s });
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;

/**
 * Closed polygon with a radius per vertex. Each rounded vertex becomes two anchors joined by an arc
 * (round), a straight cut (chamfer) or a concave arc centred on the vertex (inverted).
 */
export function roundedPolygon(vertices: readonly Vec2[], radii: readonly number[], type: CornerType = 'round'): SubPath {
  const n = vertices.length;
  const anchors: Anchor[] = [];
  for (let i = 0; i < n; i++) {
    const v = vertices[i] as Vec2;
    const prev = vertices[(i + n - 1) % n] as Vec2;
    const next = vertices[(i + 1) % n] as Vec2;
    const r = radii[i] ?? 0;
    const toPrev = unit({ x: prev.x - v.x, y: prev.y - v.y });
    const toNext = unit({ x: next.x - v.x, y: next.y - v.y });
    const edgePrev = Math.hypot(prev.x - v.x, prev.y - v.y);
    const edgeNext = Math.hypot(next.x - v.x, next.y - v.y);
    const cosTheta = Math.max(-1, Math.min(1, dot(toPrev, toNext)));
    const theta = Math.acos(cosTheta); // interior angle at the vertex
    if (r <= 0 || theta < 1e-6 || Math.abs(theta - Math.PI) < 1e-6) {
      anchors.push(corner(v));
      continue;
    }
    // Distance from the vertex to where the arc starts and ends, limited so neighbours still fit.
    const wanted = type === 'round' ? r / Math.tan(theta / 2) : r;
    const t = Math.min(wanted, edgePrev / 2, edgeNext / 2);
    const a = add(v, toPrev, t);
    const b = add(v, toNext, t);
    if (type === 'chamfer') {
      anchors.push(corner(a), corner(b));
    } else if (type === 'round') {
      const radius = t * Math.tan(theta / 2);
      const h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * radius;
      anchors.push(corner(a, add(a, toPrev, -h)), corner(b, null, add(b, toNext, -h)));
    } else {
      // Arc centred on the vertex, bulging into the shape.
      const tangentA = unit({ x: toNext.x - dot(toNext, toPrev) * toPrev.x, y: toNext.y - dot(toNext, toPrev) * toPrev.y });
      const tangentB = unit({ x: toPrev.x - dot(toPrev, toNext) * toNext.x, y: toPrev.y - dot(toPrev, toNext) * toNext.y });
      const h = (4 / 3) * Math.tan(theta / 4) * t;
      anchors.push(corner(a, add(a, tangentA, h)), corner(b, null, add(b, tangentB, h)));
    }
  }
  return { anchors, closed: true };
}

/** Arc of an ellipse as smooth anchors; angles in degrees, 0° = +X, clockwise on screen (Y down). */
function arcAnchors(cx: number, cy: number, rx: number, ry: number, startDeg: number, sweepDeg: number): Anchor[] {
  const steps = Math.max(1, Math.ceil(Math.abs(sweepDeg) / 90 - 1e-9));
  const step = (sweepDeg / steps) * (Math.PI / 180);
  const h = (4 / 3) * Math.tan(step / 4);
  const point = (a: number): Vec2 => ({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  const tangent = (a: number): Vec2 => ({ x: -rx * Math.sin(a), y: ry * Math.cos(a) });
  const anchors: Anchor[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (startDeg * Math.PI) / 180 + step * i;
    const p = point(a);
    const t = tangent(a);
    anchors.push({
      p,
      in: i === 0 ? null : { x: p.x - t.x * h, y: p.y - t.y * h },
      out: i === steps ? null : { x: p.x + t.x * h, y: p.y + t.y * h },
      kind: 'smooth',
    });
  }
  return anchors;
}

/** Contours of a live shape in its local space (rect/ellipse start at (0,0); polygon/star are centred on it). */
export function shapeSubPaths(node: ShapeNode): SubPath[] {
  switch (node.shape) {
    case 'rect': {
      const { w, h, radii, cornerType } = node.params;
      const limit = Math.min(w, h) / 2;
      const clamped = radii.map((r) => Math.max(0, Math.min(r, limit)));
      const corners: Vec2[] = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
      return [roundedPolygon(corners, clamped, cornerType)];
    }
    case 'ellipse': {
      const { w, h, startAngle, endAngle } = node.params;
      const rx = w / 2;
      const ry = h / 2;
      let sweep = endAngle - startAngle;
      if (sweep <= 0) sweep += 360;
      if (sweep >= 360 - 1e-9) {
        const anchors = arcAnchors(rx, ry, rx, ry, 0, 360);
        // First and last anchors coincide: merge them into one smooth anchor.
        const first = anchors[0] as Anchor;
        const last = anchors[anchors.length - 1] as Anchor;
        first.in = last.in;
        anchors.pop();
        return [{ anchors, closed: true }];
      }
      // Pie slice: centre → arc start → arc → centre.
      const arc = arcAnchors(rx, ry, rx, ry, startAngle, sweep);
      return [{ anchors: [corner({ x: rx, y: ry }), ...arc.map((a, i) => (i === 0 ? { ...a, kind: 'corner' as const } : a))], closed: true }];
    }
    case 'polygon': {
      const { radius, sides, cornerRadius } = node.params;
      const n = Math.max(3, Math.round(sides));
      const vertices = Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
      });
      return [roundedPolygon(vertices, vertices.map(() => cornerRadius))];
    }
    case 'star': {
      const { r1, r2, points, cornerRadius } = node.params;
      const n = Math.max(3, Math.round(points));
      const vertices = Array.from({ length: n * 2 }, (_, i) => {
        const a = -Math.PI / 2 + (Math.PI * i) / n;
        const r = i % 2 === 0 ? r1 : r2;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
      return [roundedPolygon(vertices, vertices.map(() => cornerRadius))];
    }
    case 'line':
      return [{ anchors: [corner({ x: 0, y: 0 }), corner({ x: node.params.length, y: 0 })], closed: false }];
  }
}
