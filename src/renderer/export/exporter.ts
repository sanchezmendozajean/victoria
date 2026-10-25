import {
  artboardRegion,
  buildScene,
  colorToRgb,
  exportTargets,
  FORMAT_EXTENSION,
  planFiles,
  safeFileName,
  writePdf,
  writeSvg,
  type Artboard,
  type Document,
  type DocumentSession,
  type ExportFormat,
  type ExportScope,
  type ExportTarget,
  type ExportWarning,
  type ImageResource,
  type RGB,
} from '../../core';
import type { ExportFile } from '../../shared/ipc';
import { prepareAssets, rasterize } from './raster';

export type BackgroundChoice = 'transparent' | 'white' | 'artboard';

/** One kind of file to produce for every target: format, resolution (pictures) and name suffix ("@2x"). */
export interface OutputSpec {
  format: ExportFormat;
  ppi: number;
  suffix: string;
}

export interface ExportOptions {
  background: BackgroundChoice;
  includeBleed: boolean;
  /** 1–100. */
  jpgQuality: number;
  minifySvg: boolean;
  /** PDF: one file with a page per artboard (otherwise one file per artboard). */
  pdfSinglePdf: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { background: 'transparent', includeBleed: false, jpgQuality: 90, minifySvg: false, pdfSinglePdf: true };

export interface ExportJob {
  document: Document;
  session: DocumentSession;
  documentName: string;
  targets: readonly ExportTarget[];
  outputs: readonly OutputSpec[];
  options: ExportOptions;
  /** Called after each file with how many are done and how many there are. */
  onProgress?: (done: number, total: number) => void;
}

/** What the user is told afterwards. */
export interface ExportReport {
  files: ExportFile[];
  warnings: ExportWarning[];
}

const WHITE: RGB = [255, 255, 255];

function backgroundOf(choice: BackgroundChoice, artboard: Artboard, format: ExportFormat): 'transparent' | RGB {
  if (format === 'jpg') return choice === 'artboard' && artboard.background !== 'transparent' ? colorToRgb(artboard.background) : WHITE;
  if (choice === 'white') return WHITE;
  if (choice === 'artboard' && artboard.background !== 'transparent') return colorToRgb(artboard.background);
  return 'transparent';
}

const cssOf = (bg: 'transparent' | RGB): string | null => (bg === 'transparent' ? null : `rgb(${bg.map(Math.round).join(',')})`);

const imageFormats = (doc: Document): Record<string, ImageResource['format']> => Object.fromEntries(Object.entries(doc.resources.images).map(([hash, r]) => [hash, r.format]));

/** How many files the job will produce (for the progress and for deciding between a save dialog and a folder). */
export function countFiles(targets: readonly ExportTarget[], outputs: readonly OutputSpec[], options: ExportOptions): number {
  return outputs.reduce((n, o) => n + (o.format === 'pdf' && options.pdfSinglePdf ? (targets.length > 0 ? 1 : 0) : targets.length), 0);
}

/** Makes every file of the job in memory. Throws `ExportError` when a picture would be too large. */
export async function generateExport(job: ExportJob): Promise<ExportReport> {
  const { document, session, targets, outputs, options } = job;
  const files: ExportFile[] = [];
  const warnings: ExportWarning[] = [];
  const total = countFiles(targets, outputs, options);
  let done = 0;
  const finished = (file: ExportFile) => {
    files.push(file);
    job.onProgress?.(++done, total);
  };
  const withSpaceName = new Set(targets.map((t) => t.space.id)).size > 1;
  const formats = imageFormats(document);
  const sceneOf = (target: ExportTarget, format: ExportFormat) =>
    buildScene(target.space, { resources: document.resources, region: artboardRegion(target.artboard, options.includeBleed), background: backgroundOf(options.background, target.artboard, format) });

  for (const output of outputs) {
    if (output.format === 'pdf' && options.pdfSinglePdf) {
      if (targets.length === 0) continue;
      const spaces = new Map(targets.map((t) => [t.space.id, t.space]));
      for (const space of spaces.values()) await prepareAssets(space, session.images);
      const result = await writePdf(targets.map((t) => sceneOf(t, 'pdf')), session.images, { imageFormats: formats });
      warnings.push(...result.warnings);
      finished({ name: `${safeFileName(job.documentName)}${output.suffix}.pdf`, bytes: result.bytes });
      continue;
    }
    for (const planned of planFiles({ documentName: job.documentName, targets, format: output.format, suffix: output.suffix, withSpaceName })) {
      const { space, artboard } = planned.target;
      let bytes: Uint8Array;
      if (output.format === 'png' || output.format === 'jpg') {
        const bg = backgroundOf(options.background, artboard, output.format);
        bytes = await rasterize({
          space,
          resources: document.resources,
          images: session.images,
          region: artboardRegion(artboard, options.includeBleed),
          ppi: output.ppi,
          background: cssOf(bg),
          format: output.format,
          quality: options.jpgQuality,
        });
      } else {
        await prepareAssets(space, session.images);
        const scene = sceneOf(planned.target, output.format);
        if (output.format === 'svg') {
          const result = writeSvg(scene, session.images, { minify: options.minifySvg, imageFormats: formats });
          warnings.push(...result.warnings);
          bytes = new TextEncoder().encode(result.svg);
        } else {
          const result = await writePdf([scene], session.images, { imageFormats: formats });
          warnings.push(...result.warnings);
          bytes = result.bytes;
        }
      }
      finished({ name: planned.name, bytes });
    }
    // Let the interface breathe between formats: a big export would otherwise freeze the dialog.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const unique = new Map<string, ExportWarning>();
  for (const w of warnings) unique.set(`${w.code}:${w.detail ?? ''}`, w);
  return { files, warnings: [...unique.values()] };
}

/** The artboards an "Exportar como…" run covers. */
export const targetsFor = (document: Document, scope: ExportScope, activeArtboardId: string | null): ExportTarget[] => exportTargets(document, scope, activeArtboardId);

export const extensionOf = (format: ExportFormat): string => FORMAT_EXTENSION[format];
