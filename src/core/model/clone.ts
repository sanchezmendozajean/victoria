import { deepClone } from './deepClone';
import type { IdGenerator } from './ids';
import { isLayer } from './queries';
import type { Layer, LayerChild, Node, Space } from './types';

/** Deep copy with fresh ids. `idMap` records old → new so references can be rewired. */
export function cloneNode<T extends Node>(node: T, ids: IdGenerator, idMap: Map<string, string>): T {
  const copy = deepClone(node) as T;
  const rename = (n: Node) => {
    const fresh = ids();
    idMap.set(n.id, fresh);
    n.id = fresh;
    if (n.type === 'group' || n.type === 'clipGroup') n.children.forEach(rename);
    if (n.type === 'compound') n.children.forEach(rename);
    for (const item of n.appearance.items) {
      const mods = item.kind === 'modifier' ? [item.mod] : item.modifiers;
      for (const mod of mods) mod.id = ids();
    }
  };
  rename(copy);
  return copy;
}

/** Text nodes point at other nodes (area path, path to follow): rewire them inside a cloned subtree. */
function rewireReferences(children: LayerChild[], idMap: Map<string, string>): void {
  for (const node of children) {
    if (isLayer(node)) {
      rewireReferences(node.children, idMap);
      continue;
    }
    if (node.type === 'text') {
      if (node.areaPathId !== undefined) node.areaPathId = idMap.get(node.areaPathId) ?? node.areaPathId;
      if (node.pathRef !== undefined) node.pathRef = idMap.get(node.pathRef) ?? node.pathRef;
    }
    if (node.type === 'group' || node.type === 'clipGroup') rewireReferences(node.children, idMap);
  }
}

export function cloneNodes<T extends Node>(nodes: readonly T[], ids: IdGenerator): T[] {
  const idMap = new Map<string, string>();
  const copies = nodes.map((n) => cloneNode(n, ids, idMap));
  rewireReferences(copies, idMap);
  return copies;
}

function cloneChildren(children: readonly LayerChild[], ids: IdGenerator, idMap: Map<string, string>): LayerChild[] {
  return children.map((child) => (isLayer(child) ? cloneLayer(child, ids, idMap) : cloneNode(child, ids, idMap)));
}

/** Copies a layer with its sublayers and objects, all with fresh ids. */
export function cloneLayer(layer: Layer, ids: IdGenerator, idMap = new Map<string, string>()): Layer {
  const { children, ...rest } = layer;
  const copy: Layer = { ...deepClone(rest), id: ids(), children: [] };
  idMap.set(layer.id, copy.id);
  copy.children = cloneChildren(children, ids, idMap);
  rewireReferences(copy.children, idMap);
  return copy;
}

/** "Duplicar Espacio": same content, new ids everywhere, name given by the caller. */
export function cloneSpace(space: Space, ids: IdGenerator, name: string, order: number): Space {
  const { layers, ...rest } = space;
  const copy: Space = { ...deepClone(rest), id: ids(), name, order, layers: [] };
  copy.artboards.forEach((a) => (a.id = ids()));
  copy.guides.forEach((g) => (g.id = ids()));
  const idMap = new Map<string, string>();
  copy.layers = layers.map((l) => cloneLayer(l, ids, idMap));
  // Cross-layer references (text on a path in another layer) need the complete map.
  for (const layer of copy.layers) rewireReferences(layer.children, idMap);
  return copy;
}
