import type { Document, Layer, Node, Space } from './types';

export function getSpace(doc: Document, spaceId: string): Space | undefined {
  return doc.spaces.find((s) => s.id === spaceId);
}

export function getActiveSpace(doc: Document): Space {
  const space = getSpace(doc, doc.activeSpaceId) ?? doc.spaces[0];
  if (!space) throw new Error('Document without Spaces');
  return space;
}

/** Children of container nodes (groups); compound sub-paths are not addressable on their own. */
export function childrenOf(node: Node): Node[] | null {
  return node.type === 'group' || node.type === 'clipGroup' ? node.children : null;
}

export interface NodeLocation {
  node: Node;
  layer: Layer;
  /** The array that holds the node (a layer's or a group's children). */
  siblings: Node[];
  index: number;
}

function searchIn(layer: Layer, siblings: Node[], id: string): NodeLocation | null {
  for (let index = 0; index < siblings.length; index++) {
    const node = siblings[index] as Node;
    if (node.id === id) return { node, layer, siblings, index };
    const inner = childrenOf(node);
    if (inner) {
      const found = searchIn(layer, inner, id);
      if (found) return found;
    }
  }
  return null;
}

export function locateNode(space: Space, id: string): NodeLocation | null {
  for (const layer of space.layers) {
    const found = searchIn(layer, layer.children, id);
    if (found) return found;
  }
  return null;
}

export function* walkNodes(nodes: readonly Node[]): Generator<Node> {
  for (const node of nodes) {
    yield node;
    const inner = childrenOf(node);
    if (inner) yield* walkNodes(inner);
  }
}

export function* walkSpaceNodes(space: Space): Generator<Node> {
  for (const layer of space.layers) yield* walkNodes(layer.children);
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
    for (const layer of space.layers) {
      ids.push(layer.id);
      for (const node of walkNodes(layer.children)) {
        ids.push(node.id);
        if (node.type === 'compound') for (const child of node.children) ids.push(child.id);
      }
    }
  }
  return ids;
}
