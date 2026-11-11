import { describe, expect, it } from 'vitest';
import { addNode, setBlendOptions, hitTest, removeNodes, selectionTarget, setNodeAppearance, transformNodes, blendableCount, cloneNodes, createDocument, createEllipse, createRect, DocumentSession, expandBlends, getActiveSpace, isBlendGroup, makeBlend, releaseBlends, sequentialIds, setBlendSteps, translation, type GroupNode, type Node, type PathNode } from '..';

function setup() {
  const ids = sequentialIds('b');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 100 });
  const space = () => getActiveSpace(session.document);
  const add = <T extends Node>(node: T, x: number, y: number, rgb: number[], width = 1): T => {
    node.transform = translation(x, y);
    node.appearance = { items: [{ kind: 'fill', paint: { type: 'solid', color: { model: 'rgb', values: rgb } }, opacity: 1, modifiers: [] }, { kind: 'stroke', paint: { type: 'none' }, stroke: { width, cap: 'butt', join: 'miter', miterLimit: 10, align: 'center', dash: null, dashAlignToCorners: false, arrowScale: [100, 100] }, opacity: 1, modifiers: [] }] };
    session.run(addNode(space().id, space().layers[0]!.id, node));
    return node;
  };
  const children = () => space().layers[0]!.children as Node[];
  return { ids, session, space, add, children };
}

const fillValues = (n: Node) => {
  const fill = n.appearance.items.find((i) => i.kind === 'fill');
  return fill && fill.kind === 'fill' && fill.paint.type === 'solid' ? fill.paint.color.values : null;
};
const xs = (n: Node) => (n.type === 'path' ? n.anchors.map((a) => a.p.x) : []);

describe('Mezcla (Alt+Ctrl+B)', () => {
  it('Create makes one group: key objects at both ends and N steps between, in one undo step', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [255, 0, 0], 2);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [0, 0, 255], 6);
    const before = t.session.historyLength;
    const result = makeBlend(t.space(), [a.id, b.id], 3, t.ids)!;
    expect(result).not.toBeNull();
    t.session.run(result.command);
    expect(t.session.historyLength).toBe(before + 1);
    expect(t.children()).toHaveLength(1);
    const group = t.children()[0] as GroupNode;
    expect(isBlendGroup(group)).toBe(true);
    expect(group.id).toBe(result.resultIds[0]);
    expect(group.children).toHaveLength(5);
    expect(group.blend).toMatchObject({ steps: 3, keys: [group.children[0]!.id, group.children[4]!.id] });
    // Position and colour go evenly from one end to the other (t = 1/4, 2/4, 3/4).
    expect(Math.min(...xs(group.children[1]!))).toBeCloseTo(25);
    expect(Math.min(...xs(group.children[2]!))).toBeCloseTo(50);
    expect(Math.min(...xs(group.children[4]!))).toBeCloseTo(100);
    expect(fillValues(group.children[2]!)).toEqual([127.5, 0, 127.5]);
    const stroke = group.children[2]!.appearance.items[1]!;
    expect(stroke.kind === 'stroke' && stroke.stroke.width).toBe(4);
    t.session.undo();
    expect(t.children().map((n) => n.id)).toEqual([a.id, b.id]);
  });

  it('blends different shapes (rectangle and ellipse) into closed paths with matching anchors', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 40, 40), 0, 0, [0, 0, 0]);
    const b = t.add(createEllipse(t.ids, 40, 40), 100, 0, [0, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 2, t.ids)!.command);
    const group = t.children()[0] as GroupNode;
    const mids = group.children.slice(1, 3) as PathNode[];
    for (const mid of mids) {
      expect(mid.type).toBe('path');
      expect(mid.closed).toBe(true);
      expect(mid.anchors.length).toBe(4);
      for (const anchor of mid.anchors) expect(Number.isFinite(anchor.p.x + anchor.p.y)).toBe(true);
    }
  });

  it('needs two blendable objects; text, images and groups are ignored', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [0, 0, 0]);
    expect(blendableCount(t.space(), [a.id])).toBe(1);
    expect(makeBlend(t.space(), [a.id], 5, t.ids)).toBeNull();
  });

  it('three objects chain: steps between each consecutive pair', () => {
    const t = setup();
    const ids = [0, 100, 200].map((x) => t.add(createRect(t.ids, 10, 10), x, 0, [0, 0, 0]).id);
    t.session.run(makeBlend(t.space(), ids, 2, t.ids)!.command);
    const group = t.children()[0] as GroupNode;
    expect(group.children).toHaveLength(3 + 2 * 2);
    expect(group.blend?.keys).toHaveLength(3);
  });

  it('Options changes the number of steps and keeps the group id; one undo step', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [0, 0, 0]);
    const made = makeBlend(t.space(), [a.id, b.id], 2, t.ids)!;
    t.session.run(made.command);
    const groupId = made.resultIds[0]!;
    const command = setBlendSteps(t.space(), [groupId], 6, t.ids)!;
    t.session.run(command);
    const group = t.children()[0] as GroupNode;
    expect(group.id).toBe(groupId);
    expect(group.children).toHaveLength(8);
    expect(group.blend?.steps).toBe(6);
    t.session.undo();
    expect((t.children()[0] as GroupNode).children).toHaveLength(4);
    expect(setBlendSteps(t.space(), [a.id], 6, t.ids)).toBeNull();
  });

  it('Expand keeps every object but drops the live link; Release gives back the two originals', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [255, 0, 0]);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [0, 0, 255]);
    const made = makeBlend(t.space(), [a.id, b.id], 3, t.ids)!;
    t.session.run(made.command);

    const expanded = expandBlends(t.space(), made.resultIds)!;
    t.session.run(expanded.command);
    const group = t.children()[0] as GroupNode;
    expect(group.blend).toBeUndefined();
    expect(group.children).toHaveLength(5);
    expect(releaseBlends(t.space(), made.resultIds)).toBeNull();
    t.session.undo();

    const released = releaseBlends(t.space(), made.resultIds)!;
    t.session.run(released.command);
    expect(t.children().map((n) => n.type)).toEqual(['path', 'path']);
    expect(t.children().map((n) => n.id)).toEqual(released.resultIds);
    expect(fillValues(t.children()[0]!)).toEqual([255, 0, 0]);
    expect(Math.min(...xs(t.children()[1]!))).toBe(100);
  });

  it('copies of a blend keep pointing at their own key objects', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [0, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 1, t.ids)!.command);
    const [copy] = cloneNodes([t.children()[0] as GroupNode], t.ids);
    expect(copy!.blend!.keys.every((k) => copy!.children.some((c) => c.id === k))).toBe(true);
    expect(copy!.blend!.keys).not.toEqual((t.children()[0] as GroupNode).blend!.keys);
  });
});

describe('Mezcla viva: reacciona a sus objetos clave', () => {
  const setX = (t: ReturnType<typeof setup>, id: string, dx: number) => t.session.run(transformNodes(t.space().id, [id], translation(dx, 0)));

  it('moving a key object regenerates the steps in the same undo step', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [0, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 1, t.ids)!.command);
    const group = () => t.children()[0] as GroupNode;
    const [keyA, mid, keyB] = group().children as PathNode[];
    expect(Math.min(...xs(mid!))).toBeCloseTo(50);
    const before = t.session.historyLength;
    setX(t, keyB!.id, 100);
    expect(t.session.historyLength).toBe(before + 1);
    expect(group().children).toHaveLength(3);
    expect(Math.min(...xs(group().children[1]!))).toBeCloseTo(100); // halfway between 0 and 200
    expect(group().children[1]!.id).toBe(mid!.id); // steps keep their ids
    expect(group().blend!.keys).toEqual([keyA!.id, keyB!.id]);
    t.session.undo();
    expect(Math.min(...xs(group().children[1]!))).toBeCloseTo(50);
  });

  it('recolouring a key object recolours the steps, and the group can be moved without touching the steps', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [200, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 1, t.ids)!.command);
    const group = () => t.children()[0] as GroupNode;
    expect(fillValues(group().children[1]!)).toEqual([100, 0, 0]);
    const keyB = group().children[2]!;
    t.session.run(setNodeAppearance(t.space().id, keyB.id, { items: [{ kind: 'fill', paint: { type: 'solid', color: { model: 'rgb', values: [0, 200, 0] } }, opacity: 1, modifiers: [] }, keyB.appearance.items[1]!] }));
    expect(fillValues(group().children[1]!)).toEqual([0, 100, 0]);
    const sig = group().blend!.sig;
    t.session.run(transformNodes(t.space().id, [group().id], translation(500, 0)));
    expect(group().blend!.sig).toBe(sig);
  });

  it('deleting a key object leaves a plain group with the remaining key', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [0, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 2, t.ids)!.command);
    const group = () => t.children()[0] as GroupNode;
    t.session.run(removeNodes(t.space().id, [group().children[3]!.id]));
    expect(group().blend).toBeUndefined();
    expect(group().children).toHaveLength(1);
  });

  it('the generated steps cannot be picked on their own, but picking one picks the blend', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 20, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 20, 20), 100, 0, [0, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 1, t.ids)!.command);
    const group = t.children()[0] as GroupNode;
    const middle = { x: 60, y: 10 };
    const hit = hitTest(t.space(), middle, { tolerance: 1 })[0]!;
    expect(hit.generated).toBe(true);
    expect(selectionTarget(hit)!.id).toBe(group.id);
    expect(hitTest(t.space(), middle, { tolerance: 1, isolation: group.id })).toHaveLength(0);
    const keyHit = hitTest(t.space(), { x: 10, y: 10 }, { tolerance: 1, isolation: group.id })[0]!;
    expect(keyHit.id).toBe(group.blend!.keys[0]);
  });
});

describe('Mezcla equidistante', () => {
  const gaps = (group: GroupNode) => {
    const boxes = group.children.map((n) => {
      const x = xs(n);
      return { min: Math.min(...x), max: Math.max(...x) };
    });
    return boxes.slice(1).map((b, i) => b.min - boxes[i]!.max);
  };

  it('leaves the same gap between neighbouring objects even when they grow', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 10, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 70, 20), 300, 0, [0, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 4, t.ids, true)!.command);
    const group = t.children()[0] as GroupNode;
    expect(group.blend!.equidistant).toBe(true);
    const g = gaps(group);
    expect(g).toHaveLength(5);
    for (const gap of g) expect(gap).toBeCloseTo(g[0]!, 6);
    expect(g[0]!).toBeGreaterThan(0);
    // Equal interpolation steps would not give equal gaps here.
    t.session.run(setBlendOptions(t.space(), [group.id], { equidistant: false }, t.ids)!);
    const plain = gaps(t.children()[0] as GroupNode);
    expect(Math.abs(plain[0]! - plain[4]!)).toBeGreaterThan(1);
  });

  it('turning it on later regenerates the steps and undoes', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 10, 20), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 70, 20), 300, 0, [0, 0, 0]);
    const made = makeBlend(t.space(), [a.id, b.id], 3, t.ids)!;
    t.session.run(made.command);
    t.session.run(setBlendOptions(t.space(), made.resultIds, { equidistant: true }, t.ids)!);
    const g = gaps(t.children()[0] as GroupNode);
    for (const gap of g) expect(gap).toBeCloseTo(g[0]!, 6);
    t.session.undo();
    expect((t.children()[0] as GroupNode).blend!.equidistant).toBeUndefined();
  });

  it('falls back to equal steps when the objects share a centre', () => {
    const t = setup();
    const a = t.add(createRect(t.ids, 10, 10), 0, 0, [0, 0, 0]);
    const b = t.add(createRect(t.ids, 30, 30), -10, -10, [0, 0, 0]);
    t.session.run(makeBlend(t.space(), [a.id, b.id], 2, t.ids, true)!.command);
    expect((t.children()[0] as GroupNode).children).toHaveLength(4);
  });
});
