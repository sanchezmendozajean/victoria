import type { Rect } from '../geometry/rect';
import type { Artboard } from '../model/types';
import type { ExportTarget } from '../model/exportScope';

export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf';

export const FORMAT_EXTENSION: Record<ExportFormat, string> = { png: 'png', jpg: 'jpg', svg: 'svg', pdf: 'pdf' };

/** What an export of one artboard draws: the artboard, plus its bleed when asked. */
export function artboardRegion(artboard: Artboard, includeBleed: boolean): Rect {
  const b = includeBleed ? artboard.bleed : { top: 0, right: 0, bottom: 0, left: 0 };
  return { minX: artboard.x - b.left, minY: artboard.y - b.top, maxX: artboard.x + artboard.w + b.right, maxY: artboard.y + artboard.h + b.bottom };
}

/** Largest picture a canvas can hold (Chromium: 16384 px a side, 268 million pixels). */
export const MAX_RASTER_SIDE = 16384;
export const MAX_RASTER_AREA = 268_435_456;

export interface RasterSize {
  width: number;
  height: number;
}

/** Pixel size of a region at `ppi` (72 ppi = 1 pixel per point), or null when the picture would be too large or empty. */
export function rasterSize(region: Rect, ppi: number): RasterSize | null {
  const scale = ppi / 72;
  const width = Math.round((region.maxX - region.minX) * scale);
  const height = Math.round((region.maxY - region.minY) * scale);
  if (!(width >= 1) || !(height >= 1) || width > MAX_RASTER_SIDE || height > MAX_RASTER_SIDE || width * height > MAX_RASTER_AREA) return null;
  return { width, height };
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A name that is valid on Windows and Linux: no separators or reserved characters, no trailing dots or spaces. */
export function safeFileName(name: string, fallback = 'Sin título'): string {
  // eslint-disable-next-line no-control-regex
  let clean = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (RESERVED.test(clean)) clean = `_${clean}`;
  return clean.length > 0 ? clean.slice(0, 120) : fallback;
}

export interface PlannedFile {
  name: string;
  target: ExportTarget;
}

export interface PlanInput {
  documentName: string;
  targets: readonly ExportTarget[];
  format: ExportFormat;
  /** Appended to the name before the extension, e.g. "@2x". */
  suffix?: string;
  /** True when the targets come from several Spaces: the Space name joins the file name. */
  withSpaceName?: boolean;
}

/**
 * One file name per target: `Documento-Mesa 1.png`, with the Space name when there are several Spaces.
 * Names are made safe, and repeated ones get `-2`, `-3`… (case-insensitively: Windows is not case-sensitive).
 */
export function planFiles(input: PlanInput): PlannedFile[] {
  const ext = FORMAT_EXTENSION[input.format];
  const used = new Set<string>();
  return input.targets.map((target) => {
    const parts = [input.documentName, ...(input.withSpaceName ? [target.space.name] : []), target.artboard.name].map((p) => safeFileName(p, '')).filter((p) => p.length > 0);
    const base = `${parts.join('-') || 'Sin título'}${input.suffix ?? ''}`;
    let name = `${base}.${ext}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base}-${i}.${ext}`;
    used.add(name.toLowerCase());
    return { name, target };
  });
}
