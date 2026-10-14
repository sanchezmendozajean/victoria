import type { Rect } from '../geometry/rect';
import type { Vec2 } from '../model/types';

// Alignment, distribution and spacing (specs/06 · Alineación y Espaciado). Pure geometry over the
// bounds of the objects: every function returns the translation each object needs, never mutates.

export interface Item {
  id: string;
  rect: Rect;
}

export type Deltas = Map<string, Vec2>;

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeKind = 'top' | 'vcenter' | 'bottom' | 'left' | 'hcenter' | 'right';
export type Axis = 'h' | 'v';

const cx = (r: Rect) => (r.minX + r.maxX) / 2;
const cy = (r: Rect) => (r.minY + r.maxY) / 2;
const width = (r: Rect) => r.maxX - r.minX;
const height = (r: Rect) => r.maxY - r.minY;

export function unionOf(items: readonly Item[]): Rect | null {
  const first = items[0];
  if (!first) return null;
  return items.reduce<Rect>(
    (u, i) => ({ minX: Math.min(u.minX, i.rect.minX), minY: Math.min(u.minY, i.rect.minY), maxX: Math.max(u.maxX, i.rect.maxX), maxY: Math.max(u.maxY, i.rect.maxY) }),
    { ...first.rect },
  );
}

const withDelta = (map: Deltas, id: string, dx: number, dy: number) => {
  if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) map.set(id, { x: dx, y: dy });
};

/** Aligns every object to `target` (the selection bounds, the key object's bounds or the artboard). */
export function alignItems(items: readonly Item[], kind: AlignKind, target: Rect): Deltas {
  const out: Deltas = new Map();
  for (const { id, rect } of items) {
    switch (kind) {
      case 'left':
        withDelta(out, id, target.minX - rect.minX, 0);
        break;
      case 'right':
        withDelta(out, id, target.maxX - rect.maxX, 0);
        break;
      case 'hcenter':
        withDelta(out, id, cx(target) - cx(rect), 0);
        break;
      case 'top':
        withDelta(out, id, 0, target.minY - rect.minY);
        break;
      case 'bottom':
        withDelta(out, id, 0, target.maxY - rect.maxY);
        break;
      case 'vcenter':
        withDelta(out, id, 0, cy(target) - cy(rect));
        break;
    }
  }
  return out;
}

const edgeOf = (kind: DistributeKind, r: Rect): number => {
  switch (kind) {
    case 'left':
      return r.minX;
    case 'hcenter':
      return cx(r);
    case 'right':
      return r.maxX;
    case 'top':
      return r.minY;
    case 'vcenter':
      return cy(r);
    case 'bottom':
      return r.maxY;
  }
};

const isHorizontal = (kind: DistributeKind) => kind === 'left' || kind === 'hcenter' || kind === 'right';

/**
 * Distributes objects so that the chosen edge (or centre) is equally spaced. The two outermost objects
 * stay where they are; with a key object (`keyId`) that object stays too and the rest are spaced from it.
 */
export function distributeItems(items: readonly Item[], kind: DistributeKind, keyId?: string | null): Deltas {
  const out: Deltas = new Map();
  if (items.length < 3) return out;
  const horizontal = isHorizontal(kind);
  const sorted = [...items].sort((a, b) => edgeOf(kind, a.rect) - edgeOf(kind, b.rect));
  const first = edgeOf(kind, (sorted[0] as Item).rect);
  const last = edgeOf(kind, (sorted[sorted.length - 1] as Item).rect);
  const step = (last - first) / (sorted.length - 1);
  void keyId; // the extremes already fix the layout; a key object only matters for spacing by value
  sorted.forEach((item, i) => {
    const wanted = first + step * i;
    const have = edgeOf(kind, item.rect);
    withDelta(out, item.id, horizontal ? wanted - have : 0, horizontal ? 0 : wanted - have);
  });
  return out;
}

const startOf = (axis: Axis, r: Rect) => (axis === 'h' ? r.minX : r.minY);
const endOf = (axis: Axis, r: Rect) => (axis === 'h' ? r.maxX : r.maxY);
const sizeOf = (axis: Axis, r: Rect) => (axis === 'h' ? width(r) : height(r));

/** Gaps between consecutive objects along an axis (objects sorted by position). Negative when they overlap. */
export function gapsOf(items: readonly Item[], axis: Axis): number[] {
  const sorted = [...items].sort((a, b) => startOf(axis, a.rect) - startOf(axis, b.rect));
  return sorted.slice(1).map((item, i) => startOf(axis, item.rect) - endOf(axis, (sorted[i] as Item).rect));
}

/** The spacing indicator: the shared gap, "mixed" when the gaps differ, none with fewer than two objects. */
export function currentSpacing(items: readonly Item[], axis: Axis): { value: number | null; mixed: boolean } {
  const gaps = gapsOf(items, axis);
  if (gaps.length === 0) return { value: null, mixed: false };
  const first = gaps[0] as number;
  return gaps.every((g) => Math.abs(g - first) < 0.01) ? { value: first, mixed: false } : { value: null, mixed: true };
}

/**
 * Distribute spacing: equal gaps between objects along an axis. `gap` = null spreads them evenly between
 * the outermost ones (which stay); a number sets that exact gap, keeping the key object (or the first one)
 * where it is.
 */
export function distributeSpacing(items: readonly Item[], axis: Axis, gap: number | null, keyId?: string | null): Deltas {
  const out: Deltas = new Map();
  if (items.length < 2) return out;
  const sorted = [...items].sort((a, b) => startOf(axis, a.rect) - startOf(axis, b.rect));
  let positions: number[];
  if (gap === null) {
    if (sorted.length < 3) return out;
    const first = sorted[0] as Item;
    const last = sorted[sorted.length - 1] as Item;
    const total = endOf(axis, last.rect) - startOf(axis, first.rect);
    const used = sorted.reduce((n, i) => n + sizeOf(axis, i.rect), 0);
    const even = (total - used) / (sorted.length - 1);
    positions = [];
    let cursor = startOf(axis, first.rect);
    for (const item of sorted) {
      positions.push(cursor);
      cursor += sizeOf(axis, item.rect) + even;
    }
  } else {
    const anchorIndex = Math.max(0, sorted.findIndex((i) => i.id === keyId));
    const anchorItem = sorted[anchorIndex] as Item;
    positions = new Array<number>(sorted.length);
    positions[anchorIndex] = startOf(axis, anchorItem.rect);
    for (let i = anchorIndex + 1; i < sorted.length; i++) positions[i] = (positions[i - 1] as number) + sizeOf(axis, (sorted[i - 1] as Item).rect) + gap;
    for (let i = anchorIndex - 1; i >= 0; i--) positions[i] = (positions[i + 1] as number) - gap - sizeOf(axis, (sorted[i] as Item).rect);
  }
  sorted.forEach((item, i) => {
    const d = (positions[i] as number) - startOf(axis, item.rect);
    withDelta(out, item.id, axis === 'h' ? d : 0, axis === 'v' ? d : 0);
  });
  return out;
}

export interface GridOptions {
  columns: number;
  gapX: number;
  gapY: number;
  /** Top-left corner of the grid; defaults to the top-left of the selection. */
  origin?: Vec2;
}

/**
 * Arranges the objects in a grid in reading order (top to bottom, left to right): each cell is as large
 * as the biggest object, and objects sit at the top-left of their cell. "Espaciado igual en rejilla".
 */
export function gridItems(items: readonly Item[], options: GridOptions): Deltas {
  const out: Deltas = new Map();
  if (items.length === 0) return out;
  const columns = Math.max(1, Math.floor(options.columns));
  const bounds = unionOf(items) as Rect;
  const origin = options.origin ?? { x: bounds.minX, y: bounds.minY };
  // Reading order: rows by the objects' vertical centres, then left to right.
  const sorted = [...items].sort((a, b) => cy(a.rect) - cy(b.rect) || cx(a.rect) - cx(b.rect));
  const rows = Math.ceil(sorted.length / columns);
  const byRow: Item[][] = [];
  for (let r = 0; r < rows; r++) byRow.push(sorted.slice(r * columns, (r + 1) * columns).sort((a, b) => cx(a.rect) - cx(b.rect)));
  const cellW = Math.max(...items.map((i) => width(i.rect)));
  const cellH = Math.max(...items.map((i) => height(i.rect)));
  byRow.forEach((row, r) => {
    row.forEach((item, c) => {
      const x = origin.x + c * (cellW + options.gapX);
      const y = origin.y + r * (cellH + options.gapY);
      withDelta(out, item.id, x - item.rect.minX, y - item.rect.minY);
    });
  });
  return out;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Spreads the objects over an area (an artboard) respecting margins: along each axis the outermost
 * objects touch the margins and the rest are spaced evenly. Objects wider than the area stay put on that axis.
 */
export function fitToArea(items: readonly Item[], area: Rect, margins: Margins): Deltas {
  const out: Deltas = new Map();
  if (items.length === 0) return out;
  const inner: Rect = { minX: area.minX + margins.left, minY: area.minY + margins.top, maxX: area.maxX - margins.right, maxY: area.maxY - margins.bottom };
  const bounds = unionOf(items) as Rect;
  const place = (axis: Axis): Map<string, number> => {
    const lo = axis === 'h' ? inner.minX : inner.minY;
    const hi = axis === 'h' ? inner.maxX : inner.maxY;
    const result = new Map<string, number>();
    const sorted = [...items].sort((a, b) => startOf(axis, a.rect) - startOf(axis, b.rect));
    if (sorted.length === 1) {
      const only = sorted[0] as Item;
      result.set(only.id, lo - startOf(axis, only.rect));
      return result;
    }
    const used = sorted.reduce((n, i) => n + sizeOf(axis, i.rect), 0);
    const even = (hi - lo - used) / (sorted.length - 1);
    let cursor = lo;
    for (const item of sorted) {
      result.set(item.id, cursor - startOf(axis, item.rect));
      cursor += sizeOf(axis, item.rect) + even;
    }
    return result;
  };
  void bounds;
  const dx = place('h');
  const dy = place('v');
  for (const item of items) withDelta(out, item.id, dx.get(item.id) ?? 0, dy.get(item.id) ?? 0);
  return out;
}
