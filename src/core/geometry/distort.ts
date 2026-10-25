import { applyToPoint, invert, multiply } from '../model/matrix';
import { childrenOf } from '../model/queries';
import type { Anchor, Matrix, Node, PathNode, Space, Vec2 } from '../model/types';
import { frameOf } from './world';
import { nodeGeometry } from './geometry';
import type { Rect } from './rect';


/** Free Transform's two geometry-changing modes (specs/03 · Transformación libre). */
export type DistortMode = 'free' | 'perspective';

/** The four corners of a box after distorting it, in Space coordinates. */
export interface Quad {
  nw: Vec2;
  ne: Vec2;
  se: Vec2;
  sw: Vec2;
}

export const rectQuad = (r: Rect): Quad => ({ nw: { x: r.minX, y: r.minY }, ne: { x: r.maxX, y: r.minY }, se: { x: r.maxX, y: r.maxY }, sw: { x: r.minX, y: r.maxY } });

export type PointMap = (p: Vec2) => Vec2;

/**
 * The map that takes the box `rect` onto `quad`.
 * - `free`: bilinear — each edge stays straight and the corners go where they are put.
 * - `perspective`: projective (a homography) — parallel lines meet at vanishing points.
 * Null when the box is empty or the quad folds over itself so much that the map is undefined.
 */
export function quadMapper(rect: Rect, quad: Quad, mode: DistortMode): PointMap | null {
  const w = rect.maxX - rect.minX;
  const h = rect.maxY - rect.minY;
  if (!(w > 0) || !(h > 0)) return null;
  const { nw, ne, se, sw } = quad;
  const uv = (p: Vec2) => ({ u: (p.x - rect.minX) / w, v: (p.y - rect.minY) / h });

  if (mode === 'free') {
    return (p) => {
      const { u, v } = uv(p);
      const a = (1 - u) * (1 - v);
      const b = u * (1 - v);
      const c = u * v;
      const d = (1 - u) * v;
      return { x: a * nw.x + b * ne.x + c * se.x + d * sw.x, y: a * nw.y + b * ne.y + c * se.y + d * sw.y };
    };
  }

  // Unit square → quad (Heckbert): x = (a·u + b·v + c) / (g·u + h·v + 1), y = (d·u + e·v + f) / (g·u + h·v + 1).
  const dx1 = ne.x - se.x;
  const dx2 = sw.x - se.x;
  const dx3 = nw.x - ne.x + se.x - sw.x;
  const dy1 = ne.y - se.y;
  const dy2 = sw.y - se.y;
  const dy3 = nw.y - ne.y + se.y - sw.y;
  let g = 0;
  let hh = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-12) return null;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    hh = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = ne.x - nw.x + g * ne.x;
  const b = sw.x - nw.x + hh * sw.x;
  const d = ne.y - nw.y + g * ne.y;
  const e = sw.y - nw.y + hh * sw.y;
  return (p) => {
    const { u, v } = uv(p);
    const k = g * u + hh * v + 1;
    // Beyond the vanishing line the projection flips: keep the point finite instead of throwing it to infinity.
    const s = Math.abs(k) < 1e-6 ? 1e-6 : k;
    return { x: (a * u + b * v + nw.x) / s, y: (d * u + e * v + nw.y) / s };
  };
}

/** Can every object be distorted? Text and images cannot (their pixels and glyphs are not paths). */
export function isDistortable(nodes: readonly Node[]): boolean {
  return nodes.length > 0 && nodes.every((n) => (n.type === 'text' || n.type === 'image' ? false : (childrenOf(n) ?? []).every((c) => isDistortable([c]))));
}

function mapAnchors(anchors: readonly Anchor[], full: Matrix, map: PointMap): Anchor[] | null {
  const back = invert(full);
  if (!back) return null;
  const through = (p: Vec2): Vec2 => applyToPoint(back, map(applyToPoint(full, p)));
  return anchors.map((a) => {
    const { cornerRadius: _radius, ...rest } = a;
    void _radius;
    return { ...rest, p: through(a.p), in: a.in ? through(a.in) : null, out: a.out ? through(a.out) : null };
  });
}

function distortOne(node: Node, parentWorld: Matrix, map: PointMap): Node | null {
  const full = multiply(parentWorld, node.transform);
  switch (node.type) {
    case 'path':
    case 'shape': {
      const contour = nodeGeometry(node)?.subpaths[0];
      if (!contour) return null;
      const anchors = mapAnchors(contour.anchors, full, map);
      if (!anchors) return null;
      const base = node.type === 'shape' ? (({ shape: _s, params: _p, ...rest }) => (void _s, void _p, rest))(node) : node;
      return { ...base, type: 'path', closed: contour.closed, anchors } as PathNode;
    }
    case 'compound': {
      const children: PathNode[] = [];
      for (const child of node.children) {
        const mapped = distortOne(child, full, map);
        if (!mapped || mapped.type !== 'path') return null;
        children.push(mapped);
      }
      return { ...node, children };
    }
    case 'group':
    case 'clipGroup': {
      const children: Node[] = [];
      for (const child of node.children) {
        const mapped = distortOne(child, full, map);
        if (!mapped) return null;
        children.push(mapped);
      }
      return { ...node, children } as Node;
    }
    default:
      return null;
  }
}

/**
 * The objects with their geometry distorted by `map` (given in Space coordinates), keeping ids, looks and z-order.
 * Live shapes and corner radii become plain paths. Null when something cannot be distorted.
 */
export function distortNodes(space: Space, ids: readonly string[], map: PointMap): Node[] | null {
  const out: Node[] = [];
  for (const id of ids) {
    const frame = frameOf(space, id);
    if (!frame) return null;
    const distorted = distortOne(frame.node, frame.parentWorld, map);
    if (!distorted) return null;
    out.push(distorted);
  }
  return out;
}
