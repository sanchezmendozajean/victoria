import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readVict } from '../io/vict';
import { cloneSpace } from '../model/clone';
import { createGroup, createLayer, createRect } from '../model/factory';
import { collectIds, countObjects, getActiveSpace, isLayer, locateLayer, locateNode, walkLayers } from '../model/queries';
import type { Layer, LayerChild } from '../model/types';
import { selectableIds } from '../selection/selection';
import { sampleDocument, sequentialIds } from '../testing/random-ops';
import { removeSwatch, addSwatch } from './resources';
import { addLayer, moveLayer, removeLayer, reorderLayer, updateLayer } from './layer';
import { addNode, arrangeNodes, moveNodesToLayer, removeNodes } from './node';
import { DocumentSession } from './session';

function setup() {
  const ids = sequentialIds('sl');
  const session = new DocumentSession(sampleDocument(ids), { ids });
  const space = () => getActiveSpace(session.document);
  const spaceId = session.document.activeSpaceId;
  const top = space().layers[0] as Layer;
  return { ids, session, space, spaceId, top };
}

describe('sublayers (layers inside layers)', () => {
  it('adds a sublayer next to the objects of its parent, in one z-ordered list', () => {
    const { session, space, spaceId, top, ids } = setup();
    const below = createRect(ids, 5, 5);
    const sub = createLayer(ids, 'Casa');
    const above = createRect(ids, 5, 5);
    session.run(addNode(spaceId, top.id, below));
    session.run(addLayer(spaceId, sub, undefined, top.id));
    session.run(addNode(spaceId, top.id, above));
    expect(space().layers[0]?.children.map((c) => c.id)).toEqual([below.id, sub.id, above.id]);
    expect(isLayer(space().layers[0]?.children[1] as LayerChild)).toBe(true);
    expect(space().layers).toHaveLength(1); // still one top-level layer
  });

  it('holds objects inside the sublayer and finds them with their nearest layer', () => {
    const { session, space, spaceId, top, ids } = setup();
    const sub = createLayer(ids, 'Sub');
    const rect = createRect(ids, 5, 5);
    session.run(addLayer(spaceId, sub, undefined, top.id));
    session.run(addNode(spaceId, sub.id, rect));
    const found = locateNode(space(), rect.id);
    expect(found?.layer.id).toBe(sub.id);
    expect(locateLayer(space(), sub.id)?.parent?.id).toBe(top.id);
    expect(countObjects(space())).toBe(1);
  });

  it('nests several levels and walks parents before children', () => {
    const { session, space, spaceId, top, ids } = setup();
    const a = createLayer(ids, 'A');
    const b = createLayer(ids, 'B');
    session.run(addLayer(spaceId, a, undefined, top.id));
    session.run(addLayer(spaceId, b, undefined, a.id));
    expect([...walkLayers(space().layers)].map((l) => l.name)).toEqual(['Layer 1', 'A', 'B']);
  });

  it('refuses a sublayer under a parent that does not exist', () => {
    const { session, spaceId, ids } = setup();
    expect(session.run(addLayer(spaceId, createLayer(ids, 'Orphan'), undefined, 'ghost'))).toBe(false);
  });

  it('updates, reorders and removes sublayers; removing deletes their objects; undo restores them', () => {
    const { session, space, spaceId, top, ids } = setup();
    const sub = createLayer(ids, 'Sub');
    const rect = createRect(ids, 5, 5);
    session.run(addLayer(spaceId, sub, undefined, top.id));
    session.run(addNode(spaceId, sub.id, rect));
    session.run(updateLayer(spaceId, sub.id, { name: 'Renombrada', locked: true }));
    expect(locateLayer(space(), sub.id)?.layer).toMatchObject({ name: 'Renombrada', locked: true });

    session.run(removeLayer(spaceId, sub.id));
    expect(locateLayer(space(), sub.id)).toBeNull();
    expect(locateNode(space(), rect.id)).toBeNull();
    session.undo();
    expect(locateNode(space(), rect.id)).not.toBeNull();

    const second = createLayer(ids, 'Second');
    session.run(addLayer(spaceId, second, undefined, top.id));
    session.run(reorderLayer(spaceId, second.id, 0));
    expect(locateLayer(space(), second.id)?.index).toBe(0);
  });

  it('keeps one top-level layer, but any sublayer can be removed', () => {
    const { session, spaceId, top, ids } = setup();
    expect(session.run(removeLayer(spaceId, top.id))).toBe(false);
    const sub = createLayer(ids, 'Sub');
    session.run(addLayer(spaceId, sub, undefined, top.id));
    expect(session.run(removeLayer(spaceId, sub.id))).toBe(true);
  });

  it('moves a layer into another layer and back to the top level', () => {
    const { session, space, spaceId, top, ids } = setup();
    const other = createLayer(ids, 'Other');
    session.run(addLayer(spaceId, other));
    session.run(moveLayer(spaceId, other.id, top.id));
    expect(locateLayer(space(), other.id)?.parent?.id).toBe(top.id);
    expect(space().layers).toHaveLength(1);
    session.run(moveLayer(spaceId, other.id, null));
    expect(locateLayer(space(), other.id)?.parent).toBeNull();
    expect(space().layers).toHaveLength(2);
  });

  it('never moves a layer inside itself or its own sublayers, nor lets the last top-level layer leave', () => {
    const { session, spaceId, top, ids } = setup();
    const child = createLayer(ids, 'Child');
    session.run(addLayer(spaceId, child, undefined, top.id));
    expect(session.run(moveLayer(spaceId, top.id, child.id))).toBe(false);
    expect(session.run(moveLayer(spaceId, top.id, top.id))).toBe(false);
    expect(session.run(moveLayer(spaceId, top.id, null))).toBe(false); // already top-level, same list: nothing to do
    const lonely = setup();
    const target = createLayer(lonely.ids, 'Target');
    lonely.session.run(addLayer(lonely.spaceId, target, undefined, lonely.top.id));
    expect(lonely.session.run(moveLayer(lonely.spaceId, lonely.top.id, target.id))).toBe(false);
  });

  it('moves objects between a layer and its sublayers', () => {
    const { session, space, spaceId, top, ids } = setup();
    const sub = createLayer(ids, 'Sub');
    const rect = createRect(ids, 5, 5);
    session.run(addLayer(spaceId, sub, undefined, top.id));
    session.run(addNode(spaceId, top.id, rect));
    session.run(moveNodesToLayer(spaceId, [rect.id], sub.id));
    expect(locateNode(space(), rect.id)?.layer.id).toBe(sub.id);
    session.run(moveNodesToLayer(spaceId, [rect.id], top.id));
    expect(locateNode(space(), rect.id)?.layer.id).toBe(top.id);
  });

  it('arranges objects around a sublayer without disturbing it', () => {
    const { session, space, spaceId, top, ids } = setup();
    const a = createRect(ids, 5, 5);
    const sub = createLayer(ids, 'Sub');
    const b = createRect(ids, 5, 5);
    for (const op of [addNode(spaceId, top.id, a), addLayer(spaceId, sub, undefined, top.id), addNode(spaceId, top.id, b)]) session.run(op);
    session.run(arrangeNodes(spaceId, [b.id], 'back'));
    expect(space().layers[0]?.children.map((c) => c.id)).toEqual([b.id, a.id, sub.id]);
    session.run(arrangeNodes(spaceId, [b.id], 'front'));
    expect(space().layers[0]?.children.map((c) => c.id)).toEqual([a.id, sub.id, b.id]);
  });

  it('removes objects found inside sublayers', () => {
    const { session, space, spaceId, top, ids } = setup();
    const sub = createLayer(ids, 'Sub');
    const group = createGroup(ids, [createRect(ids, 5, 5)]);
    session.run(addLayer(spaceId, sub, undefined, top.id));
    session.run(addNode(spaceId, sub.id, group));
    session.run(removeNodes(spaceId, [group.id]));
    expect(countObjects(space())).toBe(0);
  });

  it('select-all skips hidden or locked sublayers and what they contain', () => {
    const { session, space, spaceId, top, ids } = setup();
    const visible = createLayer(ids, 'Visible');
    const hidden = createLayer(ids, 'Hidden');
    const a = createRect(ids, 5, 5);
    const b = createRect(ids, 5, 5);
    const c = createRect(ids, 5, 5);
    for (const op of [addLayer(spaceId, visible, undefined, top.id), addLayer(spaceId, hidden, undefined, top.id), addNode(spaceId, top.id, a), addNode(spaceId, visible.id, b), addNode(spaceId, hidden.id, c)]) {
      session.run(op);
    }
    session.run(updateLayer(spaceId, hidden.id, { visible: false }));
    expect(selectableIds(space()).sort()).toEqual([a.id, b.id].sort());
  });

  it('duplicates a Space with its sublayers, all with fresh ids', () => {
    const { session, space, spaceId, top, ids } = setup();
    const sub = createLayer(ids, 'Sub');
    session.run(addLayer(spaceId, sub, undefined, top.id));
    session.run(addNode(spaceId, sub.id, createRect(ids, 5, 5)));
    const copy = cloneSpace(space(), sequentialIds('dup'), 'Copy', 1);
    expect([...walkLayers(copy.layers)].map((l) => l.name)).toEqual(['Layer 1', 'Sub']);
    expect(countObjects(copy)).toBe(1);
    const original = new Set(collectIds(session.document));
    for (const id of collectIds({ ...session.document, spaces: [copy] })) expect(original.has(id)).toBe(false);
  });

  it('removing a swatch also reaches objects inside sublayers', () => {
    const { session, space, spaceId, top, ids } = setup();
    const sub = createLayer(ids, 'Sub');
    const rect = createRect(ids, 5, 5);
    const fill = rect.appearance.items[0];
    if (fill?.kind === 'fill') fill.paint = { type: 'swatch', swatchId: 'sw1' };
    session.run(addSwatch({ id: 'sw1', name: 'Red', color: { model: 'rgb', values: [255, 0, 0] }, global: true }));
    session.run(addLayer(spaceId, sub, undefined, top.id));
    session.run(addNode(spaceId, sub.id, rect));
    session.run(removeSwatch('sw1'));
    const painted = locateNode(space(), rect.id)?.node.appearance.items[0];
    expect(painted?.kind === 'fill' && painted.paint).toEqual({ type: 'solid', color: { model: 'rgb', values: [255, 0, 0] } });
  });
});

describe('format 1 → 2 migration (layers became tree nodes)', () => {
  const v1Document = () => {
    const doc = JSON.parse(JSON.stringify(sampleDocument(sequentialIds('old'))));
    doc.meta.version = 1;
    for (const space of doc.spaces) for (const layer of space.layers) delete layer.type; // how version 1 stored layers
    return doc;
  };
  const zip = (doc: unknown, version: number) =>
    zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'victoria', version, app: 'old' })),
      'document.json': strToU8(JSON.stringify(doc)),
    });

  it('opens a version 1 file: layers gain their type and the version is stamped', () => {
    const read = readVict(zip(v1Document(), 1));
    expect(read.document.meta.version).toBe(2);
    expect(read.document.spaces[0]?.layers[0]?.type).toBe('layer');
    expect(read.document.spaces[0]?.layers[0]?.name).toBe('Layer 1');
  });

  it('a version 1 file with content keeps every object', () => {
    const ids = sequentialIds('c');
    const session = new DocumentSession(sampleDocument(ids), { ids });
    const space = getActiveSpace(session.document);
    session.run(addNode(space.id, space.layers[0]?.id as string, createRect(ids, 9, 9)));
    const old = JSON.parse(JSON.stringify(session.document));
    old.meta.version = 1;
    for (const s of old.spaces) for (const l of s.layers) delete l.type;
    const read = readVict(zip(old, 1));
    expect(countObjects(getActiveSpace(read.document))).toBe(1);
  });

  it('is idempotent on documents that already have typed layers', () => {
    const current = JSON.parse(JSON.stringify(sampleDocument(sequentialIds('n'))));
    expect(() => readVict(zip(current, 1))).not.toThrow();
  });

  it('rejects layers with a wrong type', () => {
    const bad = JSON.parse(JSON.stringify(sampleDocument(sequentialIds('b'))));
    bad.spaces[0].layers[0].type = 'folder';
    expect(() => readVict(zip(bad, 2))).toThrow(/layers\[0\]\.type/);
  });
});
