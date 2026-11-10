import { describe, expect, it } from 'vitest';
import { addArtboard, addNode, arrangeArtboards, createArtboard, createDocument, createRect, DocumentSession, fitArtboardToArtwork, getActiveSpace, sequentialIds, topLevelNodes, translation } from '..';
import { arrangeBoards } from './artboardLayout';

const box = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });

describe('arrangeBoards', () => {
  const boards = [box('a', 10, 20, 100, 50), box('b', 500, 0, 80, 80), box('c', 0, 300, 100, 50), box('d', 9, 9, 40, 40)];

  it('fills rows left to right from the top-left of the union', () => {
    const p = arrangeBoards(boards, { columns: 2, spacing: 10, direction: 'row' });
    expect(p.get('a')).toEqual({ x: 0, y: 0 });
    expect(p.get('b')).toEqual({ x: 110, y: 0 }); // column 0 is 100 wide
    expect(p.get('c')).toEqual({ x: 0, y: 90 }); // row 0 is 80 tall
    expect(p.get('d')).toEqual({ x: 110, y: 90 });
  });

  it('mirrors the columns right to left', () => {
    const p = arrangeBoards(boards, { columns: 2, spacing: 0, direction: 'row-rtl' });
    expect(p.get('a')?.x).toBe(80); // a is in the right column, after the 80-wide left one
    expect(p.get('b')?.x).toBe(0);
  });

  it('fills columns top to bottom', () => {
    const p = arrangeBoards(boards, { columns: 2, spacing: 0, direction: 'column' });
    // 2 columns of 2: [a, b] and [c, d]
    expect(p.get('a')).toEqual({ x: 0, y: 0 });
    expect(p.get('b')).toEqual({ x: 0, y: 50 });
    expect(p.get('c')).toEqual({ x: 100, y: 0 });
    expect(p.get('d')).toEqual({ x: 100, y: 50 });
  });

  it('clamps the column count and never overlaps mixed sizes', () => {
    const p = arrangeBoards(boards, { columns: 99, spacing: 5, direction: 'row' });
    expect(p.get('d')?.x).toBe(100 + 5 + 80 + 5 + 100 + 5);
    expect(arrangeBoards([], { columns: 2, spacing: 0, direction: 'row' }).size).toBe(0);
  });
});

function setup() {
  const ids = sequentialIds('t');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 100 });
  const space = () => getActiveSpace(session.document);
  const rect = (x: number, y: number, w: number, h: number) => {
    const r = createRect(ids, w, h);
    r.transform = translation(x, y);
    session.run(addNode(space().id, space().layers[0]!.id, r));
    return r;
  };
  return { ids, session, space, rect };
}

describe('arrangeArtboards', () => {
  it('moves the boards and the artwork on them, once, and is one undo step', () => {
    const { ids, session, space, rect } = setup();
    const first = space().artboards[0]!;
    const second = createArtboard(ids, { name: 'B2', x: first.x + first.w + 500, y: first.y, w: 100, h: 100 });
    session.run(addArtboard(space().id, second));
    const onFirst = rect(first.x + 10, first.y + 10, 20, 20);
    const onSecond = rect(second.x + 10, second.y + 10, 20, 20);

    const command = arrangeArtboards(space(), { columns: 1, spacing: 20, direction: 'row' }, true)!;
    expect(session.run(command)).toBe(true);
    const [a, b] = space().artboards;
    expect(b!.x).toBe(a!.x);
    expect(b!.y).toBe(a!.y + a!.h + 20);
    const pos = (id: string) => (space().layers[0]!.children.find((c) => c.id === id) as { transform: number[] }).transform;
    expect(pos(onFirst.id)[4]).toBe(first.x + 10); // first board did not move
    expect(pos(onSecond.id)[4]).toBe(b!.x + 10);
    expect(pos(onSecond.id)[5]).toBe(b!.y + 10);
    session.undo();
    expect(space().artboards[1]!.x).toBe(second.x);
  });

  it('leaves the artwork when asked, and returns null when nothing moves', () => {
    const { ids, session, space, rect } = setup();
    const first = space().artboards[0]!;
    session.run(addArtboard(space().id, createArtboard(ids, { name: 'B2', x: first.x + 900, y: first.y, w: 100, h: 100 })));
    const r = rect(first.x + 900 + 5, first.y + 5, 10, 10);
    const command = arrangeArtboards(space(), { columns: 1, spacing: 0, direction: 'row' }, false)!;
    session.run(command);
    expect((space().layers[0]!.children.find((c) => c.id === r.id) as { transform: number[] }).transform[4]).toBe(first.x + 900 + 5);
    expect(arrangeArtboards(space(), { columns: 1, spacing: 0, direction: 'row' }, false)).toBeNull();
  });
});

describe('fitArtboardToArtwork', () => {
  it('wraps all visible artwork, or only the given objects', () => {
    const { session, space, rect } = setup();
    const a = rect(100, 200, 50, 40);
    rect(400, 500, 10, 10);
    const board = space().artboards[0]!;
    session.run(fitArtboardToArtwork(space(), board.id, null)!);
    expect(space().artboards[0]).toMatchObject({ x: 100 - 0.5, y: 200 - 0.5 });
    session.run(fitArtboardToArtwork(space(), board.id, [a])!);
    const fitted = space().artboards[0]!;
    expect(fitted.w).toBeGreaterThanOrEqual(50);
    expect(fitted.w).toBeLessThanOrEqual(51);
    expect(topLevelNodes(space())).toHaveLength(2);
  });

  it('returns null for an empty Space', () => {
    const { space } = setup();
    expect(fitArtboardToArtwork(space(), space().artboards[0]!.id, null)).toBeNull();
  });
});

describe('duplicateArtboard', () => {
  it('copies the board and, on request, the artwork on it, shifted with the copy', async () => {
    const { duplicateArtboard, copyArtboard } = await import('..');
    const { ids, session, space, rect } = setup();
    const source = space().artboards[0]!;
    const r = rect(source.x + 10, source.y + 10, 20, 20);
    rect(source.x + 5000, source.y, 20, 20); // off the board: stays single
    const copy = copyArtboard(source, ids(), 'B2', { x: source.x + 1000, y: source.y });
    const result = duplicateArtboard(space(), source.id, copy, ids, true)!;
    expect(result.artworkIds).toHaveLength(1);
    expect(session.run(result.command)).toBe(true);
    expect(space().artboards.map((a) => a.name)).toEqual([source.name, 'B2']);
    const nodes = space().layers[0]!.children as { id: string; transform: number[] }[];
    const clone = nodes.find((n) => n.id === result.artworkIds[0])!;
    expect(clone.transform[4]).toBe(source.x + 10 + 1000);
    expect(nodes.find((n) => n.id === r.id)!.transform[4]).toBe(source.x + 10);
    expect(nodes).toHaveLength(3);
    session.undo();
    expect(space().artboards).toHaveLength(1);
    expect(space().layers[0]!.children).toHaveLength(2);
  });

  it('leaves the artwork out when not asked', async () => {
    const { duplicateArtboard, copyArtboard } = await import('..');
    const { ids, session, space, rect } = setup();
    const source = space().artboards[0]!;
    rect(source.x + 10, source.y + 10, 20, 20);
    const result = duplicateArtboard(space(), source.id, copyArtboard(source, ids(), 'B2', { x: 9000, y: 0 }), ids, false)!;
    session.run(result.command);
    expect(result.artworkIds).toEqual([]);
    expect(space().layers[0]!.children).toHaveLength(1);
  });
});
