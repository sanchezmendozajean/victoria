import { describe, expect, it } from 'vitest';
import { addNode, convertShapeToPath, duplicateNodes, groupNodes, setPathAnchors } from '../commands';
import { DocumentSession } from '../commands/session';
import { cloneNodes } from '../model/clone';
import { createEllipse, createGroup, createLayer, createPath, createRect, createSpace } from '../model/factory';
import { sequentialIds } from '../model/ids';
import { applyToPoint, rotation, translation } from '../model/matrix';
import { getActiveSpace, locateNode } from '../model/queries';
import { reflectAbout, rotateAbout, scaleAbout, toDegrees, toRadians } from '../model/transforms';
import type { Anchor, CompoundNode, Node, PathNode, Vec2 } from '../model/types';
import { addAnchors, hasAnchorSelection, pruneSelection, selectedAnchorIndices, selectOnly, toggleAnchor, withAnchors } from '../selection/selection';
import { sampleDocument } from '../testing/random-ops';
import { hitTest, selectionTarget } from './hit-test';
import { anchorsInPolygon, anchorsInRect, marqueeTargets, pointInPolygon } from './marquee';
import { frameOf, nodeWorldBounds, pathFrameOf, pathsOfNodes, selectionBounds } from './world';

const ids = sequentialIds('p4');
const pt = (x: number, y: number): Vec2 => ({ x, y });
const corner = (x: number, y: number): Anchor => ({ p: pt(x, y), in: null, out: null, kind: 'corner' });

const filled = <T extends Node>(node: T, stroke: number | null = null): T => {
  node.appearance.items = node.appearance.items.filter((i) => i.kind === 'fill' || stroke !== null);
  for (const i of node.appearance.items) if (i.kind === 'stroke' && stroke !== null) i.stroke.width = stroke;
  return node;
};
const box = (x: number, y: number, w = 100, h = 50) => {
  const r = filled(createRect(ids, w, h));
  r.transform = translation(x, y);
  return r;
};
function spaceWith(...children: Node[]) {
  const layer = createLayer(ids, 'L');
  layer.children.push(...children);
  return createSpace(ids, { name: 'S', layers: [layer] });
}

describe('transform helpers', () => {
  it('rotate and scale act around a centre', () => {
    const c = pt(100, 100);
    const r = applyToPoint(rotateAbout(Math.PI / 2, c), pt(150, 100));
    expect(r.x).toBeCloseTo(100, 9);
    expect(r.y).toBeCloseTo(150, 9); // clockwise on screen
    const s = applyToPoint(scaleAbout(2, 3, c), pt(110, 110));
    expect(s).toEqual(pt(120, 130));
    expect(applyToPoint(scaleAbout(2, 2, c), c)).toEqual(c);
  });

  it('reflect mirrors across the line through the centre', () => {
    const horizontal = applyToPoint(reflectAbout(0, pt(0, 50)), pt(30, 80));
    expect(horizontal.x).toBeCloseTo(30, 9);
    expect(horizontal.y).toBeCloseTo(20, 9);
    const vertical = applyToPoint(reflectAbout(Math.PI / 2, pt(50, 0)), pt(80, 30));
    expect(vertical.x).toBeCloseTo(20, 9);
    expect(vertical.y).toBeCloseTo(30, 9);
    const diagonal = applyToPoint(reflectAbout(Math.PI / 4, pt(0, 0)), pt(10, 0));
    expect(diagonal.x).toBeCloseTo(0, 9);
    expect(diagonal.y).toBeCloseTo(10, 9);
  });

  it('converts angles', () => {
    expect(toDegrees(toRadians(37))).toBeCloseTo(37, 9);
  });
});

describe('frames and bounds', () => {
  it('finds nodes in groups with their world matrix and ancestors', () => {
    const inner = box(10, 10);
    const group = createGroup(ids, [inner]);
    group.transform = translation(100, 200);
    const space = spaceWith(group);
    const frame = frameOf(space, inner.id)!;
    expect(frame.ancestors.map((n) => n.id)).toEqual([group.id]);
    expect(applyToPoint(frame.world, pt(0, 0))).toEqual(pt(110, 210));
    expect(frameOf(space, 'ghost')).toBeNull();
  });

  it('selection bounds are geometric (no stroke) by default, visible with `stroke`', () => {
    const r = filled(createRect(ids, 100, 50), 10);
    r.transform = translation(100, 100);
    const space = spaceWith(r);
    expect(nodeWorldBounds(space, r.id)).toEqual({ minX: 100, minY: 100, maxX: 200, maxY: 150 });
    expect(nodeWorldBounds(space, r.id, { stroke: true })!.minX).toBeLessThan(100);
  });

  it('unites several objects, also inside groups', () => {
    const a = box(0, 0, 10, 10);
    const b = box(50, 60, 10, 10);
    const group = createGroup(ids, [b]);
    group.transform = translation(100, 0);
    expect(selectionBounds(spaceWith(a, group), [a.id, group.id])).toEqual({ minX: 0, minY: 0, maxX: 160, maxY: 70 });
    expect(selectionBounds(spaceWith(a), [])).toBeNull();
  });

  it('a rotated object has the axis-aligned bounds of its rotated shape', () => {
    const r = box(0, 0, 100, 100);
    r.transform = rotation(Math.PI / 4);
    const b = nodeWorldBounds(spaceWith(r), r.id)!;
    expect(b.maxX - b.minX).toBeCloseTo(141.42, 1);
  });

  it('finds paths and compound sub-paths with the frame of their owner', () => {
    const sub = createPath(ids, [corner(0, 0), corner(10, 0), corner(10, 10)], true) as PathNode;
    const compound = { ...createRect(ids, 1, 1), type: 'compound', fillRule: 'evenodd', children: [sub] } as unknown as CompoundNode;
    compound.transform = translation(5, 5);
    const standalone = createPath(ids, [corner(0, 0), corner(1, 1)], false) as PathNode;
    const space = spaceWith(compound, standalone);
    expect(pathFrameOf(space, sub.id)?.owner.id).toBe(compound.id);
    expect(applyToPoint(pathFrameOf(space, sub.id)!.world, pt(0, 0))).toEqual(pt(5, 5));
    expect(pathFrameOf(space, standalone.id)?.owner.id).toBe(standalone.id);
    expect(pathFrameOf(space, 'ghost')).toBeNull();
    expect(pathsOfNodes(space, [compound.id, standalone.id]).map((f) => f.path.id)).toEqual([sub.id, standalone.id]);
    expect(pathsOfNodes(spaceWith(createGroup(ids, [standalone])), [])).toEqual([]);
  });
});

describe('marquee', () => {
  const rectOf = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

  it('touch mode picks everything the marquee touches, in paint order', () => {
    const a = box(0, 0, 100, 100);
    const b = box(200, 0, 100, 100);
    const c = box(500, 500, 10, 10);
    const space = spaceWith(a, b, c);
    expect(marqueeTargets(space, rectOf(90, 10, 210, 20)).map((n) => n.id)).toEqual([a.id, b.id]);
    expect(marqueeTargets(space, rectOf(-10, -10, 5, 5)).map((n) => n.id)).toEqual([a.id]);
    expect(marqueeTargets(space, rectOf(1000, 1000, 1100, 1100))).toEqual([]);
  });

  it('a marquee fully inside a filled shape touches it, but not inside the hole of an unfilled one', () => {
    const solid = box(0, 0, 200, 200);
    expect(marqueeTargets(spaceWith(solid), rectOf(50, 50, 60, 60)).map((n) => n.id)).toEqual([solid.id]);
    const outline = filled(createRect(ids, 200, 200), 1);
    outline.appearance.items = outline.appearance.items.filter((i) => i.kind === 'stroke');
    expect(marqueeTargets(spaceWith(outline), rectOf(50, 50, 60, 60))).toEqual([]);
  });

  it('contain mode needs the object fully inside', () => {
    const a = box(10, 10, 20, 20);
    const b = box(100, 10, 20, 20);
    const space = spaceWith(a, b);
    expect(marqueeTargets(space, rectOf(0, 0, 50, 50), { mode: 'contain' }).map((n) => n.id)).toEqual([a.id]);
    expect(marqueeTargets(space, rectOf(0, 0, 110, 50), { mode: 'contain' }).map((n) => n.id)).toEqual([a.id]);
    expect(marqueeTargets(space, rectOf(0, 0, 150, 50), { mode: 'contain' }).map((n) => n.id)).toEqual([a.id, b.id]);
  });

  it('selects the whole group, or the child while that group is isolated', () => {
    const inner = box(0, 0, 50, 50);
    const sibling = box(100, 0, 50, 50);
    const group = createGroup(ids, [inner, sibling]);
    const space = spaceWith(group);
    expect(marqueeTargets(space, rectOf(10, 10, 20, 20)).map((n) => n.id)).toEqual([group.id]);
    expect(marqueeTargets(space, rectOf(10, 10, 20, 20), { isolation: group.id }).map((n) => n.id)).toEqual([inner.id]);
    expect(marqueeTargets(spaceWith(box(0, 0), group), rectOf(10, 10, 20, 20), { isolation: group.id }).map((n) => n.id)).toEqual([inner.id]);
  });

  it('skips locked and hidden objects', () => {
    const locked = box(0, 0);
    locked.locked = true;
    const hidden = box(0, 0);
    hidden.visible = false;
    const space = spaceWith(locked, hidden);
    expect(marqueeTargets(space, rectOf(0, 0, 10, 10))).toEqual([]);
    expect(marqueeTargets(space, rectOf(0, 0, 10, 10), { includeLocked: true }).map((n) => n.id)).toEqual([locked.id]);
  });

  it('finds anchors in a rectangle and in a lasso polygon, through the owner transform', () => {
    const path = createPath(ids, [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)], true) as PathNode;
    path.transform = translation(10, 10);
    const space = spaceWith(path);
    expect(anchorsInRect(space, [path.id], rectOf(105, 5, 115, 15)).map((a) => [a.index, a.position])).toEqual([[1, pt(110, 10)]]);
    const lasso = [pt(0, 0), pt(120, 0), pt(120, 60), pt(0, 60)];
    expect(anchorsInPolygon(space, [path.id], lasso).map((a) => a.index)).toEqual([0, 1]);
    expect(pointInPolygon(pt(5, 5), lasso)).toBe(true);
    expect(pointInPolygon(pt(500, 5), lasso)).toBe(false);
  });
});

describe('isolation in hit testing', () => {
  it('only objects inside the isolated group can be hit, and the target is its child', () => {
    const inner = box(0, 0, 50, 50);
    const group = createGroup(ids, [inner]);
    const other = box(200, 0, 50, 50);
    const space = spaceWith(group, other);
    expect(hitTest(space, pt(225, 25), { tolerance: 1, isolation: group.id })).toEqual([]);
    const hit = hitTest(space, pt(25, 25), { tolerance: 1, isolation: group.id })[0]!;
    expect(selectionTarget(hit, group.id)?.id).toBe(inner.id);
    expect(selectionTarget(hit)?.id).toBe(group.id);
    const outside = hitTest(space, pt(225, 25), { tolerance: 1 })[0]!;
    expect(selectionTarget(outside, group.id)).toBeNull();
  });
});

describe('anchor selection', () => {
  const base = () => selectOnly('s', ['a']);

  it('toggles, adds and cleans anchor indices', () => {
    let sel = withAnchors(base(), { p: [2, 0, 2] });
    expect(selectedAnchorIndices(sel, 'p')).toEqual([0, 2]);
    sel = toggleAnchor(sel, 'p', 1);
    expect(selectedAnchorIndices(sel, 'p')).toEqual([0, 1, 2]);
    sel = toggleAnchor(sel, 'p', 0);
    expect(selectedAnchorIndices(sel, 'p')).toEqual([1, 2]);
    sel = addAnchors(sel, 'p', [5]);
    expect(selectedAnchorIndices(sel, 'p')).toEqual([1, 2, 5]);
    expect(hasAnchorSelection(sel)).toBe(true);
    expect(hasAnchorSelection(withAnchors(sel, { p: [] }))).toBe(false);
  });

  it('is pruned when a path loses anchors or disappears', () => {
    const path = createPath(ids, [corner(0, 0), corner(10, 0), corner(10, 10)], true) as PathNode;
    const doc = sampleDocument(ids);
    const session = new DocumentSession(doc, { ids });
    const space = getActiveSpace(session.document);
    session.run(addNode(space.id, space.layers[0]!.id, path));
    const sel = withAnchors(selectOnly(space.id, [path.id]), { [path.id]: [0, 2, 7] });
    expect(pruneSelection(session.document, sel).anchors).toEqual({ [path.id]: [0, 2] });
    session.run(setPathAnchors(space.id, path.id, [corner(0, 0), corner(1, 1)]));
    expect(pruneSelection(session.document, sel).anchors).toEqual({ [path.id]: [0] });
    expect(pruneSelection(session.document, withAnchors(selectOnly(space.id, []), { ghost: [0] })).anchors).toBeUndefined();
  });
});

describe('Phase 4 commands', () => {
  function setup() {
    const session = new DocumentSession(sampleDocument(ids), { ids });
    const space = getActiveSpace(session.document);
    const layerId = space.layers[0]!.id;
    return { session, spaceId: space.id, layerId, space: () => getActiveSpace(session.document) };
  }

  it('setPathAnchors edits a path and a compound sub-path, merging a drag into one step', () => {
    const { session, spaceId, layerId, space } = setup();
    const path = createPath(ids, [corner(0, 0), corner(10, 0)], false) as PathNode;
    const sub = createPath(ids, [corner(0, 0), corner(5, 5), corner(0, 5)], true) as PathNode;
    const compound = { ...createRect(ids, 1, 1), type: 'compound', fillRule: 'evenodd', children: [sub] } as unknown as CompoundNode;
    session.run(addNode(spaceId, layerId, path));
    session.run(addNode(spaceId, layerId, compound));
    const steps = session.historyLength;
    for (let i = 1; i <= 5; i++) session.run(setPathAnchors(spaceId, path.id, [corner(0, 0), corner(10 + i, 0)], 'drag-1'));
    expect(session.historyLength).toBe(steps + 1);
    expect((locateNode(space(), path.id)!.node as PathNode).anchors[1]!.p.x).toBe(15);
    session.run(setPathAnchors(spaceId, sub.id, [corner(1, 1), corner(2, 2), corner(3, 3)]));
    expect(pathFrameOf(space(), sub.id)!.path.anchors[2]!.p).toEqual(pt(3, 3));
    session.undo();
    expect(pathFrameOf(space(), sub.id)!.path.anchors[2]!.p).toEqual(pt(0, 5));
  });

  it('converts a live shape to a path keeping id, transform and appearance', () => {
    const { session, spaceId, layerId, space } = setup();
    const rect = createRect(ids, 100, 50, 10);
    rect.transform = translation(30, 40);
    rect.name = 'Caja';
    session.run(addNode(spaceId, layerId, rect));
    session.run(convertShapeToPath(spaceId, rect.id));
    const node = locateNode(space(), rect.id)!.node as PathNode;
    expect(node.type).toBe('path');
    expect(node.closed).toBe(true);
    expect(node.anchors).toHaveLength(8); // four rounded corners
    expect(node.transform).toEqual(translation(30, 40));
    expect(node.name).toBe('Caja');
    expect(node.appearance).toEqual(rect.appearance);
    expect('shape' in node).toBe(false);
    session.undo();
    expect(locateNode(space(), rect.id)!.node.type).toBe('shape');
    expect(session.run(convertShapeToPath(spaceId, 'ghost'))).toBe(false);
    session.run(addNode(spaceId, layerId, createEllipse(ids, 10, 10)));
  });

  it('duplicates objects above their originals with the move applied, in one step', () => {
    const { session, spaceId, layerId, space } = setup();
    const a = createRect(ids, 10, 10);
    const b = createRect(ids, 10, 10);
    session.run(addNode(spaceId, layerId, a));
    session.run(addNode(spaceId, layerId, b));
    const clones = cloneNodes([a], ids);
    const steps = session.historyLength;
    session.run(duplicateNodes(spaceId, [a.id], clones, translation(40, 0)));
    expect(session.historyLength).toBe(steps + 1);
    const order = space().layers[0]!.children.map((c) => c.id);
    expect(order).toEqual([a.id, clones[0]!.id, b.id]);
    expect(locateNode(space(), clones[0]!.id)!.node.transform).toEqual(translation(40, 0));
    expect(locateNode(space(), a.id)!.node.transform).toEqual(translation(0, 0));
    expect(clones[0]!.id).not.toBe(a.id);
  });

  it('duplicates objects inside groups next to their originals', () => {
    const { session, spaceId, layerId, space } = setup();
    const inner = createRect(ids, 10, 10);
    const group = createGroup(ids, []);
    session.run(addNode(spaceId, layerId, inner));
    session.run(groupNodes(spaceId, [inner.id], group));
    const clones = cloneNodes([inner], ids);
    session.run(duplicateNodes(spaceId, [inner.id], clones));
    const g = locateNode(space(), group.id)!.node;
    expect(g.type === 'group' && g.children.map((c) => c.id)).toEqual([inner.id, clones[0]!.id]);
  });

  it('rollback undoes the last step without leaving a redo (cancelled preview)', () => {
    const { session, spaceId, layerId } = setup();
    session.run(addNode(spaceId, layerId, createRect(ids, 10, 10)));
    session.run(addNode(spaceId, layerId, createRect(ids, 10, 10)));
    expect(session.rollback()).toBe(true);
    expect(session.canRedo).toBe(false);
    expect(session.historyLength).toBe(1);
    expect(session.rollback()).toBe(true);
    expect(session.rollback()).toBe(false);
  });
});
