import { inflateRect, unionRect, type Rect } from '../geometry/rect';
import { nodeWorldBounds } from '../geometry/world';
import { strokesOf } from '../geometry/geometry';
import { isLayer } from './queries';
import type { Artboard, Layer, Node, Space } from './types';

/** Position, size and id of an artboard: what layouts need. */
export type BoardBox = Pick<Artboard, 'id' | 'x' | 'y' | 'w' | 'h'>;

/** Top-level objects of a Space (sublayers included), skipping hidden or locked ones when asked. */
export function topLevelNodes(space: Space, options: { editableOnly?: boolean } = {}): Node[] {
  const out: Node[] = [];
  const walk = (layer: Layer) => {
    if (!layer.visible || (options.editableOnly && layer.locked)) return;
    for (const child of layer.children) {
      if (isLayer(child)) walk(child);
      else if (child.visible && !(options.editableOnly && child.locked)) out.push(child);
    }
  };
  for (const layer of space.layers) walk(layer);
  return out;
}

/** Room a node's own strokes need around its outline (miter spikes ignored: a rectangle fits exactly). */
function strokeReach(node: Node): number {
  let d = 0;
  for (const s of strokesOf(node.appearance)) d = Math.max(d, s.align === 'inside' ? 0 : s.align === 'outside' ? s.width : s.width / 2);
  return d;
}

/** Geometric bounds of a node (and what it holds) plus the half width of its strokes, in Space coordinates. */
export function artworkRect(space: Space, node: Node): Rect | null {
  if (node.type === 'group' || node.type === 'clipGroup') {
    let out: Rect | null = null;
    // A clip group shows only what its mask (first child) covers.
    for (const child of node.type === 'clipGroup' ? node.children.slice(0, 1) : node.children) out = unionRect(out, artworkRect(space, child));
    return out;
  }
  const b = nodeWorldBounds(space, node.id);
  return b ? inflateRect(b, strokeReach(node)) : null;
}

/** Union of the visual bounds of several top-level objects. */
export function artworkBounds(space: Space, nodes: readonly Node[]): Rect | null {
  let out: Rect | null = null;
  for (const node of nodes) out = unionRect(out, artworkRect(space, node));
  return out;
}

/** Top-level objects whose centre lies on the artboard: they travel with it. */
export function artworkOnBoard(space: Space, board: Pick<Artboard, 'x' | 'y' | 'w' | 'h'>): string[] {
  const ids: string[] = [];
  for (const node of topLevelNodes(space, { editableOnly: true })) {
    const b = nodeWorldBounds(space, node.id);
    if (!b) continue;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    if (cx >= board.x && cx <= board.x + board.w && cy >= board.y && cy <= board.y + board.h) ids.push(node.id);
  }
  return ids;
}

export type ArtboardArrangeDirection = 'row' | 'row-rtl' | 'column';

export interface ArrangeOptions {
  /** Boards per row (row directions) or number of columns (column direction). */
  columns: number;
  /** Gap between boards, in pt. */
  spacing: number;
  /** `row`: left to right, row by row · `row-rtl`: right to left · `column`: top to bottom, column by column. */
  direction: ArtboardArrangeDirection;
}

/**
 * New top-left corner of each artboard in a grid, keeping the list order. Columns are as wide as their widest
 * board and rows as tall as their tallest, so mixed sizes never overlap. The grid starts where the boards' union starts.
 */
export function arrangeBoards(boards: readonly BoardBox[], options: ArrangeOptions): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const n = boards.length;
  if (n === 0) return out;
  const columns = Math.max(1, Math.min(n, Math.round(options.columns) || 1));
  const spacing = Math.max(0, options.spacing);
  const perColumn = Math.ceil(n / columns);
  const rows = options.direction === 'column' ? perColumn : Math.ceil(n / columns);
  const cell = (i: number): { col: number; row: number } => {
    if (options.direction === 'column') return { col: Math.floor(i / perColumn), row: i % perColumn };
    const col = i % columns;
    return { col: options.direction === 'row-rtl' ? columns - 1 - col : col, row: Math.floor(i / columns) };
  };
  const colW = new Array<number>(columns).fill(0);
  const rowH = new Array<number>(rows).fill(0);
  boards.forEach((b, i) => {
    const { col, row } = cell(i);
    colW[col] = Math.max(colW[col] ?? 0, b.w);
    rowH[row] = Math.max(rowH[row] ?? 0, b.h);
  });
  const originX = Math.min(...boards.map((b) => b.x));
  const originY = Math.min(...boards.map((b) => b.y));
  const offset = (sizes: number[], index: number) => sizes.slice(0, index).reduce((sum, s) => sum + s + spacing, 0);
  boards.forEach((b, i) => {
    const { col, row } = cell(i);
    out.set(b.id, { x: originX + offset(colW, col), y: originY + offset(rowH, row) });
  });
  return out;
}

/** A copy of an artboard (size, bleed, background and marks included) with a fresh id, name and position. */
export function copyArtboard(source: Artboard, id: string, name: string, at: { x: number; y: number } = source): Artboard {
  return { ...source, id, name, x: at.x, y: at.y, bleed: { ...source.bleed } };
}
