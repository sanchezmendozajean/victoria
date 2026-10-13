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

export function locateNode(space: Space, id: string): NodeLocation | null {
  for (const layer of space.layers) {
    const found = searchNode(layer, layer.children, id);
    if (found) return found;
  }
  return null;
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
