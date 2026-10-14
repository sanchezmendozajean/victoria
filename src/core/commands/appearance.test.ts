import { describe, expect, it } from 'vitest';
import {
  addNode,
  applyGradient,
  colorToHex,
  commonItemOpacity,
  commonPaint,
  commonStrokeField,
  convertColor,
  copyAppearance,
  createDocument,
  createGroup,
  createPath,
  createRect,
  defaultAppearance,
  defaultGradientTransform,
  DocumentSession,
  editGradients,
  gradientAngle,
  gradientAxis,
  gradientColorAt,
  gradientTransform,
  groupNodes,
  hexToColor,
  makeGradient,
  paintTargets,
  patchStroke,
  removeUnusedGradients,
  reversedStops,
  rotateGradient,
  sameColor,
  selectOnly,
  sequentialIds,
  setItemOpacity,
  setPaint,
  swapFillStroke,
  toWebSafe,
  getActiveSpace,
  type Color,
  type Node,
  type PathNode,
  type ShapeNode,
} from '..';

const rgb = (r: number, g: number, b: number): Color => ({ model: 'rgb', values: [r, g, b] });

function setup() {
  const ids = sequentialIds('p');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 100 });
  const space = () => getActiveSpace(session.document);
  const layerId = () => space().layers[0]!.id;
  const add = <T extends Node>(node: T): T => {
    session.run(addNode(space().id, layerId(), node));
    return node;
  };
  const find = <T extends Node>(id: string): T => {
    const walk = (nodes: readonly unknown[]): Node | undefined => {
      for (const n of nodes as Node[]) {
        if (n.id === id) return n;
        if (n.type === 'group' || n.type === 'clipGroup') {
          const f = walk(n.children);
          if (f) return f;
        }
      }
      return undefined;
    };
    return walk(space().layers[0]!.children) as T;
  };
  return { ids, session, space, add, find };
}

describe('color conversions', () => {
  it('round-trips rgb ↔ hsb ↔ cmyk within rounding', () => {
    const c = rgb(200, 80, 40);
    for (const model of ['hsb', 'cmyk'] as const) {
      const back = convertColor(convertColor(c, model), 'rgb');
      expect(sameColor(c, back)).toBe(true);
    }
  });

  it('converts black, white and gray', () => {
    expect(convertColor(rgb(0, 0, 0), 'cmyk').values).toEqual([0, 0, 0, 100]);
    expect(convertColor(rgb(255, 255, 255), 'gray').values).toEqual([0]);
    expect(convertColor(rgb(255, 0, 0), 'hsb').values).toEqual([0, 100, 100]);
    expect(convertColor({ model: 'gray', values: [50] }, 'rgb').values[0]).toBeCloseTo(127.5, 3);
  });

  it('keeps alpha', () => {
    expect(convertColor({ model: 'rgb', values: [1, 2, 3], alpha: 0.4 }, 'hsb').alpha).toBe(0.4);
  });

  it('hex parsing and formatting', () => {
    expect(colorToHex(rgb(255, 128, 0))).toBe('#FF8000');
    expect(hexToColor('#f80')!.values).toEqual([255, 136, 0]);
    expect(hexToColor('00ff7f')!.values).toEqual([0, 255, 127]);
    expect(hexToColor('#12')).toBeNull();
    expect(hexToColor('zzzzzz')).toBeNull();
  });

  it('web safe colours snap each channel to a multiple of 51', () => {
    expect(toWebSafe(rgb(100, 140, 250)).values).toEqual([102, 153, 255]);
  });
});

describe('mixed values', () => {
  it('shows a shared fill, and mixed when objects differ', () => {
    const { add, session, space } = setup();
    const a = add(createRect(session.ids, 10, 10));
    const b = add(createRect(session.ids, 10, 10));
    const nodes = () => paintTargets(space(), [a.id, b.id]);
    expect(commonPaint(nodes(), 'fill')).toEqual({ mixed: false, value: { type: 'solid', color: { model: 'rgb', values: [255, 255, 255] } } });
    session.run(setPaint(space().id, [a.id], 'fill', { type: 'solid', color: rgb(255, 0, 0) }));
    expect(commonPaint(nodes(), 'fill')).toEqual({ mixed: true });
  });

  it('a node without a stroke counts as none; no nodes means no value', () => {
    const { add, session, space } = setup();
    const a = add(createRect(session.ids, 10, 10));
    session.run(setPaint(space().id, [a.id], 'stroke', { type: 'none' }));
    expect(commonPaint(paintTargets(space(), [a.id]), 'stroke')).toEqual({ mixed: false, value: { type: 'none' } });
    expect(commonPaint([], 'fill')).toBeNull();
  });

  it('stroke fields are mixed per property', () => {
    const { add, session, space } = setup();
    const a = add(createRect(session.ids, 10, 10));
    const b = add(createRect(session.ids, 10, 10));
    session.run(patchStroke(space().id, [a.id], { width: 4 }));
    const nodes = paintTargets(space(), [a.id, b.id]);
    expect(commonStrokeField(nodes, 'width')).toEqual({ mixed: true });
    expect(commonStrokeField(nodes, 'cap')).toEqual({ mixed: false, value: 'butt' });
    expect(commonItemOpacity(nodes, 'fill')).toEqual({ mixed: false, value: 1 });
  });

  it('a group stands for the objects inside it', () => {
    const { add, session, space } = setup();
    const a = createRect(session.ids, 10, 10);
    const b = createRect(session.ids, 10, 10);
    const g = add(createGroup(session.ids, [a, b]));
    expect(paintTargets(space(), [g.id]).map((n) => n.id)).toEqual([a.id, b.id]);
  });
});

describe('paint commands', () => {
  it('sets the fill of many objects as one undo step', () => {
    const { add, session, space, find } = setup();
    const a = add(createRect(session.ids, 10, 10));
    const b = add(createRect(session.ids, 10, 10));
    const before = session.historyLength;
    session.run(setPaint(space().id, [a.id, b.id], 'fill', { type: 'solid', color: rgb(1, 2, 3) }));
    expect(session.historyLength).toBe(before + 1);
    expect(colorToHex((find<ShapeNode>(a.id).appearance.items[0] as { paint: { color: Color } }).paint.color)).toBe('#010203');
    session.undo();
    expect(colorToHex((find<ShapeNode>(a.id).appearance.items[0] as { paint: { color: Color } }).paint.color)).toBe('#FFFFFF');
  });

  it('setting a fill on a group paints its children; merge keys fold a drag into one step', () => {
    const { add, session, space, find } = setup();
    const a = createRect(session.ids, 10, 10);
    const g = add(createGroup(session.ids, [a]));
    const before = session.historyLength;
    for (const v of [10, 20, 30]) session.run(setPaint(space().id, [g.id], 'fill', { type: 'solid', color: rgb(v, 0, 0) }, 'slider1'));
    expect(session.historyLength).toBe(before + 1);
    expect(find<ShapeNode>(a.id).appearance.items[0]).toMatchObject({ paint: { color: { values: [30, 0, 0] } } });
  });

  it('creates a missing fill below the stroke and a missing stroke with paint none', () => {
    const { add, session, space, find } = setup();
    const p = add(createPath(session.ids, [], false) as PathNode);
    session.run({ label: 'x', spaceId: space().id, apply: (d) => void (d.spaces[0]!.layers[0]!.children[0] as PathNode).appearance.items.splice(0, 2) });
    expect(find<PathNode>(p.id).appearance.items).toEqual([]);
    session.run(patchStroke(space().id, [p.id], { width: 3 }));
    session.run(setPaint(space().id, [p.id], 'fill', { type: 'solid', color: rgb(9, 9, 9) }));
    const items = find<PathNode>(p.id).appearance.items;
    expect(items.map((i) => i.kind)).toEqual(['fill', 'stroke']);
    expect(items[1]).toMatchObject({ paint: { type: 'none' }, stroke: { width: 3 } });
  });

  it('none on an object without that item changes nothing (no history entry)', () => {
    const { add, session, space } = setup();
    const p = add(createPath(session.ids, [], false) as PathNode);
    session.run({ label: 'x', spaceId: space().id, apply: (d) => void (d.spaces[0]!.layers[0]!.children[0] as PathNode).appearance.items.splice(0, 2) });
    expect(session.run(setPaint(space().id, [p.id], 'fill', { type: 'none' }))).toBe(false);
  });

  it('stroke patches change only the given fields, and undefined removes optional ones', () => {
    const { add, session, space, find } = setup();
    const a = add(createRect(session.ids, 10, 10));
    session.run(patchStroke(space().id, [a.id], { width: 6, cap: 'round', startArrow: 'a1' }));
    let stroke = (find<ShapeNode>(a.id).appearance.items[1] as { stroke: { width: number; cap: string; join: string; startArrow?: string } }).stroke;
    expect(stroke).toMatchObject({ width: 6, cap: 'round', join: 'miter', startArrow: 'a1' });
    session.run(patchStroke(space().id, [a.id], { startArrow: undefined }));
    stroke = (find<ShapeNode>(a.id).appearance.items[1] as unknown as { stroke: typeof stroke }).stroke;
    expect('startArrow' in stroke).toBe(false);
  });

  it('opacity of items is clamped, swap exchanges paints and keeps stroke attributes', () => {
    const { add, session, space, find } = setup();
    const a = add(createRect(session.ids, 10, 10));
    session.run(setItemOpacity(space().id, [a.id], 'fill', 3));
    expect((find<ShapeNode>(a.id).appearance.items[0] as { opacity: number }).opacity).toBe(1);
    session.run(setItemOpacity(space().id, [a.id], 'fill', 0.25));
    expect((find<ShapeNode>(a.id).appearance.items[0] as { opacity: number }).opacity).toBe(0.25);
    session.run(patchStroke(space().id, [a.id], { width: 5 }));
    session.run(swapFillStroke(space().id, [a.id]));
    const [fill, stroke] = find<ShapeNode>(a.id).appearance.items as unknown as Array<{ paint: { color: Color }; stroke?: { width: number } }>;
    expect(colorToHex(fill!.paint.color)).toBe('#000000');
    expect(colorToHex(stroke!.paint.color)).toBe('#FFFFFF');
    expect(stroke!.stroke!.width).toBe(5);
  });

  it('copyAppearance gives other objects the same appearance, opacity and blend mode', () => {
    const { add, session, space, find } = setup();
    const a = add(createRect(session.ids, 10, 10));
    const b = add(createRect(session.ids, 10, 10));
    const look = defaultAppearance();
    (look.items[0] as { paint: unknown }).paint = { type: 'solid', color: rgb(5, 6, 7) };
    session.run(copyAppearance(space().id, [a.id, b.id], look, { opacity: 0.5, blendMode: 'multiply' }));
    expect(find<ShapeNode>(b.id).opacity).toBe(0.5);
    expect(find<ShapeNode>(b.id).blendMode).toBe('multiply');
    expect(colorToHex(((find<ShapeNode>(b.id).appearance.items[0]) as unknown as { paint: { color: Color } }).paint.color)).toBe('#050607');
  });

  it('groups and ungroups keep their paints (sanity of paintTargets after grouping)', () => {
    const { add, session, space } = setup();
    const a = add(createRect(session.ids, 10, 10));
    const g = createGroup(session.ids, []);
    session.run(groupNodes(space().id, [a.id], g), selectOnly(space().id, [g.id]));
    expect(paintTargets(space(), [g.id]).map((n) => n.id)).toEqual([a.id]);
  });
});

describe('gradients', () => {
  const setupGradient = () => {
    const ctx = setup();
    const a = ctx.add(createRect(ctx.session.ids, 100, 50));
    const gradient = makeGradient(ctx.ids, 'linear', rgb(255, 0, 0), rgb(0, 0, 255), 'G');
    const transform = defaultGradientTransform({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 'linear');
    return { ...ctx, a, gradient, transform };
  };

  it('applies a gradient fill and stores the resource once', () => {
    const { session, space, a, gradient, transform, find } = setupGradient();
    session.run(applyGradient(space().id, [a.id], 'fill', { type: 'linear', gradient, transform }));
    expect(session.document.resources.gradients).toHaveLength(1);
    expect(find<ShapeNode>(a.id).appearance.items[0]).toMatchObject({ paint: { type: 'linear', gradientId: gradient.id } });
    session.undo();
    expect(session.document.resources.gradients).toHaveLength(0);
  });

  it('edits stops in place, merged by key', () => {
    const { session, space, a, gradient, transform, ids } = setupGradient();
    session.run(applyGradient(space().id, [a.id], 'fill', { type: 'linear', gradient, transform }));
    const before = session.historyLength;
    for (const o of [0.2, 0.3, 0.4]) session.run(editGradients(space().id, [a.id], 'fill', (g) => void (g.stops[0]!.offset = o), ids, 'drag1'));
    expect(session.historyLength).toBe(before + 1);
    expect(session.document.resources.gradients[0]!.stops[0]!.offset).toBe(0.4);
  });

  it('a gradient shared with another object is copied before it is edited', () => {
    const { session, space, a, gradient, transform, ids, add } = setupGradient();
    const b = add(createRect(session.ids, 10, 10));
    session.run(applyGradient(space().id, [a.id, b.id], 'fill', { type: 'linear', gradient, transform }));
    session.run(editGradients(space().id, [a.id], 'fill', (g) => void (g.stops[1]!.opacity = 0.2), ids));
    expect(session.document.resources.gradients).toHaveLength(2);
    const stops = session.document.resources.gradients.map((g) => g.stops[1]!.opacity).sort();
    expect(stops).toEqual([0.2, 1]);
    // Unused ones can be pruned: delete b and prune.
    session.run(removeUnusedGradients());
    expect(session.document.resources.gradients).toHaveLength(2);
  });

  it('changing the type through the edit retypes the paints', () => {
    const { session, space, a, gradient, transform, ids, find } = setupGradient();
    session.run(applyGradient(space().id, [a.id], 'fill', { type: 'linear', gradient, transform }));
    session.run(editGradients(space().id, [a.id], 'fill', (g) => void (g.type = 'radial'), ids));
    expect(find<ShapeNode>(a.id).appearance.items[0]).toMatchObject({ paint: { type: 'radial' } });
  });

  it('geometry: default transforms, axis, angle and rotation', () => {
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    const t = defaultGradientTransform(bounds, 'linear', 0);
    expect(gradientAxis(t)).toMatchObject({ start: { x: 0, y: 25 }, end: { x: 100, y: 25 }, aspect: 1 });
    const t90 = defaultGradientTransform(bounds, 'linear', 90); // counter-clockwise: from bottom to top
    expect(gradientAxis(t90).start.y).toBeCloseTo(50, 9);
    expect(gradientAxis(t90).end.y).toBeCloseTo(0, 9);
    expect(gradientAngle(t90)).toBeCloseTo(90, 9);
    expect(gradientAngle(rotateGradient(t, 45, 'linear'))).toBeCloseTo(45, 9);
    const radial = defaultGradientTransform(bounds, 'radial');
    expect(gradientAxis(radial).start).toEqual({ x: 50, y: 25 });
    expect(gradientAxis(gradientTransform({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5)).aspect).toBeCloseTo(0.5, 9);
  });

  it('stops: colour interpolation, midpoints and reversal', () => {
    const g = makeGradient(sequentialIds('x'), 'linear', rgb(0, 0, 0), rgb(100, 200, 50));
    expect(gradientColorAt(g.stops, 0.5).color.values).toEqual([50, 100, 25]);
    g.stops[0]!.midpoint = 0.25;
    expect(gradientColorAt(g.stops, 0.25).color.values).toEqual([50, 100, 25]);
    g.stops.push({ offset: 0.5, color: rgb(255, 255, 255), opacity: 0.5 });
    const r = reversedStops(g.stops);
    expect(r.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    expect(r[0]!.color.values).toEqual([100, 200, 50]);
    expect(r[2]!.color.values).toEqual([0, 0, 0]);
    expect(gradientColorAt(g.stops, -1).opacity).toBe(1);
  });
});
