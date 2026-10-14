import { describe, expect, it } from 'vitest';
import { addLayer, addNode, createDocument, createGroup, createLayer, createRect, DocumentSession, getActiveSpace, moveLayer, moveNodesToLayer, sequentialIds, type Space } from '../../core';
import { ancestorIds, buildRows, planDrop } from './layersModel';

function setup() {
  const ids = sequentialIds('y');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'Base', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 50 });
  const space = (): Space => getActiveSpace(session.document);
  const base = space().layers[0]!;
  const top = createLayer(ids, 'Top');
  session.run(addLayer(space().id, top));
  const sub = createLayer(ids, 'Sub');
  session.run(addLayer(space().id, sub, undefined, base.id));
  const r1 = createRect(ids, 10, 10);
  const r2 = createRect(ids, 10, 10);
  const r3 = createRect(ids, 10, 10);
  session.run(addNode(space().id, base.id, r1));
  session.run(addNode(space().id, base.id, r2));
  session.run(addNode(space().id, top.id, r3));
  return { ids, session, space, base, top, sub, r1, r2, r3 };
}

describe('buildRows', () => {
  it('lists the top of the stack first, layers open, groups closed', () => {
    const { space, base, top, sub, r1, r2, r3 } = setup();
    const rows = buildRows(space(), new Set(), new Set());
    expect(rows.map((r) => r.id)).toEqual([top.id, r3.id, base.id, r2.id, r1.id, sub.id]);
    expect(rows.find((r) => r.id === sub.id)).toMatchObject({ kind: 'layer', depth: 1, parentLayerId: base.id });
    expect(rows.find((r) => r.id === r3.id)).toMatchObject({ kind: 'node', depth: 1, parentLayerId: top.id, inGroup: false });
  });

  it('collapsed layers hide their contents; expanded groups show their children', () => {
    const { ids, session, space, top } = setup();
    const a = createRect(ids, 5, 5);
    const g = createGroup(ids, [a]);
    session.run(addNode(space().id, top.id, g));
    expect(buildRows(space(), new Set(), new Set()).some((r) => r.id === a.id)).toBe(false);
    const open = buildRows(space(), new Set(), new Set([g.id]));
    expect(open.find((r) => r.id === a.id)).toMatchObject({ inGroup: true, depth: 2 });
    expect(buildRows(space(), new Set([top.id]), new Set()).filter((r) => r.parentLayerId === top.id)).toEqual([]);
  });

  it('reveals the ancestors of an object', () => {
    const { ids, session, space, top } = setup();
    const a = createRect(ids, 5, 5);
    const g = createGroup(ids, [a]);
    session.run(addNode(space().id, top.id, g));
    expect(ancestorIds(space(), a.id)).toEqual({ layers: [top.id], groups: [g.id] });
    expect(ancestorIds(space(), 'nope')).toEqual({ layers: [], groups: [] });
  });
});

describe('planDrop', () => {
  it('moves objects into a layer, or next to another object', () => {
    const { session, space, base, top, r1, r2, r3 } = setup();
    expect(planDrop(space(), { kind: 'node', ids: [r3.id] }, base.id, 'inside')).toEqual({ type: 'moveNodes', ids: [r3.id], layerId: base.id, index: space().layers[0]!.children.length });
    // r3 above r1 (before = visually above = later in the array): index after r1.
    const above = planDrop(space(), { kind: 'node', ids: [r3.id] }, r1.id, 'before');
    expect(above).toMatchObject({ type: 'moveNodes', layerId: base.id });
    session.run(moveNodesToLayer(space().id, [r3.id], base.id, (above as { index: number }).index));
    const kids = space().layers[0]!.children.map((c) => c.id);
    expect(kids.indexOf(r3.id)).toBeGreaterThan(kids.indexOf(r1.id));
    // r3 below r1 (after = visually below).
    const below = planDrop(space(), { kind: 'node', ids: [r3.id] }, r1.id, 'after');
    session.run(moveNodesToLayer(space().id, [r3.id], base.id, (below as { index: number }).index));
    const after = space().layers[0]!.children.map((c) => c.id);
    expect(after.indexOf(r3.id)).toBeLessThan(after.indexOf(r1.id));
    void top;
    void r2;
  });

  it('refuses to drop onto itself or into a group', () => {
    const { ids, session, space, top, r3 } = setup();
    const a = createRect(ids, 5, 5);
    const g = createGroup(ids, [a]);
    session.run(addNode(space().id, top.id, g));
    expect(planDrop(space(), { kind: 'node', ids: [r3.id] }, r3.id, 'before')).toBeNull();
    expect(planDrop(space(), { kind: 'node', ids: [r3.id] }, a.id, 'before')).toBeNull();
    expect(planDrop(space(), { kind: 'node', ids: [r3.id] }, 'missing', 'before')).toBeNull();
  });

  it('reorders layers and nests them', () => {
    const { session, space, base, top, sub } = setup();
    // Top above Base at the top level is the current state; drop Top "after" (below) Base.
    const below = planDrop(space(), { kind: 'layer', ids: [top.id] }, base.id, 'after');
    expect(below).toEqual({ type: 'moveLayer', layerId: top.id, parentId: null, index: 0 });
    session.run(moveLayer(space().id, top.id, null, 0));
    expect(space().layers.map((l) => l.id)).toEqual([top.id, base.id]);
    // Nest Top inside Base.
    const inside = planDrop(space(), { kind: 'layer', ids: [top.id] }, base.id, 'inside');
    expect(inside).toMatchObject({ type: 'moveLayer', parentId: base.id });
    // Next to a sublayer: the same parent.
    const beside = planDrop(space(), { kind: 'layer', ids: [top.id] }, sub.id, 'before');
    expect(beside).toMatchObject({ type: 'moveLayer', parentId: base.id });
    expect(planDrop(space(), { kind: 'layer', ids: [base.id] }, base.id, 'inside')).toBeNull();
  });
});
