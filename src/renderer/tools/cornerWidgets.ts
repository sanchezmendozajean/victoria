import {
  anchorToWorld,
  frameOf,
  pathFrameOf,
  patchNode,
  selectedAnchorIndices,
  setPathAnchors,
  worldToLocal,
  type Anchor,
  type Command,
  type EllipseParams,
  type Matrix,
  type PolygonParams,
  type RectParams,
  type Selection,
  type ShapeNode,
  type Space,
  type StarParams,
  type Vec2,
} from '../../core';
import { currentSelection } from './shared';
import type { ToolHost } from './types';

// Live-shape widgets (specs/03): the corner circles of rectangles, polygons, stars and corner anchors
// of paths, and the two pie handles of an ellipse. Pure geometry here; the tools only forward pointer events.

/** Distance (screen px) from the widget centre that still grabs it. */
export const WIDGET_PICK_PX = 6;
/** Where a widget rests when its radius is 0, measured from the corner (screen px). */
export const WIDGET_REST_PX = 14;

export type Widget =
  | { kind: 'rect'; id: string; world: Matrix; pos: Vec2; corner: 0 | 1 | 2 | 3; params: RectParams }
  | { kind: 'polygon'; id: string; world: Matrix; pos: Vec2; params: PolygonParams }
  | { kind: 'star'; id: string; world: Matrix; pos: Vec2; params: StarParams }
  | { kind: 'pie'; id: string; world: Matrix; pos: Vec2; which: 'start' | 'end'; params: EllipseParams }
  | { kind: 'anchor'; id: string; pathId: string; world: Matrix; pos: Vec2; index: number; picked: number[]; anchors: Anchor[]; direction: Vec2 };

const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;

/** Uniform scale of a matrix (square root of |det|), to turn screen distances into local ones. */
const scaleOf = (m: Matrix): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

const RECT_SIGNS: Array<[number, number]> = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

function rectWidgets(node: ShapeNode & { shape: 'rect' }, world: Matrix, zoom: number): Widget[] {
  const { w, h, radii } = node.params;
  const rest = WIDGET_REST_PX / zoom / scaleOf(world);
  const limit = Math.min(w, h) / 2;
  const corners: Vec2[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  return corners.map((c, i) => {
    const [sx, sy] = RECT_SIGNS[i] as [number, number];
    const d = Math.min(Math.max(radii[i] as number, rest), limit);
    return { kind: 'rect', id: node.id, world, corner: i as 0 | 1 | 2 | 3, params: node.params, pos: anchorToWorld(world, { x: c.x + sx * d, y: c.y + sy * d }) };
  });
}

function vertexOf(radius: number, i: number, n: number): Vec2 {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
}

/**
 * Widgets of the selected objects (live shapes), plus — when `anchors` is true — those of the picked
 * corner anchors of paths. `zoom` places each at a fixed screen distance from its corner at rest.
 */
export function listWidgets(space: Space, selection: Selection, zoom: number, anchors: boolean): Widget[] {
  const out: Widget[] = [];
  for (const id of selection.ids) {
    const frame = frameOf(space, id);
    if (!frame || frame.layer.locked || frame.node.locked) continue;
    const node = frame.node;
    if (node.type !== 'shape') continue;
    const world = frame.world;
    if (node.shape === 'rect') out.push(...rectWidgets(node as ShapeNode & { shape: 'rect' }, world, zoom));
    else if (node.shape === 'polygon') {
      const { radius, sides, cornerRadius } = node.params;
      const n = Math.max(3, Math.round(sides));
      const v = vertexOf(radius, 0, n);
      const inward = unit({ x: -v.x, y: -v.y });
      const d = Math.min(Math.max(cornerRadius, WIDGET_REST_PX / zoom / scaleOf(world)), radius);
      out.push({ kind: 'polygon', id, world, params: node.params, pos: anchorToWorld(world, { x: v.x + inward.x * d, y: v.y + inward.y * d }) });
    } else if (node.shape === 'star') {
      const { r1, cornerRadius } = node.params;
      const v = vertexOf(r1, 0, 1);
      const inward = unit({ x: -v.x, y: -v.y });
      const d = Math.min(Math.max(cornerRadius, WIDGET_REST_PX / zoom / scaleOf(world)), r1);
      out.push({ kind: 'star', id, world, params: node.params, pos: anchorToWorld(world, { x: v.x + inward.x * d, y: v.y + inward.y * d }) });
    } else if (node.shape === 'ellipse') {
      const { w, h, startAngle, endAngle } = node.params;
      const at = (deg: number): Vec2 => anchorToWorld(world, { x: w / 2 + (w / 2) * Math.cos((deg * Math.PI) / 180), y: h / 2 + (h / 2) * Math.sin((deg * Math.PI) / 180) });
      out.push({ kind: 'pie', id, world, which: 'start', params: node.params, pos: at(startAngle) });
      out.push({ kind: 'pie', id, world, which: 'end', params: node.params, pos: at(endAngle) });
    }
  }
  if (!anchors) return out;
  for (const pathId of Object.keys(selection.anchors ?? {})) {
    const frame = pathFrameOf(space, pathId);
    if (!frame || frame.live || frame.layer.locked || frame.owner.locked) continue;
    const list = frame.path.anchors;
    const n = list.length;
    const picked = selectedAnchorIndices(selection, pathId);
    for (const index of picked) {
      const a = list[index] as Anchor;
      const prev = list[(index - 1 + n) % n] as Anchor;
      const next = list[(index + 1) % n] as Anchor;
      const closed = frame.path.closed;
      if (a.in || a.out || (!closed && (index === 0 || index === n - 1)) || prev.out || next.in) continue;
      const direction = unit({ x: unit(sub(prev.p, a.p)).x + unit(sub(next.p, a.p)).x, y: unit(sub(prev.p, a.p)).y + unit(sub(next.p, a.p)).y });
      if (direction.x === 0 && direction.y === 0) continue;
      const d = Math.max(a.cornerRadius ?? 0, WIDGET_REST_PX / zoom / scaleOf(frame.world));
      out.push({
        kind: 'anchor',
        id: frame.owner.id,
        pathId,
        world: frame.world,
        index,
        picked,
        anchors: list,
        direction,
        pos: anchorToWorld(frame.world, { x: a.p.x + direction.x * d, y: a.p.y + direction.y * d }),
      });
    }
  }
  return out;
}

/** The widget under a document point (screen tolerance `pickPx` converted with `zoom`). */
export function widgetAt(widgets: readonly Widget[], p: Vec2, zoom: number, pickPx = WIDGET_PICK_PX): Widget | null {
  let best: Widget | null = null;
  let bestDistance = Infinity;
  // Later widgets win ties: the pie end handle sits on top of the start one on a full ellipse.
  for (const w of widgets) {
    const d = Math.hypot(w.pos.x - p.x, w.pos.y - p.y) * zoom;
    if (d <= pickPx && d <= bestDistance + 1e-6) {
      best = w;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * The command that follows a widget drag to `pointer` (document coordinates). Alt on a corner widget
 * changes that corner alone; otherwise every corner of the shape (or every picked anchor) follows.
 */
export function widgetCommand(space: Space, widget: Widget, pointer: Vec2, alt: boolean, key: string): Command | null {
  const local = worldToLocal(widget.world, pointer);
  switch (widget.kind) {
    case 'rect': {
      const { w, h } = widget.params;
      const [sx, sy] = RECT_SIGNS[widget.corner] as [number, number];
      const corner = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }][widget.corner] as Vec2;
      const r = Math.max(0, Math.min(Math.min(w, h) / 2, ((local.x - corner.x) * sx + (local.y - corner.y) * sy) / 2));
      const radii = alt
        ? (widget.params.radii.map((v, i) => (i === widget.corner ? r : v)) as RectParams['radii'])
        : ([r, r, r, r] as RectParams['radii']);
      return patchNode<ShapeNode>(space.id, widget.id, { params: { ...widget.params, radii } } as Partial<ShapeNode>, `widget:${key}`);
    }
    case 'polygon': {
      const v = vertexOf(widget.params.radius, 0, 1);
      const cornerRadius = Math.max(0, Math.min(widget.params.radius, dot(sub(local, v), unit({ x: -v.x, y: -v.y }))));
      return patchNode<ShapeNode>(space.id, widget.id, { params: { ...widget.params, cornerRadius } } as Partial<ShapeNode>, `widget:${key}`);
    }
    case 'star': {
      const v = vertexOf(widget.params.r1, 0, 1);
      const cornerRadius = Math.max(0, Math.min(widget.params.r1, dot(sub(local, v), unit({ x: -v.x, y: -v.y }))));
      return patchNode<ShapeNode>(space.id, widget.id, { params: { ...widget.params, cornerRadius } } as Partial<ShapeNode>, `widget:${key}`);
    }
    case 'pie': {
      const { w, h } = widget.params;
      const rx = w / 2 || 1;
      const ry = h / 2 || 1;
      let degrees = (Math.atan2((local.y - h / 2) / ry, (local.x - w / 2) / rx) * 180) / Math.PI;
      if (degrees < 0) degrees += 360;
      const params = { ...widget.params };
      if (widget.which === 'start') params.startAngle = degrees;
      else {
        params.endAngle = degrees;
        if (params.endAngle <= params.startAngle) params.endAngle += 360;
      }
      return patchNode<ShapeNode>(space.id, widget.id, { params } as Partial<ShapeNode>, `widget:${key}`);
    }
    case 'anchor': {
      const anchor = widget.anchors[widget.index] as Anchor;
      const r = Math.max(0, dot(sub(local, anchor.p), widget.direction));
      const targets = alt ? [widget.index] : widget.picked;
      const next = widget.anchors.map((a, i) => {
        if (!targets.includes(i)) return a;
        const copy: Anchor = { ...a };
        if (r < 0.5) delete copy.cornerRadius;
        else copy.cornerRadius = r;
        return copy;
      });
      return setPathAnchors(space.id, widget.pathId, next, key);
    }
  }
}

/** Alt+click on a rectangle corner widget cycles round → inverted → chamfer for the whole rectangle. */
export function cycleCornerType(space: Space, widget: Widget): Command | null {
  if (widget.kind !== 'rect') return null;
  const order: RectParams['cornerType'][] = ['round', 'inverted', 'chamfer'];
  const next = order[(order.indexOf(widget.params.cornerType) + 1) % order.length] as RectParams['cornerType'];
  return patchNode<ShapeNode>(space.id, widget.id, { params: { ...widget.params, cornerType: next } } as Partial<ShapeNode>);
}

/** Widgets of the current selection of a tool host. */
export function hostWidgets(host: ToolHost, anchors: boolean): Widget[] {
  const selection = currentSelection(host);
  return selection && host.space && !host.options.hideEdges ? listWidgets(host.space, selection, host.view.zoom, anchors) : [];
}
