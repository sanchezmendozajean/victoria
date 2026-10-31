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
  /** Margin the printer cannot print on, pt (0 for a PDF). */
  unprintable?: number;
}

/** How long each crop mark is, pt: 5 mm. */
export const MARK_LENGTH = mmToPt(5);
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
  /** How far the artwork with its bleed reaches outside the printable area, pt (0 = it fits). */
  clip: number;
  /** The crop marks reach outside the printable area. */
  marksOut: boolean;
  /** Room left inside the printable area around the trim (bleed and marks included), pt; <= 0 on both axes = the position has no effect. */
  slack: { x: number; y: number };
}

/** `auto` follows the shape of the artboard: wider than tall prints in landscape. */
export function resolveOrientation(artboard: Artboard, layout: PrintLayout): Orientation {
  if (layout.orientation !== 'auto') return layout.orientation;
  return artboard.w > artboard.h ? 'landscape' : 'portrait';
}

/** Where one artboard goes on the page for this layout (specs/08 · Imprimir). */
export function planPage(artboard: Artboard, layout: PrintLayout, orientation: Orientation): PagePlan {
  const page = orientation === 'landscape' ? { w: layout.paper.h, h: layout.paper.w } : { w: layout.paper.w, h: layout.paper.h };
  const region = artboardRegion(artboard, layout.includeBleed);
  const trim = artboardRegion(artboard, false);
  const m = layout.unprintable ?? 0;
  const bleed = Math.max(trim.minX - region.minX, trim.minY - region.minY, region.maxX - trim.maxX, region.maxY - trim.maxY);
  const marksReach = layout.marks ? layout.marks.offset + MARK_LENGTH : 0;
  const pad = Math.max(bleed, marksReach);
  const tw = trim.maxX - trim.minX;
  const th = trim.maxY - trim.minY;
  const availW = page.w - 2 * (m + pad);
  const availH = page.h - 2 * (m + pad);
  let scale = 1;
  if (layout.scale.mode === 'custom') scale = Math.max(0.01, layout.scale.percent / 100);
  else if (layout.scale.mode === 'fit') scale = Math.max(0.0001, Math.min(availW / tw, availH / th));
  const w = tw * scale;
  const h = th * scale;
  const trimOrigin = { x: m + pad + ((availW - w) * layout.anchor.col) / 2, y: m + pad + ((availH - h) * layout.anchor.row) / 2 };
  const origin = { x: trimOrigin.x - (trim.minX - region.minX) * scale, y: trimOrigin.y - (trim.minY - region.minY) * scale };
  const trimOnPage: Rect = { minX: trimOrigin.x, minY: trimOrigin.y, maxX: trimOrigin.x + w, maxY: trimOrigin.y + h };
  const bleedOnPage = bleed * scale;
  const clip = Math.max(0, m - (trimOnPage.minX - bleedOnPage), m - (trimOnPage.minY - bleedOnPage), trimOnPage.maxX + bleedOnPage - (page.w - m), trimOnPage.maxY + bleedOnPage - (page.h - m));
  const marksOut = layout.marks !== null && (trimOnPage.minX - marksReach < m - 0.01 || trimOnPage.minY - marksReach < m - 0.01 || trimOnPage.maxX + marksReach > page.w - m + 0.01 || trimOnPage.maxY + marksReach > page.h - m + 0.01);
  return { page, orientation, region, trim, scale, origin, trimOnPage, overflow: clip > 1e-6 || marksOut, clip, marksOut, slack: { x: availW - w, y: availH - h } };
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

export type RangeError = { kind: 'empty' } | { kind: 'token'; token: string } | { kind: 'bounds'; token: string; count: number };

/**
 * "1-3, 5" → [1, 2, 3, 5] (1-based, in the order written, no repeats). A backwards range ("3-1") is turned around.
 * Anything else comes back as the error the dialog shows under the field.
 */
export function parseArtboardRange(text: string, count: number): { pages: number[] } | { error: RangeError } {
  const picked: number[] = [];
  for (const raw of text.split(',')) {
    const token = raw.trim();
    if (token === '') continue;
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(token);
    if (!m) return { error: { kind: 'token', token } };
    let from = Number(m[1]);
    let to = m[2] === undefined ? from : Number(m[2]);
    if (from > to) [from, to] = [to, from];
    if (from < 1 || to > count) return { error: { kind: 'bounds', token, count } };
    for (let n = from; n <= to; n++) if (!picked.includes(n)) picked.push(n);
  }
  return picked.length > 0 ? { pages: picked } : { error: { kind: 'empty' } };
}
