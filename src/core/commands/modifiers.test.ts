import { describe, expect, it } from 'vitest';
import {
  addModifier,
  addNode,
  boundsInParent,
  createDocument,
  createRect,
  defaultParams,
  DocumentSession,
  duplicateModifier,
  evaluateNode,
  expandModifiers,
  geometricBoundsInParent,
  getActiveSpace,
  hitTest,
  makeLivePathfinder,
  moveModifier,
  newModifier,
  removeModifier,
  renderGeometry,
  sequentialIds,
  translation,
  updateModifier,
  type GroupNode,
  type Node,
  type PathNode,
} from '..';

function setup() {
  const ids = sequentialIds('m');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 100 });
  const space = () => getActiveSpace(session.document);
  const rect = (x: number, y: number, w = 100, h = 100) => {
    const node = createRect(ids, w, h);
    node.transform = translation(x, y);
    session.run(addNode(space().id, space().layers[0]!.id, node));
    return node;
  };
  const get = (id: string) => space().layers[0]!.children.find((c) => c.id === id) as Node;
  const add = (node: Node, modifierId: string, params = {}) => {
    const mod = newModifier(ids, modifierId, { ...defaultParams(modifierId), ...params });
    session.run(addModifier(space().id, [{ nodeId: node.id, mod }]));
    return mod;
  };
  return { ids, session, space, rect, get, add };
}

describe('modifier commands', () => {
  it('adding a modifier changes what is painted and picked, in one undo step', () => {
    const t = setup();
    const r = t.rect(0, 0);
    expect(evaluateNode(t.get(r.id))).toBeNull();
    const before = t.session.historyLength;
    t.add(r, 'offset-path', { offset: 20, join: 'miter' });
    expect(t.session.historyLength).toBe(before + 1);
    const g = renderGeometry(t.get(r.id))!;
    expect(g.subpaths).toHaveLength(1);
    // Painted and picked 20 pt beyond the original square...
    const hits = hitTest(t.space(), { x: -15, y: 50 }, { tolerance: 1 });
    expect(hits.map((h) => h.id)).toContain(r.id);
    // ...while the bounding box shown with the selection stays on the original contour.
    expect(geometricBoundsInParent(t.get(r.id))).toMatchObject({ minX: 0, maxX: 100 });
    expect(boundsInParent(t.get(r.id))!.minX).toBeLessThan(-20);
    t.session.undo();
    expect(evaluateNode(t.get(r.id))).toBeNull();
    expect(hitTest(t.space(), { x: -15, y: 50 }, { tolerance: 1 })).toHaveLength(0);
  });

  it('editing parameters merges a drag into one step; switching a modifier off removes its effect', () => {
    const t = setup();
    const r = t.rect(0, 0);
    const mod = t.add(r, 'offset-path', { offset: 5 });
    const before = t.session.historyLength;
    for (const v of [6, 8, 12]) t.session.run(updateModifier(t.space().id, r.id, mod.id, { params: { offset: v } }, 'drag1'));
    expect(t.session.historyLength).toBe(before + 1);
    expect(boundsInParent(t.get(r.id))!.minX).toBeLessThan(-11);
    t.session.run(updateModifier(t.space().id, r.id, mod.id, { enabled: false }));
    expect(evaluateNode(t.get(r.id))).toBeNull();
  });

  it('the order of modifiers matters: moving one changes the result', () => {
    const t = setup();
    const r = t.rect(0, 0);
    const a = t.add(r, 'transform', { scaleX: 200, scaleY: 100 });
    const b = t.add(r, 'offset-path', { offset: 10, join: 'miter' });
    const first = JSON.stringify(evaluateNode(t.get(r.id))!.geometry);
    t.session.run(moveModifier(t.space().id, r.id, b.id, { zone: 'object' }, 0));
    const items = t.get(r.id).appearance.items;
    const at = (id: string) => items.findIndex((i) => i.kind === 'modifier' && i.mod.id === id);
    expect(at(b.id)).toBeLessThan(at(a.id));
    expect(JSON.stringify(evaluateNode(t.get(r.id))!.geometry)).not.toBe(first);
  });

  it('duplicates and removes modifiers', () => {
    const t = setup();
    const r = t.rect(0, 0);
    const mod = t.add(r, 'zigzag');
    t.session.run(duplicateModifier(t.space().id, r.id, mod.id, 'copy1'));
    expect(t.get(r.id).appearance.items.filter((i) => i.kind === 'modifier')).toHaveLength(2);
    t.session.run(removeModifier(t.space().id, r.id, mod.id));
    t.session.run(removeModifier(t.space().id, r.id, 'copy1'));
    expect(evaluateNode(t.get(r.id))).toBeNull();
  });
});

describe('apply modifiers (expand)', () => {
  it('turns the evaluated geometry into a real path and drops the modifier', () => {
    const t = setup();
    const r = t.rect(10, 10);
    t.add(r, 'round-corners', { radius: 20 });
    const result = expandModifiers(t.space(), [r.id], t.ids)!;
    t.session.run(result.command);
    const node = t.get(result.resultIds[0]!) as PathNode;
    expect(node.type).toBe('path');
    expect(node.anchors).toHaveLength(8);
    expect(node.appearance.items.some((i) => i.kind === 'modifier')).toBe(false);
    expect(node.transform[4]).toBe(10);
    t.session.undo();
    expect(t.get(r.id).appearance.items.some((i) => i.kind === 'modifier')).toBe(true);
  });

  it('a drop shadow becomes an object under the shape; outline stroke becomes a filled outline', () => {
    const t = setup();
    const r = t.rect(0, 0);
    t.add(r, 'drop-shadow', { dx: 8, dy: 6, opacity: 50 });
    const r1 = expandModifiers(t.space(), [r.id], t.ids)!;
    t.session.run(r1.command);
    const kids = t.space().layers[0]!.children as Node[];
    expect(kids).toHaveLength(2);
    expect(kids[0]!.transform.slice(4)).toEqual([8, 6]);
    expect(kids[0]!.appearance.items[0]).toMatchObject({ kind: 'fill', opacity: 0.5 });

    const t2 = setup();
    const q = t2.rect(0, 0);
    t2.add(q, 'outline-stroke');
    const r2 = expandModifiers(t2.space(), [q.id], t2.ids)!;
    t2.session.run(r2.command);
    const group = t2.space().layers[0]!.children[0] as GroupNode;
    expect(group.type).toBe('group');
    expect(group.children).toHaveLength(2);
    // The stroke is now a fill; the original object no longer has one.
    expect(group.children[0]!.appearance.items.some((i) => i.kind === 'stroke')).toBe(false);
    expect(group.children[1]!.appearance.items[0]).toMatchObject({ kind: 'fill' });
  });

  it('returns null when nothing has modifiers', () => {
    const t = setup();
    const r = t.rect(0, 0);
    expect(expandModifiers(t.space(), [r.id], t.ids)).toBeNull();
  });
});

describe('live pathfinder', () => {
  it('groups the objects, draws them as one shape and expands to a real path', () => {
    const t = setup();
    const a = t.rect(0, 0);
    const b = t.rect(60, 0);
    const live = makeLivePathfinder(t.space(), [a.id, b.id], 'unite', t.ids)!;
    t.session.run(live.command);
    const group = t.space().layers[0]!.children[0] as GroupNode;
    expect(group.type).toBe('group');
    expect(group.children).toHaveLength(2); // the originals are still there, editable
    const e = evaluateNode(group)!;
    expect(e.groupAsShape).toBe(true);
    // One united contour: 160 wide.
    const xs = e.geometry.subpaths.flatMap((s) => s.anchors.map((p) => p.p.x));
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(160);
    // Picking the group works anywhere on the united shape.
    expect(hitTest(t.space(), { x: 150, y: 50 }, { tolerance: 1 })[0]?.id).toBe(group.id);
    const expanded = expandModifiers(t.space(), [group.id], t.ids)!;
    t.session.run(expanded.command);
    expect(t.space().layers[0]!.children).toHaveLength(1);
    expect(t.space().layers[0]!.children[0]!.type).toBe('path');
  });

  it('needs two objects and a shape mode', () => {
    const t = setup();
    const a = t.rect(0, 0);
    expect(makeLivePathfinder(t.space(), [a.id], 'unite', t.ids)).toBeNull();
    const b = t.rect(60, 0);
    expect(makeLivePathfinder(t.space(), [a.id, b.id], 'divide', t.ids)).toBeNull();
  });
});

describe('persistence', () => {
  it('modifiers survive saving and opening a .vict (parameters included)', async () => {
    const { writeVict, readVict } = await import('..');
    const t = setup();
    const r = t.rect(0, 0);
    t.add(r, 'zigzag', { size: 7, ridges: 5 });
    const bytes = writeVict({ document: t.session.document, app: 'test' });
    const back = readVict(bytes).document;
    const node = getActiveSpace(back).layers[0]!.children[0] as Node;
    const mod = node.appearance.items.find((i) => i.kind === 'modifier');
    expect(mod && mod.kind === 'modifier' && mod.mod.params).toMatchObject({ size: 7, ridges: 5 });
    expect(evaluateNode(node)).not.toBeNull();
  });
});

describe('modifiers of one fill or stroke', () => {
  const strokeIndex = (n: Node) => n.appearance.items.findIndex((i) => i.kind === 'stroke');
  const fillIndex = (n: Node) => n.appearance.items.findIndex((i) => i.kind === 'fill');

  it('a modifier on the stroke changes only the stroke; one on the whole object changes both', () => {
    const t = setup();
    const r = t.rect(0, 0);
    const mod = newModifier(t.ids, 'offset-path', { ...defaultParams('offset-path'), offset: 10 });
    t.session.run(addModifier(t.space().id, [{ nodeId: r.id, mod, target: { zone: 'item', index: strokeIndex(t.get(r.id)) } }]));
    const e = evaluateNode(t.get(r.id))!;
    // The fill keeps the original square; the stroke is painted on the grown one.
    const xs = (g: { subpaths: Array<{ anchors: Array<{ p: { x: number } }> }> }) => g.subpaths.flatMap((s) => s.anchors.map((a) => a.p.x));
    expect(Math.min(...xs(e.geometry))).toBe(0);
    expect(Math.min(...xs(e.items.get(strokeIndex(t.get(r.id)))!.geometry))).toBeCloseTo(-10);
    expect(e.items.has(fillIndex(t.get(r.id)))).toBe(false);
    // What can be picked covers both.
    expect(Math.min(...xs(e.shape))).toBeCloseTo(-10);
    // Moved to the whole object, it now changes the fill too.
    t.session.run(moveModifier(t.space().id, r.id, mod.id, { zone: 'object' }));
    const whole = evaluateNode(t.get(r.id))!;
    expect(whole.items.size).toBe(0);
    expect(Math.min(...xs(whole.geometry))).toBeCloseTo(-10);
    // And back onto the fill alone.
    t.session.run(moveModifier(t.space().id, r.id, mod.id, { zone: 'item', index: fillIndex(t.get(r.id)) }));
    const back = evaluateNode(t.get(r.id))!;
    expect([...back.items.keys()]).toEqual([fillIndex(t.get(r.id))]);
  });

  it('edits, switches off, duplicates and removes modifiers wherever they live', () => {
    const t = setup();
    const r = t.rect(0, 0);
    const mod = newModifier(t.ids, 'zigzag', defaultParams('zigzag'));
    const target = { zone: 'item' as const, index: fillIndex(t.get(r.id)) };
    t.session.run(addModifier(t.space().id, [{ nodeId: r.id, mod, target }]));
    t.session.run(updateModifier(t.space().id, r.id, mod.id, { params: { size: 9 } }));
    const item = t.get(r.id).appearance.items[target.index]!;
    expect(item.kind !== 'modifier' && item.modifiers[0]!.params.size).toBe(9);
    t.session.run(duplicateModifier(t.space().id, r.id, mod.id, 'dup'));
    expect(t.get(r.id).appearance.items[target.index]!.kind !== 'modifier' && (t.get(r.id).appearance.items[target.index] as { modifiers: unknown[] }).modifiers).toHaveLength(2);
    t.session.run(updateModifier(t.space().id, r.id, mod.id, { enabled: false }));
    t.session.run(updateModifier(t.space().id, r.id, 'dup', { enabled: false }));
    expect(evaluateNode(t.get(r.id))).toBeNull();
    t.session.run(removeModifier(t.space().id, r.id, 'dup'));
    expect((t.get(r.id).appearance.items[target.index] as { modifiers: unknown[] }).modifiers).toHaveLength(1);
  });

  it('applying splits an object whose items have modifiers into one object per fill and stroke', () => {
    const t = setup();
    const r = t.rect(0, 0);
    const mod = newModifier(t.ids, 'offset-path', { ...defaultParams('offset-path'), offset: 10 });
    t.session.run(addModifier(t.space().id, [{ nodeId: r.id, mod, target: { zone: 'item', index: strokeIndex(t.get(r.id)) } }]));
    const result = expandModifiers(t.space(), [r.id], t.ids)!;
    t.session.run(result.command);
    const group = t.space().layers[0]!.children[0] as GroupNode;
    expect(group.children.map((c) => c.appearance.items[0]!.kind)).toEqual(['fill', 'stroke']);
    const stroke = group.children[1] as PathNode;
    expect(Math.min(...stroke.anchors.map((a) => a.p.x))).toBeCloseTo(-10);
    expect(hasModifiersCheck(group)).toBe(false);
  });
});

import { hasModifiers as hasModifiersCheck } from '..';
