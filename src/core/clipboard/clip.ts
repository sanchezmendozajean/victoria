import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { combineCommands, type Command } from '../commands/command';
import { addNode } from '../commands/node';
import { addGradient, addImageResource, addSwatch } from '../commands/resources';
import type { Rect } from '../geometry/rect';
import { frameOf, selectionBounds } from '../geometry/world';
import type { ImageStore } from '../io/imageStore';
import { assertNodes } from '../io/validate';
import { cloneNodes } from '../model/clone';
import { deepClone } from '../model/deepClone';
import type { IdGenerator } from '../model/ids';
import { multiply, translation } from '../model/matrix';
import { locateNode, walkNodes, walkSpaceNodes } from '../model/queries';
import type { Document, Gradient, ImageResource, Node, Paint, Space, Swatch } from '../model/types';

/** What travels on the clipboard: the objects (already in Space coordinates) and the resources they use. */
export interface ClipPayload {
  format: 'victoria-clip';
  version: 1;
  /** In painting order, bottom first. Each `transform` already includes the groups the object was in. */
  nodes: Node[];
  swatches: Swatch[];
  gradients: Gradient[];
  images: Record<string, ImageResource>;
  /** Geometric bounds of the whole copy, in Space coordinates. */
  bounds: Rect;
  /** Top-left corner of the artboard the copy was made over (for "Pegar en todas las mesas"). */
  artboard: { x: number; y: number } | null;
}

function paintsOf(node: Node): Paint[] {
  const out: Paint[] = [];
  const visit = (n: Node) => {
    for (const item of n.appearance.items) if (item.kind !== 'modifier') out.push(item.paint);
    if (n.type === 'compound') n.children.forEach((c) => visit(c as unknown as Node));
    if (n.type === 'group' || n.type === 'clipGroup') n.children.forEach(visit);
  };
  visit(node);
  return out;
}

/** The node and everything inside it. */
function withDescendants(node: Node): Node[] {
  return node.type === 'group' || node.type === 'clipGroup' ? [node, ...walkNodes(node.children)] : [node];
}

/** The selected objects (top-level ones) as a payload; null when there is nothing to copy. */
export function copyObjects(doc: Document, space: Space, ids: readonly string[]): ClipPayload | null {
  const wanted = new Set(ids);
  const nodes: Node[] = [];
  for (const node of walkSpaceNodes(space)) {
    if (!wanted.has(node.id)) continue;
    const frame = frameOf(space, node.id);
    if (!frame) continue;
    const baked = deepClone(node) as Node;
    baked.transform = multiply(frame.parentWorld, node.transform);
    nodes.push(baked);
  }
  const bounds = nodes.length > 0 ? selectionBounds(space, nodes.map((n) => n.id)) : null;
  if (!bounds) return null;

  const swatchIds = new Set<string>();
  const gradientIds = new Set<string>();
  const imageIds = new Set<string>();
  for (const n of nodes.flatMap(withDescendants)) {
    if (n.type === 'image') imageIds.add(n.resourceId);
    for (const paint of paintsOf(n)) {
      if (paint.type === 'swatch') swatchIds.add(paint.swatchId);
      else if (paint.type === 'linear' || paint.type === 'radial') gradientIds.add(paint.gradientId);
    }
  }
  const images: Record<string, ImageResource> = {};
  for (const hash of imageIds) {
    const resource = doc.resources.images[hash];
    if (resource) images[hash] = deepClone(resource);
  }
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const board = space.artboards.find((a) => cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h);
  return {
    format: 'victoria-clip',
    version: 1,
    nodes,
    swatches: doc.resources.swatches.filter((s) => swatchIds.has(s.id)).map((s) => deepClone(s)),
    gradients: doc.resources.gradients.filter((g) => gradientIds.has(g.id)).map((g) => deepClone(g)),
    images,
    bounds,
    artboard: board ? { x: board.x, y: board.y } : null,
  };
}

const MAX_CLIP_ENTRY = 512 * 1024 * 1024;

/** The clipboard bytes: a small ZIP with `clip.json` and the image files, like a .vict. */
export function encodeClip(payload: ClipPayload, images: ImageStore): Uint8Array {
  const files: Zippable = { 'clip.json': strToU8(JSON.stringify(payload)) };
  for (const hash of Object.keys(payload.images)) {
    const bytes = images.get(hash);
    if (bytes) files[`images/${hash}`] = [bytes, { level: 0 }];
  }
  return zipSync(files);
}

/** Null for anything that is not a Victoria clip or is damaged: pasting must never throw. */
export function decodeClip(bytes: Uint8Array): { payload: ClipPayload; images: Record<string, Uint8Array> } | null {
  try {
    const entries = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_CLIP_ENTRY });
    const raw = entries['clip.json'];
    if (!raw) return null;
    const payload = JSON.parse(strFromU8(raw)) as ClipPayload;
    if (payload.format !== 'victoria-clip' || payload.version !== 1) return null;
    assertNodes(payload.nodes, 'clip.nodes');
    if (!Array.isArray(payload.swatches) || !Array.isArray(payload.gradients) || typeof payload.images !== 'object' || payload.images === null) return null;
    const b = payload.bounds;
    if (!b || ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) return null;
    const images: Record<string, Uint8Array> = {};
    for (const hash of Object.keys(payload.images)) {
      const data = entries[`images/${hash}`];
      if (data) images[hash] = data;
    }
    return { payload, images };
  } catch {
    return null;
  }
}

export type PasteMode = 'center' | 'inPlace' | 'front' | 'back' | 'allArtboards';

export interface PasteOptions {
  mode: PasteMode;
  /** Centre of what the user sees, in Space coordinates (for `center`). */
  viewCenter: { x: number; y: number };
  /** Selected objects of the Space; "front" and "back" go right above or below them. */
  selectedIds: readonly string[];
  /** Layer that receives the copy when nothing is selected. */
  layerId: string;
}

export interface PasteResult {
  command: Command;
  /** Ids of the new objects, to select them. */
  ids: string[];
}

const PASTE_LABEL: Record<PasteMode, string> = {
  center: 'clipboard.paste',
  inPlace: 'clipboard.pasteInPlace',
  front: 'clipboard.pasteFront',
  back: 'clipboard.pasteBack',
  allArtboards: 'clipboard.pasteAll',
};

/**
 * Builds the command that puts a payload into a Space (one undo step): missing swatches, gradients and
 * images are listed first, then the objects go in with fresh ids. The image bytes are the caller's job.
 */
export function pasteCommand(doc: Document, space: Space, payload: ClipPayload, ids: IdGenerator, options: PasteOptions): PasteResult | null {
  const steps: Command[] = [];
  for (const swatch of payload.swatches) if (!doc.resources.swatches.some((s) => s.id === swatch.id)) steps.push(addSwatch(swatch));
  for (const gradient of payload.gradients) if (!doc.resources.gradients.some((g) => g.id === gradient.id)) steps.push(addGradient(gradient));
  for (const [hash, resource] of Object.entries(payload.images)) if (!doc.resources.images[hash]) steps.push(addImageResource(hash, resource));

  const { bounds } = payload;
  const offsets: Array<{ dx: number; dy: number }> = [];
  if (options.mode === 'center') {
    offsets.push({ dx: options.viewCenter.x - (bounds.minX + bounds.maxX) / 2, dy: options.viewCenter.y - (bounds.minY + bounds.maxY) / 2 });
  } else if (options.mode === 'allArtboards' && space.artboards.length > 0) {
    const first = space.artboards[0];
    const from = payload.artboard ?? { x: first?.x ?? 0, y: first?.y ?? 0 };
    for (const board of space.artboards) offsets.push({ dx: board.x - from.x, dy: board.y - from.y });
  } else {
    offsets.push({ dx: 0, dy: 0 });
  }

  // Z-order: right above or below the topmost / bottom selected object when it sits directly in a layer, else the layer's end.
  let layerId = options.layerId;
  let index: number | undefined;
  if (options.mode === 'front' || options.mode === 'back') {
    const located = options.selectedIds.map((id) => locateNode(space, id)).filter((l): l is NonNullable<typeof l> => l !== null && l.siblings === l.layer.children);
    const front = located.reduce<(typeof located)[number] | undefined>((best, l) => (!best || l.index > best.index ? l : best), undefined);
    const back = located.reduce<(typeof located)[number] | undefined>((best, l) => (!best || l.index < best.index ? l : best), undefined);
    const target = options.mode === 'front' ? front : back;
    if (target) {
      layerId = target.layer.id;
      index = options.mode === 'front' ? target.index + 1 : target.index;
    } else if (options.mode === 'back') {
      index = 0;
    }
  }

  const created: string[] = [];
  let at = index;
  for (const { dx, dy } of offsets) {
    for (const copy of cloneNodes(payload.nodes, ids)) {
      if (dx !== 0 || dy !== 0) copy.transform = multiply(translation(dx, dy), copy.transform);
      steps.push(addNode(space.id, layerId, copy, at));
      if (at !== undefined) at++;
      created.push(copy.id);
    }
  }
  if (created.length === 0) return null;
  return { command: combineCommands(PASTE_LABEL[options.mode], steps), ids: created };
}
