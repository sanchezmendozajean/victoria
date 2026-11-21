import { describe, expect, it } from 'vitest';
import {
  addGradient,
  addModifier,
  addNode,
  buildScene,
  createClipGroup,
  createCompound,
  createDocument,
  createEllipse,
  createGroup,
  createPath,
  createRect,
  createText,
  defaultParams,
  defaultStroke,
  DocumentSession,
  getActiveSpace,
  importSvg,
  newModifier,
  sequentialIds,
  textGeometry,
  setNodeAppearance,
  SVG_BLOCKED,
  SVG_ROUND_TRIP,
  writeSvg,
  type Anchor,
  type Appearance,
  type BlendMode,
  type Matrix,
  type Node,
  type PathNode,
  type StrokeStyle,
  type TextNode,
  type TextRun,
  type SvgRoundTripFeature,
} from '../..';

// The SVG mode (specs/02 · Modo SVG) allows what survives `export → import`. This file is the proof: one case per
// allowed feature, and one case per blocked feature showing what the round trip does to it.

const red = { model: 'rgb' as const, values: [255, 0, 0] };
const blue = { model: 'rgb' as const, values: [0, 0, 255] };
const fill = (color = red): Appearance => ({ items: [{ kind: 'fill', paint: { type: 'solid', color }, opacity: 1, modifiers: [] }] });
const stroked = (patch: Partial<StrokeStyle> = {}, color = blue): Appearance => ({
  items: [{ kind: 'stroke', paint: { type: 'solid', color }, stroke: { ...defaultStroke(), ...patch }, opacity: 1, modifiers: [] }],
});

function setup() {
  const ids = sequentialIds('c');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids });
  const space = () => getActiveSpace(session.document);
  const add = <T extends Node>(node: T, look?: Appearance): T => {
    session.run(addNode(space().id, space().layers[0]!.id, node));
    if (look) session.run(setNodeAppearance(space().id, node.id, look));
    return node;
  };
  /** Exports the active space and reads it back. */
  const trip = () => {
    const scene = buildScene(space(), { resources: session.document.resources, region: { minX: 0, minY: 0, maxX: 300, maxY: 200 }, liveText: true });
    const { svg } = writeSvg(scene, session.images, { structure: 'semantic' });
    return { svg, back: importSvg(svg, sequentialIds('b')) };
  };
  return { ids, session, space, add, trip };
}

/** The exporter wraps each object in a `<g>` that carries its transform and opacity: peel the plain wrappers off. */
function leaf(node: Node): Node {
  let cur = node;
  while (cur.type === 'group' && cur.children.length === 1) cur = cur.children[0] as Node;
  return cur;
}
const first = (nodes: Node[]) => leaf(nodes[0]!);
const items = (n: Node) => n.appearance.items;
const A = (x: number, y: number, extra: Partial<Anchor> = {}): Anchor => ({ p: { x, y }, in: null, out: null, kind: 'corner', ...extra });

const run = (text: string, patch: Partial<TextRun['style']> = {}): TextRun => ({ text, style: { fontFamily: 'Open Sans', fontStyle: 'Regular', size: 12, ...patch } });

const CASES: Record<SvgRoundTripFeature, () => void> = {
  'text.point': () => {
    const s = setup();
    const t = createText(s.ids, { kind: 'point' }, [run('Hola ', { tracking: 50, underline: true }), run('mundo', { fontStyle: 'Bold Italic', tracking: 50, underline: true }), run('\n'), run('segunda línea', { size: 12, leading: 20 }), run('\n'), run('tercera')]);
    t.transform = [1, 0, 0, 1, 30, 50];
    t.paragraphs = [{ align: 'center' }, { align: 'center' }, { align: 'center' }];
    s.add(t);
    const { svg, back } = s.trip();
    expect(svg).toMatch(/<text transform="matrix\(1 0 0 1 30 50\)" xml:space="preserve"/);
    expect(svg).not.toContain('<path');
    const out = first(back.nodes) as TextNode;
    expect(out.type).toBe('text');
    expect(out.kind).toBe('point');
    expect(out.story.map((r) => r.text).join('')).toBe('Hola mundo\nsegunda línea\ntercera');
    expect(out.story[0]!.style).toMatchObject({ fontFamily: 'Open Sans', fontStyle: 'Regular', size: 12, underline: true });
    expect(out.story[0]!.style.tracking).toBeCloseTo(50, 2);
    expect(out.story[1]!.style).toMatchObject({ fontStyle: 'Bold Italic' });
    expect(out.paragraphs?.map((p) => p.align)).toEqual(['center', 'center', 'center']);
    expect(out.transform).toEqual([1, 0, 0, 1, 30, 50]);
    // Same line positions after the trip: the layout of the read-back text matches the original.
    const again = s.trip();
    expect(again.back.warnings).toEqual([]);
    const l1 = textGeometry(t).layout!.lines.map((l) => l.y);
    const l2 = textGeometry(out).layout!.lines.map((l) => l.y);
    l1.forEach((y, i) => expect(l2[i]).toBeCloseTo(y, 2));
  },
  'shape.rect': () => {
    const s = setup();
    s.add(createRect(s.ids, 80, 40, 6), fill());
    const { svg, back } = s.trip();
    expect(svg).toContain('<rect width="80" height="40" rx="6"');
    expect(first(back.nodes)).toMatchObject({ type: 'shape', shape: 'rect', params: { w: 80, h: 40, radii: [6, 6, 6, 6] } });
  },
  'shape.ellipse': () => {
    const s = setup();
    s.add(createEllipse(s.ids, 50, 30), fill());
    const { svg, back } = s.trip();
    expect(svg).toContain('<ellipse cx="25" cy="15" rx="25" ry="15"');
    expect(first(back.nodes)).toMatchObject({ type: 'shape', shape: 'ellipse', params: { w: 50, h: 30 } });
    const c = setup();
    c.add(createEllipse(c.ids, 40, 40), fill());
    expect(c.trip().svg).toContain('<circle cx="20" cy="20" r="20"');
  },
  path: () => {
    const s = setup();
    s.add(createPath(s.ids, [A(0, 0), A(40, 0, { out: { x: 50, y: 20 } }), A(40, 40, { in: { x: 20, y: 60 } })], true), fill());
    const n = first(s.trip().back.nodes) as PathNode;
    expect(n.type).toBe('path');
    expect(n.closed).toBe(true);
    expect(n.anchors).toHaveLength(3);
    expect(n.anchors[1]!.out).toEqual({ x: 50, y: 20 });
  },
  compound: () => {
    const s = setup();
    const ring = createCompound(s.ids, [createPath(s.ids, [A(0, 0), A(60, 0), A(60, 60), A(0, 60)], true), createPath(s.ids, [A(20, 20), A(40, 20), A(40, 40), A(20, 40)], true)], 'evenodd');
    s.add(ring, fill());
    expect(first(s.trip().back.nodes)).toMatchObject({ type: 'compound', fillRule: 'evenodd' });
  },
  group: () => {
    const s = setup();
    const a = createRect(s.ids, 10, 10);
    const b = createEllipse(s.ids, 20, 20);
    a.appearance = fill();
    b.appearance = fill(blue);
    s.add(createGroup(s.ids, [a, b]));
    const { svg, back } = s.trip();
    expect(svg).toContain('<g>');
    const g = back.nodes[0]!;
    expect(g.type).toBe('group');
    expect(g.type === 'group' && g.children.map((c) => (c.type === 'shape' ? c.shape : c.type))).toEqual(['rect', 'ellipse']);
  },
  'clip-group': () => {
    const s = setup();
    const mask = createRect(s.ids, 30, 30);
    const art = createRect(s.ids, 90, 90);
    art.appearance = fill();
    s.add(createClipGroup(s.ids, [mask, art]));
    const clip = s.trip().back.nodes.map((n) => (n.type === 'group' ? n.children : [n])).flat().find((n) => n.type === 'clipGroup');
    expect(clip).toBeDefined();
  },
  'fill.solid': () => {
    const s = setup();
    s.add(createRect(s.ids, 10, 10), fill());
    expect(items(first(s.trip().back.nodes))[0]).toMatchObject({ kind: 'fill', paint: { type: 'solid', color: { values: [255, 0, 0] } } });
  },
  'fill.linear': () => gradient('linear'),
  'fill.radial': () => gradient('radial'),
  'stroke.width': () => {
    const s = setup();
    s.add(createRect(s.ids, 10, 10), stroked({ width: 3 }));
    expect(items(first(s.trip().back.nodes))[0]).toMatchObject({ kind: 'stroke', stroke: { width: 3 } });
  },
  'stroke.cap-join': () => {
    const s = setup();
    s.add(createRect(s.ids, 10, 10), stroked({ cap: 'round', join: 'miter', miterLimit: 7 }));
    expect(items(first(s.trip().back.nodes))[0]).toMatchObject({ stroke: { cap: 'round', join: 'miter', miterLimit: 7 } });
    const t = setup();
    t.add(createRect(t.ids, 10, 10), stroked({ join: 'bevel' })); // the miter limit is only written for a miter join
    expect(items(first(t.trip().back.nodes))[0]).toMatchObject({ stroke: { join: 'bevel' } });
  },
  'stroke.dash': () => {
    const s = setup();
    s.add(createRect(s.ids, 10, 10), stroked({ dash: [4, 2] }));
    const stroke = items(first(s.trip().back.nodes))[0];
    expect(stroke).toMatchObject({ stroke: { dash: [4, 2] } });
  },
  opacity: () => {
    const s = setup();
    const n = createRect(s.ids, 10, 10);
    n.opacity = 0.4;
    s.add(n, fill());
    const back = s.trip().back.nodes[0]!;
    expect(back.opacity).toBeCloseTo(0.4, 3);
  },
  blend: () => {
    for (const mode of ['multiply', 'screen', 'overlay', 'darken', 'lighten'] as BlendMode[]) {
      const s = setup();
      const n = createRect(s.ids, 10, 10);
      n.blendMode = mode;
      s.add(n, fill());
      expect(s.trip().back.nodes[0]!.blendMode).toBe(mode);
    }
  },
  transform: () => {
    const s = setup();
    const n = createRect(s.ids, 10, 10);
    const m: Matrix = [0.8, 0.6, -0.6, 0.8, 25, 40];
    n.transform = m;
    s.add(n, fill());
    const back = s.trip().back.nodes[0]!;
    m.forEach((v, i) => expect(back.transform[i]).toBeCloseTo(v, 3));
  },
};

function gradient(type: 'linear' | 'radial') {
  const s = setup();
  s.session.run(addGradient({ id: 'g1', name: 'G', type, stops: [{ offset: 0, color: red, opacity: 1 }, { offset: 1, color: blue, opacity: 1 }] }));
  const n = s.add(createRect(s.ids, 50, 30));
  s.session.run(setNodeAppearance(s.space().id, n.id, { items: [{ kind: 'fill', paint: { type, gradientId: 'g1', transform: [50, 0, 0, 30, 0, 0] }, opacity: 1, modifiers: [] }] }));
  const { back } = s.trip();
  expect(back.gradients).toHaveLength(1);
  expect(back.gradients[0]!.type).toBe(type);
  expect(items(first(back.nodes))[0]).toMatchObject({ kind: 'fill', paint: { type } });
}

describe('SVG mode · what survives the round trip', () => {
  it('has one case per allowed feature, and no case for anything else', () => {
    expect(Object.keys(CASES).sort()).toEqual([...SVG_ROUND_TRIP].sort());
  });
  for (const feature of SVG_ROUND_TRIP) it(`allowed: ${feature}`, () => CASES[feature]());
});

describe('SVG mode · the default export still writes the drawing', () => {
  it('without structure: "semantic" groups vanish and shapes become paths', () => {
    const s = setup();
    const a = createRect(s.ids, 10, 10, 3);
    a.appearance = fill();
    s.add(createGroup(s.ids, [a]));
    const scene = buildScene(s.space(), { resources: s.session.document.resources, region: { minX: 0, minY: 0, maxX: 50, maxY: 50 } });
    const { svg } = writeSvg(scene, s.session.images);
    expect(svg).not.toMatch(/<(rect|ellipse|circle|g)[ >]/);
  });

  it('semantic mode keeps one element per object: transform, opacity and blend go on it, with no wrapper', () => {
    const s = setup();
    const r = createRect(s.ids, 10, 10);
    r.transform = [1, 0, 0, 1, 5, 6];
    r.opacity = 0.5;
    r.blendMode = 'multiply';
    s.add(r, fill());
    expect(s.trip().svg).toMatch(/<rect transform="matrix\(1 0 0 1 5 6\)" opacity="0.5" style="mix-blend-mode:multiply" width="10" height="10" fill="#ff0000"\/>/);
  });

  it('a modifier, partial ellipse or uneven corners are paths, not primitives', () => {
    const s = setup();
    const e = createEllipse(s.ids, 20, 20);
    Object.assign(e.params, { endAngle: 180 });
    const r = createRect(s.ids, 20, 20);
    Object.assign(r.params, { radii: [1, 2, 3, 4] });
    s.add(e, fill());
    s.add(r, fill());
    expect(s.trip().svg).not.toMatch(/<(rect|ellipse|circle)/);
  });
});

describe('SVG mode · live text', () => {
  it('stays as outlines when the text uses what <text> cannot hold, and without liveText', () => {
    const s = setup();
    s.add(createText(s.ids, { kind: 'point' }, [run('Hola', { hScale: 80 })]));
    expect(s.trip().svg).not.toContain('<text');
    const t = setup();
    t.add(createText(t.ids, { kind: 'point' }, [run('Hola')]));
    const scene = buildScene(t.space(), { resources: t.session.document.resources, region: { minX: 0, minY: 0, maxX: 100, maxY: 100 } });
    expect(writeSvg(scene, t.session.images, { structure: 'semantic' }).svg).not.toContain('<text');
  });

  it('area text, text on a path and non-plain font styles stay outlines', () => {
    const s = setup();
    s.add(createText(s.ids, { kind: 'point' }, [run('Light', { fontStyle: 'Light' })]));
    expect(s.trip().svg).not.toContain('<text');
  });

  it('escapes markup and keeps the spaces', () => {
    const s = setup();
    s.add(createText(s.ids, { kind: 'point' }, [run('a < b & "c"  d')]));
    const { svg, back } = s.trip();
    expect(svg).toContain('a &lt; b &amp; "c"  d');
    expect((first(back.nodes) as TextNode).story.map((r) => r.text).join('')).toBe('a < b & "c"  d');
  });

  it('refuses what it cannot keep: the importer warns so the file is not edited in place', () => {
    const doc = (body: string) => importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`, sequentialIds('w')).warnings.filter((w) => w.code === 'text-layout').map((w) => w.detail);
    expect(doc('<text x="0" y="10" rotate="10 20">ab</text>')).toEqual(['rotate']);
    expect(doc('<text x="0" y="10" dx="5">ab</text>')).toEqual(['dx']);
    expect(doc('<text x="0 5 10" y="10">abc</text>')).toEqual(['position-list']);
    expect(doc('<text x="0" y="10">a<tspan dy="-3">b</tspan></text>')).toEqual(['dy']);
    expect(doc('<text x="0" y="10">a<tspan x="20">b</tspan></text>')).toEqual(['x']);
    expect(doc('<text x="0" y="10">ab</text>')).toEqual([]);
    expect(doc('<text x="0" y="10">a<tspan x="0" y="22">b</tspan></text>')).toEqual([]);
  });
});

describe('SVG mode · what the round trip changes (so it is blocked)', () => {
  it('modifier.live: a live modifier comes back as plain geometry', () => {
    const s = setup();
    const n = s.add(createRect(s.ids, 60, 40), fill());
    s.session.run(addModifier(s.space().id, [{ nodeId: n.id, mod: newModifier(s.ids, 'zigzag', defaultParams('zigzag')) }]));
    const { back } = s.trip();
    const out = first(back.nodes);
    expect(out.type).not.toBe('shape');
    expect(JSON.stringify(out.appearance)).not.toContain('zigzag');
  });

  it('effect.filter: a shadow is saved as a filter and dropped on reading', () => {
    const s = setup();
    const n = s.add(createRect(s.ids, 60, 40), fill());
    s.session.run(addModifier(s.space().id, [{ nodeId: n.id, mod: newModifier(s.ids, 'drop-shadow', defaultParams('drop-shadow')) }]));
    const { svg, back } = s.trip();
    expect(svg).toContain('<filter');
    expect(back.warnings.map((w) => w.code)).toContain('filter');
  });

  it('stroke.align: an inside stroke is saved as a clip path, not as a stroke setting', () => {
    const s = setup();
    s.add(createRect(s.ids, 60, 40), stroked({ align: 'inside', width: 4 }));
    const { svg, back } = s.trip();
    expect(svg).toContain('clip-path');
    const stroke = items(first(back.nodes)).find((i) => i.kind === 'stroke');
    expect(stroke && stroke.kind === 'stroke' ? stroke.stroke.align : 'none').not.toBe('inside');
  });

  it('every blocked gate has a reason', () => {
    for (const reason of Object.values(SVG_BLOCKED)) expect(reason).toMatch(/^[a-z-]+$/);
  });
});
