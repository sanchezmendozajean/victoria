// Builds the sample documents with the real core (bundled by scripts/gen-samples.mjs).
import {
  addArtboard,
  createArtboard,
  createDocument,
  createEllipse,
  createGroup,
  createLayer,
  createPath,
  createRect,
  DocumentSession,
  sequentialIds,
  translation,
  writeVict,
  type Anchor,
  type CompoundNode,
  type Node,
  type PathNode,
  type ShapeNode,
} from '../src/core';

const rgb = (r: number, g: number, b: number) => ({ model: 'rgb' as const, values: [r, g, b] });
const NOW = '2026-01-01T00:00:00.000Z';

function paint(node: Node, fill: ReturnType<typeof rgb> | null, stroke: { color: ReturnType<typeof rgb>; width: number; join?: 'round' | 'miter'; cap?: 'round' | 'butt' } | null): Node {
  node.appearance.items = [];
  if (fill) node.appearance.items.push({ kind: 'fill', paint: { type: 'solid', color: fill }, opacity: 1, modifiers: [] });
  if (stroke) {
    node.appearance.items.push({
      kind: 'stroke',
      paint: { type: 'solid', color: stroke.color },
      stroke: { width: stroke.width, cap: stroke.cap ?? 'butt', join: stroke.join ?? 'miter', miterLimit: 10, align: 'center', dash: null, dashAlignToCorners: false, arrowScale: [100, 100] },
      opacity: 1,
      modifiers: [],
    });
  }
  return node;
}

const a = (x: number, y: number, hin?: [number, number], hout?: [number, number], kind: Anchor['kind'] = 'corner'): Anchor => ({
  p: { x, y },
  in: hin ? { x: hin[0], y: hin[1] } : null,
  out: hout ? { x: hout[0], y: hout[1] } : null,
  kind,
});

function circle(ids: () => string, cx: number, cy: number, r: number): ShapeNode {
  const c = createEllipse(ids, r * 2, r * 2);
  c.transform = translation(cx - r, cy - r);
  return c;
}

/** Four 288 pt artboards like mockup screen 3: a house, a heart, a badge and a Venn diagram. */
export function demoDocument(): Uint8Array {
  const ids = sequentialIds('demo');
  const doc = createDocument({ name: 'Demostración', spaceName: 'Íconos', artboardName: 'casa-24', layerName: 'Íconos', preset: 'Icono 24', ids, now: NOW });
  const session = new DocumentSession(doc, { ids, now: () => NOW });
  const space = doc.spaces[0]!;
  const layer = space.layers[0]!;
  const board = space.artboards[0]!;
  // The first artboard is the house; resize it to 288 pt and add the others to its right and below.
  session.run({ label: 'artboard.update', spaceId: space.id, apply: (d) => void Object.assign(d.spaces[0]!.artboards[0]!, { w: 288, h: 288, name: 'casa-24', preset: undefined }) });
  const boards = [
    { name: 'corazón-24', x: 328, y: 0 },
    { name: 'insignia-24', x: 0, y: 328 },
    { name: 'fusión-24', x: 328, y: 328 },
  ];
  for (const b of boards) session.run(addArtboard(space.id, createArtboard(ids, { name: b.name, x: b.x, y: b.y, w: 288, h: 288 })));
  void board;

  const add = (node: Node) => session.run({ label: 'node.add', spaceId: space.id, apply: (d) => void d.spaces[0]!.layers[0]!.children.push(node) });

  // House: an open path with a thick round stroke.
  const house = createPath(ids, [a(60, 240), a(60, 132), a(144, 48), a(228, 132), a(228, 240, [228, 192], [228, 192])], false) as PathNode;
  house.anchors[3] = a(228, 132, undefined, [228, 132]);
  house.anchors[4] = a(228, 240, [192, 204], undefined);
  house.anchors[3] = a(228, 132, undefined, [228, 192], 'corner');
  paint(house, null, { color: rgb(31, 33, 36), width: 18, join: 'round', cap: 'round' });
  add(house);

  // Heart on a soft circle.
  const disc = circle(ids, 328 + 144, 144, 144);
  paint(disc, rgb(255, 216, 168), null);
  add(disc);
  const heart = createPath(
    ids,
    [
      a(472, 236, [472, 236], [472, 236]),
      a(402, 170, [402, 170], [374, 140]),
      a(402, 96, [372, 96], [412, 80]),
      a(472, 120, [446, 82], [498, 82]),
      a(542, 96, [532, 80], [572, 96]),
      a(542, 170, [570, 140], [542, 170]),
    ],
    true,
  );
  paint(heart, rgb(240, 82, 79), null);
  add(heart);

  // Badge: a ring and a star.
  const ring = circle(ids, 144, 328 + 144, 132);
  paint(ring, null, { color: rgb(31, 33, 36), width: 6 });
  add(ring);
  const star: ShapeNode = { ...createRect(ids, 1, 1), shape: 'star', params: { r1: 44, r2: 18, points: 5, cornerRadius: 0 } } as ShapeNode;
  star.transform = translation(144, 328 + 156);
  paint(star, rgb(242, 179, 61), null);
  add(star);

  // Venn: two circles and the lens where they overlap as a compound path with a hole.
  const left = circle(ids, 328 + 100, 328 + 144, 72);
  paint(left, rgb(191, 214, 255), { color: rgb(31, 33, 36), width: 2 });
  const right = circle(ids, 328 + 188, 328 + 144, 72);
  paint(right, rgb(227, 212, 255), { color: rgb(31, 33, 36), width: 2 });
  add(left);
  add(right);
  const holeRect = (x: number, y: number, w: number, h: number): PathNode => createPath(ids, [a(x, y), a(x + w, y), a(x + w, y + h), a(x, y + h)], true) as PathNode;
  const frame: CompoundNode = {
    ...createRect(ids, 1, 1),
    type: 'compound',
    fillRule: 'evenodd',
    children: [holeRect(328 + 20, 328 + 236, 248, 40), holeRect(328 + 40, 328 + 246, 208, 20)],
  } as unknown as CompoundNode;
  paint(frame, rgb(63, 185, 122), null);
  add(frame);

  const group = createGroup(ids, [paint(createRect(ids, 30, 30, 6), rgb(76, 141, 255), null), paint(createEllipse(ids, 30, 30), rgb(255, 138, 61), null)]);
  group.children[1]!.transform = translation(20, 20);
  group.transform = translation(20, 20);
  add(group);
  void layer;

  return writeVict({ document: session.document, app: 'samples' });
}

/** 10 000 objects (rectangles, rounded rectangles, ellipses and stars) on a 100 × 100 grid. */
export function stressDocument(count = 10_000): Uint8Array {
  const ids = sequentialIds('stress');
  const doc = createDocument({ name: 'Estrés 10 000', spaceName: 'Estrés', artboardName: 'Mesa 1', layerName: 'Capa 1', ids, now: NOW });
  const session = new DocumentSession(doc, { ids, now: () => NOW, historyLimit: 1 });
  const space = doc.spaces[0]!;
  const side = Math.ceil(Math.sqrt(count));
  const cell = 24;
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    const kind = i % 4;
    const n: Node =
      kind === 0
        ? createRect(ids, 18, 18)
        : kind === 1
          ? createRect(ids, 18, 18, 5)
          : kind === 2
            ? createEllipse(ids, 18, 18)
            : ({ ...createRect(ids, 1, 1), shape: 'star', params: { r1: 10, r2: 4, points: 5, cornerRadius: 0 } } as ShapeNode);
    n.transform = translation((i % side) * cell + (kind === 3 ? 9 : 0), Math.floor(i / side) * cell + (kind === 3 ? 9 : 0));
    paint(n, rgb((i * 53) % 256, (i * 97) % 256, (i * 193) % 256), i % 3 === 0 ? { color: rgb(31, 33, 36), width: 1 } : null);
    nodes.push(n);
  }
  session.run({ label: 'node.add', spaceId: space.id, apply: (d) => void d.spaces[0]!.layers[0]!.children.push(...nodes) });
  const total = side * cell;
  session.run({ label: 'artboard.update', spaceId: space.id, apply: (d) => void Object.assign(d.spaces[0]!.artboards[0]!, { x: 0, y: 0, w: total, h: total, preset: undefined }) });
  void createLayer;
  return writeVict({ document: session.document, app: 'samples' });
}
