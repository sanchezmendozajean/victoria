import { describe, expect, it, vi } from 'vitest';
import { createGroup, createLayer, createRect, createSpace, createArtboard } from '../model/factory';
import { translation } from '../model/matrix';
import { getActiveSpace, locateNode } from '../model/queries';
import { selectOnly } from '../selection/selection';
import { sampleDocument, sequentialIds } from '../testing/random-ops';
import { addArtboard, removeArtboard } from './artboard';
import { addNode, arrangeNodes, groupNodes, moveNodesToSpace, removeNodes, transformNodes, ungroupNode } from './node';
import { DocumentSession } from './session';
import { addSpace, removeSpace, renameSpace } from './space';

function setup() {
  const ids = sequentialIds('t');
  let n = 1;
  const session = new DocumentSession(sampleDocument(ids), { ids, now: () => `2026-01-01T00:00:00.${String(n++).padStart(3, '0')}Z` });
  const layerId = getActiveSpace(session.document).layers[0]?.id as string;
  const spaceId = session.document.activeSpaceId;
  return { ids, session, layerId, spaceId };
}

describe('DocumentSession', () => {
  it('starts clean with an empty history', () => {
    const { session } = setup();
    expect(session.dirty).toBe(false);
    expect(session.canUndo).toBe(false);
    expect(session.undoLabel).toBeNull();
  });

  it('records commands, undoes and redoes them, and labels the steps', () => {
    const { session, spaceId } = setup();
    session.run(renameSpace(spaceId, 'Renamed'));
    expect(getActiveSpace(session.document).name).toBe('Renamed');
    expect(session.undoLabel).toBe('space.rename');
    session.undo();
    expect(getActiveSpace(session.document).name).toBe('Space 1');
    expect(session.redoLabel).toBe('space.rename');
    session.redo();
    expect(getActiveSpace(session.document).name).toBe('Renamed');
  });

  it('does not record commands that change nothing', () => {
    const { session, spaceId } = setup();
    expect(session.run(removeSpace(spaceId))).toBe(false); // the last Space cannot be removed
    expect(session.run(removeArtboard(spaceId, getActiveSpace(session.document).artboards[0]?.id as string))).toBe(false);
    expect(session.run(renameSpace(spaceId, 'Space 1'))).toBe(false);
    expect(session.canUndo).toBe(false);
  });

  it('drops the redo stack when a new command runs', () => {
    const { session, spaceId } = setup();
    session.run(renameSpace(spaceId, 'A'));
    session.undo();
    session.run(renameSpace(spaceId, 'B'));
    expect(session.canRedo).toBe(false);
  });

  it('merges consecutive commands that share a merge key into one step', () => {
    const { session, spaceId, layerId, ids } = setup();
    const rect = createRect(ids, 10, 10);
    session.run(addNode(spaceId, layerId, rect));
    for (let i = 0; i < 5; i++) session.run(transformNodes(spaceId, [rect.id], translation(2, 0), 'arrows'));
    expect(session.historyLength).toBe(2);
    expect(locateNode(getActiveSpace(session.document), rect.id)?.node.transform[4]).toBe(10);
    session.undo();
    expect(locateNode(getActiveSpace(session.document), rect.id)?.node.transform[4]).toBe(0);
    session.redo();
    expect(locateNode(getActiveSpace(session.document), rect.id)?.node.transform[4]).toBe(10);
  });

  it('does not merge different keys or interrupted gestures', () => {
    const { session, spaceId, layerId, ids } = setup();
    const rect = createRect(ids, 10, 10);
    session.run(addNode(spaceId, layerId, rect));
    session.run(transformNodes(spaceId, [rect.id], translation(1, 0), 'a'));
    session.run(transformNodes(spaceId, [rect.id], translation(1, 0), 'b'));
    session.run(renameSpace(spaceId, 'x'));
    session.run(transformNodes(spaceId, [rect.id], translation(1, 0), 'b'));
    expect(session.historyLength).toBe(5);
  });

  it('caps the history at the configured limit', () => {
    const ids = sequentialIds('l');
    const session = new DocumentSession(sampleDocument(ids), { ids, historyLimit: 3 });
    const id = session.document.activeSpaceId;
    for (let i = 0; i < 10; i++) session.run(renameSpace(id, `n${i}`));
    expect(session.historyLength).toBe(3);
    session.setHistoryLimit(2);
    expect(session.historyLength).toBe(2);
    while (session.undo());
    expect(getActiveSpace(session.document).name).toBe('n7');
  });

  it('tracks dirty against the last save, even through undo and redo', () => {
    const { session, spaceId } = setup();
    session.run(renameSpace(spaceId, 'A'));
    expect(session.dirty).toBe(true);
    session.markSaved();
    expect(session.dirty).toBe(false);
    session.run(renameSpace(spaceId, 'B'));
    expect(session.dirty).toBe(true);
    session.undo();
    expect(session.dirty).toBe(false);
    session.undo();
    expect(session.dirty).toBe(true);
    session.redo();
    expect(session.dirty).toBe(false);
  });

  it('stays dirty when a merged step is extended after saving', () => {
    const { session, spaceId, layerId, ids } = setup();
    const rect = createRect(ids, 10, 10);
    session.run(addNode(spaceId, layerId, rect));
    session.run(transformNodes(spaceId, [rect.id], translation(1, 0), 'k'));
    session.markSaved();
    session.run(transformNodes(spaceId, [rect.id], translation(1, 0), 'k')); // merges into the saved step
    expect(session.dirty).toBe(true);
  });

  it('bumps the modified timestamp and restores it on undo', () => {
    const { session, spaceId } = setup();
    const before = session.document.meta.modified;
    session.run(renameSpace(spaceId, 'A'));
    expect(session.document.meta.modified).not.toBe(before);
    session.undo();
    expect(session.document.meta.modified).toBe(before);
  });

  it('notifies subscribers with the kind of change and the patches', () => {
    const { session, spaceId } = setup();
    const listener = vi.fn();
    const off = session.subscribe(listener);
    session.run(renameSpace(spaceId, 'A'));
    session.undo();
    session.select(selectOnly(spaceId, []));
    off();
    session.redo();
    expect(listener.mock.calls.map(([c]) => c.kind)).toEqual(['run', 'undo', 'select']);
    expect(listener.mock.calls[0]?.[0].patches.length).toBeGreaterThan(0);
  });
});

describe('selection and history', () => {
  it('restores the selection of each side of a step', () => {
    const { session, spaceId, layerId, ids } = setup();
    const a = createRect(ids, 10, 10);
    const b = createRect(ids, 10, 10);
    session.run(addNode(spaceId, layerId, a), selectOnly(spaceId, [a.id]));
    session.run(addNode(spaceId, layerId, b), selectOnly(spaceId, [b.id]));
    expect(session.selection.ids).toEqual([b.id]);
    session.undo();
    expect(session.selection.ids).toEqual([a.id]);
    session.redo();
    expect(session.selection.ids).toEqual([b.id]);
  });

  it('drops selected ids that stop existing, and undo of the delete selects them again', () => {
    const { session, spaceId, layerId, ids } = setup();
    const a = createRect(ids, 10, 10);
    session.run(addNode(spaceId, layerId, a), selectOnly(spaceId, [a.id]));
    session.run(removeNodes(spaceId, [a.id]));
    expect(session.selection.ids).toEqual([]);
    session.undo();
    expect(session.selection.ids).toEqual([a.id]); // the step remembers what was selected before the delete
  });

  it('does not put selection changes in the history', () => {
    const { session, spaceId } = setup();
    session.select(selectOnly(spaceId, []));
    expect(session.canUndo).toBe(false);
  });
});

describe('Spaces', () => {
  it('undo of an action done in another Space brings that Space to the front (specs/04 · regla 4)', () => {
    const { session, ids, spaceId } = setup();
    const second = createSpace(ids, { name: 'Two', order: 1, artboards: [createArtboard(ids, { name: 'B', w: 10, h: 10 })], layers: [createLayer(ids, 'L')] });
    session.run(addSpace(second));
    session.run(renameSpace(spaceId, 'First renamed')); // action in Space 1, while Space 2 is in front
    session.setActiveSpace(second.id);
    expect(session.document.activeSpaceId).toBe(second.id);
    session.undo();
    expect(session.document.activeSpaceId).toBe(spaceId);
  });

  it('switching Space is not a history step and clears the selection', () => {
    const { session, ids, spaceId } = setup();
    const second = createSpace(ids, { name: 'Two', order: 1, artboards: [createArtboard(ids, { name: 'B', w: 10, h: 10 })], layers: [createLayer(ids, 'L')] });
    session.run(addSpace(second));
    const steps = session.historyLength;
    session.setActiveSpace(spaceId);
    expect(session.historyLength).toBe(steps);
    expect(session.dirty).toBe(true); // from addSpace, not from switching
    expect(session.selection.spaceId).toBe(spaceId);
  });

  it('keeps zoom and pan per Space without touching the history', () => {
    const { session, spaceId } = setup();
    session.setSpaceView(spaceId, { zoom: 4, panX: 10, panY: -5 });
    expect(getActiveSpace(session.document).view).toEqual({ zoom: 4, panX: 10, panY: -5 });
    expect(session.canUndo).toBe(false);
    expect(session.dirty).toBe(false);
  });

  it('adding a Space makes it active; removing the active one activates a neighbour and renumbers', () => {
    const { session, ids, spaceId } = setup();
    const second = createSpace(ids, { name: 'Two', artboards: [createArtboard(ids, { name: 'B', w: 10, h: 10 })], layers: [createLayer(ids, 'L')] });
    session.run(addSpace(second));
    expect(session.document.activeSpaceId).toBe(second.id);
    expect(session.document.spaces.map((s) => s.order)).toEqual([0, 1]);
    session.run(removeSpace(second.id));
    expect(session.document.activeSpaceId).toBe(spaceId);
    expect(session.document.spaces).toHaveLength(1);
  });

  it('keeps artboards ≥ 1 and adds more with addArtboard', () => {
    const { session, spaceId, ids } = setup();
    session.run(addArtboard(spaceId, createArtboard(ids, { name: 'B2', x: 700, w: 100, h: 100 })));
    const space = getActiveSpace(session.document);
    expect(space.artboards).toHaveLength(2);
    expect(session.run(removeArtboard(spaceId, space.artboards[0]?.id as string))).toBe(true);
    expect(session.run(removeArtboard(spaceId, space.artboards[1]?.id as string))).toBe(false);
  });
});

describe('node commands', () => {
  it('groups and ungroups keeping z-order and visual position', () => {
    const { session, spaceId, layerId, ids } = setup();
    const a = createRect(ids, 10, 10);
    const b = createRect(ids, 10, 10);
    const c = createRect(ids, 10, 10);
    for (const n of [a, b, c]) session.run(addNode(spaceId, layerId, n));
    const group = createGroup(ids, []);
    group.transform = translation(100, 100);
    session.run(groupNodes(spaceId, [a.id, c.id], group));
    let layer = getActiveSpace(session.document).layers[0];
    expect(layer?.children.map((n) => n.id)).toEqual([b.id, group.id]);
    const grouped = layer?.children[1];
    expect(grouped?.type === 'group' && grouped.children.map((n) => n.id)).toEqual([a.id, c.id]);

    session.run(ungroupNode(spaceId, group.id));
    layer = getActiveSpace(session.document).layers[0];
    expect(layer?.children.map((n) => n.id)).toEqual([b.id, a.id, c.id]);
    expect(layer?.children[1]?.transform).toEqual(translation(100, 100));
  });

  it('refuses to group nodes that live in different containers', () => {
    const { session, spaceId, layerId, ids } = setup();
    const inner = createRect(ids, 5, 5);
    const g = createGroup(ids, [inner]);
    const loose = createRect(ids, 5, 5);
    session.run(addNode(spaceId, layerId, g));
    session.run(addNode(spaceId, layerId, loose));
    expect(session.run(groupNodes(spaceId, [inner.id, loose.id], createGroup(ids, [])))).toBe(false);
  });

  it('does not move a group and its child twice', () => {
    const { session, spaceId, layerId, ids } = setup();
    const inner = createRect(ids, 5, 5);
    const g = createGroup(ids, [inner]);
    session.run(addNode(spaceId, layerId, g));
    session.run(transformNodes(spaceId, [g.id, inner.id], translation(10, 0)));
    const space = getActiveSpace(session.document);
    expect(locateNode(space, g.id)?.node.transform[4]).toBe(10);
    expect(locateNode(space, inner.id)?.node.transform[4]).toBe(0);
  });

  it('arranges objects: front, back, forward, backward', () => {
    const { session, spaceId, layerId, ids } = setup();
    const [a, b, c, d] = [1, 2, 3, 4].map(() => createRect(ids, 5, 5));
    for (const n of [a, b, c, d]) session.run(addNode(spaceId, layerId, n!));
    const order = () => getActiveSpace(session.document).layers[0]?.children.map((n) => n.id);
    session.run(arrangeNodes(spaceId, [a!.id], 'front'));
    expect(order()).toEqual([b!.id, c!.id, d!.id, a!.id]);
    session.run(arrangeNodes(spaceId, [a!.id], 'backward'));
    expect(order()).toEqual([b!.id, c!.id, a!.id, d!.id]);
    session.run(arrangeNodes(spaceId, [b!.id, c!.id], 'forward'));
    expect(order()).toEqual([a!.id, b!.id, c!.id, d!.id]);
    session.run(arrangeNodes(spaceId, [d!.id], 'back'));
    expect(order()).toEqual([d!.id, a!.id, b!.id, c!.id]);
  });

  it('moves objects to another Space keeping their coordinates, and undo restores both', () => {
    const { session, spaceId, layerId, ids } = setup();
    const target = createSpace(ids, { name: 'Two', order: 1, artboards: [createArtboard(ids, { name: 'B', w: 10, h: 10 })], layers: [createLayer(ids, 'L')] });
    session.run(addSpace(target));
    const rect = createRect(ids, 10, 10);
    rect.transform = translation(33, 44);
    session.run(addNode(spaceId, layerId, rect));
    const targetLayer = target.layers[0]?.id as string;
    session.run(moveNodesToSpace(spaceId, [rect.id], target.id, targetLayer));
    const [first, second] = session.document.spaces;
    expect(first && locateNode(first, rect.id)).toBeNull();
    expect(second && locateNode(second, rect.id)?.node.transform).toEqual(translation(33, 44));
    session.undo();
    expect(session.document.spaces[0] && locateNode(session.document.spaces[0], rect.id)).not.toBeNull();
    expect(session.document.spaces[1] && locateNode(session.document.spaces[1], rect.id)).toBeNull();
  });
});
