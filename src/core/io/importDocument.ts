import type { ClipPayload } from '../clipboard/clip';
import { createArtboard, createDocument, createGroup, createLayer, createSpace } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import type { Document, Gradient, ImageResource, Node } from '../model/types';
import { ImageStore } from './imageStore';

/** One imported drawing: an SVG file, or a page of a PDF. */
export interface ImportedDrawing {
  /** Size in pt: the artboard. */
  width: number;
  height: number;
  nodes: Node[];
  gradients: Gradient[];
  images: Record<string, { resource: ImageResource; bytes: Uint8Array }>;
}

export interface ImportNames {
  /** Name of the new document. */
  name: string;
  space(n: number): string;
  artboard(n: number): string;
  layer(n: number): string;
}

/**
 * A new document from imported drawings: each one becomes a Space with one artboard of its size and one layer
 * holding the objects (specs/02 · «cada página → un Espacio con una mesa del tamaño de la página»).
 */
export function documentFromDrawings(drawings: readonly ImportedDrawing[], names: ImportNames, ids: IdGenerator, now: string): { document: Document; images: ImageStore } {
  const document = createDocument({ name: names.name, spaceName: names.space(1), artboardName: names.artboard(1), layerName: names.layer(1), ids, now });
  const images = new ImageStore();
  drawings.forEach((drawing, index) => {
    let space = document.spaces[0];
    if (index > 0) {
      space = createSpace(ids, { name: names.space(index + 1), order: index, artboards: [createArtboard(ids, { name: names.artboard(1), w: drawing.width, h: drawing.height })], layers: [createLayer(ids, names.layer(1))] });
      document.spaces.push(space);
    }
    const board = space?.artboards[0];
    const layer = space?.layers[0];
    if (!space || !board || !layer) throw new Error('Invalid new document');
    board.w = drawing.width;
    board.h = drawing.height;
    delete board.preset;
    layer.children = drawing.nodes as typeof layer.children;
    document.resources.gradients.push(...drawing.gradients);
    for (const [hash, image] of Object.entries(drawing.images)) {
      document.resources.images[hash] = image.resource;
      images.set(hash, image.bytes);
    }
  });
  return { document, images };
}

/**
 * The drawing as something to paste (Archivo › Colocar): one group of its objects, framed by its own size so that
 * the whole drawing, not just what is painted in it, is centred. The caller adds the image files to the document.
 */
export function drawingPayload(drawing: ImportedDrawing, name: string, ids: IdGenerator): ClipPayload {
  const group = createGroup(ids, drawing.nodes as never);
  group.name = name;
  group.appearance = { items: [] };
  return {
    format: 'victoria-clip',
    version: 1,
    nodes: [group],
    swatches: [],
    gradients: drawing.gradients,
    images: Object.fromEntries(Object.entries(drawing.images).map(([hash, image]) => [hash, image.resource])),
    bounds: { minX: 0, minY: 0, maxX: drawing.width, maxY: drawing.height },
    artboard: null,
  };
}
