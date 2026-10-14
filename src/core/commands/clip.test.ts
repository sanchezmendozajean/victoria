import { describe, expect, it } from 'vitest';
import { addNode, createClipGroup, createDocument, createRect, DocumentSession, getActiveSpace, groupNodes, sequentialIds, translation, ungroupNode, type ClipGroupNode } from '..';

function setup() {
  const ids = sequentialIds('c');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 50 });
  const space = () => getActiveSpace(session.document);
  const add = (x: number) => {
    const r = createRect(ids, 10, 10);
    r.transform = translation(x, 0);
    session.run(addNode(space().id, space().layers[0]!.id, r));
    return r;
  };
  return { ids, session, space, add };
}

describe('clipping groups', () => {
  it('the topmost selected object becomes the mask (first child), as one undo step', () => {
    const { ids, session, space, add } = setup();
    const a = add(0);
    const b = add(50);
    const c = add(100);
    const before = session.historyLength;
    const clip = createClipGroup(ids, []);
    session.run(groupNodes(space().id, [a.id, b.id, c.id], clip));
    expect(session.historyLength).toBe(before + 1);
    const group = space().layers[0]!.children[0] as ClipGroupNode;
    expect(group.type).toBe('clipGroup');
    expect(group.children.map((n) => n.id)).toEqual([c.id, a.id, b.id]);
    session.undo();
    expect(space().layers[0]!.children.map((n) => n.id)).toEqual([a.id, b.id, c.id]);
  });

  it('releasing keeps the children, with the group transform baked in', () => {
    const { ids, session, space, add } = setup();
    const a = add(0);
    const b = add(50);
    const clip = createClipGroup(ids, []);
    clip.transform = translation(5, 7);
    session.run(groupNodes(space().id, [a.id, b.id], clip));
    session.run(ungroupNode(space().id, clip.id));
    const kids = space().layers[0]!.children as Array<{ id: string; transform: number[] }>;
    expect(kids).toHaveLength(2);
    expect(kids.every((k) => k.transform[5] === 7)).toBe(true);
  });
});
