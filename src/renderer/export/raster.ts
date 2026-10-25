import { rasterSize, walkSpaceNodes, withJpegDpi, withPngDpi, type ImageStore, type Rect, type Resources, type Space } from '../../core';
import { loadBitmap } from '../canvas/imageCache';
import { renderContent } from '../canvas/contentRenderer';
import { readCanvasTheme } from '../canvas/theme';
import { fontManager } from '../text/fontManager';

/** Why a picture could not be made; the dialog turns it into a message. */
export class ExportError extends Error {
  constructor(readonly code: 'too-large' | 'encode') {
    super(code);
    this.name = 'ExportError';
  }
}

/**
 * Everything a drawing needs before it can be painted synchronously: the decoded pictures and the fonts of
 * the text (the canvas loads them lazily and repaints; an export cannot wait for that).
 */
export async function prepareAssets(space: Space, images: ImageStore): Promise<void> {
  const hashes = new Set<string>();
  const faces = new Map<string, { family: string; style: string }>();
  for (const node of walkSpaceNodes(space)) {
    if (node.type === 'image') hashes.add(node.resourceId);
    if (node.type === 'text') {
      for (const run of node.story) faces.set(`${run.style.fontFamily}|${run.style.fontStyle}`, { family: run.style.fontFamily, style: run.style.fontStyle });
    }
  }
  await Promise.all([...hashes].map((hash) => loadBitmap(images, hash)));
  await Promise.all([...faces.values()].map((f) => fontManager.ensure(f.family, f.style)));
}

export interface RasterRequest {
  space: Space;
  resources: Resources;
  images: ImageStore;
  /** What to draw, in Space coordinates. */
  region: Rect;
  ppi: number;
  /** A CSS colour, or null for a transparent picture (PNG only). */
  background: string | null;
  format: 'png' | 'jpg';
  /** 1–100, JPEG only. */
  quality: number;
}

const canvasToBytes = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new ExportError('encode'));
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      type,
      quality,
    );
  });

/** The region as a PNG or JPEG at `ppi`, painted with the same code as the canvas, with its resolution recorded in the file. */
export async function rasterize(request: RasterRequest): Promise<Uint8Array> {
  const size = rasterSize(request.region, request.ppi);
  if (!size) throw new ExportError('too-large');
  await prepareAssets(request.space, request.images);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('encode');
  const zoom = request.ppi / 72;
  renderContent(ctx, {
    space: request.space,
    resources: request.resources,
    view: { zoom, panX: -request.region.minX * zoom, panY: -request.region.minY * zoom },
    width: size.width,
    height: size.height,
    dpr: 1,
    outline: false,
    showArtboards: false,
    showGrid: false,
    activeArtboardId: null,
    theme: readCanvasTheme(),
    isolatedId: null,
    images: request.images,
    // A JPEG has no transparency: it always gets a background.
    ...(request.format === 'jpg' || request.background ? { background: request.background ?? '#ffffff' } : {}),
  });
  if (request.format === 'png') return withPngDpi(await canvasToBytes(canvas, 'image/png'), request.ppi);
  return withJpegDpi(await canvasToBytes(canvas, 'image/jpeg', Math.min(1, Math.max(0.01, request.quality / 100))), request.ppi);
}
