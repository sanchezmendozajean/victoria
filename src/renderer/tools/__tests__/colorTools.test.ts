import { describe, expect, it } from 'vitest';
import { colorToHex, gradientAxis, primaryItem, selectOnly, setPaint, type Color, type Matrix, type Paint, type ShapeNode } from '../../../core';
import { createEyedropperTool } from '../eyedropperTool';
import { createGradientTool } from '../gradientTool';
import { click, createTestHost, drag, ev, type TestHost } from './fakeHost';

const rgb = (r: number, g: number, b: number): Color => ({ model: 'rgb', values: [r, g, b] });
const nodeOf = (t: TestHost, i = 0) => t.space().layers[0]!.children[i] as ShapeNode;
const fillOf = (t: TestHost, i = 0): Paint => primaryItem(nodeOf(t, i).appearance, 'fill')!.paint;

const transformOf = (t: TestHost): Matrix => (fillOf(t) as { transform: Matrix }).transform;

describe('Gradient tool (G)', () => {
  const setup = () => {
    const t = createTestHost();
    const tool = createGradientTool();
    const r = t.rect(0, 0, 100, 50);
    t.session.select(selectOnly(t.spaceId(), [r.id]));
    return { t, tool, r };
  };

  it('a drag over the selected object gives it a gradient running from start to end, as one undo step', () => {
    const { t, tool } = setup();
    const before = t.session.historyLength;
    drag(tool, t, { x: 10, y: 25 }, { x: 90, y: 25 });
    const paint = fillOf(t);
    expect(paint.type).toBe('linear');
    const axis = gradientAxis((paint as { transform: Matrix }).transform);
    expect(axis.start).toEqual({ x: 10, y: 25 });
    expect(axis.end).toEqual({ x: 90, y: 25 });
    expect(t.session.historyLength).toBe(before + 1);
    expect(t.session.document.resources.gradients).toHaveLength(1);
    t.session.undo();
    expect(fillOf(t).type).toBe('solid');
    expect(t.session.document.resources.gradients).toHaveLength(0);
  });

  it('the new gradient starts from the current fill towards the contrasting colour', () => {
    const { t, tool, r } = setup();
    t.session.run(setPaint(t.spaceId(), [r.id], 'fill', { type: 'solid', color: rgb(200, 0, 0) }));
    drag(tool, t, { x: 0, y: 0 }, { x: 100, y: 0 });
    const g = t.session.document.resources.gradients[0]!;
    expect(colorToHex(g.stops[0]!.color)).toBe('#C80000');
    expect(colorToHex(g.stops[1]!.color)).toBe('#FFFFFF');
  });

  it('Shift constrains the direction to 45°', () => {
    const { t, tool } = setup();
    drag(tool, t, { x: 10, y: 10 }, { x: 80, y: 18 }, { shiftKey: true });
    const axis = gradientAxis(transformOf(t));
    expect(axis.end.y).toBeCloseTo(10, 6);
  });

  it('a click gives an object without a gradient one that fills its bounds', () => {
    const { t, tool } = setup();
    click(tool, t, 50, 25);
    const axis = gradientAxis(transformOf(t));
    expect(axis.start).toEqual({ x: 0, y: 25 });
    expect(axis.end).toEqual({ x: 100, y: 25 });
  });

  it('works on the objects inside a transformed object (local coordinates)', () => {
    const t = createTestHost();
    const tool = createGradientTool();
    const r = t.rect(200, 100, 100, 50);
    t.session.select(selectOnly(t.spaceId(), [r.id]));
    drag(tool, t, { x: 210, y: 125 }, { x: 290, y: 125 });
    const axis = gradientAxis(transformOf(t));
    expect(axis.start).toEqual({ x: 10, y: 25 });
    expect(axis.end).toEqual({ x: 90, y: 25 });
  });

  it('the annotator: dragging the end moves it, a click on the axis adds a stop, double click on a stop removes it', () => {
    const { t, tool } = setup();
    drag(tool, t, { x: 10, y: 25 }, { x: 90, y: 25 });
    drag(tool, t, { x: 90, y: 25 }, { x: 60, y: 25 }); // the end handle
    let axis = gradientAxis(transformOf(t));
    expect(axis.end).toEqual({ x: 60, y: 25 });
    click(tool, t, 35, 25); // on the axis, between the stops
    expect(t.session.document.resources.gradients[0]!.stops).toHaveLength(3);
    expect(t.session.document.resources.gradients[0]!.stops[1]!.offset).toBeCloseTo(0.5, 6);
    click(tool, t, 35, 25 + 14, { clickCount: 2 }); // on the marker of the new stop, hanging below the axis
    expect(t.session.document.resources.gradients[0]!.stops).toHaveLength(2);
    axis = gradientAxis(transformOf(t));
    expect(axis.start).toEqual({ x: 10, y: 25 });
  });

  it('dragging a stop changes its offset in one undo step; the origin moves the whole gradient', () => {
    const { t, tool } = setup();
    drag(tool, t, { x: 0, y: 25 }, { x: 100, y: 25 });
    click(tool, t, 50, 25); // add a stop at 0.5
    const before = t.session.historyLength;
    drag(tool, t, { x: 50, y: 39 }, { x: 75, y: 39 }); // the marker hangs 14 px below the axis
    expect(t.session.historyLength).toBe(before + 1);
    expect(t.session.document.resources.gradients[0]!.stops[1]!.offset).toBeCloseTo(0.75, 6);
    drag(tool, t, { x: 0, y: 25 }, { x: 10, y: 35 }); // the origin
    const axis = gradientAxis(transformOf(t));
    expect(axis.start).toEqual({ x: 10, y: 35 });
    expect(axis.end).toEqual({ x: 110, y: 35 });
  });

  it('Escape during the drag removes the gradient again', () => {
    const { t, tool } = setup();
    tool.onPointerDown(ev(10, 25), t.host);
    tool.onPointerMove(ev(60, 25), t.host);
    tool.onPointerMove(ev(90, 25), t.host);
    expect(fillOf(t).type).toBe('linear');
    tool.onKey?.('Escape', t.host);
    expect(fillOf(t).type).toBe('solid');
  });

  it('does nothing without a selection', () => {
    const t = createTestHost();
    const tool = createGradientTool();
    t.rect(0, 0, 100, 50);
    const before = t.session.historyLength;
    drag(tool, t, { x: 10, y: 25 }, { x: 90, y: 25 });
    expect(t.session.historyLength).toBe(before);
  });

  it('edits only the stroke when the stroke is the active paint', () => {
    const t = createTestHost();
    (t.host as { activePaint: string }).activePaint = 'stroke';
    const tool = createGradientTool();
    const r = t.rect(0, 0, 100, 50);
    t.session.select(selectOnly(t.spaceId(), [r.id]));
    drag(tool, t, { x: 10, y: 25 }, { x: 90, y: 25 });
    expect(primaryItem(nodeOf(t).appearance, 'stroke')!.paint.type).toBe('linear');
    expect(fillOf(t).type).toBe('solid');
  });
});

describe('Eyedropper (I)', () => {
  const setup = () => {
    const t = createTestHost();
    const tool = createEyedropperTool();
    const source = t.rect(0, 0, 100, 100);
    const target = t.rect(300, 0, 100, 100);
    t.session.run(setPaint(t.spaceId(), [source.id], 'fill', { type: 'solid', color: rgb(10, 20, 30) }));
    t.session.run({ label: 'x', spaceId: t.spaceId(), apply: (d) => void Object.assign(d.spaces[0]!.layers[0]!.children[0]!, { opacity: 0.4, blendMode: 'multiply' }) });
    return { t, tool, source, target };
  };

  it('a click copies the appearance, opacity and blend mode of the clicked object to the selection', () => {
    const { t, tool, target } = setup();
    t.session.select(selectOnly(t.spaceId(), [target.id]));
    click(tool, t, 50, 50);
    const copied = nodeOf(t, 1);
    expect(colorToHex((primaryItem(copied.appearance, 'fill')!.paint as { color: Color }).color)).toBe('#0A141E');
    expect(copied.opacity).toBe(0.4);
    expect(copied.blendMode).toBe('multiply');
  });

  it('with nothing selected it loads the look of the next objects instead', () => {
    const { t, tool } = setup();
    click(tool, t, 50, 50);
    expect(t.host.setNewAppearance).toHaveBeenCalledTimes(1);
    const look = (t.host.setNewAppearance as unknown as { mock: { calls: Array<[{ items: Array<{ paint: { color: Color } }> }]> } }).mock.calls[0]![0];
    expect(colorToHex(look.items[0]!.paint.color)).toBe('#0A141E');
  });

  it('Alt+click applies the selection\'s appearance to the clicked object', () => {
    const { t, tool, source, target } = setup();
    t.session.select(selectOnly(t.spaceId(), [source.id]));
    click(tool, t, 350, 50, { altKey: true });
    expect(colorToHex((primaryItem(nodeOf(t, 1).appearance, 'fill')!.paint as { color: Color }).color)).toBe('#0A141E');
    expect(t.session.selection.ids).toEqual([source.id]);
    void target;
  });

  it('Shift+click copies only the colour of the part clicked', () => {
    const { t, tool, target } = setup();
    t.session.run(setPaint(t.spaceId(), [target.id], 'stroke', { type: 'solid', color: rgb(1, 2, 3) }));
    t.session.select(selectOnly(t.spaceId(), [target.id]));
    click(tool, t, 50, 50, { shiftKey: true }); // inside the fill of the source
    const copied = nodeOf(t, 1);
    expect(colorToHex((primaryItem(copied.appearance, 'fill')!.paint as { color: Color }).color)).toBe('#0A141E');
    expect(colorToHex((primaryItem(copied.appearance, 'stroke')!.paint as { color: Color }).color)).toBe('#010203');
    expect(copied.opacity).toBe(1);
  });

  it('clicking on nothing does nothing', () => {
    const { t, tool, target } = setup();
    t.session.select(selectOnly(t.spaceId(), [target.id]));
    const before = t.session.historyLength;
    click(tool, t, 700, 600);
    expect(t.session.historyLength).toBe(before);
  });
});
