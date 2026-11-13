import { describe, expect, it } from 'vitest';
import {
  addNode,
  cornerAnchor,
  createDocument,
  createGroup,
  createPath,
  createText,
  DocumentSession,
  frameOf,
  getActiveSpace,
  multiply,
  resetBoundingBox,
  rotation,
  scaling,
  sequentialIds,
  translation,
  worldRotationOf,
  type Matrix,
  type PathNode,
  type Vec2,
} from '..';
import { applyToPoint } from '../model/matrix';

const setup = () => {
  const ids = sequentialIds('rb');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 100 });
  const space = () => getActiveSpace(session.document);
  const add = <T extends Parameters<typeof addNode>[2]>(node: T): T => {
    session.run(addNode(space().id, space().layers[0]!.id, node));
    return node;
  };
  return { ids, session, space, add };
};

/** Where the anchors of a path are on the page. */
const onPage = (world: Matrix, path: PathNode): Vec2[] => path.anchors.map((a) => applyToPoint(world, a.p));
const near = (a: Vec2[], b: Vec2[]) => a.forEach((p, i) => (expect(p.x).toBeCloseTo(b[i]!.x, 9), expect(p.y).toBeCloseTo(b[i]!.y, 9)));

describe('resetBoundingBox (Objeto › Transformar › Restablecer cuadro delimitador)', () => {
  it('a rotated path keeps its place but loses the rotation; one undo step brings it back', () => {
    const { ids, session, space, add } = setup();
    const p = createPath(ids, [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 })], false);
    p.transform = multiply(translation(50, 20), rotation(Math.PI / 6));
    add(p);
    const before = onPage(frameOf(space(), p.id)!.world, p);
    session.run(resetBoundingBox(space().id, [p.id]));
    expect(worldRotationOf(space(), p.id)).toBeCloseTo(0, 12);
    const frame = frameOf(space(), p.id)!;
    near(onPage(frame.world, frame.node as PathNode), before);
    session.undo();
    expect(worldRotationOf(space(), p.id)).toBeCloseTo(Math.PI / 6, 12);
  });

  it('keeps a uniform scale of the same area, so strokes keep their width', () => {
    const { ids, session, space, add } = setup();
    const p = createPath(ids, [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 10, y: 5 })], false);
    p.transform = multiply(rotation(1), scaling(3, 3));
    add(p);
    const before = onPage(frameOf(space(), p.id)!.world, p);
    session.run(resetBoundingBox(space().id, [p.id]));
    const frame = frameOf(space(), p.id)!;
    expect(frame.world.slice(0, 4).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([3, 0, 0, 3]);
    near(onPage(frame.world, frame.node as PathNode), before);
  });

  it('a rotated group passes the rotation to its children, which stay where they were', () => {
    const { ids, session, space, add } = setup();
    const child = createPath(ids, [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 40, y: 0 })], false);
    child.transform = translation(5, 5);
    const g = createGroup(ids, [child]);
    g.transform = multiply(translation(100, 100), rotation(-0.7));
    add(g);
    const before = onPage(frameOf(space(), child.id)!.world, child);
    session.run(resetBoundingBox(space().id, [g.id]));
    expect(worldRotationOf(space(), g.id)).toBeCloseTo(0, 12);
    const frame = frameOf(space(), child.id)!;
    near(onPage(frame.world, frame.node as PathNode), before);
  });

  it('leaves text (and other nodes whose content cannot take the rotation) as they are', () => {
    const { ids, session, space, add } = setup();
    const text = createText(ids, { kind: 'point' }, [{ text: 'Hola', style: { fontFamily: 'Arial', fontStyle: 'Regular', size: 12 } }]);
    text.transform = rotation(0.5);
    add(text);
    session.run(resetBoundingBox(space().id, [text.id]));
    expect(worldRotationOf(space(), text.id)).toBeCloseTo(0.5, 12);
  });
});
