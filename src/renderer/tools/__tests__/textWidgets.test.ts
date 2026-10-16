import { describe, expect, it } from 'vitest';
import { addNode, cornerAnchor, createText, selectOnly, type TextNode, type TextPath } from '../../../core';
import { createSelectionTool } from '../selectionTool';
import { textWidgetsOf } from '../textWidgets';
import { click, createTestHost, drag, ev, type TestHost } from './fakeHost';

const style = { fontFamily: 'Mono', fontStyle: 'Regular', size: 10 };

function onPathText(t: TestHost) {
  const path: TextPath = { anchors: [cornerAnchor({ x: 0, y: 100 }), cornerAnchor({ x: 200, y: 100 })], closed: false };
  const node = createText(t.ids, { kind: 'onPath', path, options: { effect: 'rainbow', align: 'baseline', spacing: 0, flip: false, start: 0.2, end: 0.8 } }, [{ text: 'Hello', style }]);
  t.session.run(addNode(t.spaceId(), t.layerId(), node));
  t.session.select(selectOnly(t.spaceId(), [node.id]));
  return node;
}
const get = (t: TestHost, id: string) => t.space().layers[0]!.children.find((c) => c.id === id) as TextNode;

describe('text widgets of the Selection tool', () => {
  it('dragging the start and end brackets limits the range of text on a path', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const node = onPathText(t);
    drag(tool, t, { x: 40, y: 100 }, { x: 20, y: 100 });
    expect(get(t, node.id).pathOptions!.start).toBeCloseTo(0.1, 2);
    drag(tool, t, { x: 160, y: 100 }, { x: 180, y: 100 });
    expect(get(t, node.id).pathOptions!.end).toBeCloseTo(0.9, 2);
    expect(t.session.historyLength).toBe(3); // creation + one step per drag
  });

  it('the centre bracket slides the text keeping its span', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const node = onPathText(t);
    drag(tool, t, { x: 100, y: 100 }, { x: 120, y: 100 });
    const o = get(t, node.id).pathOptions!;
    expect(o.start).toBeCloseTo(0.3, 2);
    expect(o.end).toBeCloseTo(0.9, 2);
  });

  it('dragging the centre bracket across the path flips the text', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const node = onPathText(t);
    drag(tool, t, { x: 100, y: 100 }, { x: 100, y: 130 });
    expect(get(t, node.id).pathOptions!.flip).toBe(true);
    // Back over the text side restores it.
    drag(tool, t, { x: 100, y: 100 }, { x: 100, y: 60 });
    expect(get(t, node.id).pathOptions!.flip).toBe(false);
  });

  it('double click on the circle converts point text to area text and back', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const node = createText(t.ids, { kind: 'point' }, [{ text: 'Hello', style }]);
    node.transform = [1, 0, 0, 1, 50, 50];
    t.session.run(addNode(t.spaceId(), t.layerId(), node));
    t.session.select(selectOnly(t.spaceId(), [node.id]));
    // The circle sits just to the right of the text.
    {
      const w = textWidgetsOf(t.host).find((x) => x.kind === 'convert')!;
      tool.onPointerDown(ev(w.pos.x, w.pos.y, { clickCount: 2 }), t.host);
      tool.onPointerUp(ev(w.pos.x, w.pos.y), t.host);
      expect(get(t, node.id).kind).toBe('area');
      const w2 = textWidgetsOf(t.host).find((x) => x.kind === 'convert')!;
      tool.onPointerDown(ev(w2.pos.x, w2.pos.y, { clickCount: 2 }), t.host);
      tool.onPointerUp(ev(w2.pos.x, w2.pos.y), t.host);
      expect(get(t, node.id).kind).toBe('point');
    }
  });

  it('double click on text switches to the Type tool and asks it to edit that text', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const node = createText(t.ids, { kind: 'point' }, [{ text: 'Hello', style }]);
    node.transform = [1, 0, 0, 1, 50, 50];
    t.session.run(addNode(t.spaceId(), t.layerId(), node));
    const hit = t.host.hitTest({ x: 55, y: 47 })[0];
    expect(hit?.node.id).toBe(node.id);
    click(tool, t, 55, 47);
    tool.onPointerDown(ev(55, 47, { clickCount: 2 }), t.host);
    tool.onPointerUp(ev(55, 47), t.host);
    expect(t.host.switchTool).toHaveBeenCalledWith('tool-type');
    expect(t.host.takeTextEditRequest()).toMatchObject({ id: node.id });
  });
});
