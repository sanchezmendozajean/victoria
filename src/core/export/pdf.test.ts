import { decodePDFRawStream, PDFDocument, type PDFRawStream } from 'pdf-lib';
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
  writePdf,
  type Appearance,
  type Node,
  type StrokeStyle,
} from '..';

// A real 1×1 PNG: pdf-lib decodes the image to embed it.
const PIXEL = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

const red = { model: 'rgb' as const, values: [255, 0, 0] };
const blue = { model: 'rgb' as const, values: [0, 0, 255] };
const black = { model: 'rgb' as const, values: [0, 0, 0] };

function setup() {
  const ids = sequentialIds('p');
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
  const scene = (w = 200, h = 100) => buildScene(space(), { resources: session.document.resources, region: { minX: 0, minY: 0, maxX: w, maxY: h } });
  const pdf = (images: ImageStore = session.images, formats?: Record<string, 'png' | 'jpeg' | 'webp'>) => writePdf([scene()], images, formats ? { imageFormats: formats } : {});
  return { ids, session, space, layerId, add, look, stroke, scene, pdf };
}

const fillRed = (): Appearance => ({ items: [{ kind: 'fill', paint: { type: 'solid', color: red }, opacity: 1, modifiers: [] }] });

async function pageContent(bytes: Uint8Array, index = 0): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const stream = doc.getPage(index).node.Contents();
  return new TextDecoder('latin1').decode(decodePDFRawStream(stream as PDFRawStream).decode());
}

const raw = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('PDF export', () => {
  it('writes a valid PDF with a page of the size of the scene, one page per scene', async () => {
    const s = setup();
    const a = s.add(createRect(s.ids, 10, 10));
    s.look(a.id, fillRed());
    const { bytes } = await writePdf([s.scene(200, 100), s.scene(80, 60)], s.session.images);
    expect(raw(bytes).startsWith('%PDF-')).toBe(true);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 200, height: 100 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 80, height: 60 });
  });

  it('flips to Y-up once, then draws the path with a fill colour', async () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 100, 50));
    s.look(r.id, fillRed());
    const text = await pageContent((await s.pdf()).bytes);
    expect(text.split('\n')[0]).toBe('1 0 0 -1 0 100 cm');
    expect(text).toContain('1 0 0 rg');
    expect(text).toContain('0 0 m\n100 0 l\n100 50 l\n0 50 l\nh\nf');
  });

  it('strokes with width, cap, join, miter limit and dashes', async () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    s.look(r.id, { items: [{ kind: 'stroke', paint: { type: 'solid', color: blue }, stroke: s.stroke({ width: 3, cap: 'round', join: 'bevel', miterLimit: 7, dash: [4, 2] }), opacity: 1, modifiers: [] }] });
    const text = await pageContent((await s.pdf()).bytes);
    expect(text).toContain('0 0 1 RG');
    expect(text).toContain('3 w\n1 J\n2 j\n7 M\n[4 2] 0 d');
    expect(text).toMatch(/\nS\n/);
  });

  it('inside strokes are twice as wide and clipped to the shape', async () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    s.look(r.id, { items: [{ kind: 'stroke', paint: { type: 'solid', color: black }, stroke: s.stroke({ width: 4, align: 'inside' }), opacity: 1, modifiers: [] }] });
    const text = await pageContent((await s.pdf()).bytes);
    expect(text).toContain('W n');
    expect(text).toContain('8 w');
  });

  it('opacity and blend mode become graphics states, accumulating through groups', async () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    s.look(r.id, { items: [{ kind: 'fill', paint: { type: 'solid', color: red }, opacity: 0.5, modifiers: [] }] });
    s.session.run({ label: 'node', apply: (d) => void Object.assign(d.spaces[0]!.layers[0]!.children[0]!, { opacity: 0.5, blendMode: 'multiply' }) });
    const { bytes } = await s.pdf();
    const file = raw(bytes);
    expect(file).toContain('/BM /Multiply');
    expect(file).toMatch(/\/ca 0\.25\b/); // 0.5 of the node × 0.5 of the fill
    expect(await pageContent(bytes)).toMatch(/\/GS1 gs/);
  });

  it('gradients are shading patterns with a stitching function for several stops', async () => {
    const s = setup();
    s.session.run(
      addGradient({
        id: 'g1',
        name: 'G',
        type: 'linear',
        stops: [
          { offset: 0, color: red, opacity: 1 },
          { offset: 0.5, color: blue, opacity: 1 },
          { offset: 1, color: black, opacity: 1 },
        ],
      }),
    );
    s.session.run(addGradient({ id: 'g2', name: 'R', type: 'radial', stops: [{ offset: 0, color: red, opacity: 1 }, { offset: 1, color: blue, opacity: 1 }] }));
    const a = s.add(createRect(s.ids, 100, 100));
    const b = s.add(createEllipse(s.ids, 50, 50));
    s.look(a.id, { items: [{ kind: 'fill', paint: { type: 'linear', gradientId: 'g1', transform: [100, 0, 0, 100, 0, 0] }, opacity: 1, modifiers: [] }] });
    s.look(b.id, { items: [{ kind: 'fill', paint: { type: 'radial', gradientId: 'g2', transform: [25, 0, 0, 25, 25, 25] }, opacity: 1, modifiers: [] }] });
    const { bytes, warnings } = await s.pdf();
    const file = raw(bytes);
    expect(file).toContain('/ShadingType 2');
    expect(file).toContain('/ShadingType 3');
    expect(file).toContain('/FunctionType 3');
    expect(file).toContain('/PatternType 2');
    expect(warnings).toEqual([]);
    const text = await pageContent(bytes);
    expect(text).toMatch(/\/Pattern cs \/P1 scn/);
    expect(text).toMatch(/\/Pattern cs \/P2 scn/);
  });

  it('warns that gradient transparency is not kept', async () => {
    const s = setup();
    s.session.run(addGradient({ id: 'g1', name: 'G', type: 'linear', stops: [{ offset: 0, color: red, opacity: 1 }, { offset: 1, color: red, opacity: 0 }] }));
    const a = s.add(createRect(s.ids, 100, 100));
    s.look(a.id, { items: [{ kind: 'fill', paint: { type: 'linear', gradientId: 'g1', transform: [100, 0, 0, 100, 0, 0] }, opacity: 1, modifiers: [] }] });
    expect((await s.pdf()).warnings.map((w) => w.code)).toEqual(['gradient-alpha']);
  });

  it('clipping groups write a clip path before their content', async () => {
    const s = setup();
    const content = s.add(createRect(s.ids, 100, 100));
    const mask = s.add(createRect(s.ids, 40, 40));
    s.look(content.id, fillRed());
    s.look(mask.id, fillRed());
    s.session.run(groupNodes(s.space().id, [content.id, mask.id], createClipGroup(s.ids, [])));
    const text = await pageContent((await s.pdf()).bytes);
    expect(text).toContain('0 0 m\n40 0 l\n40 40 l\n0 40 l\nh\nW n');
    expect(text.indexOf('W n')).toBeLessThan(text.lastIndexOf('rg'));
  });

  it('embeds PNG images once per file and reports a missing or WebP file', async () => {
    const s = setup();
    const added = s.session.images.add(Uint8Array.from([...PIXEL]));
    // The 1×1 PNG has a real header, so it is a valid image resource.
    expect(added).not.toBeNull();
    const resource = { width: 1, height: 1, format: 'png' as const };
    s.session.run(placeImage(s.space().id, s.layerId(), createImage(s.ids, added!.hash, 40, 40), resource));
    s.session.run(placeImage(s.space().id, s.layerId(), createImage(s.ids, added!.hash, 40, 40), resource));
    const ok = await s.pdf();
    expect(ok.warnings).toEqual([]);
    // One image XObject plus its soft mask (the PNG is RGBA), embedded once although it is placed twice.
    expect((raw(ok.bytes).match(/\/Subtype \/Image/g) ?? []).length).toBe(2);
    const content = await pageContent(ok.bytes);
    expect(content).toContain('40 0 0 -40 0 40 cm\n/Im1 Do');
    expect((content.match(/\/Im1 Do/g) ?? []).length).toBe(2);

    expect((await s.pdf(new ImageStore())).warnings.map((w) => w.code)).toEqual(['image-missing']);
    expect((await s.pdf(s.session.images, { [added!.hash]: 'webp' })).warnings.map((w) => w.code)).toEqual(['image-format']);
  });

  it('leaves out shadows with a warning but still draws the object', async () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 50, 50));
    s.look(r.id, fillRed());
    s.session.run(addModifier(s.space().id, [{ nodeId: r.id, mod: newModifier(s.ids, 'drop-shadow', { ...defaultParams('drop-shadow'), blur: 6 }) }]));
    const { bytes, warnings } = await s.pdf();
    expect(warnings.map((w) => w.code)).toEqual(['effects-unsupported']);
    expect(await pageContent(bytes)).toContain('1 0 0 rg');
  });

  it('paints the background behind everything', async () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 10, 10));
    s.look(r.id, fillRed());
    const { bytes } = await writePdf([{ ...s.scene(), background: [255, 255, 255] }], s.session.images);
    const text = await pageContent(bytes);
    expect(text.indexOf('1 1 1 rg')).toBeGreaterThan(-1);
    expect(text.indexOf('1 1 1 rg')).toBeLessThan(text.indexOf('1 0 0 rg'));
  });
});
