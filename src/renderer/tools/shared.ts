import {
  locateNodes,
  invert,
  multiply,
  selectionBounds,
  snapPoint,
  snapRect,
  type Matrix,
  type Rect,
  type Selection,
  type SnapLine,
  type Space,
  type Vec2,
} from '../../core';
import type { ToolHost } from './types';

/** Selected ids that are not inside another selected object (a group and its child are one unit). */
export function topLevelIds(space: Space, ids: readonly string[]): string[] {
  const tops = new Set(locateNodes(space, ids, true).map((l) => l.node.id));
  return ids.filter((id) => tops.has(id));
}

/** The selection of this Space (selections of another Space do not apply). */
export function currentSelection(host: ToolHost): Selection | null {
  const { session, space } = host;
  if (!session || !space) return null;
  const selection = session.selection;
  return selection.spaceId === space.id ? selection : null;
}

export const selectedTopLevel = (host: ToolHost): string[] => {
  const selection = currentSelection(host);
  return selection && host.space ? topLevelIds(host.space, selection.ids) : [];
};

export const boxOf = (host: ToolHost, ids: readonly string[]): Rect | null => (host.space && ids.length ? selectionBounds(host.space, ids) : null);

/** `step` = new total transform applied after the previously applied one (so drags stay one absolute transform). */
export const stepBetween = (next: Matrix, applied: Matrix): Matrix => {
  const inverse = invert(applied);
  return inverse ? multiply(next, inverse) : next;
};

export const translate = (r: Rect, d: Vec2): Rect => ({ minX: r.minX + d.x, minY: r.minY + d.y, maxX: r.maxX + d.x, maxY: r.maxY + d.y });

/** Applies snapping to a drag delta; returns the corrected delta and shows the smart guides. */
export function snapDelta(host: ToolHost, bounds: Rect, delta: Vec2, exclude: ReadonlySet<string>): Vec2 {
  const sources = host.snapSources(exclude);
  const hasSources = !!(sources.guides?.length || sources.grid || sources.artboards?.length || sources.objects || sources.anchors?.length);
  if (!hasSources) {
    host.setSnapLines(null);
    return delta;
  }
  const result = snapRect(translate(bounds, delta), sources, host.pickTolerance);
  host.setSnapLines(result.lines.length > 0 ? (result.lines as SnapLine[]) : null);
  return { x: delta.x + result.dx, y: delta.y + result.dy };
}

/** Drag distance (screen px) before a press becomes a drag. */
export const DRAG_THRESHOLD = 3;

export const dragged = (a: Vec2, b: Vec2): boolean => Math.hypot(a.x - b.x, a.y - b.y) >= DRAG_THRESHOLD;

/** Snaps one point (a click or a drag end) to guides, grid and smart guides; shows the guides drawn. */
export function snapTo(host: ToolHost, p: Vec2, exclude: ReadonlySet<string> = new Set()): Vec2 {
  const sources = host.snapSources(exclude);
  const hasSources = !!(sources.guides?.length || sources.grid || sources.artboards?.length || sources.objects || sources.anchors?.length);
  if (!hasSources) return p;
  const result = snapPoint(p, sources, host.pickTolerance);
  host.setSnapLines(result.lines.length > 0 ? (result.lines as SnapLine[]) : null);
  return { x: p.x + result.dx, y: p.y + result.dy };
}

/** Gives a freshly created object the look of the next objects (the current fill and stroke). */
export function withLook<T extends { appearance: { items: unknown[] } }>(node: T, host: ToolHost, strokeOnly = false): T {
  const look = host.newAppearance();
  node.appearance = (strokeOnly ? { items: look.items.filter((i) => i.kind === 'stroke') } : look) as T['appearance'];
  return node;
}
