import { indexFor } from '../geometry/spatial-index';
import type { Rect } from '../geometry/rect';
import type { Artboard, Guide, Space, Vec2 } from '../model/types';

export type SnapKind = 'guide' | 'grid' | 'edge' | 'center' | 'artboard' | 'anchor';

/** One alignment line to draw (specs/03 · Guías inteligentes). */
export interface SnapLine {
  axis: 'x' | 'y';
  /** Coordinate of the line on its axis (an `x` line is vertical). */
  value: number;
  kind: SnapKind;
  /** Extent along the other axis. Guides and the grid have none (the whole window). */
  from: number | null;
  to: number | null;
  /** Magenta label of the smart guide ("alinear", "centro", "ancla"); null for plain guides and grid. */
  label: 'align' | 'center' | 'anchor' | null;
}

export interface SnapSources {
  guides?: readonly Guide[] | null;
  /** Grid spacing in pt; lines every `size / subdivisions`. */
  grid?: { size: number; subdivisions: number } | null;
  artboards?: readonly Artboard[] | null;
  /** Align to the bounds of other objects of this Space. */
  objects?: { space: Space; exclude: ReadonlySet<string> } | null;
  /** Anchor points to snap to. */
  anchors?: readonly Vec2[] | null;
}

export interface SnapResult {
  /** Correction to add to the moving thing so it lands on the snap. */
  dx: number;
  dy: number;
  lines: SnapLine[];
}

interface Candidate {
  value: number;
  kind: SnapKind;
  from: number | null;
  to: number | null;
}

/** Lower wins when two snaps are equally close. */
const PRIORITY: Record<SnapKind, number> = { guide: 0, anchor: 1, edge: 2, center: 2, artboard: 3, grid: 4 };

function candidatesFor(axis: 'x' | 'y', moving: readonly number[], span: [number, number], sources: SnapSources, tolerance: number): Candidate[] {
  const out: Candidate[] = [];
  const lo = Math.min(...moving) - tolerance;
  const hi = Math.max(...moving) + tolerance;
  const near = (v: number) => v >= lo && v <= hi;
  const other = (r: Rect) => (axis === 'x' ? [r.minY, r.maxY] : [r.minX, r.maxX]) as [number, number];

  for (const g of sources.guides ?? []) {
    if ((axis === 'x') === (g.orientation === 'vertical') && near(g.position)) out.push({ value: g.position, kind: 'guide', from: null, to: null });
  }
  if (sources.grid && sources.grid.size > 0) {
    const step = sources.grid.size / Math.max(1, sources.grid.subdivisions);
    for (const m of moving) {
      const v = Math.round(m / step) * step;
      if (near(v)) out.push({ value: v, kind: 'grid', from: null, to: null });
    }
  }
  for (const a of sources.artboards ?? []) {
    const min = axis === 'x' ? a.x : a.y;
    const size = axis === 'x' ? a.w : a.h;
    const across: [number, number] = axis === 'x' ? [a.y, a.y + a.h] : [a.x, a.x + a.w];
    for (const [value, kind] of [[min, 'artboard'], [min + size / 2, 'center'], [min + size, 'artboard']] as const) {
      if (near(value)) out.push({ value, kind, from: Math.min(span[0], across[0]), to: Math.max(span[1], across[1]) });
    }
  }
  for (const p of sources.anchors ?? []) {
    const value = axis === 'x' ? p.x : p.y;
    if (near(value)) out.push({ value, kind: 'anchor', from: null, to: null });
  }
  if (sources.objects) {
    const { space, exclude } = sources.objects;
    for (const item of indexFor(space).items) {
      if (exclude.has(item.id) || item.ancestors.some((a) => exclude.has(a.id))) continue;
      const r = item.geometric;
      const min = axis === 'x' ? r.minX : r.minY;
      const max = axis === 'x' ? r.maxX : r.maxY;
      const across = other(r);
      for (const [value, kind] of [[min, 'edge'], [(min + max) / 2, 'center'], [max, 'edge']] as const) {
        if (near(value)) out.push({ value, kind, from: Math.min(span[0], across[0]), to: Math.max(span[1], across[1]) });
      }
    }
  }
  return out;
}

function solveAxis(axis: 'x' | 'y', moving: readonly number[], span: [number, number], sources: SnapSources, tolerance: number): { delta: number; lines: SnapLine[] } {
  const candidates = candidatesFor(axis, moving, span, sources, tolerance);
  let best: { delta: number; priority: number } | null = null;
  for (const c of candidates) {
    for (const m of moving) {
      const delta = c.value - m;
      if (Math.abs(delta) > tolerance) continue;
      const priority = PRIORITY[c.kind];
      if (!best || Math.abs(delta) < Math.abs(best.delta) - 1e-9 || (Math.abs(Math.abs(delta) - Math.abs(best.delta)) <= 1e-9 && priority < best.priority)) {
        best = { delta, priority };
      }
    }
  }
  if (!best) return { delta: 0, lines: [] };

  // Every target that the corrected position also hits gets a line.
  const lines: SnapLine[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    for (const m of moving) {
      if (Math.abs(m + best.delta - c.value) > 1e-6) continue;
      const key = `${c.kind}:${c.value.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = c.kind === 'center' ? 'center' : c.kind === 'edge' ? 'align' : c.kind === 'anchor' ? 'anchor' : null;
      lines.push({ axis, value: c.value, kind: c.kind, from: c.from, to: c.to, label });
    }
  }
  return { delta: best.delta, lines };
}

/**
 * Snaps a moving rectangle (its two edges and centre on each axis) to guides, the grid, artboards,
 * other objects and anchors, within `tolerance` Space units (4 screen px / zoom).
 */
export function snapRect(moving: Rect, sources: SnapSources, tolerance: number): SnapResult {
  const x = solveAxis('x', [moving.minX, (moving.minX + moving.maxX) / 2, moving.maxX], [moving.minY, moving.maxY], sources, tolerance);
  const y = solveAxis('y', [moving.minY, (moving.minY + moving.maxY) / 2, moving.maxY], [moving.minX, moving.maxX], sources, tolerance);
  return { dx: x.delta, dy: y.delta, lines: [...x.lines, ...y.lines] };
}

/** Snaps a single point (an anchor or handle being dragged). */
export function snapPoint(point: Vec2, sources: SnapSources, tolerance: number): SnapResult {
  const x = solveAxis('x', [point.x], [point.y, point.y], sources, tolerance);
  const y = solveAxis('y', [point.y], [point.x, point.x], sources, tolerance);
  return { dx: x.delta, dy: y.delta, lines: [...x.lines, ...y.lines] };
}

/** Screen-pixel snapping distance of specs/03. */
export const SNAP_PIXELS = 4;
