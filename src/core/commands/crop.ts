import { invert, multiply, translation } from '../model/matrix';
import { createClipGroup, createRect } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import type { ClipGroupNode, ImageNode, ImageResource, LayerChild, Matrix, Node, ShapeNode } from '../model/types';
import { patchNode, replaceNode } from './node';
import { addImageResource } from './resources';
import { combineCommands, type Command } from './command';

/** A window on an image, in the image's own units (its `width` × `height` box, origin at the top left). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A non-destructive crop: a clipping group whose mask is a plain rectangle laid on one image. */
export interface CropInfo {
  clip: ClipGroupNode;
  mask: RectShape;
  image: ImageNode;
  rect: CropRect;
}

const EPSILON = 1e-6;
type RectShape = Extract<ShapeNode, { shape: 'rect' }>;

/** The crop an object stands for, or null when it is not a clipping group made by "Recortar imagen". */
export function cropOf(node: LayerChild | null | undefined): CropInfo | null {
  if (!node || node.type !== 'clipGroup' || node.children.length !== 2) return null;
  const [mask, image] = node.children as [Node, Node];
  if (mask.type !== 'shape' || mask.shape !== 'rect' || image.type !== 'image') return null;
  if (mask.params.radii.some((r) => r !== 0)) return null;
  const inverse = invert(image.transform);
  if (!inverse) return null;
  const rel = multiply(inverse, mask.transform);
  const upright = Math.abs(rel[0] - 1) < EPSILON && Math.abs(rel[1]) < EPSILON && Math.abs(rel[2]) < EPSILON && Math.abs(rel[3] - 1) < EPSILON;
  if (!upright) return null;
  return { clip: node, mask, image, rect: { x: rel[4], y: rel[5], w: mask.params.w, h: mask.params.h } };
}

/** The window clamped to the image and never smaller than `min` (units of the image) on a side. */
export function clampCrop(rect: CropRect, image: Pick<ImageNode, 'width' | 'height'>, min = 1): CropRect {
  const w = Math.min(image.width, Math.max(Math.min(min, image.width), rect.w));
  const h = Math.min(image.height, Math.max(Math.min(min, image.height), rect.h));
  return { x: Math.min(image.width - w, Math.max(0, rect.x)), y: Math.min(image.height - h, Math.max(0, rect.y)), w, h };
}

const maskTransform = (image: ImageNode, rect: CropRect): Matrix => multiply(image.transform, translation(rect.x, rect.y));

/** Recortar imagen: the image goes inside a clipping group masked by a rectangle (the whole image at first). One undo step. */
export function cropImage(ids: IdGenerator, spaceId: string, image: ImageNode, rect: CropRect): { command: Command; clip: ClipGroupNode } {
  const window = clampCrop(rect, image);
  const mask = createRect(ids, window.w, window.h);
  mask.transform = maskTransform(image, window);
  mask.appearance = { items: [] };
  const clip = createClipGroup(ids, [mask, image]);
  return { command: { ...replaceNode(spaceId, image.id, [clip]), label: 'image.crop' }, clip };
}

/** Moves the edges of an existing crop. Dragging the sliders of the dialog merges into one undo step. */
export function recropImage(spaceId: string, info: CropInfo, rect: CropRect, mergeKey?: string): Command {
  const window = clampCrop(rect, info.image);
  return patchNode<RectShape>(spaceId, info.mask.id, { transform: maskTransform(info.image, window), params: { ...info.mask.params, w: window.w, h: window.h } }, mergeKey);
}

/** Removes the crop and leaves the whole image, where it was. */
export function uncropImage(spaceId: string, info: CropInfo): Command {
  const image = { ...info.image, transform: multiply(info.clip.transform, info.image.transform) };
  return { ...replaceNode(spaceId, info.clip.id, [image]), label: 'image.uncrop' };
}

/** The part of the picture's pixels a crop keeps: whole pixels, so the cut never resamples. */
export interface PixelWindow {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** The crop snapped to those pixels, in image units. */
  rect: CropRect;
}

export function pixelWindow(info: CropInfo, resource: Pick<ImageResource, 'width' | 'height'>): PixelWindow {
  const kx = resource.width / info.image.width;
  const ky = resource.height / info.image.height;
  const sx = Math.max(0, Math.min(resource.width - 1, Math.round(info.rect.x * kx)));
  const sy = Math.max(0, Math.min(resource.height - 1, Math.round(info.rect.y * ky)));
  const sw = Math.max(1, Math.min(resource.width - sx, Math.round((info.rect.x + info.rect.w) * kx) - sx));
  const sh = Math.max(1, Math.min(resource.height - sy, Math.round((info.rect.y + info.rect.h) * ky) - sy));
  return { sx, sy, sw, sh, rect: { x: sx / kx, y: sy / ky, w: sw / kx, h: sh / ky } };
}

/**
 * Aplicar recorte: the crop becomes a new, smaller image (its pixels cut out) at the same place and scale,
 * and the group disappears. `hash` and `resource` describe the already cut picture.
 */
export function applyCrop(ids: IdGenerator, spaceId: string, info: CropInfo, window: PixelWindow, hash: string, resource: ImageResource): { command: Command; image: ImageNode } {
  const world = multiply(info.clip.transform, info.image.transform);
  const image: ImageNode = {
    ...info.image,
    id: ids(),
    transform: multiply(world, translation(window.rect.x, window.rect.y)),
    width: window.rect.w,
    height: window.rect.h,
    resourceId: hash,
    opacity: info.image.opacity * info.clip.opacity,
    blendMode: info.clip.blendMode !== 'normal' ? info.clip.blendMode : info.image.blendMode,
  };
  const command = combineCommands('image.cropApply', [addImageResource(hash, resource), replaceNode(spaceId, info.clip.id, [image])]);
  return { command, image };
}
