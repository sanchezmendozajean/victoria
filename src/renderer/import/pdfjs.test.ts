import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import {
  addGradient,
  addNode,
  applyToPoint,
  buildScene,
  createClipGroup,
  createDocument,
  createEllipse,
  createRect,
  defaultStroke,
  DocumentSession,
  geometryBounds,
  getActiveSpace,
  groupNodes,
  nodeGeometry,
  sequentialIds,
  setNodeAppearance,
  writePdf,
  type Appearance,
  type ClipGroupNode,
  type Node,
  type PathNode,
} from '../../core';
import { readPdf, type PdfJs } from './pdfjs';

const pdfjs = pdfjsLegacy as unknown as PdfJs;
const red = { model: 'rgb' as const, values: [255, 0, 0] };
const blue = { model: 'rgb' as const, values: [0, 0, 255] };

function setup() {
  const ids = sequentialIds('d');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids });
  const space = () => getActiveSpace(session.document);
  const add = <T extends Node>(n: T): T => {
    session.run(addNode(space().id, space().layers[0]!.id, n));
    return n;
  };
  const look = (id: string, appearance: Appearance) => session.run(setNodeAppearance(space().id, id, appearance));
  const pdf = async (width = 200, height = 100, pages = 1) => {
    const scene = buildScene(space(), { resources: session.document.resources, region: { minX: 0, minY: 0, maxX: width, maxY: height } });
    return (await writePdf(Array.from({ length: pages }, () => scene), session.images)).bytes;
  };
  return { ids, session, space, add, look, pdf };
}

const bounds = (n: Node) => {
  const b = geometryBounds(nodeGeometry(n)!)!;
  const p = applyToPoint(n.transform, { x: b.minX, y: b.minY });
  const q = applyToPoint(n.transform, { x: b.maxX, y: b.maxY });
  return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
};
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 1));

describe('readPdf with the real pdf.js', () => {
  it('reads back a PDF made by the exporter: shapes in place, colours, stroke, dashes and opacity', async () => {
    const s = setup();
    const rect = createRect(s.ids, 80, 40, 6);
    rect.transform = [1, 0, 0, 1, 20, 30];
    const r = s.add(rect);
    s.look(r.id, {
      items: [
        { kind: 'fill', paint: { type: 'solid', color: red }, opacity: 0.5, modifiers: [] },
        { kind: 'stroke', paint: { type: 'solid', color: blue }, stroke: { ...defaultStroke(), width: 3, dash: [4, 2], cap: 'round', join: 'bevel' }, opacity: 1, modifiers: [] },
      ],
    });
    const { pages, pageCount } = await readPdf(await s.pdf(), sequentialIds('i'), pdfjs);
    expect(pageCount).toBe(1);
    expect(pages[0]).toMatchObject({ width: 200, height: 100 });
    const nodes = pages[0]!.nodes;
    // The exporter writes the fill and the stroke as two operations; the PDF has no "one object".
    const fill = nodes.find((n) => n.appearance.items.some((i) => i.kind === 'fill'))!;
    const stroke = nodes.find((n) => n.appearance.items.some((i) => i.kind === 'stroke'))!;
    near(bounds(fill), [20, 30, 100, 70]);
    expect(fill.appearance.items[0]).toMatchObject({ kind: 'fill', paint: { color: { values: [255, 0, 0] } }, opacity: 0.5 });
    expect(stroke.appearance.items[0]).toMatchObject({ kind: 'stroke', paint: { color: { values: [0, 0, 255] } }, stroke: { width: 3, dash: [4, 2], cap: 'round', join: 'bevel' } });
  });

  it('reads a gradient back with the matrix it was written with', async () => {
    const s = setup();
    s.session.run(addGradient({ id: 'g', name: 'G', type: 'linear', stops: [{ offset: 0, color: red, opacity: 1 }, { offset: 0.5, color: { model: 'rgb', values: [0, 255, 0] }, opacity: 1 }, { offset: 1, color: blue, opacity: 1 }] }));
    const e0 = createEllipse(s.ids, 100, 60);
    e0.transform = [1, 0, 0, 1, 10, 20];
    const e = s.add(e0);
    s.look(e.id, { items: [{ kind: 'fill', paint: { type: 'linear', gradientId: 'g', transform: [100, 0, 0, 60, 0, 0] }, opacity: 1, modifiers: [] }] });
    const { pages } = await readPdf(await s.pdf(), sequentialIds('i'), pdfjs);
    const page = pages[0]!;
    expect(page.warnings).toEqual([]);
    expect(page.gradients).toHaveLength(1);
    // pdf.js hands the gradient over sampled at 256 points, so the ends can be off by one level.
    expect(page.gradients[0]!.stops.map((st) => st.offset)).toEqual([0, 0.5, 1]);
    page.gradients[0]!.stops.forEach((st, i) => st.color.values.forEach((v, k) => expect(Math.abs(v - [[255, 0, 0], [0, 255, 0], [0, 0, 255]][i]![k]!)).toBeLessThanOrEqual(2)));
    const paint = page.nodes[0]!.appearance.items[0]!;
    if (paint.kind !== 'fill' || paint.paint.type !== 'linear') throw new Error('not a linear gradient');
    // Written in the ellipse's own space with the object moved to (10, 20): read back in page space.
    const from = applyToPoint(paint.paint.transform, { x: 0, y: 0 });
    const to = applyToPoint(paint.paint.transform, { x: 1, y: 0 });
    expect([from.x, from.y]).toEqual([10, 20]);
    expect([to.x, to.y]).toEqual([110, 20]);
  });

  it('keeps a clipping group as a clipping group', async () => {
    const s = setup();
    const content = s.add(createRect(s.ids, 100, 100));
    const mask = s.add(createRect(s.ids, 40, 40));
    s.look(content.id, { items: [{ kind: 'fill', paint: { type: 'solid', color: red }, opacity: 1, modifiers: [] }] });
    s.session.run(groupNodes(s.space().id, [content.id, mask.id], createClipGroup(s.ids, [])));
    const { pages } = await readPdf(await s.pdf(), sequentialIds('i'), pdfjs);
    const clip = pages[0]!.nodes[0] as ClipGroupNode;
    expect(clip.type).toBe('clipGroup');
    near(bounds(clip.children[0]!), [0, 0, 40, 40]);
    near(bounds(clip.children[1]!), [0, 0, 100, 100]);
  });

  it('brings every page, each with its own size', async () => {
    const s = setup();
    const r = s.add(createRect(s.ids, 10, 10));
    s.look(r.id, { items: [{ kind: 'fill', paint: { type: 'solid', color: red }, opacity: 1, modifiers: [] }] });
    const bytes = (
      await writePdf(
        [
          buildScene(s.space(), { resources: s.session.document.resources, region: { minX: 0, minY: 0, maxX: 200, maxY: 100 } }),
          buildScene(s.space(), { resources: s.session.document.resources, region: { minX: 0, minY: 0, maxX: 50, maxY: 80 } }),
        ],
        s.session.images,
      )
    ).bytes;
    const progress: Array<[number, number]> = [];
    const { pages, pageCount } = await readPdf(bytes, sequentialIds('i'), pdfjs, { onPage: (d, t) => progress.push([d, t]) });
    expect(pageCount).toBe(2);
    expect(pages.map((p) => [p.width, p.height])).toEqual([[200, 100], [50, 80]]);
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  it('refuses a file that is not a PDF', async () => {
    await expect(readPdf(new TextEncoder().encode('not a pdf at all'), sequentialIds('i'), pdfjs)).rejects.toThrow();
  });
});

// Keeps the helper type honest: a path node is what a plain rectangle comes back as.
void (null as unknown as PathNode);
