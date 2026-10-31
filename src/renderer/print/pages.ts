import {
  buildScene,
  exportTargets,
  LOW_PPI,
  lowResolutionPpi,
  mmToPt,
  PAPER_SIZES,
  pageScene,
  parseArtboardRange,
  planPage,
  resolveOrientation,
  writeSvg,
  type Artboard,
  type Document,
  type DocumentSession,
  type ExportTarget,
  type ImageResource,
  type Orientation,
  type PagePlan,
  type PrintLayout,
  type PrintScale,
  type RangeError,
} from '../../core';
import { prepareAssets } from '../export/raster';

/** Everything the Print dialog asks (specs/08 · Imprimir). */
export interface PrintSettings {
  /** Printer name, `PDF_DESTINATION` for "Guardar como PDF", null = the default printer. */
  destination: string | null;
  copies: number;
  collate: boolean;
  color: 'color' | 'gray';
  scope: 'active' | 'all' | 'range';
  /** "1-3, 5": which artboards of the document, for `scope === 'range'`. */
  range: string;
  paper: string;
  orientation: 'auto' | Orientation;
  scale: 'none' | 'fit' | 'custom';
  percent: number;
  anchor: { col: 0 | 1 | 2; row: 0 | 1 | 2 };
  marks: boolean;
  includeBleed: boolean;
  /** mm */
  bleedMm: number;
}

/** The destination that writes a PDF instead of using a printer. */
export const PDF_DESTINATION = '__pdf__';

/** Default bleed when the document has none: 3 mm. */
export const DEFAULT_BLEED_MM = 3;

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  destination: null,
  copies: 1,
  collate: true,
  color: 'color',
  scope: 'active',
  range: '',
  paper: 'a4',
  orientation: 'auto',
  scale: 'none',
  percent: 100,
  anchor: { col: 1, row: 1 },
  marks: false,
  includeBleed: false,
  bleedMm: DEFAULT_BLEED_MM,
};

/** What is kept per document between openings of the dialog: not the copies, the collating nor the range. */
export type RememberedPrint = Omit<PrintSettings, 'copies' | 'collate' | 'range' | 'scope'>;

export function rememberable(s: PrintSettings): RememberedPrint {
  return { destination: s.destination, color: s.color, paper: s.paper, orientation: s.orientation, scale: s.scale, percent: s.percent, anchor: s.anchor, marks: s.marks, includeBleed: s.includeBleed, bleedMm: s.bleedMm };
}

/**
 * The margin a printer cannot print on, mm. Electron gives no way to ask the driver, so it is 0: the sheet is
 * treated as fully printable (a PDF really is). The page maths and the warnings already handle a margin.
 */
export const UNPRINTABLE_MM = 0;

export function layoutOf(s: PrintSettings): PrintLayout {
  const preset = PAPER_SIZES.find((p) => p.id === s.paper) ?? PAPER_SIZES.find((p) => p.id === 'a4')!;
  const scale: PrintScale = s.scale === 'custom' ? { mode: 'custom', percent: s.percent } : { mode: s.scale };
  return {
    paper: { w: preset.w, h: preset.h },
    orientation: s.orientation,
    scale,
    anchor: s.anchor,
    // Marks start 3 mm outside the bleed (or the trim, with no bleed) and are 5 mm long.
    marks: s.marks ? { style: 'western', weight: 0.25, offset: mmToPt((s.includeBleed ? s.bleedMm : 0) + 3) } : null,
    includeBleed: s.includeBleed,
    unprintable: mmToPt(UNPRINTABLE_MM),
  };
}

export interface PlannedPage {
  target: ExportTarget;
  /** 1-based position of the artboard among all those of the document. */
  number: number;
  plan: PagePlan;
}

export interface PrintPlan {
  /** Artboards of the document that can be printed. */
  total: number;
  /** The artboards that will print, in order (empty when the range is not valid). */
  pages: PlannedPage[];
  error: RangeError | null;
}

/** The artboard as printed: with the bleed the dialog asks for instead of its own. */
function printed(artboard: Artboard, s: PrintSettings): Artboard {
  if (!s.includeBleed) return artboard;
  const b = mmToPt(s.bleedMm);
  return { ...artboard, bleed: { top: b, right: b, bottom: b, left: b } };
}

/** Which artboards print and where each goes on its page (each with the orientation that suits it). */
export function planPrint(doc: Document, s: PrintSettings, activeArtboardId: string | null): PrintPlan {
  const layout = layoutOf(s);
  const all = exportTargets(doc, 'all-spaces');
  const numberOf = (t: ExportTarget) => all.findIndex((a) => a.artboard.id === t.artboard.id) + 1;
  let chosen: ExportTarget[];
  let error: RangeError | null = null;
  if (s.scope === 'active') chosen = exportTargets(doc, 'active-artboard', activeArtboardId);
  else if (s.scope === 'all') chosen = all;
  else {
    const parsed = parseArtboardRange(s.range, all.length);
    if ('error' in parsed) {
      chosen = [];
      error = parsed.error;
    } else chosen = parsed.pages.map((n) => all[n - 1] as ExportTarget);
  }
  const pages = chosen.map((t) => {
    const target: ExportTarget = { ...t, artboard: printed(t.artboard, s) };
    return { target, number: Math.max(1, numberOf(t)), plan: planPage(target.artboard, layout, resolveOrientation(target.artboard, layout)) };
  });
  return { total: all.length, pages, error };
}

export type PrintWarning =
  | { kind: 'range'; error: RangeError }
  | { kind: 'resolution'; count: number; ppi: number; image: { spaceId: string; nodeId: string } }
  | { kind: 'clip'; count: number; name: string; mm: number }
  | { kind: 'marks' };

/** Everything worth telling before the job goes out, for the pages as they are laid out now. */
export function printWarnings(doc: Document, plan: PrintPlan, hasBytes: (hash: string) => boolean): PrintWarning[] {
  const warnings: PrintWarning[] = [];
  if (plan.error) warnings.push({ kind: 'range', error: plan.error });

  const images = new Map<string, { ppi: number; spaceId: string; nodeId: string }>();
  for (const page of plan.pages) {
    for (const { node, ppi } of lowResolutionPpi(doc, page.target.space.id, page.plan.region, page.plan.scale, hasBytes)) {
      const known = images.get(node.id);
      if (!known || ppi < known.ppi) images.set(node.id, { ppi, spaceId: page.target.space.id, nodeId: node.id });
    }
  }
  if (images.size > 0) {
    const worst = [...images.values()].reduce((a, b) => (b.ppi < a.ppi ? b : a));
    warnings.push({ kind: 'resolution', count: images.size, ppi: worst.ppi, image: { spaceId: worst.spaceId, nodeId: worst.nodeId } });
  }

  const clipped = plan.pages.filter((p) => p.plan.clip > mmToPt(0.05));
  if (clipped.length > 0) {
    warnings.push({ kind: 'clip', count: clipped.length, name: clipped[0]!.target.artboard.name, mm: Math.max(...clipped.map((p) => p.plan.clip)) / mmToPt(1) });
  } else if (plan.pages.some((p) => p.plan.marksOut)) {
    warnings.push({ kind: 'marks' });
  }
  return warnings;
}

export { LOW_PPI };

/** One page as an SVG document at the real size of the paper. The preview leaves the crop marks to the dialog, which draws them at a visible weight. */
export async function renderPage(doc: Document, session: DocumentSession, s: PrintSettings, planned: PlannedPage, options: { marks?: boolean } = {}): Promise<string> {
  const { target, plan } = planned;
  await prepareAssets(target.space, session.images);
  const content = buildScene(target.space, { resources: doc.resources, region: plan.region });
  const formats: Record<string, ImageResource['format']> = Object.fromEntries(Object.entries(doc.resources.images).map(([hash, r]) => [hash, r.format]));
  const layout = layoutOf(s);
  return writeSvg(pageScene(content, plan, options.marks === false ? { ...layout, marks: null } : layout, target.artboard), session.images, { minify: true, imageFormats: formats }).svg;
}
