import type { Draft } from 'immer';
import { multiply } from '../model/matrix';
import { childrenOf, locateLayer, locateNode, walkNodes } from '../model/queries';
import { pathFrameOf } from '../geometry/world';
import { shapeSubPaths } from '../geometry/shapes';
import { deepClone } from '../model/deepClone';
import type { Anchor, Appearance, BaseNode, ClipGroupNode, TextNode, Document, GroupNode, LayerChild, Matrix, Node, PathNode, ShapeNode, Space } from '../model/types';
import { combineCommands, type Command } from './command';
import { scaleStrokeWidths } from './appearance';

type DraftSpace = Draft<Space>;
type DraftNode = Draft<Node>;
type DraftChild = Draft<LayerChild>;

/** A layer or sublayer of the Space, wherever it sits in the tree. */
const findLayer = (d: Draft<Document>, spaceId: string, layerId: string) => {
  const space = findSpace(d, spaceId);
  return space ? locateLayer(space, layerId)?.layer : undefined;
};

const findSpace = (d: Draft<Document>, id: string): DraftSpace | undefined => d.spaces.find((s) => s.id === id);

/** Ids that are not inside another listed node, so a group and its children are never moved twice. */
function topmostIds(space: DraftSpace, ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const inner = new Set<string>();
  for (const id of ids) {
    const found = locateNode(space, id);
    const children = found ? childrenOf(found.node) : null;
    if (children) for (const n of walkNodes(children)) inner.add(n.id);
  }
  return [...wanted].filter((id) => !inner.has(id));
}

/** Detaches nodes (topmost only) and returns them in their original z-order. */
function detach(space: DraftSpace, ids: readonly string[]): DraftNode[] {
  const located = topmostIds(space, ids)
    .map((id) => locateNode(space, id))
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const taken = new Set(located.map((l) => l.node.id));
  // z-order = document order; walk to collect, then remove from their arrays.
  const ordered: DraftNode[] = [];
  for (const node of walkNodes(space.layers as LayerChild[])) if (taken.has(node.id)) ordered.push(node as DraftNode);
  for (const l of located) {
    const at = l.siblings.findIndex((n) => n.id === l.node.id);
    if (at !== -1) l.siblings.splice(at, 1);
  }
  return ordered;
}

/** `mergeKey` (verbatim) lets the first step of a drawing gesture merge with the edits that follow it. */
export const addNode = (spaceId: string, layerId: string, node: Node, index?: number, mergeKey?: string): Command => ({
  label: 'node.add',
  spaceId,
  ...(mergeKey ? { mergeKey } : {}),
  apply: (d) => {
    const layer = findLayer(d, spaceId, layerId);
    if (layer) layer.children.splice(index ?? layer.children.length, 0, node);
  },
});

export const removeNodes = (spaceId: string, ids: readonly string[]): Command => ({
  label: 'node.remove',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) detach(space, ids);
  },
});

/** Applies `matrix` in Space coordinates on top of each node's current transform (move, rotate, scale…). */
export const transformNodes = (spaceId: string, ids: readonly string[], matrix: Matrix, mergeKey?: string): Command => ({
  label: 'node.transform',
  spaceId,
  ...(mergeKey ? { mergeKey: `node.transform:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const id of topmostIds(space, ids)) {
      const found = locateNode(space, id);
      if (!found) continue;
      found.node.transform = multiply(matrix, found.node.transform);
      if (found.node.type === 'text' && (found.node.kind === 'point' || found.node.kind === 'area')) bakeTextScale(found.node as Draft<TextNode>);
    }
  },
});

/**
 * Point and area text keep their transform free of scale. Point text puts it into the font size and the
 * horizontal scale; area text scales its frame instead and leaves the font alone (as Illustrator does).
 */
function bakeTextScale(node: Draft<TextNode>): void {
  const m = node.transform;
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  if (sx === 0 || sy === 0 || (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9)) return;
  node.transform = [m[0] / sx, m[1] / sx, m[2] / sy, m[3] / sy, m[4], m[5]];
  if (node.kind === 'area' && node.frame) {
    const scale = (p: { x: number; y: number } | null) => {
      if (p) {
        p.x *= sx;
        p.y *= sy;
      }
    };
    for (const a of node.frame.anchors) {
      scale(a.p);
      scale(a.in);
      scale(a.out);
    }
    return;
  }
  for (const run of node.story) {
    run.style.size *= sy;
    if (run.style.leading !== undefined) run.style.leading *= sy;
    if (run.style.baselineShift !== undefined) run.style.baselineShift *= sy;
    if (Math.abs(sx - sy) > 1e-9) run.style.hScale = ((run.style.hScale ?? 100) * sx) / sy;
  }
}

export type NodeProps = Partial<Pick<BaseNode, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>;

export const setNodeProps = (spaceId: string, ids: readonly string[], props: NodeProps, mergeKey?: string): Command => ({
  label: 'node.props',
  spaceId,
  ...(mergeKey ? { mergeKey: `node.props:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const id of ids) {
      const found = locateNode(space, id);
      if (found) Object.assign(found.node, props);
    }
  },
});

/** Type-specific edits (anchors, shape params, text…). The patch is shallow-merged into the node. */
export const patchNode = <T extends Node>(spaceId: string, id: string, patch: Partial<T>, mergeKey?: string): Command => ({
  label: 'node.patch',
  spaceId,
  ...(mergeKey ? { mergeKey: `node.patch:${id}:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space, id) : null;
    if (found) Object.assign(found.node as object, patch);
  },
});

export const setNodeAppearance = (spaceId: string, id: string, appearance: Appearance): Command => ({
  label: 'node.appearance',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space, id) : null;
    if (found) found.node.appearance = appearance;
  },
});

export type ArrangeDirection = 'front' | 'back' | 'forward' | 'backward';

/** Object › Organizar. Index 0 is the bottom of the stack. */
export const arrangeNodes = (spaceId: string, ids: readonly string[], direction: ArrangeDirection): Command => ({
  label: `node.arrange.${direction}`,
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    const wanted = new Set(ids);
    // Each container (a layer, a group) is arranged on its own.
    const containers = new Map<DraftChild[], Set<string>>();
    for (const id of wanted) {
      const found = locateNode(space, id);
      if (!found) continue;
      const set = containers.get(found.siblings as DraftChild[]) ?? new Set<string>();
      set.add(id);
      containers.set(found.siblings as DraftChild[], set);
    }
    for (const [siblings, picked] of containers) {
      if (direction === 'front' || direction === 'back') {
        const chosen = siblings.filter((n) => picked.has(n.id));
        const rest = siblings.filter((n) => !picked.has(n.id));
        siblings.splice(0, siblings.length, ...(direction === 'front' ? [...rest, ...chosen] : [...chosen, ...rest]));
      } else if (direction === 'forward') {
        for (let i = siblings.length - 2; i >= 0; i--) {
          const a = siblings[i] as DraftChild;
          const b = siblings[i + 1] as DraftChild;
          if (picked.has(a.id) && !picked.has(b.id)) {
            siblings[i] = b;
            siblings[i + 1] = a;
          }
        }
      } else {
        for (let i = 1; i < siblings.length; i++) {
          const a = siblings[i - 1] as DraftChild;
          const b = siblings[i] as DraftChild;
          if (picked.has(b.id) && !picked.has(a.id)) {
            siblings[i - 1] = b;
            siblings[i] = a;
          }
        }
      }
    }
  },
});

/** Ctrl+G. The nodes must share one container; `group` comes from `createGroup` with no children. */
export const groupNodes = (spaceId: string, ids: readonly string[], group: GroupNode | ClipGroupNode): Command => ({
  label: group.type === 'clipGroup' ? 'node.clip' : 'node.group',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    const tops = topmostIds(space, ids)
      .map((id) => locateNode(space, id))
      .filter((l): l is NonNullable<typeof l> => l !== null);
    const first = tops[0];
    if (!first || tops.some((l) => l.siblings !== first.siblings)) return;
    const siblings = first.siblings as DraftChild[];
    const picked = new Set(tops.map((l) => l.node.id));
    const insertAt = Math.max(...tops.map((l) => siblings.indexOf(l.node as DraftChild)));
    let members = siblings.filter((n) => picked.has(n.id)) as DraftNode[];
    // A clipping mask: the topmost object is the mask and goes first (specs/02 · ClipGroup).
    if (group.type === 'clipGroup' && members.length > 1) members = [members[members.length - 1] as DraftNode, ...members.slice(0, -1)];
    const remainingBefore = siblings.slice(0, insertAt).filter((n) => !picked.has(n.id)).length;
    const rest = siblings.filter((n) => !picked.has(n.id));
    rest.splice(remainingBefore, 0, { ...group, children: members } as DraftChild);
    siblings.splice(0, siblings.length, ...rest);
  },
});

/** Mayús+Ctrl+G: children take the group's place and keep their look in the Space. */
export const ungroupNode = (spaceId: string, groupId: string): Command => ({
  label: 'node.ungroup',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space, groupId) : null;
    if (!found || (found.node.type !== 'group' && found.node.type !== 'clipGroup')) return;
    const group = found.node;
    const freed = group.children.map((child) => ({ ...child, transform: multiply(group.transform, child.transform) }));
    found.siblings.splice(found.index, 1, ...(freed as DraftNode[]));
  },
});

/** Moves objects to another layer of the same Space (on top by default). */
export const moveNodesToLayer = (spaceId: string, ids: readonly string[], layerId: string, index?: number): Command => ({
  label: 'node.moveToLayer',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const layer = space ? locateLayer(space, layerId)?.layer : undefined;
    if (!space || !layer) return;
    const moved = detach(space, ids);
    layer.children.splice(index ?? layer.children.length, 0, ...moved);
  },
});

/** "Mover a Espacio…": coordinates are kept (specs/04 · regla 6). The command belongs to the source Space. */
export const moveNodesToSpace = (fromSpaceId: string, ids: readonly string[], toSpaceId: string, toLayerId: string): Command => ({
  label: 'node.moveToSpace',
  spaceId: fromSpaceId,
  apply: (d) => {
    const from = findSpace(d, fromSpaceId);
    const target = findLayer(d, toSpaceId, toLayerId);
    if (!from || !target || fromSpaceId === toSpaceId) return;
    target.children.push(...detach(from, ids));
  },
});

/** "Mover a Espacio… › Nuevo Espacio…": the new Space is created and receives the objects in one step (the step belongs to the source Space). */
export const moveNodesToNewSpace = (fromSpaceId: string, ids: readonly string[], space: Space): Command => ({
  label: 'node.moveToSpace',
  spaceId: fromSpaceId,
  apply: (d) => {
    const from = findSpace(d, fromSpaceId);
    const layer = space.layers[0];
    if (!from || !layer) return;
    const draftSpace = deepClone(space) as Draft<Space>;
    d.spaces.push(draftSpace);
    d.spaces.forEach((sp, i) => (sp.order = i));
    draftSpace.layers[0]?.children.push(...detach(from, ids));
  },
});

/** Replaces the anchors of a path (or of a compound sub-path): the single command behind every node edit. */
export const setPathAnchors = (spaceId: string, pathId: string, anchors: Anchor[], mergeKey?: string): Command => ({
  label: 'path.edit',
  spaceId,
  ...(mergeKey ? { mergeKey: `path.edit:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const frame = space ? pathFrameOf(space, pathId) : null;
    if (frame) frame.path.anchors = anchors;
  },
});

/** Turns the live shape `id` into a plain path in place (same id, transform and appearance). */
function convertShapeInDraft(space: DraftSpace, id: string): void {
  const found = locateNode(space, id);
  if (!found || found.node.type !== 'shape') return;
  const { shape: _shape, params: _params, type: _type, ...base } = deepClone(found.node as Node) as Node & { shape: string; params: unknown };
  void _shape;
  void _params;
  void _type;
  const [contour] = shapeSubPaths(found.node as ShapeNode);
  if (!contour) return;
  found.siblings[found.index] = { ...base, type: 'path', closed: contour.closed, anchors: contour.anchors } as PathNode as DraftChild;
}

/** Editing the nodes of a live shape turns it into a plain path (specs/02 · Shape). */
export const convertShapeToPath = (spaceId: string, id: string, mergeKey?: string): Command => ({
  label: 'shape.toPath',
  spaceId,
  ...(mergeKey ? { mergeKey: `path.edit:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) convertShapeInDraft(space, id);
  },
});

/** One path of an `editPaths` step: new anchors (and optionally open/closed), or null to delete the path. */
export interface PathEdit {
  pathId: string;
  anchors: Anchor[] | null;
  closed?: boolean;
}

/**
 * Several path edits as a single history step (delete anchors on many paths, convert anchors, average…).
 * Live shapes are converted first; a path left with no anchors is removed, with its object when it was alone.
 */
export const editPaths = (spaceId: string, edits: readonly PathEdit[], label = 'path.edit'): Command => ({
  label,
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const edit of edits) {
      convertShapeInDraft(space, edit.pathId);
      const frame = pathFrameOf(space, edit.pathId);
      if (!frame) continue;
      if (edit.anchors === null) {
        const owner = frame.owner;
        if (owner.type === 'compound' && owner.children.length > 1) owner.children = owner.children.filter((p) => p.id !== edit.pathId);
        else detach(space, [owner.id]);
        continue;
      }
      frame.path.anchors = edit.anchors;
      if (edit.closed !== undefined) frame.path.closed = edit.closed;
    }
  },
});

/**
 * Alt+drag: inserts each clone right above its original (same container) with `matrix` already applied.
 * `clones[i]` is the copy of `ids[i]` (made with `cloneNodes`, so it has fresh ids).
 */
export const duplicateNodes = (spaceId: string, ids: readonly string[], clones: readonly Node[], matrix: Matrix | null = null, mergeKey?: string): Command => ({
  label: 'node.duplicate',
  spaceId,
  ...(mergeKey ? { mergeKey: `node.transform:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    ids.forEach((id, i) => {
      const clone = clones[i];
      const found = locateNode(space, id);
      if (!clone || !found) return;
      const placed = matrix ? { ...clone, transform: multiply(matrix, clone.transform) } : clone;
      found.siblings.splice(found.index + 1, 0, placed as DraftChild);
    });
  },
});

/** Objeto › Desbloquear todo / Mostrar todo: sets properties on every object of the Space (groups included). */
export const setAllNodesProps = (spaceId: string, props: NodeProps): Command => ({
  label: 'node.propsAll',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of walkNodes(space.layers as LayerChild[])) Object.assign(node, props);
  },
});

/** Mayús+Ctrl+G on several groups at once, as a single history step. */
export const ungroupNodes = (spaceId: string, groupIds: readonly string[]): Command => ({
  label: 'node.ungroup',
  spaceId,
  apply: (d) => {
    for (const id of groupIds) ungroupNode(spaceId, id).apply(d);
  },
});

/** Scissors: replaces a node by other nodes in the same place of the z-order (an empty list deletes it). */
export const replaceNode = (spaceId: string, id: string, replacements: readonly Node[]): Command => ({
  label: 'node.replace',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space, id) : null;
    if (found) found.siblings.splice(found.index, 1, ...(replacements as DraftChild[]));
  },
});

/** Join: the path `keepId` takes the joined geometry and the other paths disappear. */
export const joinPathNodes = (spaceId: string, keepId: string, removeIds: readonly string[], anchors: Anchor[], closed: boolean): Command => ({
  label: 'path.join',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    const found = locateNode(space, keepId);
    if (found && found.node.type === 'path') {
      found.node.anchors = anchors;
      found.node.closed = closed;
    }
    detach(space, removeIds);
  },
});

/** Opens or closes a path and sets its anchors in one step (Pen closing, Ctrl+J on the two ends of one path). */
export const setPathGeometry = (spaceId: string, pathId: string, anchors: Anchor[], closed: boolean, mergeKey?: string): Command => ({
  label: 'path.edit',
  spaceId,
  ...(mergeKey ? { mergeKey: `path.edit:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space, pathId) : null;
    if (found && found.node.type === 'path') {
      found.node.anchors = anchors;
      found.node.closed = closed;
    }
  },
});

/** While a shape is being dragged out: replaces its parameters and transform; merges with `addNode(…, `draw:${key}`)`. */
export const redrawShape = (spaceId: string, id: string, patch: Partial<ShapeNode>, key: string): Command => ({
  label: 'node.add',
  spaceId,
  mergeKey: `draw:${key}`,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space, id) : null;
    if (found) Object.assign(found.node as object, patch);
  },
});

/** Scissors on several paths at once: each node is replaced by its pieces in the same place of the z-order. */
export const replaceNodes = (spaceId: string, replacements: ReadonlyArray<{ id: string; nodes: readonly Node[] }>, label = 'node.replace', mergeKey?: string): Command => ({
  label,
  spaceId,
  ...(mergeKey ? { mergeKey: `${label}:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const { id, nodes } of replacements) {
      const found = locateNode(space, id);
      if (found) found.siblings.splice(found.index, 1, ...(nodes as DraftChild[]));
    }
  },
});

/** Moves several objects each by its own offset (Align, Distribute, Spacing, grid) as one history step. */
export const translateNodes = (spaceId: string, deltas: ReadonlyMap<string, { x: number; y: number }>, label = 'node.align'): Command => ({
  label,
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const [id, delta] of deltas) {
      const found = locateNode(space, id);
      if (found) found.node.transform = multiply([1, 0, 0, 1, delta.x, delta.y], found.node.transform);
    }
  },
});

/**
 * Like `transformNodes`, and with "Escalar trazos y efectos" on the stroke weights follow the scale
 * of the matrix (the square root of its determinant), in the same history step.
 */
export const transformNodesScaling = (spaceId: string, ids: readonly string[], matrix: Matrix, scaleStrokes: boolean, mergeKey?: string): Command => {
  const move = transformNodes(spaceId, ids, matrix, mergeKey);
  const factor = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
  if (!scaleStrokes || !Number.isFinite(factor) || Math.abs(factor - 1) < 1e-9) return move;
  return combineCommands('node.transform', [move, scaleStrokeWidths(spaceId, ids, factor)]);
};
