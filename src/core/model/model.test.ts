import { describe, expect, it } from 'vitest';
import { addNode } from '../commands';
import { DocumentSession } from '../commands/session';
import { addToSelection, pruneSelection, selectableIds, selectAllInSpace, selectOnly, toggleInSelection } from '../selection/selection';
import { sampleDocument, sequentialIds } from '../testing/random-ops';
import { cloneNodes, cloneSpace } from './clone';
import { createDocument, createGroup, createRect, createLayer } from './factory';
import { applyToPoint, IDENTITY, invert, multiply, rotation, scaling, translation } from './matrix';
import { ARTBOARD_PRESETS, findPreset, SPACE_COLORS } from './presets';
import { collectIds, countObjects, getActiveSpace, locateNode } from './queries';

describe('new document', () => {
  it('has one Space with one artboard and one layer (specs/04 · regla 1)', () => {
    const doc = sampleDocument(sequentialIds('n'));
    expect(doc.spaces).toHaveLength(1);
    expect(doc.spaces[0]?.artboards).toHaveLength(1);
    expect(doc.spaces[0]?.layers).toHaveLength(1);
    expect(doc.activeSpaceId).toBe(doc.spaces[0]?.id);
    expect(doc.meta.version).toBe(1);
  });

  it('defaults to an A4 artboard in points and accepts other presets', () => {
    const a4 = sampleDocument(sequentialIds('a'));
    expect(a4.spaces[0]?.artboards[0]).toMatchObject({ w: 595.276, h: 841.89, preset: 'A4' });
    const icon = createDocument({ name: 'i', spaceName: 's', artboardName: 'b', layerName: 'l', preset: 'Icono 24', ids: sequentialIds('i'), now: 'x' });
    expect(icon.spaces[0]?.artboards[0]).toMatchObject({ w: 24, h: 24 });
  });

  it('new objects get a white fill and a 1 pt black stroke', () => {
    const rect = createRect(sequentialIds('r'), 10, 10);
    expect(rect.appearance.items.map((i) => i.kind)).toEqual(['fill', 'stroke']);
    const stroke = rect.appearance.items[1];
    expect(stroke?.kind === 'stroke' && stroke.stroke.width).toBe(1);
  });
});

describe('presets', () => {
  it('include everything listed in specs/04', () => {
    for (const id of ['A3', 'A4', 'A5', 'Carta', 'Oficio', 'Tabloide', '10x15', '13x18', 'Tarjeta', 'Icono 16', 'Icono 512', 'Instagram', 'Historia', 'Pantalla']) {
      expect(findPreset(id), id).toBeDefined();
    }
    expect(ARTBOARD_PRESETS.find((p) => p.id === 'Carta')).toMatchObject({ w: 612, h: 792 });
  });
  it('offers eight Space colours', () => {
    expect(SPACE_COLORS).toHaveLength(8);
  });
});

describe('matrix', () => {
  it('multiplies applying the right operand first', () => {
    const m = multiply(translation(10, 0), scaling(2, 2));
    expect(applyToPoint(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 });
  });
  it('inverts and reports singular matrices', () => {
    const m = multiply(translation(5, 7), rotation(0.5));
    const back = multiply(m, invert(m) as typeof m);
    back.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i] as number, 12));
    expect(invert([0, 0, 0, 0, 1, 1])).toBeNull();
  });
});

describe('cloning', () => {
  it('gives every copied node and modifier a fresh id and rewires text references', () => {
    const ids = sequentialIds('c');
    const path = createRect(ids, 5, 5);
    const text = {
      ...createRect(ids, 1, 1),
      type: 'text' as const,
      kind: 'onPath' as const,
      story: [],
      pathRef: path.id,
    };
    // `text` was built from a rect only to borrow BaseNode defaults.
    const { shape: _s, params: _p, ...textNode } = text as unknown as Record<string, unknown>;
    void _s;
    void _p;
    const group = createGroup(ids, [path, textNode as never]);
    const [copy] = cloneNodes([group], sequentialIds('copy'));
    expect(copy?.id).not.toBe(group.id);
    const [cPath, cText] = (copy as typeof group).children;
    expect(cPath?.id).not.toBe(path.id);
    expect(cText?.type === 'text' && cText.pathRef).toBe(cPath?.id);
  });

  it('duplicates a Space with no shared ids and equal content', () => {
    const ids = sequentialIds('s');
    const session = new DocumentSession(sampleDocument(ids), { ids });
    const space = getActiveSpace(session.document);
    session.run(addNode(space.id, space.layers[0]?.id as string, createGroup(ids, [createRect(ids, 4, 4)])));
    const source = getActiveSpace(session.document);
    const copy = cloneSpace(source, sequentialIds('dup'), 'Copy', 1);
    expect(countObjects(copy)).toBe(countObjects(source));
    const original = new Set(collectIds({ ...session.document }));
    for (const id of collectIds({ ...session.document, spaces: [copy] })) expect(original.has(id)).toBe(false);
    expect(copy.name).toBe('Copy');
  });
});

describe('selection', () => {
  const build = () => {
    const ids = sequentialIds('sel');
    const session = new DocumentSession(sampleDocument(ids), { ids });
    const space = getActiveSpace(session.document);
    const layer = space.layers[0];
    const a = createRect(ids, 1, 1);
    const b = createRect(ids, 1, 1);
    const hidden = createRect(ids, 1, 1);
    hidden.visible = false;
    const locked = createRect(ids, 1, 1);
    locked.locked = true;
    for (const n of [a, b, hidden, locked]) session.run(addNode(space.id, layer?.id as string, n));
    return { session, space, a, b, hidden, locked };
  };

  it('adds, toggles and de-duplicates', () => {
    const { a, b, space } = build();
    let sel = selectOnly(space.id, [a.id, a.id]);
    expect(sel.ids).toEqual([a.id]);
    sel = addToSelection(sel, [b.id]);
    sel = toggleInSelection(sel, a.id);
    expect(sel.ids).toEqual([b.id]);
  });

  it('select-all skips hidden and locked objects and locked layers', () => {
    const { session, space, a, b } = build();
    expect(selectAllInSpace(session.document, space.id).ids).toEqual([a.id, b.id]);
    const ids = sequentialIds('x');
    const lockedLayer = { ...createLayer(ids, 'locked'), locked: true, children: [createRect(ids, 1, 1)] };
    expect(selectableIds({ ...getActiveSpace(session.document), layers: [lockedLayer] })).toEqual([]);
  });

  it('prunes missing ids and missing Spaces', () => {
    const { session, space, a } = build();
    expect(pruneSelection(session.document, selectOnly(space.id, [a.id, 'ghost'])).ids).toEqual([a.id]);
    expect(pruneSelection(session.document, selectOnly('no-space', [a.id]))).toEqual({ spaceId: session.document.activeSpaceId, ids: [] });
  });

  it('finds nodes inside groups', () => {
    const ids = sequentialIds('f');
    const session = new DocumentSession(sampleDocument(ids), { ids });
    const space = getActiveSpace(session.document);
    const inner = createRect(ids, 1, 1);
    session.run(addNode(space.id, space.layers[0]?.id as string, createGroup(ids, [createGroup(ids, [inner])])));
    expect(locateNode(getActiveSpace(session.document), inner.id)?.node.id).toBe(inner.id);
  });
});
