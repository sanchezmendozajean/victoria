import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNode, createDocument, createText, DocumentSession, getActiveSpace, selectOnly, sequentialIds, type TextNode } from '../../core';

let current: { session: DocumentSession } | null = null;
vi.mock('../documents', () => ({
  manager: {
    get active() {
      return current;
    },
  },
}));
vi.mock('../documents/manager', () => ({ lastSelectionOf: () => undefined }));

const actions = await import('./textActions');
const { useUi } = await import('./store');

const ids = sequentialIds('x');
let session: DocumentSession;
let node: TextNode;

const space = () => getActiveSpace(session.document);
const current_ = () => space().layers[0]!.children.find((c) => c.id === node.id) as TextNode;

beforeEach(() => {
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  session = new DocumentSession(doc, { ids, historyLimit: 100 });
  current = { session };
  node = createText(ids, { kind: 'point' }, [{ text: 'Hello world', style: { fontFamily: 'Mono', fontStyle: 'Regular', size: 10 } }]);
  session.run(addNode(space().id, space().layers[0]!.id, node));
  session.select(selectOnly(space().id, [node.id]));
  useUi.setState({ textEditing: null, pendingTextStyle: null, textStyle: { fontFamily: 'Arial', fontStyle: 'Regular', size: 12 }, paragraphStyle: {} });
});

describe('Character / Paragraph panel actions', () => {
  it('styles the whole selected text object in one undo step', () => {
    const before = session.historyLength;
    actions.applyCharacter({ size: 24 });
    expect(current_().story.every((r) => r.style.size === 24)).toBe(true);
    expect(session.historyLength).toBe(before + 1);
    session.undo();
    expect(current_().story[0]!.style.size).toBe(10);
  });

  it('styles only the editing range and reports mixed values', () => {
    useUi.setState({ textEditing: { id: node.id, from: 0, to: 5 } });
    actions.applyCharacter({ underline: true });
    expect(actions.characterField('underline')).toEqual({ mixed: false, value: true });
    useUi.setState({ textEditing: { id: node.id, from: 0, to: 11 } });
    expect(actions.characterField('underline')).toEqual({ mixed: true });
  });

  it('a collapsed caret keeps the attribute for the next characters instead of changing the text', () => {
    useUi.setState({ textEditing: { id: node.id, from: 3, to: 3 } });
    const before = session.historyLength;
    actions.applyCharacter({ size: 40 });
    expect(session.historyLength).toBe(before);
    expect(useUi.getState().pendingTextStyle).toEqual({ size: 40 });
    expect(actions.characterField('size')).toEqual({ mixed: false, value: 40 });
  });

  it('with nothing selected the panel edits the defaults of the next text', () => {
    session.select(selectOnly(space().id, []));
    actions.applyCharacter({ size: 18 });
    expect(useUi.getState().textStyle.size).toBe(18);
    actions.applyParagraph({ align: 'center' });
    expect(useUi.getState().paragraphStyle.align).toBe('center');
  });

  it('paragraph attributes apply to the paragraphs of the range only', () => {
    useUi.setState({ textEditing: { id: node.id, from: 0, to: 0 } });
    actions.applyParagraph({ align: 'right' });
    expect(actions.paragraphField('align')).toEqual({ mixed: false, value: 'right' });
    expect(current_().paragraphs![0]!.align).toBe('right');
  });

  it('Create Outlines replaces the text by a selected group', () => {
    actions.outlineSelection();
    const children = space().layers[0]!.children;
    expect(children.some((c) => c.type === 'text')).toBe(false);
    expect(children.some((c) => c.type === 'group')).toBe(true);
    expect(session.selection.ids).toHaveLength(1);
  });
});
