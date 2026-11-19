import { artboardRegion } from '../../export/plan';
import { buildScene } from '../../export/scene';
import { writeSvg, type ExportWarning } from '../../export/svg';
import { getActiveSpace } from '../../model/queries';
import type { Document, ImageResource } from '../../model/types';
import type { ImageStore } from '../imageStore';
import type { SvgImport } from './svg';

// Editing an SVG in its own file (specs/02 · Modo SVG).

/**
 * An SVG opens in SVG mode only when the import left nothing out: every warning means something the model cannot hold,
 * and saving over the file would delete it. Otherwise it opens as a copy (a new document) and the file is not touched.
 */
export const canEditSvgInPlace = (result: Pick<SvgImport, 'warnings'>): boolean => result.warnings.length === 0;

/** The document as the SVG that replaces its file: the first artboard, structure kept, text as text where it can be. */
export function writeDocumentSvg(document: Document, images: ImageStore, options: { minify?: boolean } = {}): { svg: string; warnings: ExportWarning[] } {
  const space = getActiveSpace(document);
  const board = space.artboards[0];
  if (!board) throw new Error('The document has no artboard');
  const scene = buildScene(space, { resources: document.resources, region: artboardRegion(board, false), liveText: true });
  const formats: Record<string, ImageResource['format']> = Object.fromEntries(Object.entries(document.resources.images).map(([hash, r]) => [hash, r.format]));
  return writeSvg(scene, images, { ...options, structure: 'semantic', imageFormats: formats });
}
