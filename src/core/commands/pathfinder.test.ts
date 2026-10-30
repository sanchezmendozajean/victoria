import { describe, expect, it } from 'vitest';
import { addNode, arrange, BOOLEAN_WORKER_SEGMENTS, computePieces, finishPathfinder, planPathfinder, planSegments, createDocument, createEllipse, createGroup, createRect, DocumentSession, getActiveSpace, pathfinder, sequentialIds, shapeBuilderEdit, translation, type GroupNode, type Node, type PathfinderOp } from '..';

function setup() {
  const ids = sequentialIds('p');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 100 });
  const space = () => getActiveSpace(session.document);
  const layerId = () => space().layers[0]!.id;
  const add = <T extends Node>(node: T, x: number, y: number): T => {
    node.transform = translation(x, y);
    session.run(addNode(space().id, layerId(), node));
    return node;
  };
  const fill = (n: Node, rgb: number[]) => {
    n.appearance = { items: [{ kind: 'fill', paint: { type: 'solid', color: { model: 'rgb', values: rgb } }, opacity: 1, modifiers: [] }, { kind: 'stroke', paint: { type: 'solid', color: { model: 'rgb', values: [0, 0, 0] } }, stroke: { width: 3, cap: 'butt', join: 'miter', miterLimit: 10, align: 'center', dash: null, dashAlignToCorners: false, arrowScale: [100, 100] }, opacity: 1, modifiers: [] }] };
    return n;
  };
  const run = (op: PathfinderOp, selected: Node[]) => {
    const result = pathfinder(space(), selected.map((n) => n.id), op, ids);
    expect(result).not.toBeNull();
    session.run(result!.command);
    return result!.resultIds;
  };
  const children = () => space().layers[0]!.children as Node[];
  return { ids, session, space, add, fill, run, children };
}

const circle = (t: ReturnType<typeof setup>, x: number, y: number, rgb: number[]) => t.add(t.fill(createEllipse(t.ids, 100, 100), rgb), x, y);

describe('Pathfinder', () => {
  it('Unite replaces the objects by one with the look of the topmost, in one undo step', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    const b = circle(t, 60, 0, [0, 0, 255]);
    const before = t.session.historyLength;
    const [id] = t.run('unite', [a, b]);
    expect(t.children()).toHaveLength(1);
    const node = t.children()[0]!;
    expect(node.id).toBe(id);
    expect(node.type).toBe('path');
    expect(node.appearance.items[0]).toMatchObject({ kind: 'fill', paint: { color: { values: [0, 0, 255] } } });
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(t.children()).toHaveLength(2);
  });

  it('Minus Front keeps the look of the bottom object; Minus Back that of the top one', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    const b = circle(t, 60, 0, [0, 0, 255]);
    t.run('minusFront', [a, b]);
    expect(t.children()[0]!.appearance.items[0]).toMatchObject({ paint: { color: { values: [255, 0, 0] } } });
    t.session.undo();
    t.run('minusBack', [a, b]);
    expect(t.children()[0]!.appearance.items[0]).toMatchObject({ paint: { color: { values: [0, 0, 255] } } });
  });

  it('Intersect of disjoint objects removes them (as Illustrator does)', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    const b = circle(t, 500, 0, [0, 0, 255]);
    t.run('intersect', [a, b]);
    expect(t.children()).toHaveLength(0);
  });

  it('Divide makes a group of the regions, each with the fill of the topmost object covering it', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    const b = circle(t, 60, 0, [0, 0, 255]);
    t.run('divide', [a, b]);
    const group = t.children()[0] as GroupNode;
    expect(group.type).toBe('group');
    expect(group.children).toHaveLength(3);
    const colours = group.children.map((c) => (c.appearance.items[0] as { paint: { color: { values: number[] } } }).paint.color.values[2]);
    expect(colours.filter((v) => v === 255)).toHaveLength(2); // the lens and the blue crescent
  });

  it('Trim and Crop drop strokes; Outline makes hairline strokes in the fill colour', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    const b = circle(t, 60, 0, [0, 0, 255]);
    t.run('trim', [a, b]);
    expect((t.children()[0] as GroupNode).children.every((c) => c.appearance.items.every((i) => i.kind === 'fill'))).toBe(true);
    t.session.undo();
    t.run('crop', [a, b]);
    expect((t.children()[0] as GroupNode).children).toHaveLength(1);
    t.session.undo();
    t.run('outline', [a, b]);
    const items = (t.children()[0] as GroupNode).children.flatMap((c) => c.appearance.items);
    expect(items.every((i) => i.kind === 'stroke' && i.stroke.width === 0.25)).toBe(true);
  });

  it('works on grouped and transformed objects (contours are taken in Space coordinates)', () => {
    const t = setup();
    const inner = t.fill(createRect(t.ids, 100, 100), [0, 255, 0]);
    const group = t.add(createGroup(t.ids, [inner]), 200, 200);
    const b = t.add(t.fill(createRect(t.ids, 100, 100), [255, 0, 0]), 250, 250);
    t.run('unite', [group, b]);
    expect(t.children()).toHaveLength(1);
    const node = t.children()[0]!;
    const xs = (node as { anchors: Array<{ p: { x: number } }> }).anchors.map((a) => a.p.x + node.transform[4]);
    expect(Math.min(...xs)).toBeCloseTo(200);
    expect(Math.max(...xs)).toBeCloseTo(350);
  });

  it('needs at least two objects', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    expect(pathfinder(t.space(), [a.id], 'unite', t.ids)).toBeNull();
  });
});

describe('Shape Builder edit', () => {
  it('divides the selection into regions; uniting and deleting regions edit them', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    const b = circle(t, 60, 0, [0, 0, 255]);
    const arrangement = arrange(t.space(), [a.id, b.id])!;
    expect(arrangement.faces).toHaveLength(3);
    const lens = arrangement.faces.findIndex((f) => f.covers.length === 2);
    const crescents = arrangement.faces.map((f, i) => (f.covers.length === 1 ? i : -1)).filter((i) => i >= 0);
    // Click on a region = every region becomes its own object.
    const all = shapeBuilderEdit(t.space(), arrangement, [], new Set(), t.ids)!;
    expect(all.resultIds).toHaveLength(3);
    // Unite the lens with one crescent, delete the other crescent.
    const edited = shapeBuilderEdit(t.space(), arrangement, [[lens, crescents[0]!]], new Set([crescents[1]!]), t.ids)!;
    t.session.run(edited.command);
    expect(t.children()).toHaveLength(1);
    t.session.undo();
    expect(t.children()).toHaveLength(2);
  });
});

describe('Pathfinder in two steps (what the Worker path uses)', () => {
  it('plan, compute and finish give the same document as pathfinder()', () => {
    const run = (twoStep: boolean) => {
      const t = setup();
      const a = circle(t, 0, 0, [255, 0, 0]);
      const b = circle(t, 60, 0, [0, 0, 255]);
      const selected = [a.id, b.id];
      if (twoStep) {
        const plan = planPathfinder(t.space(), selected, 'unite')!;
        const result = finishPathfinder(t.space(), plan, computePieces('unite', plan.operands), t.ids)!;
        t.session.run(result.command);
      } else {
        t.session.run(pathfinder(t.space(), selected, 'unite', t.ids)!.command);
      }
      // Ids differ between runs only by the generator's counter: compare the geometry.
      return JSON.stringify(t.children().map((n) => (n.type === 'path' ? n.anchors : n.type)));
    };
    expect(run(true)).toBe(run(false));
  });

  it('counts the segments that decide whether to use a Worker, and refuses a plan with fewer than two objects', () => {
    const t = setup();
    const a = circle(t, 0, 0, [255, 0, 0]);
    expect(planPathfinder(t.space(), [a.id], 'unite')).toBeNull();
    const b = circle(t, 60, 0, [0, 0, 255]);
    const plan = planPathfinder(t.space(), [a.id, b.id], 'unite')!;
    expect(planSegments(plan)).toBe(8); // two ellipses of four anchors
    expect(BOOLEAN_WORKER_SEGMENTS).toBe(500);
  });
});
