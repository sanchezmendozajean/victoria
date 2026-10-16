import paper from 'paper/dist/paper-core';
import type { Anchor, Vec2 } from '../model/types';
import type { SubPath } from './path';

// Boolean operations on filled shapes with paper.js running headless. Curves are kept as Béziers: paper splits
// them at the intersections instead of flattening them. Everything here is geometry in a common space; the
// commands (`commands/pathfinder.ts`) deal with objects, appearances and the document.

export type FillRule = 'nonzero' | 'evenodd';

export interface BooleanShape {
  subpaths: readonly SubPath[];
  fillRule: FillRule;
}

/** A piece of a result: contours plus the index of the input whose look it takes. */
export interface BooleanPiece {
  subpaths: SubPath[];
  fillRule: FillRule;
  source: number;
}

export type ShapeOp = 'unite' | 'minusFront' | 'intersect' | 'exclude' | 'minusBack';
export type SplitOp = 'divide' | 'trim' | 'merge' | 'crop' | 'outline';

let scope: paper.PaperScope | null = null;
function paperScope(): paper.PaperScope {
  if (!scope) {
    scope = new paper.PaperScope();
    scope.setup(new scope.Size(1, 1));
  }
  return scope;
}

type Item = paper.Path | paper.CompoundPath;
const NO_INSERT = { insert: false } as const;
const EPS_AREA = 1e-6;

function toPaper(shape: BooleanShape): Item | null {
  paperScope();
  const paths: paper.Path[] = [];
  for (const sub of shape.subpaths) {
    if (sub.anchors.length < 2) continue;
    const segments = sub.anchors.map((a) => new paper.Segment(new paper.Point(a.p.x, a.p.y), a.in ? new paper.Point(a.in.x - a.p.x, a.in.y - a.p.y) : undefined, a.out ? new paper.Point(a.out.x - a.p.x, a.out.y - a.p.y) : undefined));
    paths.push(new paper.Path({ segments, closed: true, ...NO_INSERT }));
  }
  if (paths.length === 0) return null;
  if (paths.length === 1) {
    const only = paths[0] as paper.Path;
    only.fillRule = shape.fillRule;
    return only;
  }
  return new paper.CompoundPath({ children: paths, fillRule: shape.fillRule, ...NO_INSERT });
}

/** Absolute area (the signed area of a compound path can cancel out between pieces of opposite winding). */
const areaOf = (item: paper.PathItem): number => (item instanceof paper.CompoundPath ? (item.children as paper.Path[]).reduce((n, c) => n + Math.abs(c.area), 0) : Math.abs((item as paper.Path).area));
const emptyItem = (item: paper.PathItem | null | undefined): boolean => !item || item.isEmpty() || areaOf(item) < EPS_AREA;

function anchorOf(s: paper.Segment): Anchor {
  const p = { x: s.point.x, y: s.point.y };
  const hin = s.handleIn;
  const hout = s.handleOut;
  const hasIn = hin.x !== 0 || hin.y !== 0;
  const hasOut = hout.x !== 0 || hout.y !== 0;
  let kind: Anchor['kind'] = 'corner';
  if (hasIn && hasOut) {
    const cross = hin.x * hout.y - hin.y * hout.x;
    const dot = hin.x * hout.x + hin.y * hout.y;
    if (Math.abs(cross) < 1e-6 * Math.hypot(hin.x, hin.y) * Math.hypot(hout.x, hout.y) && dot < 0) kind = 'smooth';
  }
  return { p, in: hasIn ? { x: p.x + hin.x, y: p.y + hin.y } : null, out: hasOut ? { x: p.x + hout.x, y: p.y + hout.y } : null, kind };
}

const subPathOf = (path: paper.Path): SubPath => ({ anchors: path.segments.map(anchorOf), closed: path.closed });

/** Splits an item into its separate pieces: each outer contour with the holes inside it. */
function piecesOf(item: paper.PathItem | null | undefined): Array<{ outer: paper.Path; holes: paper.Path[] }> {
  if (emptyItem(item)) return [];
  const paths: paper.Path[] = item instanceof paper.CompoundPath ? (item.children as paper.Path[]) : [item as paper.Path];
  const live = paths.filter((p) => p.segments.length > 1 && Math.abs(p.area) > EPS_AREA);
  const contains = (a: paper.Path, b: paper.Path) => a !== b && Math.abs(a.area) > Math.abs(b.area) && a.contains(b.interiorPoint);
  const depth = live.map((p) => live.filter((q) => contains(q, p)).length);
  const pieces: Array<{ outer: paper.Path; holes: paper.Path[] }> = [];
  live.forEach((p, i) => {
    if ((depth[i] as number) % 2 === 0) pieces.push({ outer: p, holes: [] });
  });
  live.forEach((p, i) => {
    if ((depth[i] as number) % 2 === 1) {
      // The hole belongs to the smallest outer contour that contains it.
      const owner = pieces.filter((piece) => contains(piece.outer, p)).sort((a, b) => Math.abs(a.outer.area) - Math.abs(b.outer.area))[0];
      owner?.holes.push(p);
    }
  });
  return pieces;
}

function pieceOutputs(item: paper.PathItem | null | undefined, source: number): BooleanPiece[] {
  return piecesOf(item).map(({ outer, holes }) => ({
    subpaths: [subPathOf(outer), ...holes.map(subPathOf)],
    fillRule: holes.length > 0 ? 'evenodd' : 'nonzero',
    source,
  }));
}

function booleanOf(a: paper.PathItem, b: paper.PathItem, kind: 'unite' | 'subtract' | 'intersect' | 'exclude'): paper.PathItem {
  return a[kind](b, NO_INSERT);
}

/** Unite / Minus Front / Intersect / Exclude / Minus Back of shapes given bottom to top. */
export function shapeOperation(op: ShapeOp, shapes: readonly BooleanShape[]): BooleanPiece[] {
  paperScope();
  const items = shapes.map(toPaper);
  const present = items.map((it, i) => ({ it, i })).filter((x): x is { it: Item; i: number } => x.it !== null);
  if (present.length === 0) return [];
  const last = present[present.length - 1] as { it: Item; i: number };
  const first = present[0] as { it: Item; i: number };
  try {
    switch (op) {
      case 'unite': return pieceOutputs(present.slice(1).reduce<paper.PathItem>((acc, x) => booleanOf(acc, x.it, 'unite'), first.it), last.i);
      case 'intersect': return pieceOutputs(present.slice(1).reduce<paper.PathItem>((acc, x) => booleanOf(acc, x.it, 'intersect'), first.it), last.i);
      case 'exclude': return pieceOutputs(present.slice(1).reduce<paper.PathItem>((acc, x) => booleanOf(acc, x.it, 'exclude'), first.it), last.i);
      case 'minusFront': return pieceOutputs(present.slice(1).reduce<paper.PathItem>((acc, x) => booleanOf(acc, x.it, 'subtract'), first.it), first.i);
      case 'minusBack': return pieceOutputs(subtractAll(last.it, present.slice(0, -1).map((x) => x.it)), last.i);
    }
  } finally {
    paperScope().project.clear();
  }
}

function subtractAll(base: paper.PathItem, cutters: readonly paper.PathItem[]): paper.PathItem {
  return cutters.reduce<paper.PathItem>((acc, c) => booleanOf(acc, c, 'subtract'), base);
}

/** One face of the planar subdivision made by overlapping shapes. */
export interface Face extends BooleanPiece {
  /** Indices of all the inputs that cover the face. */
  covers: number[];
}

/**
 * Splits shapes (bottom to top) into the disjoint regions they form (their planar arrangement): every region
 * remembers which shapes cover it, and takes the look of the topmost one (`source`). Curves stay Béziers.
 */
export function divideShapes(shapes: readonly BooleanShape[]): Face[] {
  paperScope();
  try {
    let faces: Array<{ item: paper.PathItem; covers: number[] }> = [];
    shapes.forEach((shape, i) => {
      const item = toPaper(shape);
      if (!item) return;
      const next: Array<{ item: paper.PathItem; covers: number[] }> = [];
      let rest: paper.PathItem = item;
      for (const face of faces) {
        const inside = booleanOf(face.item, item, 'intersect');
        const outside = booleanOf(face.item, item, 'subtract');
        if (!emptyItem(inside)) next.push({ item: inside, covers: [...face.covers, i] });
        if (!emptyItem(outside)) next.push({ item: outside, covers: face.covers });
        rest = booleanOf(rest, face.item, 'subtract');
      }
      if (!emptyItem(rest)) next.push({ item: rest, covers: [i] });
      faces = next;
    });
    const out: Face[] = [];
    for (const face of faces) {
      const source = Math.max(...face.covers);
      for (const piece of pieceOutputs(face.item, source)) out.push({ ...piece, covers: face.covers });
    }
    return out;
  } finally {
    paperScope().project.clear();
  }
}

/** Trim: every shape minus everything in front of it. Crop: everything cut to the frontmost shape (which disappears). */
export function trimShapes(shapes: readonly BooleanShape[], mode: 'trim' | 'crop'): BooleanPiece[] {
  paperScope();
  const items = shapes.map(toPaper);
  const out: BooleanPiece[] = [];
  try {
    if (mode === 'crop') {
      const mask = items[items.length - 1];
      if (!mask) return [];
      items.slice(0, -1).forEach((it, i) => {
        if (it) out.push(...pieceOutputs(booleanOf(it, mask, 'intersect'), i));
      });
      return out;
    }
    items.forEach((it, i) => {
      if (!it) return;
      const front = items.slice(i + 1).filter((x): x is Item => x !== null);
      out.push(...pieceOutputs(subtractAll(it, front), i));
    });
    return out;
  } finally {
    paperScope().project.clear();
  }
}

/** Unites pieces that touch or overlap and are the same kind (`group`): Merge after Trim. */
export function mergePieces(pieces: readonly BooleanPiece[], group: (piece: BooleanPiece) => string): BooleanPiece[] {
  paperScope();
  try {
    const buckets = new Map<string, BooleanPiece[]>();
    for (const piece of pieces) {
      const key = group(piece);
      buckets.set(key, [...(buckets.get(key) ?? []), piece]);
    }
    const out: BooleanPiece[] = [];
    for (const list of buckets.values()) {
      const merged: Array<{ item: paper.PathItem; source: number }> = [];
      for (const piece of list) {
        let item: paper.PathItem | null = toPaper(piece);
        if (!item) continue;
        let source = piece.source;
        // Absorb every already-merged piece that touches this one (the union is a single piece when they do).
        for (let i = merged.length - 1; i >= 0; i--) {
          const other = merged[i] as { item: paper.PathItem; source: number };
          if (!item.bounds.intersects(other.item.bounds)) continue;
          const joined = booleanOf(item, other.item, 'unite');
          if (piecesOf(joined).length === 1) {
            item = joined;
            source = Math.max(source, other.source);
            merged.splice(i, 1);
          }
        }
        merged.push({ item, source });
      }
      for (const m of merged) out.push(...pieceOutputs(m.item, m.source));
    }
    return out;
  } finally {
    paperScope().project.clear();
  }
}

/** Whether a point is inside a piece (even-odd over its contours when it has holes). */
export function pieceContains(piece: BooleanPiece, p: Vec2): boolean {
  paperScope();
  try {
    const item = toPaper(piece);
    return !!item && item.contains(new paper.Point(p.x, p.y));
  } finally {
    paperScope().project.clear();
  }
}

/** Union of pieces as one piece list (Shape Builder drag across regions). */
export function unitePieces(pieces: readonly BooleanPiece[]): BooleanPiece[] {
  return shapeOperation('unite', pieces.map((p) => ({ subpaths: p.subpaths, fillRule: p.fillRule }))).map((r) => ({ ...r, source: pieces[0]?.source ?? 0 }));
}
