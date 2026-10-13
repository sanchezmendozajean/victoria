// Test kit: seeded random document operations, used by the history and file-format tests.
import {
  addArtboard,
  addGuide,
  addLayer,
  addNode,
  addSpace,
  addSwatch,
  arrangeNodes,
  groupNodes,
  moveGuide,
  moveNodesToLayer,
  moveNodesToSpace,
  removeArtboard,
  removeLayer,
  removeNodes,
  removeSpace,
  removeSwatch,
  renameDocument,
  renameSpace,
  reorderArtboard,
  reorderLayer,
  reorderSpace,
  setNodeProps,
  setSpaceColor,
  setSpaceExcluded,
  setUnits,
  transformNodes,
  ungroupNode,
  updateArtboard,
  updateLayer,
  updateSwatch,
  type Command,
} from '../commands';
import { cloneSpace } from '../model/clone';
import { createArtboard, createDocument, createEllipse, createGroup, createLayer, createPath, createRect, createSpace } from '../model/factory';
import { sequentialIds, type IdGenerator } from '../model/ids';
import { translation, scaling, rotation } from '../model/matrix';
import { SPACE_COLORS } from '../model/presets';
import { walkNodes } from '../model/queries';
import type { Document, Node, Space } from '../model/types';

/** Mulberry32: tiny seeded PRNG. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (p: number) => next() < p,
    /** A "nice" number so floating error cannot hide behind equal-looking values. */
    num: (range = 500) => Math.round((next() - 0.5) * 2 * range * 8) / 8,
  };
}
export type Rng = ReturnType<typeof createRng>;

export function sampleDocument(ids: IdGenerator, now = '2026-01-01T00:00:00.000Z'): Document {
  return createDocument({ name: 'Sample', spaceName: 'Space 1', artboardName: 'Board 1', layerName: 'Layer 1', ids, now });
}

function randomNode(rng: Rng, ids: IdGenerator): Node {
  const kind = rng.int(4);
  let node: Node;
  if (kind === 0) node = createRect(ids, 10 + rng.int(200), 10 + rng.int(200), rng.int(8));
  else if (kind === 1) node = createEllipse(ids, 10 + rng.int(200), 10 + rng.int(200));
  else if (kind === 2) {
    node = createPath(
      ids,
      [
        { p: { x: rng.num(), y: rng.num() }, in: null, out: { x: rng.num(), y: rng.num() }, kind: 'smooth' },
        { p: { x: rng.num(), y: rng.num() }, in: { x: rng.num(), y: rng.num() }, out: null, kind: 'corner' },
      ],
      rng.chance(0.5),
    );
  } else {
    node = createGroup(ids, [createRect(ids, 20, 20), createEllipse(ids, 30, 30)]);
  }
  node.transform = translation(rng.num(300), rng.num(300));
  return node;
}

function allNodes(space: Space): Node[] {
  return space.layers.flatMap((l) => [...walkNodes(l.children)]);
}

function pickSome<T>(rng: Rng, items: readonly T[], max = 3): T[] {
  const count = Math.min(items.length, 1 + rng.int(max));
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(pool.splice(rng.int(pool.length), 1)[0] as T);
  return out;
}

/** A random, mostly valid command for the current document (some are deliberate no-ops). */
export function randomCommand(rng: Rng, doc: Document, ids: IdGenerator, withMerge = true): Command {
  const space = rng.pick(doc.spaces);
  const nodes = allNodes(space);
  const mergeKey = withMerge && rng.chance(0.3) ? 'drag' : undefined;
  const weighted: Array<[number, () => Command]> = [
    [3, () => addSpace(createSpace(ids, { name: `S${rng.int(99)}`, order: doc.spaces.length, artboards: [createArtboard(ids, { name: 'B', w: 100, h: 100 })], layers: [createLayer(ids, 'L')] }))],
    [2, () => removeSpace(rng.pick(doc.spaces).id)],
    [2, () => renameSpace(space.id, `Name ${rng.int(1000)}`)],
    [2, () => setSpaceColor(space.id, rng.pick(SPACE_COLORS))],
    [1, () => setSpaceExcluded(space.id, rng.chance(0.5))],
    [2, () => reorderSpace(space.id, rng.int(doc.spaces.length))],
    [2, () => addSpace(cloneSpace(space, ids, `${space.name} copy`, doc.spaces.length))],
    [2, () => addArtboard(space.id, createArtboard(ids, { name: 'AB', x: rng.num(), y: rng.num(), w: 50 + rng.int(300), h: 50 + rng.int(300) }), rng.int(space.artboards.length + 1))],
    [1, () => removeArtboard(space.id, rng.pick(space.artboards).id)],
    [3, () => updateArtboard(space.id, rng.pick(space.artboards).id, { x: rng.num(), y: rng.num() }, mergeKey)],
    [1, () => reorderArtboard(space.id, rng.pick(space.artboards).id, rng.int(space.artboards.length))],
    [2, () => addLayer(space.id, createLayer(ids, 'Layer'), rng.int(space.layers.length + 1))],
    [1, () => removeLayer(space.id, rng.pick(space.layers).id)],
    [2, () => updateLayer(space.id, rng.pick(space.layers).id, { visible: rng.chance(0.5), locked: rng.chance(0.3), name: `Layer ${rng.int(50)}` })],
    [1, () => reorderLayer(space.id, rng.pick(space.layers).id, rng.int(space.layers.length))],
    [8, () => addNode(space.id, rng.pick(space.layers).id, randomNode(rng, ids))],
    [2, () => (nodes.length ? removeNodes(space.id, pickSome(rng, nodes).map((n) => n.id)) : renameDocument('x'))],
    [6, () => (nodes.length ? transformNodes(space.id, pickSome(rng, nodes).map((n) => n.id), translation(rng.num(40), rng.num(40)), mergeKey) : renameDocument('y'))],
    [1, () => (nodes.length ? transformNodes(space.id, pickSome(rng, nodes).map((n) => n.id), rotation(rng.num(3)), undefined) : renameDocument('r'))],
    [1, () => (nodes.length ? transformNodes(space.id, pickSome(rng, nodes).map((n) => n.id), scaling(1 + rng.int(3), 1 + rng.int(3))) : renameDocument('s'))],
    [3, () => (nodes.length ? setNodeProps(space.id, pickSome(rng, nodes).map((n) => n.id), { opacity: rng.int(100) / 100, visible: rng.chance(0.8), name: `n${rng.int(99)}` }, mergeKey) : renameDocument('z'))],
    [2, () => (nodes.length ? arrangeNodes(space.id, pickSome(rng, nodes).map((n) => n.id), rng.pick(['front', 'back', 'forward', 'backward'] as const)) : renameDocument('a'))],
    [2, () => (nodes.length ? groupNodes(space.id, pickSome(rng, nodes, 2).map((n) => n.id), createGroup(ids, [])) : renameDocument('g'))],
    [2, () => {
      const groups = nodes.filter((n) => n.type === 'group');
      return groups.length ? ungroupNode(space.id, rng.pick(groups).id) : renameDocument('u');
    }],
    [2, () => (nodes.length ? moveNodesToLayer(space.id, pickSome(rng, nodes).map((n) => n.id), rng.pick(space.layers).id) : renameDocument('m'))],
    [2, () => {
      const other = rng.pick(doc.spaces);
      return nodes.length ? moveNodesToSpace(space.id, pickSome(rng, nodes).map((n) => n.id), other.id, rng.pick(other.layers).id) : renameDocument('t');
    }],
    [1, () => addGuide(space.id, { id: ids(), orientation: rng.chance(0.5) ? 'horizontal' : 'vertical', position: rng.num(), locked: false })],
    [1, () => (space.guides.length ? moveGuide(space.id, rng.pick(space.guides).id, rng.num()) : renameDocument('q'))],
    [2, () => addSwatch({ id: ids(), name: `sw${rng.int(99)}`, color: { model: 'rgb', values: [rng.int(256), rng.int(256), rng.int(256)] }, global: rng.chance(0.5) })],
    [1, () => (doc.resources.swatches.length ? removeSwatch(rng.pick(doc.resources.swatches).id) : renameDocument('w'))],
    [1, () => (doc.resources.swatches.length ? updateSwatch(rng.pick(doc.resources.swatches).id, { name: `up${rng.int(99)}` }) : renameDocument('v'))],
    [1, () => renameDocument(`Doc ${rng.int(1000)}`)],
    [1, () => setUnits(rng.pick(['px', 'mm', 'cm', 'pt', 'in'] as const))],
  ];
  const total = weighted.reduce((sum, [w]) => sum + w, 0);
  let roll = rng.int(total);
  for (const [weight, make] of weighted) {
    if (roll < weight) return make();
    roll -= weight;
  }
  return renameDocument('fallback');
}

export { sequentialIds };
