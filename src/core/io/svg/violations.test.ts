import { describe, expect, it } from 'vitest';
import {
  addModifier,
  addNode,
  createDocument,
  createEllipse,
  createGroup,
  createPath,
  createPolygon,
  createRect,
  createText,
  defaultParams,
  defaultStroke,
  documentFromDrawings,
  DocumentSession,
  getActiveSpace,
  importSvg,
  newModifier,
  sequentialIds,
  setNodeAppearance,
  svgGuard,
  svgViolations,
  type Appearance,
  type Node,
  type SvgGate,
} from '../..';

const red = { model: 'rgb' as const, values: [255, 0, 0] };
const fillItem = { kind: 'fill' as const, paint: { type: 'solid' as const, color: red }, opacity: 1, modifiers: [] };
const strokeItem = (patch: object = {}) => ({ kind: 'stroke' as const, paint: { type: 'solid' as const, color: red }, stroke: { ...defaultStroke(), ...patch }, opacity: 1, modifiers: [] });

function setup() {
  const ids = sequentialIds('v');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids });
  const space = () => getActiveSpace(session.document);
  const add = <T extends Node>(node: T, look?: Appearance): T => {
    session.run(addNode(space().id, space().layers[0]!.id, node));
    if (look) session.run(setNodeAppearance(space().id, node.id, look));
    return node;
  };
  return { ids, session, space, add };
}

const gatesOf = (s: ReturnType<typeof setup>): SvgGate[] => [...svgViolations(s.session.document)];
const run = (node: (ids: ReturnType<typeof sequentialIds>) => Node, look?: Appearance) => {
  const s = setup();
  s.add(node(s.ids), look);
  return gatesOf(s);
};

describe('svgViolations', () => {
  it('finds nothing in a document of plain shapes, paths and point text', () => {
    const s = setup();
    s.add(createRect(s.ids, 10, 10, 2), { items: [fillItem, strokeItem()] });
    s.add(createEllipse(s.ids, 10, 10), { items: [fillItem] });
    s.add(createPolygon(s.ids, 10, 5), { items: [fillItem] });
    s.add(createText(s.ids, { kind: 'point' }, [{ text: 'Hola', style: { fontFamily: 'Open Sans', fontStyle: 'Bold', size: 12 } }]));
    expect(gatesOf(s)).toEqual([]);
  });

  it('a clean SVG import starts with no violations (so the SVG mode can edit it at all)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><clipPath id="c"><rect width="50" height="50"/></clipPath></defs>
      <rect width="80" height="40" rx="5" fill="url(#g)" stroke="#000" stroke-width="2" stroke-dasharray="4 2"/><g opacity="0.5"><circle cx="50" cy="50" r="10" fill="#0f0"/><path d="M0 0L10 10" stroke="#00f" fill="none"/></g>
      <g clip-path="url(#c)"><rect width="90" height="90" fill="#f0f"/></g><text x="10" y="20" font-family="Open Sans" font-size="12" fill="#123456">Hola<tspan x="10" y="34">mundo</tspan></text></svg>`;
    const result = importSvg(svg, sequentialIds('i'));
    expect(result.warnings).toEqual([]);
    const { document } = documentFromDrawings([result], { name: 'x', space: () => 's', artboard: () => 'a', layer: () => 'l' }, sequentialIds('d'), '2026-01-01T00:00:00.000Z');
    expect([...svgViolations(document)]).toEqual([]);
  });

  it('names each feature an SVG cannot keep', () => {
    const shadow = (s: ReturnType<typeof setup>, n: Node, id: string) => s.session.run(addModifier(s.space().id, [{ nodeId: n.id, mod: newModifier(s.ids, id, defaultParams(id)) }]));
    const s = setup();
    const a = s.add(createRect(s.ids, 10, 10), { items: [fillItem] });
    shadow(s, a, 'drop-shadow');
    expect(gatesOf(s)).toContain('effect.filter');
    const b = setup();
    shadow(b, b.add(createRect(b.ids, 10, 10), { items: [fillItem] }), 'blur');
    expect(gatesOf(b)).toContain('effect.filter');
    const c = setup();
    shadow(c, c.add(createRect(c.ids, 10, 10), { items: [fillItem] }), 'zigzag');
    expect(gatesOf(c)).toContain('modifier.live');

    expect(run((ids) => createRect(ids, 9, 9), { items: [strokeItem({ align: 'inside' })] })).toContain('stroke.align');
    expect(run((ids) => createRect(ids, 9, 9), { items: [strokeItem({ profile: 'taper' })] })).toContain('stroke.profile');
    expect(run((ids) => createRect(ids, 9, 9), { items: [strokeItem({ endArrow: 'simple' })] })).toContain('stroke.arrow');
    expect(run((ids) => createRect(ids, 9, 9), { items: [fillItem, fillItem] })).toContain('appearance.multiple');
    expect(run((ids) => createRect(ids, 9, 9), { items: [strokeItem(), fillItem] })).toContain('appearance.multiple');
    expect(run((ids) => createRect(ids, 9, 9), { items: [{ ...fillItem, visible: false }] })).toContain('appearance.hidden');
    expect(run((ids) => createPolygon(ids, 9, 5, 2), { items: [fillItem] })).toContain('corner.live');
    expect(run((ids) => createPath(ids, [{ p: { x: 0, y: 0 }, in: null, out: null, kind: 'corner', cornerRadius: 3 }, { p: { x: 9, y: 0 }, in: null, out: null, kind: 'corner' }], false))).toContain('corner.live');
    const uneven = createRect(sequentialIds('u'), 9, 9);
    uneven.params.radii = [1, 2, 3, 4];
    expect(run(() => uneven)).toContain('corner.live');
    expect(run((ids) => createText(ids, { kind: 'point' }, [{ text: 'A', style: { fontFamily: 'X', fontStyle: 'Regular', size: 12, hScale: 80 } }]))).toContain('text.advanced');
    expect(run((ids) => createText(ids, { kind: 'area', frame: { anchors: [], closed: true } }, [{ text: 'A', style: { fontFamily: 'X', fontStyle: 'Regular', size: 12 } }]))).toContain('text.area');
  });

  it('flags a live blend and a live trace (built directly: the session would refresh a made-up blend)', () => {
    const ids = sequentialIds('g');
    const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
    const layer = doc.spaces[0]!.layers[0]!;
    layer.children.push({ ...createGroup(ids, [createRect(ids, 5, 5)]), blend: { steps: 3, keys: [] } });
    expect([...svgViolations(doc)]).toEqual(['blend.live']);
    layer.children.length = 0;
    layer.children.push({ ...createGroup(ids, [createRect(ids, 5, 5)]), trace: { imageId: 'h' } as never });
    expect([...svgViolations(doc)]).toEqual(['trace.live']);
  });

  it('flags more than one artboard or Space', () => {
    const s = setup();
    s.session.run({ label: 'x', apply: (d) => void d.spaces[0]!.artboards.push({ ...d.spaces[0]!.artboards[0]!, id: 'second' }) });
    expect(gatesOf(s)).toContain('artboard.multiple');
  });
});

describe('svgGuard on a session', () => {
  it('refuses a command that adds an unsupported feature, tells why, and leaves the document untouched', () => {
    const s = setup();
    const refused: SvgGate[] = [];
    s.session.setGuard(svgGuard((gate) => refused.push(gate)));
    const n = s.add(createRect(s.ids, 10, 10), { items: [fillItem] });
    const revision = s.session.revision;
    const ok = s.session.run(addModifier(s.space().id, [{ nodeId: n.id, mod: newModifier(s.ids, 'drop-shadow', defaultParams('drop-shadow')) }]));
    expect(ok).toBe(false);
    expect(refused).toEqual(['effect.filter']);
    expect(s.session.revision).toBe(revision);
    expect(s.session.canUndo).toBe(true);
    expect(gatesOf(s)).toEqual([]);
  });

  it('lets everything else through, and undo and redo too', () => {
    const s = setup();
    s.session.setGuard(svgGuard(() => undefined));
    const n = s.add(createRect(s.ids, 10, 10), { items: [fillItem] });
    expect(s.session.run(setNodeAppearance(s.space().id, n.id, { items: [fillItem, strokeItem()] }))).toBe(true);
    expect(s.session.undo()).toBe(true);
    expect(s.session.redo()).toBe(true);
  });

  it('does not lock a document that already had the feature: it may keep editing, just not add more kinds', () => {
    const s = setup();
    const n = s.add(createRect(s.ids, 10, 10), { items: [fillItem, fillItem] }); // already 'appearance.multiple'
    s.session.setGuard(svgGuard(() => undefined));
    expect(s.session.run(setNodeAppearance(s.space().id, n.id, { items: [{ ...fillItem, opacity: 0.5 }, fillItem] }))).toBe(true);
  });
});
