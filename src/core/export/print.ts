import type { Rect } from '../geometry/rect';
import type { Artboard, Matrix, Vec2 } from '../model/types';
import { artboardRegion } from './plan';
import { pathOfPolygons, type Scene, type SceneOp } from './scene';

// Print layout (specs/08 · Imprimir): where an artboard goes on the paper, at what scale, with which marks.
// Pure geometry: the dialog previews it and the printer receives exactly the same page.

const MM = 72 / 25.4;
export const mmToPt = (mm: number): number => mm * MM;

export interface PaperSize {
  id: string;
  /** Portrait size in pt. */
  w: number;
  h: number;
}

export const PAPER_SIZES: readonly PaperSize[] = [
  { id: 'a5', w: 419.53, h: 595.28 },
  { id: 'a4', w: 595.28, h: 841.89 },
  { id: 'a3', w: 841.89, h: 1190.55 },
  { id: 'letter', w: 612, h: 792 },
  { id: 'legal', w: 612, h: 1008 },
  { id: 'tabloid', w: 792, h: 1224 },
];

export type PrintScale = { mode: 'none' } | { mode: 'fit' } | { mode: 'custom'; percent: number };
export type Orientation = 'portrait' | 'landscape';

export interface PrintMarks {
  /** Western: one line per edge at the trim. Japanese: also a line at the bleed. */
  style: 'western' | 'japanese';
  /** pt */
  weight: number;
  /** Gap between the trim corner and where a mark starts, pt. */
  offset: number;
}

export interface PrintLayout {
  /** Portrait size in pt (swapped by the orientation). */
  paper: { w: number; h: number };
  orientation: 'auto' | Orientation;
  scale: PrintScale;
  /** Where the artboard sits on the page, as a cell of a 3 × 3 grid (0 = left / top, 2 = right / bottom). */
  anchor: { col: 0 | 1 | 2; row: 0 | 1 | 2 };
  marks: PrintMarks | null;
  includeBleed: boolean;
}

/** How long each crop mark is, pt. */
export const MARK_LENGTH = 18;
/** Distance of the bleed line of Japanese marks when the artboard has no bleed of its own: 3 mm. */
export const DEFAULT_BLEED = mmToPt(3);

export interface PagePlan {
  page: { w: number; h: number };
  orientation: Orientation;
  /** What is printed, in Space coordinates (the trim, plus its bleed if asked). */
  region: Rect;
  trim: Rect;
  scale: number;
  /** Where the region's top-left corner lands on the page, pt. */
  origin: Vec2;
  /** The trim box on the page, pt. */
  trimOnPage: Rect;
  /** The artwork (plus its marks) does not fit on the page: the part outside is not printed. */
  overflow: boolean;
}

/** `auto` follows the shape of the artboard: wider than tall prints in landscape. */
export function resolveOrientation(artboard: Artboard, layout: PrintLayout): Orientation {
  if (layout.orientation !== 'auto') return layout.orientation;
  return artboard.w > artboard.h ? 'landscape' : 'portrait';
}

/** Where one artboard goes on the page for this layout. */
export function planPage(artboard: Artboard, layout: PrintLayout, orientation: Orientation): PagePlan {
  const page = orientation === 'landscape' ? { w: layout.paper.h, h: layout.paper.w } : { w: layout.paper.w, h: layout.paper.h };
  const region = artboardRegion(artboard, layout.includeBleed);
  const trim = artboardRegion(artboard, false);
  const rw = region.maxX - region.minX;
  const rh = region.maxY - region.minY;
  const margin = layout.marks ? layout.marks.offset + MARK_LENGTH : 0;
  const availW = page.w - 2 * margin;
  const availH = page.h - 2 * margin;
  let scale = 1;
  if (layout.scale.mode === 'custom') scale = Math.max(0.01, layout.scale.percent / 100);
  else if (layout.scale.mode === 'fit') scale = Math.max(0.0001, Math.min(availW / rw, availH / rh));
  const w = rw * scale;
  const h = rh * scale;
  const origin = { x: margin + ((availW - w) * layout.anchor.col) / 2, y: margin + ((availH - h) * layout.anchor.row) / 2 };
  const trimOnPage: Rect = {
    minX: origin.x + (trim.minX - region.minX) * scale,
    minY: origin.y + (trim.minY - region.minY) * scale,
    maxX: origin.x + (trim.maxX - region.minX) * scale,
    maxY: origin.y + (trim.maxY - region.minY) * scale,
  };
  return { page, orientation, region, trim, scale, origin, trimOnPage, overflow: w > availW + 1e-6 || h > availH + 1e-6 };
}

/** The crop marks as line segments in page coordinates (pt). */
export function markLines(plan: PagePlan, marks: PrintMarks, artboard: Artboard): Vec2[][] {
  const t = plan.trimOnPage;
  const o = marks.offset;
  const bleed = Math.max(artboard.bleed.top, artboard.bleed.right, artboard.bleed.bottom, artboard.bleed.left);
  const b = (bleed > 0 ? bleed : DEFAULT_BLEED) * plan.scale;
  const lines: Vec2[][] = [];
  for (const [cx, sx] of [[t.minX, -1], [t.maxX, 1]] as const) {
    for (const [cy, sy] of [[t.minY, -1], [t.maxY, 1]] as const) {
      // Away from the corner along x (a horizontal mark) and along y (a vertical one), starting `offset` from the trim.
      const ys = marks.style === 'japanese' ? [cy, cy + sy * b] : [cy];
      const xs = marks.style === 'japanese' ? [cx, cx + sx * b] : [cx];
      for (const y of ys) lines.push([{ x: cx + sx * o, y }, { x: cx + sx * (o + MARK_LENGTH), y }]);
      for (const x of xs) lines.push([{ x, y: cy + sy * o }, { x, y: cy + sy * (o + MARK_LENGTH) }]);
    }
  }
  return lines;
}

/**
 * One printed page as a scene: the artwork placed and clipped to its region, then the marks in black.
 * `content` is the artwork of `plan.region` (what `buildScene` makes for it). The page background is white.
 */
export function pageScene(content: Scene, plan: PagePlan, layout: PrintLayout, artboard: Artboard): Scene {
  const rw = plan.region.maxX - plan.region.minX;
  const rh = plan.region.maxY - plan.region.minY;
  const placed: Matrix = [plan.scale, 0, 0, plan.scale, plan.origin.x, plan.origin.y];
  const corners: Vec2[] = [{ x: 0, y: 0 }, { x: rw, y: 0 }, { x: rw, y: rh }, { x: 0, y: rh }];
  const ops: SceneOp[] = [{ kind: 'group', matrix: placed, opacity: 1, blend: 'normal', clip: { path: pathOfPolygons([corners], true, 'nonzero'), matrix: [1, 0, 0, 1, 0, 0] }, effect: null, children: content.ops }];
  if (layout.marks) {
    ops.push({
      kind: 'stroke',
      path: pathOfPolygons(markLines(plan, layout.marks, artboard), false, 'nonzero'),
      paint: { kind: 'solid', rgb: [0, 0, 0], alpha: 1 },
      opacity: 1,
      width: layout.marks.weight,
      cap: 'butt',
      join: 'miter',
      miterLimit: 10,
      dash: null,
      align: 'center',
    });
  }
  return { width: plan.page.w, height: plan.page.h, background: [255, 255, 255], ops };
}

/**
 * "1-3, 5, 8-" → [1, 2, 3, 5, 8, …] (1-based, ascending, no repeats, clipped to `count`). Empty text means all.
 * Null when the text is not a range.
 */
export function parseRange(text: string, count: number): number[] | null {
  const clean = text.trim();
  if (clean === '') return Array.from({ length: count }, (_, i) => i + 1);
  const picked = new Set<number>();
  for (const part of clean.split(',')) {
    const m = /^\s*(\d*)\s*(-)?\s*(\d*)\s*$/.exec(part);
    // Digits after the number need a dash between them: '1 2' is not a range.
    if (!m || (m[1] === '' && m[3] === '') || (!m[2] && m[3] !== '')) return null;
    const from = m[1] === '' ? 1 : Number(m[1]);
    const to = m[2] ? (m[3] === '' ? count : Number(m[3])) : from;
    if (from < 1 || to < from) return null;
    for (let n = from; n <= Math.min(to, count); n++) picked.add(n);
  }
  return [...picked].sort((a, b) => a - b);
}
