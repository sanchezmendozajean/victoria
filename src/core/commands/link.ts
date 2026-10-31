import type { Document, ImageNode, ImageResource, Matrix } from '../model/types';
import { walkSpaceNodes } from '../model/queries';
import { frameOf, nodeWorldBounds } from '../geometry/world';
import type { Rect } from '../geometry/rect';
import { patchNode } from './node';
import { addImageResource } from './resources';
import { combineCommands, type Command } from './command';

/** Below this many effective pixels per inch an image looks soft on paper (Imagen › ppp, alert when printing). */
export const LOW_PPI = 150;

/** Pixels of the picture per printed inch, given where the image sits (`world` = its local → Space matrix; 1 unit = 1 pt). */
export function effectivePpi(world: Matrix, image: Pick<ImageNode, 'width'>, resource: Pick<ImageResource, 'width'>): number {
  const scale = Math.hypot(world[0], world[1]);
  const inches = (image.width * scale) / 72;
  return inches > 0 ? resource.width / inches : Infinity;
}

export interface ImageRef {
  spaceId: string;
  node: ImageNode;
}

/** Every image object of the document. */
export function imageNodes(document: Document): ImageRef[] {
  const out: ImageRef[] = [];
  for (const space of document.spaces) {
    for (const node of walkSpaceNodes(space)) if (node.type === 'image') out.push({ spaceId: space.id, node });
  }
  return out;
}

/** Linked images whose file is not available (nothing was read for them). */
export function brokenLinks(document: Document, available: (hash: string) => boolean): ImageRef[] {
  return imageNodes(document).filter(({ node }) => !node.embedded && !available(node.resourceId));
}

/** Pictures whose bytes must travel inside the .vict: those some embedded image uses, or no image uses at all (an undone placement). */
export function hashesToEmbed(document: Document): string[] {
  const linkedOnly = new Set<string>();
  const embedded = new Set<string>();
  for (const { node } of imageNodes(document)) (node.embedded ? embedded : linkedOnly).add(node.resourceId);
  return Object.keys(document.resources.images).filter((hash) => embedded.has(hash) || !linkedOnly.has(hash));
}

export interface ImageSource {
  hash: string;
  resource: ImageResource;
  embedded: boolean;
  /** Absolute path of the file when it is linked. */
  linkedPath?: string;
}

/**
 * Incrustar / Desincrustar / Reubicar: points images at a picture, embedded in the document or linked to a file.
 * Their size and place do not change. One undo step.
 */
export function setImageSource(targets: readonly ImageRef[], source: ImageSource): Command {
  const commands: Command[] = [addImageResource(source.hash, source.resource)];
  for (const { spaceId, node } of targets) {
    commands.push(patchNode<ImageNode>(spaceId, node.id, { resourceId: source.hash, embedded: source.embedded, linkedPath: source.embedded ? undefined : source.linkedPath }));
  }
  return combineCommands(source.embedded ? 'image.embed' : 'image.link', commands);
}

/**
 * Images that touch `region` (Space coordinates) and would print below `LOW_PPI` once the page is scaled by `scale`
 * (page pt per Space pt), with the resolution each would print at. Images without their picture, or that are hidden, are not counted.
 */
export function lowResolutionPpi(document: Document, spaceId: string, region: Rect, scale: number, hasBytes: (hash: string) => boolean): Array<{ node: ImageNode; ppi: number }> {
  const space = document.spaces.find((s) => s.id === spaceId);
  if (!space || scale <= 0) return [];
  const low: Array<{ node: ImageNode; ppi: number }> = [];
  for (const node of walkSpaceNodes(space)) {
    if (node.type !== 'image' || !node.visible || !hasBytes(node.resourceId)) continue;
    const resource = document.resources.images[node.resourceId];
    const frame = frameOf(space, node.id);
    const bounds = frame ? nodeWorldBounds(space, node.id) : null;
    if (!resource || !frame || !bounds) continue;
    const apart = bounds.maxX < region.minX || bounds.minX > region.maxX || bounds.maxY < region.minY || bounds.minY > region.maxY;
    const ppi = effectivePpi(frame.world, node, resource) / scale;
    if (!apart && ppi < LOW_PPI) low.push({ node, ppi });
  }
  return low;
}

/** The images of `lowResolutionPpi`, without the numbers. */
export function lowResolutionImages(document: Document, spaceId: string, region: Rect, scale: number, hasBytes: (hash: string) => boolean): ImageNode[] {
  return lowResolutionPpi(document, spaceId, region, scale, hasBytes).map((l) => l.node);
}
