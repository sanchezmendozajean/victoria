import { describe, expect, it } from 'vitest';
import {
  addGradient,
  addModifier,
  addNode,
  buildScene,
  createClipGroup,
  createDocument,
  createEllipse,
  createImage,
  createRect,
  defaultParams,
  defaultStroke,
  DocumentSession,
  getActiveSpace,
  groupNodes,
  ImageStore,
  newModifier,
  placeImage,
  sequentialIds,
  setNodeAppearance,
  translation,
  writeSvg,
  type Appearance,
  type Node,
  type StrokeStyle,
} from '..';

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0, 0, 0, 0, 0,
]);

const red = { model: 'rgb' as const, values: [255, 0, 0] };
const black = { model: 'rgb' as const, values: [0, 0, 0] };

function setup() {
  const ids = sequentialIds('x');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids });
  const space = () => getActiveSpace(session.document);
  const layerId = () => space().layers[0]!.id;
  const add = <T extends Node>(node: T): T => {
    session.run(addNode(space().id, layerId(), node));
    return node;
  };
  const look = (id: string, appearance: Appearance) => session.run(setNodeAppearance(space().id, id, appearance));
  const stroke = (patch: Partial<StrokeStyle> = {}) => ({ ...defaultStroke(), ...patch });
  const scene = (region = { minX: 0, minY: 0, maxX: 200, maxY: 200 }) => buildScene(space(), { resources: session.document.resources, region });
  const svg = (region?: Parameters<typeof scene>[0], minify = true) => writeSvg(scene(region), session.images, { minify });
  return { ids, session, space, layerId, add, look, stroke, scene, svg };
}

const fillRed = (): Appearance => ({ items: [{ kind: 'fill', paint: { type: 'solid', color: red }, opacity: 1, modifiers: [] }] });

describe('SVG export', () => {
  it('writes a viewBox of the region and the contour of a filled rectangle with its transform', () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 100, 50));
    s.session.run({ label: 'move', apply: (d) => void ((d.spaces[0]!.layers[0]!.children[0] as unknown as { transform: number[] }).transform = [1, 0, 0, 1, 10, 20]) });
    s.look(r.id, fillRed());
    const { svg } = s.svg({ minX: 0, minY: 0, maxX: 300, maxY: 200 });
    expect(svg).toContain('viewBox="0 0 300 200"');
    expect(svg).toContain('width="300" height="200"');
    expect(svg).toContain('<g transform="matrix(1 0 0 1 10 20)">');
    expect(svg).toContain('d="M0 0L100 0L100 50L0 50Z" fill="#ff0000"');
  });

  it('shifts everything so that the region starts at (0, 0)', () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 10, 10));
    s.look(r.id, fillRed());
    const { svg } = s.svg({ minX: -5, minY: -7, maxX: 95, maxY: 93 });
    expect(svg).toContain('matrix(1 0 0 1 5 7)');
  });

  it('leaves out what is outside the region, hidden objects and hidden layers', () => {
    const s = setup();
    const inside = s.add(createRect(s.ids, 10, 10));
    const far = s.add(createRect(s.ids, 10, 10));
    const hidden = s.add(createRect(s.ids, 10, 10));
    for (const n of [inside, far, hidden]) s.look(n.id, fillRed());
    s.session.run({
      label: 'arrange',
      apply: (d) => {
        const kids = d.spaces[0]!.layers[0]!.children as Array<{ id: string; transform: number[]; visible: boolean }>;
        kids.find((k) => k.id === far.id)!.transform = [1, 0, 0, 1, 5000, 0];
        kids.find((k) => k.id === hidden.id)!.visible = false;
      },
    });
    const scene = s.scene();
    const text = writeSvg(scene, s.session.images, { minify: true }).svg;
    expect((text.match(/<path /g) ?? []).length).toBe(1);
  });

  it('opacity and blend mode go on the group, the stroke keeps cap, join, miter and dashes', () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    s.look(r.id, { items: [{ kind: 'stroke', paint: { type: 'solid', color: black }, stroke: s.stroke({ width: 3, cap: 'round', join: 'miter', miterLimit: 6, dash: [4, 2] }), opacity: 0.5, modifiers: [] }] });
    s.session.run({ label: 'node', apply: (d) => void Object.assign(d.spaces[0]!.layers[0]!.children[0]!, { opacity: 0.4, blendMode: 'multiply' }) });
    const { svg } = s.svg();
    expect(svg).toContain('opacity="0.4"');
    expect(svg).toContain('style="mix-blend-mode:multiply"');
    expect(svg).toContain('stroke="#000000" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="6" stroke-dasharray="4 2"');
    expect(svg).toContain('fill="none"');
  });

  it('a fill and a centred stroke of the same shape make one element, but an inside stroke stays apart', () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    const both = (align: StrokeStyle['align']): Appearance => ({ items: [...fillRed().items, { kind: 'stroke', paint: { type: 'solid', color: black }, stroke: s.stroke({ width: 2, align }), opacity: 1, modifiers: [] }] });
    s.look(r.id, both('center'));
    const merged = s.svg().svg;
    expect((merged.match(/<path /g) ?? []).length).toBe(1);
    expect(merged).toMatch(/<path d="M0 0L50 0L50 50L0 50Z" fill="#ff0000" stroke="#000000" stroke-width="2"/);
    s.look(r.id, both('inside'));
    expect((s.svg().svg.match(/<path /g) ?? []).length).toBe(2);
  });

  it('inside and outside strokes are drawn twice as wide inside a clip path', () => {
    const s = setup();
    const a = s.add(createRect(s.ids, 50, 50));
    s.look(a.id, { items: [{ kind: 'stroke', paint: { type: 'solid', color: black }, stroke: s.stroke({ width: 4, align: 'inside' }), opacity: 1, modifiers: [] }] });
    const inside = s.svg().svg;
    expect(inside).toContain('stroke-width="8"');
    expect(inside).toMatch(/<clipPath id="c\d+"><path d="M0 0L50 0L50 50L0 50Z" clip-rule="nonzero"\/><\/clipPath>/);
    s.look(a.id, { items: [{ kind: 'stroke', paint: { type: 'solid', color: black }, stroke: s.stroke({ width: 4, align: 'outside' }), opacity: 1, modifiers: [] }] });
    const outside = s.svg().svg;
    expect(outside).toContain('clip-rule="evenodd"');
    expect(outside).toContain('stroke-width="8"');
  });

  it('gradients keep their unit space, stops and midpoints', () => {
    const s = setup();
    s.session.run(
      addGradient({
        id: 'g1',
        name: 'G',
        type: 'linear',
        stops: [
          { offset: 0, color: red, opacity: 1, midpoint: 0.25 },
          { offset: 1, color: black, opacity: 0.5 },
        ],
      }),
    );
    const e = s.add(createEllipse(s.ids, 100, 100));
    s.look(e.id, { items: [{ kind: 'fill', paint: { type: 'linear', gradientId: 'g1', transform: [100, 0, 0, 100, 0, 0] }, opacity: 1, modifiers: [] }] });
    const { svg } = s.svg();
    expect(svg).toContain('<linearGradient id="g1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(100 0 0 100 0 0)" x1="0" y1="0" x2="1" y2="0">');
    expect(svg).toContain('<stop offset="0" stop-color="#ff0000"/>');
    expect(svg).toContain('<stop offset="0.25"'); // the midpoint became a stop
    expect(svg).toContain('stop-opacity="0.5"');
    expect(svg).toMatch(/fill="url\(#g\d+\)"/);
  });

  it('a clipping group becomes a group with a clip path in the mask coordinates', () => {
    const s = setup();
    const content = s.add(createRect(s.ids, 100, 100));
    const mask = s.add(createRect(s.ids, 40, 40)); // the topmost becomes the mask
    s.look(content.id, fillRed());
    s.look(mask.id, fillRed());
    const clip = createClipGroup(s.ids, []);
    s.session.run(groupNodes(s.space().id, [content.id, mask.id], clip));
    const { svg } = s.svg();
    expect(svg).toMatch(/<g clip-path="url\(#c\d+\)">/);
    expect(svg).toMatch(/<clipPath id="c\d+"><path d="M0 0L40 0L40 40L0 40Z" clip-rule="nonzero"\/><\/clipPath>/);
  });

  it('embeds an image once as a data URI and reuses it; a missing file is reported', () => {
    const s = setup();
    const added = s.session.images.add(PNG)!;
    const resource = { width: 64, height: 32, format: 'png' as const };
    s.session.run(placeImage(s.space().id, s.layerId(), createImage(s.ids, added.hash, 64, 32), resource));
    s.session.run(placeImage(s.space().id, s.layerId(), createImage(s.ids, added.hash, 64, 32, translation(100, 0)), resource));
    const { svg, warnings } = s.svg();
    expect((svg.match(/<image /g) ?? []).length).toBe(1);
    expect((svg.match(/<use /g) ?? []).length).toBe(2);
    expect(svg).toContain('href="data:image/png;base64,iVBORw0KGgo');
    expect(warnings).toEqual([]);

    const missing = writeSvg(s.scene(), new ImageStore(), { minify: true });
    expect(missing.warnings.map((w) => w.code)).toEqual(['image-missing']);
    expect(missing.svg).not.toContain('<use ');
  });

  it('a drop shadow becomes a filter that draws only the shadow, before the object', () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    s.look(r.id, fillRed());
    s.session.run(addModifier(s.space().id, [{ nodeId: r.id, mod: newModifier(s.ids, 'drop-shadow', { ...defaultParams('drop-shadow'), dx: 6, dy: 8, blur: 10, opacity: 60 }) }]));
    const { svg } = s.svg();
    expect(svg).toMatch(/<filter id="f\d+"[^>]*><feGaussianBlur in="SourceAlpha" stdDeviation="5"\/><feOffset dx="6" dy="8" result="o"\/>/);
    expect(svg).toContain('flood-opacity="0.6"');
    const shadowAt = svg.indexOf('filter="url(');
    const objectAt = svg.indexOf('fill="#ff0000"');
    expect(shadowAt).toBeGreaterThan(-1);
    expect(shadowAt).toBeLessThan(objectAt);
  });

  it('paints the background first and can be written without line breaks', () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 10, 10));
    s.look(r.id, fillRed());
    const scene = { ...s.scene(), background: [255, 255, 255] as [number, number, number] };
    const pretty = writeSvg(scene, s.session.images).svg;
    expect(pretty.indexOf('<rect width="200" height="200" fill="#ffffff"/>')).toBeLessThan(pretty.indexOf('<path'));
    expect(pretty).toContain('\n');
    expect(writeSvg(scene, s.session.images, { minify: true }).svg).not.toContain('\n');
  });

  it('the output is well-formed: every tag opens and closes', () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    s.look(r.id, { items: [...fillRed().items, { kind: 'stroke', paint: { type: 'solid', color: black }, stroke: s.stroke({ align: 'inside' }), opacity: 1, modifiers: [] }] });
    const { svg } = s.svg(undefined, false);
    const opens = [...svg.matchAll(/<([a-zA-Z]+)(?:\s[^>]*[^/])?>/g)].map((m) => m[1]);
    const closes = [...svg.matchAll(/<\/([a-zA-Z]+)>/g)].map((m) => m[1]);
    expect(opens.sort()).toEqual(closes.sort());
  });
});
