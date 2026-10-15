import { describe, expect, it } from 'vitest';
import { plainText, type TextNode } from '../../../core';
import { createTextTool } from '../textTool';
import { click, createTestHost, drag, type TestHost } from './fakeHost';

const key = (k: string, extra: object = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });
const texts = (t: TestHost): TextNode[] => t.space().layers[0]!.children.filter((c) => c.type === 'text') as TextNode[];
const typed = (tool: ReturnType<typeof createTextTool>, t: TestHost, s: string) => tool.onTextInput!(s, t.host);

describe('Type tool', () => {
  it('a click then typing creates point text in one undo step', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    click(tool, t, 50, 60);
    expect(texts(t)).toHaveLength(0); // nothing exists until the first character
    typed(tool, t, 'H');
    typed(tool, t, 'i');
    expect(texts(t)).toHaveLength(1);
    expect(plainText(texts(t)[0]!.story)).toBe('Hi');
    expect(texts(t)[0]!.kind).toBe('point');
    t.session.undo();
    expect(texts(t)).toHaveLength(0);
  });

  it('a drag makes area text with a frame of the dragged size', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    drag(tool, t, { x: 10, y: 20 }, { x: 110, y: 80 });
    typed(tool, t, 'Hello');
    const node = texts(t)[0]!;
    expect(node.kind).toBe('area');
    const xs = node.frame!.anchors.map((a) => a.p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100);
  });

  it('Backspace, arrows and Enter edit the story', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    click(tool, t, 0, 0);
    typed(tool, t, 'abc');
    tool.onTextKey!(key('Backspace'), t.host);
    expect(plainText(texts(t)[0]!.story)).toBe('ab');
    tool.onTextKey!(key('ArrowLeft'), t.host);
    tool.onTextKey!(key('Enter'), t.host);
    expect(plainText(texts(t)[0]!.story)).toBe('a\nb');
  });

  it('Ctrl+A then typing replaces everything', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    click(tool, t, 0, 0);
    typed(tool, t, 'abc');
    tool.onTextKey!(key('a', { ctrlKey: true }), t.host);
    typed(tool, t, 'z');
    expect(plainText(texts(t)[0]!.story)).toBe('z');
  });

  it('Alt+Right adds 20 of tracking to the selection', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    click(tool, t, 0, 0);
    typed(tool, t, 'abc');
    tool.onTextKey!(key('a', { ctrlKey: true }), t.host);
    tool.onTextKey!(key('ArrowRight', { altKey: true }), t.host);
    expect(texts(t)[0]!.story.every((r) => r.style.tracking === 20)).toBe(true);
  });

  it('Escape leaves editing and returns to the Selection tool', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    click(tool, t, 0, 0);
    typed(tool, t, 'a');
    expect(tool.onTextKey!(key('Escape'), t.host)).toBe(true);
    expect(t.host.switchTool).toHaveBeenCalledWith('tool-select');
    expect(tool.editingText).toBe(false);
  });

  it('a text emptied by the user is removed when editing ends', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    click(tool, t, 0, 0);
    typed(tool, t, 'a');
    tool.onTextKey!(key('Backspace'), t.host);
    tool.onTextKey!(key('Escape'), t.host);
    expect(texts(t)).toHaveLength(0);
  });

  it('copy and paste keep styles inside the app', () => {
    const t = createTestHost();
    const tool = createTextTool('tool-type', 'point');
    click(tool, t, 0, 0);
    typed(tool, t, 'ab');
    tool.onTextKey!(key('a', { ctrlKey: true }), t.host);
    const copied = tool.onTextClipboard!('copy', null, t.host);
    expect(copied).toBe('ab');
    tool.onTextKey!(key('End'), t.host);
    tool.onTextClipboard!('paste', 'ab', t.host);
    expect(plainText(texts(t)[0]!.story)).toBe('abab');
  });
});

describe('Type on a Path', () => {
  it('clicking an open path puts text on it and replaces the path', () => {
    const t = createTestHost();
    const open = t.path([{ p: { x: 0, y: 100 }, in: null, out: null, kind: 'corner' }, { p: { x: 200, y: 100 }, in: null, out: null, kind: 'corner' }], false, false);
    const tool = createTextTool('tool-type-on-path', 'onPath');
    click(tool, t, 100, 100);
    typed(tool, t, 'Hi');
    const list = texts(t);
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe('onPath');
    expect(list[0]!.pathOptions!.start).toBeCloseTo(0.5, 1);
    expect(t.space().layers[0]!.children.some((c) => c.id === open.id)).toBe(false);
  });
});

describe('Area Type', () => {
  it('clicking a closed path flows text inside it', () => {
    const t = createTestHost();
    const a = (x: number, y: number) => ({ p: { x, y }, in: null, out: null, kind: 'corner' as const });
    t.path([a(0, 0), a(100, 0), a(100, 100), a(0, 100)], true, true);
    const tool = createTextTool('tool-area-type', 'area');
    click(tool, t, 50, 50);
    typed(tool, t, 'Hi');
    expect(texts(t)[0]!.kind).toBe('area');
  });
});
