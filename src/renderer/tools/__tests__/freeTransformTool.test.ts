import { afterEach, describe, expect, it } from 'vitest';
import { applyToPoint, createImage, selectionBounds, selectOnly, type Node, type PathNode } from '../../../core';
import { createFreeTransformTool, freeTransformMode, setFreeTransformMode } from '../freeTransformTool';
import { click, createTestHost, drag, ev, type TestHost } from './fakeHost';

afterEach(() => setFreeTransformMode('free'));

/** A 100×100 rectangle at (100,100), selected. The widget buttons sit to the right of its box. */
function setup() {
  const t = createTestHost();
  const tool = createFreeTransformTool();
  const r = t.rect(100, 100, 100, 100);
  t.session.select(selectOnly(t.spaceId(), [r.id]));
  return { t, tool, r };
}

const BUTTON_X = 225; // box right edge (200) + 16 + half a button
const BUTTON_Y = { constrain: 111, free: 137, perspective: 163, distort: 189 };
const pick = (tool: ReturnType<typeof createFreeTransformTool>, t: TestHost, mode: keyof typeof BUTTON_Y) => click(tool, t, BUTTON_X, BUTTON_Y[mode]);

const nodeOf = (t: TestHost, id: string) => t.space().layers[0]!.children.find((n) => n.id === id)! as Node;
const worldAnchors = (t: TestHost, id: string) => {
  const node = nodeOf(t, id) as PathNode;
  return node.anchors.map((a) => applyToPoint(node.transform, a.p));
};
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('Free Transform tool · widget', () => {
  it('starts in Free Transform and the buttons switch the mode without touching the selection or the document', () => {
    const { t, tool, r } = setup();
    expect(freeTransformMode()).toBe('free');
    const before = t.session.historyLength;
    pick(tool, t, 'perspective');
    expect(freeTransformMode()).toBe('perspective');
    pick(tool, t, 'distort');
    expect(freeTransformMode()).toBe('distort');
    pick(tool, t, 'constrain');
    expect(freeTransformMode()).toBe('constrain');
    expect(t.session.selection.ids).toEqual([r.id]);
    expect(t.session.historyLength).toBe(before);
  });
});

describe('Free Transform tool · Free Distort', () => {
  it('dragging a corner moves only that corner, turns the live shape into a path and is one undo step', () => {
    const { t, tool, r } = setup();
    pick(tool, t, 'distort');
    const before = t.session.historyLength;
    drag(tool, t, { x: 200, y: 200 }, { x: 230, y: 210 });
    expect(t.session.historyLength).toBe(before + 1);
    expect(nodeOf(t, r.id).type).toBe('path');
    const [nw, ne, se, sw] = worldAnchors(t, r.id);
    near(nw!, { x: 100, y: 100 });
    near(ne!, { x: 200, y: 100 });
    near(se!, { x: 230, y: 210 });
    near(sw!, { x: 100, y: 200 });
    t.session.undo();
    expect(nodeOf(t, r.id).type).toBe('shape');
  });

  it('is computed from the original every time: the way there does not matter', () => {
    const { t, tool, r } = setup();
    pick(tool, t, 'distort');
    tool.onPointerDown(ev(200, 200), t.host);
    for (const p of [{ x: 300, y: 50 }, { x: 150, y: 400 }, { x: 240, y: 220 }]) tool.onPointerMove(ev(p.x, p.y), t.host);
    tool.onPointerUp(ev(240, 220), t.host);
    const [, , se] = worldAnchors(t, r.id);
    near(se!, { x: 240, y: 220 });
  });

  it('Escape in the middle of a drag puts everything back', () => {
    const { t, tool, r } = setup();
    pick(tool, t, 'distort');
    const before = t.session.historyLength;
    tool.onPointerDown(ev(200, 200), t.host);
    tool.onPointerMove(ev(260, 260), t.host);
    expect(nodeOf(t, r.id).type).toBe('path');
    tool.onKey!('Escape', t.host);
    tool.onPointerUp(ev(260, 260), t.host);
    expect(nodeOf(t, r.id).type).toBe('shape');
    expect(t.session.historyLength).toBe(before);
  });

  it('a click on a handle without dragging changes nothing', () => {
    const { t, tool, r } = setup();
    pick(tool, t, 'distort');
    const before = t.session.historyLength;
    click(tool, t, 200, 200);
    expect(nodeOf(t, r.id).type).toBe('shape');
    expect(t.session.historyLength).toBe(before);
  });
});

describe('Free Transform tool · Perspective', () => {
  it('dragging a corner sideways squeezes its edge symmetrically', () => {
    const { t, tool, r } = setup();
    pick(tool, t, 'perspective');
    drag(tool, t, { x: 100, y: 100 }, { x: 120, y: 104 });
    const [nw, ne, se, sw] = worldAnchors(t, r.id);
    near(nw!, { x: 120, y: 100 });
    near(ne!, { x: 180, y: 100 });
    near(se!, { x: 200, y: 200 });
    near(sw!, { x: 100, y: 200 });
  });

  it('side handles are not handles in this mode: the press falls through to the Selection behaviour', () => {
    const { t, tool, r } = setup();
    pick(tool, t, 'perspective');
    drag(tool, t, { x: 150, y: 100 }, { x: 150, y: 60 });
    expect(nodeOf(t, r.id).type).not.toBe('path'); // no distortion happened
  });
});

describe('Free Transform tool · Free Transform and Constrain', () => {
  it('Ctrl on a side handle skews and keeps the live shape', () => {
    const { t, tool, r } = setup();
    drag(tool, t, { x: 150, y: 100 }, { x: 180, y: 100 }, { ctrlKey: true });
    const node = nodeOf(t, r.id);
    expect(node.type).toBe('shape');
    near(applyToPoint(node.transform, { x: 0, y: 0 }), { x: 130, y: 100 }); // the top edge slid by 30
    near(applyToPoint(node.transform, { x: 0, y: 100 }), { x: 100, y: 200 }); // the bottom edge stayed
  });

  it('Ctrl on a corner distorts it freely; Ctrl+Alt+Shift makes it a perspective', () => {
    const { t, tool, r } = setup();
    drag(tool, t, { x: 200, y: 200 }, { x: 230, y: 210 }, { ctrlKey: true });
    near(worldAnchors(t, r.id)[2]!, { x: 230, y: 210 });
    t.session.undo();
    drag(tool, t, { x: 100, y: 100 }, { x: 120, y: 102 }, { ctrlKey: true, altKey: true, shiftKey: true });
    const [nw, ne] = worldAnchors(t, r.id);
    near(nw!, { x: 120, y: 100 });
    near(ne!, { x: 180, y: 100 });
  });

  it('without Ctrl a handle scales like the Selection tool (and Constrain keeps the proportion)', () => {
    const { t, tool, r } = setup();
    drag(tool, t, { x: 200, y: 200 }, { x: 300, y: 230 });
    const free = selectionBounds(t.space(), [r.id])!;
    expect(free.maxX - free.minX).toBeCloseTo(200, 6);
    expect(free.maxY - free.minY).toBeCloseTo(130, 6);
    t.session.undo();
    pick(tool, t, 'constrain');
    drag(tool, t, { x: 200, y: 200 }, { x: 300, y: 230 });
    const kept = selectionBounds(t.space(), [r.id])!;
    expect((kept.maxX - kept.minX) / (kept.maxY - kept.minY)).toBeCloseTo(1, 6);
  });

  it('clicking an object still selects it (the tool behaves as Selection away from the box)', () => {
    const { t, tool } = setup();
    const other = t.rect(400, 400, 50, 50);
    click(tool, t, 420, 420);
    expect(t.session.selection.ids).toEqual([other.id]);
  });
});

describe('Free Transform tool · what cannot be distorted', () => {
  it('an image is refused with a message and stays untouched', () => {
    const t = createTestHost();
    const tool = createFreeTransformTool();
    const img = t.add(createImage(t.ids, 'h', 100, 50));
    t.session.select(selectOnly(t.spaceId(), [img.id]));
    setFreeTransformMode('distort');
    const before = t.session.historyLength;
    drag(tool, t, { x: 100, y: 50 }, { x: 130, y: 70 });
    expect(t.host.confirm).toHaveBeenCalledTimes(1);
    expect(t.session.historyLength).toBe(before);
    expect(nodeOf(t, img.id).transform).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
