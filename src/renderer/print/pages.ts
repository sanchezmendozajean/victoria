import {
  buildScene,
  exportTargets,
  mmToPt,
  PAPER_SIZES,
  pageScene,
  parseRange,
  planPage,
  resolveOrientation,
  writeSvg,
  type Document,
  type DocumentSession,
  type ExportScope,
  type ExportTarget,
  type ImageResource,
  type Orientation,
  type PagePlan,
  type PrintLayout,
  type PrintScale,
} from '../../core';
import { prepareAssets } from '../export/raster';

/** Everything the Print dialog asks (specs/08 · Imprimir). */
export interface PrintSettings {
  /** null = the default printer. */
  printer: string | null;
  copies: number;
  scope: ExportScope;
  /** "1-3, 5": which of the artboards of `scope` (empty = all). */
  range: string;
  paper: string;
  /** Portrait size in mm, for `paper === 'custom'`. */
  customMm: { w: number; h: number };
  orientation: 'auto' | Orientation;
  scale: 'none' | 'fit' | 'custom';
  percent: number;
  anchor: { col: 0 | 1 | 2; row: 0 | 1 | 2 };
  marks: boolean;
  markStyle: 'western' | 'japanese';
  /** pt */
  markWeight: number;
  /** mm */
  markOffsetMm: number;
  includeBleed: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  printer: null,
  copies: 1,
  scope: 'active-artboard',
  range: '',
  paper: 'a4',
  customMm: { w: 210, h: 297 },
  orientation: 'auto',
  scale: 'none',
  percent: 100,
  anchor: { col: 1, row: 1 },
  marks: false,
  markStyle: 'western',
  markWeight: 0.25,
  markOffsetMm: 3,
  includeBleed: false,
};

export function layoutOf(s: PrintSettings): PrintLayout {
  const preset = PAPER_SIZES.find((p) => p.id === s.paper);
  const paper = preset ? { w: preset.w, h: preset.h } : { w: mmToPt(Math.min(s.customMm.w, s.customMm.h)), h: mmToPt(Math.max(s.customMm.w, s.customMm.h)) };
  const scale: PrintScale = s.scale === 'custom' ? { mode: 'custom', percent: s.percent } : { mode: s.scale };
  return {
    paper,
    orientation: s.orientation,
    scale,
    anchor: s.anchor,
    marks: s.marks ? { style: s.markStyle, weight: s.markWeight, offset: mmToPt(s.markOffsetMm) } : null,
    includeBleed: s.includeBleed,
  };
}

export interface PlannedPage {
  target: ExportTarget;
  plan: PagePlan;
}

export interface PrintPlan {
  /** The artboards that will print, in order; null when the range is not valid. */
  pages: PlannedPage[] | null;
  /** Size of every page in pt (all pages of a job share the paper and the orientation of the first). */
  page: { w: number; h: number };
}

/** Which artboards print and where each goes on its page. */
export function planPrint(doc: Document, s: PrintSettings, activeArtboardId: string | null): PrintPlan {
  const layout = layoutOf(s);
  const all = exportTargets(doc, s.scope, activeArtboardId);
  const picked = parseRange(s.range, all.length);
  const first = all[0];
  const orientation = first ? resolveOrientation(first.artboard, layout) : 'portrait';
  const page = orientation === 'landscape' ? { w: layout.paper.h, h: layout.paper.w } : { w: layout.paper.w, h: layout.paper.h };
  if (!picked) return { pages: null, page };
  return { pages: picked.map((n) => all[n - 1] as ExportTarget).map((target) => ({ target, plan: planPage(target.artboard, layout, orientation) })), page };
}

/** One page as an SVG document at the real size of the paper. */
export async function renderPage(doc: Document, session: DocumentSession, s: PrintSettings, planned: PlannedPage): Promise<string> {
  const { target, plan } = planned;
  await prepareAssets(target.space, session.images);
  const content = buildScene(target.space, { resources: doc.resources, region: plan.region });
  const formats: Record<string, ImageResource['format']> = Object.fromEntries(Object.entries(doc.resources.images).map(([hash, r]) => [hash, r.format]));
  return writeSvg(pageScene(content, plan, layoutOf(s), target.artboard), session.images, { minify: true, imageFormats: formats }).svg;
}
