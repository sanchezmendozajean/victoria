import { createCompound, createGroup, createPath, defaultStroke } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import { flattenSubPath } from '../geometry/path';
import type { Anchor, CompoundNode, GroupNode, ImageNode, Node, PathNode, Vec2 } from '../model/types';
import type { TraceParams, TraceView } from '../trace/params';
import type { TraceResult } from '../trace/trace';
import { patchNode, replaceNode } from './node';
import type { Command } from './command';

const scaled = (anchors: readonly Anchor[], sx: number, sy: number): Anchor[] =>
  anchors.map((a) => ({
    ...a,
    p: { x: a.p.x * sx, y: a.p.y * sy },
    in: a.in && { x: a.in.x * sx, y: a.in.y * sy },
    out: a.out && { x: a.out.x * sx, y: a.out.y * sy },
  }));

interface Ring {
  anchors: Anchor[];
  points: Vec2[];
  area: number;
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

function ringOf(anchors: Anchor[]): Ring {
  const points = flattenSubPath({ closed: true, anchors }, 0.1).points;
  let area = 0;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] as Vec2;
    area += (p.x * q.y - q.x * p.y) / 2;
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  });
  return { anchors, points, area, box };
}

function pointInRing(ring: Ring, p: Vec2): boolean {
  const pts = ring.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const u = pts[i] as Vec2;
    const v = pts[j] as Vec2;
    if (u.y > p.y !== v.y > p.y && p.x < ((v.x - u.x) * (p.y - u.y)) / (v.y - u.y) + u.x) inside = !inside;
  }
  return inside;
}

/**
 * The outlines of one colour grouped into shapes: every outer outline with the holes inside it. The tracer emits outer
 * outlines and holes winding opposite ways, so the biggest outline tells which way "outer" goes.
 */
function shapesOf(paths: readonly Anchor[][]): Anchor[][][] {
  const rings = paths.map(ringOf).filter((r) => r.points.length >= 3 && Math.abs(r.area) > 0);
  if (rings.length === 0) return [];
  const biggest = rings.reduce((m, r) => (Math.abs(r.area) > Math.abs(m.area) ? r : m));
  const outers = rings.filter((r) => r.area * biggest.area > 0);
  const shapes = new Map<Ring, Ring[]>(outers.map((o) => [o, []]));
  const bySize = [...outers].sort((x, y) => Math.abs(x.area) - Math.abs(y.area));
  for (const hole of rings.filter((r) => r.area * biggest.area < 0)) {
    const probe = hole.points[0] as Vec2;
    const owner = bySize.find((o) => Math.abs(o.area) > Math.abs(hole.area) && o.box.minX <= hole.box.minX && o.box.maxX >= hole.box.maxX && o.box.minY <= hole.box.minY && o.box.maxY >= hole.box.maxY && pointInRing(o, probe));
    if (owner) shapes.get(owner)?.push(hole);
  }
  return outers.map((o) => [o.anchors, ...(shapes.get(o) ?? []).map((h) => h.anchors)]);
}

/**
 * The traced colours as flat-filled objects, bottom to top, scaled from pixels to the box of the image. Each shape is a
 * plain path; only a shape with holes in it is a compound path (a hole cannot be drawn any other way).
 */
export function traceChildren(ids: IdGenerator, result: TraceResult, width: number, height: number, strokes = false): Array<PathNode | CompoundNode> {
  const sx = width / result.width;
  const sy = height / result.height;
  return result.layers.flatMap((layer) => {
    const paint = { type: 'solid' as const, color: { model: 'rgb' as const, values: [...layer.color] } };
    const look = { items: [strokes ? { kind: 'stroke' as const, paint, stroke: { ...defaultStroke(), width: 1 }, opacity: 1, modifiers: [] } : { kind: 'fill' as const, paint, opacity: 1, modifiers: [] }] };
    return shapesOf(layer.paths).map((rings) => {
      const node = rings.length === 1 ? createPath(ids, scaled(rings[0] as Anchor[], sx, sy), true) : createCompound(ids, rings.map((r) => createPath(ids, scaled(r, sx, sy), true)), 'evenodd');
      node.appearance = look;
      return node;
    });
  });
}

/** Calco de imagen: the image becomes a live group of flat-colour paths (same place, size and look). One undo step. */
export function makeTrace(ids: IdGenerator, spaceId: string, image: ImageNode, params: TraceParams, result: TraceResult): { command: Command; group: GroupNode } {
  const group = createGroup(ids, traceChildren(ids, result, image.width, image.height, params.strokes === true));
  group.transform = image.transform;
  group.opacity = image.opacity;
  group.blendMode = image.blendMode;
  group.appearance = { items: [] };
  group.trace = { resourceId: image.resourceId, width: image.width, height: image.height, params };
  return { command: { ...replaceNode(spaceId, image.id, [group]), label: 'trace.make' }, group };
}

/** Changing the settings of a live trace: the paths are replaced by the new result. */
export function retrace(ids: IdGenerator, spaceId: string, group: GroupNode, params: TraceParams, result: TraceResult): Command {
  const info = group.trace;
  if (!info) throw new Error('Not a live trace');
  const children: Node[] = traceChildren(ids, result, info.width, info.height, params.strokes === true);
  return { ...patchNode<GroupNode>(spaceId, group.id, { children, trace: { ...info, params } }), label: 'trace.update' };
}

/** Vista of the live trace: what the canvas shows (result, outlines, the original image…). */
export function setTraceView(spaceId: string, group: GroupNode, view: TraceView): Command {
  const info = group.trace;
  if (!info) throw new Error('Not a live trace');
  return { ...patchNode<GroupNode>(spaceId, group.id, { trace: { ...info, view } }), label: 'trace.view' };
}

/** Expandir: the group keeps its paths and stops being live. */
export function expandTrace(spaceId: string, group: GroupNode): Command {
  return { ...patchNode<GroupNode>(spaceId, group.id, { trace: undefined }), label: 'trace.expand' };
}
