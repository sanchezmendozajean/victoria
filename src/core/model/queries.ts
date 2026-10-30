import type { Document, Layer, LayerChild, Node, Space } from './types';

export function getSpace(doc: Document, spaceId: string): Space | undefined {
  return doc.spaces.find((s) => s.id === spaceId);
}

export function getActiveSpace(doc: Document): Space {
  const space = getSpace(doc, doc.activeSpaceId) ?? doc.spaces[0];
  if (!space) throw new Error('Document without Spaces');
  return space;
}

export const isLayer = (child: LayerChild): child is Layer => child.type === 'layer';

/** Children of container nodes (groups); compound sub-paths are not addressable on their own. */
export function childrenOf(node: Node): Node[] | null {
  return node.type === 'group' || node.type === 'clipGroup' ? node.children : null;
}

export interface NodeLocation {
  node: Node;
  /** The layer (or sublayer) that holds the node, directly or through groups. */
  layer: Layer;
  /** The array that holds the node: a layer's children (mixed with sublayers) or a group's children. */
  siblings: LayerChild[];
  index: number;
}

function searchNode(layer: Layer, siblings: LayerChild[], id: string): NodeLocation | null {
  for (let index = 0; index < siblings.length; index++) {
    const child = siblings[index] as LayerChild;
    if (isLayer(child)) {
      const found = searchNode(child, child.children, id);
      if (found) return found;
      continue;
    }
    if (child.id === id) return { node: child, layer, siblings, index };
    const inner = childrenOf(child);
    if (inner) {
      const found = searchNode(layer, inner, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Lookups by id on a frozen (immutable) Space are answered from an index built once per version of the Space, after a few
 * plain searches: panels, overlays and tools look up hundreds or thousands of ids per frame with a big selection, and a
 * search per id is quadratic. Spaces that can still change (drafts inside a command, plain objects in tests) are never indexed.
 */
const INDEX_AFTER = 8;
const locationIndexes = new WeakMap<Space, { lookups: number; index: Map<string, NodeLocation> | null }>();

function buildLocationIndex(space: Space): Map<string, NodeLocation> {
  const index = new Map<string, NodeLocation>();
  const visit = (layer: Layer, siblings: LayerChild[]): void => {
    for (let i = 0; i < siblings.length; i++) {
      const child = siblings[i] as LayerChild;
      if (isLayer(child)) {
        visit(child, child.children);
        continue;
      }
      index.set(child.id, { node: child, layer, siblings, index: i });
      const inner = childrenOf(child);
      if (inner) visit(layer, inner);
    }
  };
  for (const layer of space.layers) visit(layer, layer.children);
  return index;
}

function indexFor(space: Space): Map<string, NodeLocation> | null {
  if (!Object.isFrozen(space)) return null;
  let entry = locationIndexes.get(space);
  if (!entry) {
    entry = { lookups: 0, index: null };
    locationIndexes.set(space, entry);
  }
  if (!entry.index && ++entry.lookups > INDEX_AFTER) entry.index = buildLocationIndex(space);
  return entry.index;
}

export function locateNode(space: Space, id: string): NodeLocation | null {
  const index = indexFor(space);
  if (index) return index.get(id) ?? null;
  for (const layer of space.layers) {
    const found = searchNode(layer, layer.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Where each of `ids` is, found in ONE walk of the Space (calling `locateNode` per id is quadratic: moving 10 000
 * objects took minutes). Results come in z-order. With `topmost`, nodes inside another listed node are left out, so
 * a group and its children are never handled twice. Indexes are valid until the arrays are changed.
 */
export function locateNodes(space: Space, ids: Iterable<string>, topmost = false): NodeLocation[] {
  const wanted = ids instanceof Set ? (ids as Set<string>) : new Set(ids);
  const out: NodeLocation[] = [];
  if (wanted.size === 0) return out;
  const visit = (layer: Layer, siblings: LayerChild[], inside: boolean): void => {
    for (let index = 0; index < siblings.length; index++) {
      const child = siblings[index] as LayerChild;
      if (isLayer(child)) {
        visit(child, child.children, inside);
        continue;
      }
      const hit = wanted.has(child.id);
      if (hit && !(topmost && inside)) out.push({ node: child, layer, siblings, index });
      const inner = childrenOf(child);
      if (inner) visit(layer, inner, inside || hit);
    }
  };
  for (const layer of space.layers) visit(layer, layer.children, false);
  return out;
}

export interface LayerLocation {
  layer: Layer;
  /** The array that holds the layer: `space.layers` or a parent layer's children. */
  siblings: LayerChild[];
  index: number;
  /** null for top-level layers. */
  parent: Layer | null;
}

function searchLayer(parent: Layer | null, siblings: LayerChild[], id: string): LayerLocation | null {
  for (let index = 0; index < siblings.length; index++) {
    const child = siblings[index] as LayerChild;
    if (!isLayer(child)) continue;
    if (child.id === id) return { layer: child, siblings, index, parent };
    const found = searchLayer(child, child.children, id);
    if (found) return found;
  }
  return null;
}

/** Finds a layer or sublayer anywhere in the Space. */
export function locateLayer(space: Space, id: string): LayerLocation | null {
  return searchLayer(null, space.layers as LayerChild[], id);
}

/** Every layer and sublayer of a Space, parents before children. */
export function* walkLayers(layers: readonly Layer[]): Generator<Layer> {
  for (const layer of layers) {
    yield layer;
    yield* walkLayers(layer.children.filter(isLayer));
  }
}

/** Objects in z-order (bottom to top), descending into sublayers and groups. */
export function* walkNodes(children: readonly LayerChild[]): Generator<Node> {
  for (const child of children) {
    if (isLayer(child)) {
      yield* walkNodes(child.children);
      continue;
    }
    yield child;
    const inner = childrenOf(child);
    if (inner) yield* walkNodes(inner);
  }
}

export function* walkSpaceNodes(space: Space): Generator<Node> {
  yield* walkNodes(space.layers as LayerChild[]);
}

export function countObjects(space: Space): number {
  let n = 0;
  for (const node of walkSpaceNodes(space)) if (node) n++;
  return n;
}

/** Every id in the document (spaces, artboards, layers, guides, nodes): they must all be unique. */
export function collectIds(doc: Document): string[] {
  const ids: string[] = [];
  for (const space of doc.spaces) {
    ids.push(space.id);
    for (const a of space.artboards) ids.push(a.id);
    for (const g of space.guides) ids.push(g.id);
    for (const layer of walkLayers(space.layers)) ids.push(layer.id);
    for (const node of walkSpaceNodes(space)) {
      ids.push(node.id);
      if (node.type === 'compound') for (const child of node.children) ids.push(child.id);
    }
  }
  return ids;
}
