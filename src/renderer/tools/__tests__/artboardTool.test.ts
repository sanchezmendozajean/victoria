import { describe, expect, it } from 'vitest';
import { getActiveSpace } from '../../../core';
import { resizeRect } from '../artboardTool';

const start = { x: 100, y: 100, w: 200, h: 100 };

describe('resizeRect', () => {
  it('pulls the edges a handle touches and leaves the others', () => {
    expect(resizeRect(start, 'e', { x: 400, y: 0 }, false)).toEqual({ x: 100, y: 100, w: 300, h: 100 });
    expect(resizeRect(start, 'nw', { x: 50, y: 60 }, false)).toEqual({ x: 50, y: 60, w: 250, h: 140 });
  });

  it('never collapses or flips', () => {
    const r = resizeRect(start, 'e', { x: 0, y: 0 }, false);
    expect(r.w).toBe(1);
    expect(r.x).toBe(100);
  });

  it('Shift keeps the proportions on a corner', () => {
    const r = resizeRect(start, 'se', { x: 500, y: 150 }, true);
    expect(r.w / r.h).toBeCloseTo(2, 9);
    expect(r.x).toBe(100);
  });
});

describe('moving an artboard', () => {
  const setup = async (withArtwork: boolean) => {
    const { createTestHost, drag, nodeX } = await import('./fakeHost');
    const { usePreferences } = await import('../../prefs/preferences');
    usePreferences.getState().set({ moveArtworkWithArtboard: withArtwork });
    const t = createTestHost();
    const board = getActiveSpace(t.session.document).artboards[0]!;
    const r = t.rect(board.x + 10, board.y + 10, 20, 20);
    const tool = (await import('../artboardTool')).createArtboardTool();
    const from = { x: board.x + board.w / 2, y: board.y + board.h / 2 };
    drag(tool, t, from, { x: from.x + 50, y: from.y + 30 });
    return { t, board, r, nodeX };
  };

  it('carries the artwork with it by default', async () => {
    const { t, board, r, nodeX } = await setup(true);
    expect(getActiveSpace(t.session.document).artboards[0]!.x).toBe(board.x + 50);
    expect(nodeX(t, r.id)).toBe(board.x + 10 + 50);
  });

  it('leaves the artwork in place when "move artwork with artboard" is off', async () => {
    const { t, board, r, nodeX } = await setup(false);
    expect(getActiveSpace(t.session.document).artboards[0]!.x).toBe(board.x + 50);
    expect(nodeX(t, r.id)).toBe(board.x + 10);
  });
});

describe('clicking an object with the artboard tool', () => {
  it('creates an artboard fitted to its bounds, stroke included', async () => {
    const { createTestHost, click } = await import('./fakeHost');
    const { createArtboardTool } = await import('../artboardTool');
    const t = createTestHost();
    const board = getActiveSpace(t.session.document).artboards[0]!;
    const x = board.x + board.w + 200;
    const r = t.rect(x, board.y, 100, 60, { stroke: 10 });
    const tool = createArtboardTool();
    click(tool, t, x + 50, board.y + 30);
    const boards = getActiveSpace(t.session.document).artboards;
    expect(boards).toHaveLength(2);
    expect(boards[1]).toMatchObject({ x: x - 5, y: board.y - 5, w: 110, h: 70 });
    expect(r.id).toBeTruthy();
  });
});

describe('Alt+drag on an artboard', () => {
  const run = async (withArtwork: boolean) => {
    const { createTestHost, drag } = await import('./fakeHost');
    const { usePreferences } = await import('../../prefs/preferences');
    usePreferences.getState().set({ moveArtworkWithArtboard: withArtwork });
    const t = createTestHost();
    const board = getActiveSpace(t.session.document).artboards[0]!;
    t.rect(board.x + 10, board.y + 10, 20, 20);
    const tool = (await import('../artboardTool')).createArtboardTool();
    const from = { x: board.x + board.w / 2, y: board.y + board.h / 2 };
    drag(tool, t, from, { x: from.x + board.w + 100, y: from.y }, { altKey: true });
    return { t, board };
  };

  it('copies the board with its artwork, which travels with the copy', async () => {
    const { t, board } = await run(true);
    const space = getActiveSpace(t.session.document);
    expect(space.artboards).toHaveLength(2);
    expect(space.artboards[0]!.x).toBe(board.x); // the original stays
    const xs = (space.layers[0]!.children as { transform: number[] }[]).map((n) => n.transform[4]).sort((a, b) => a! - b!);
    expect(xs[0]).toBeCloseTo(board.x + 10, 6);
    expect(xs[1]).toBeCloseTo(board.x + 10 + board.w + 100, 6);
  });

  it('copies only the board when the option is off', async () => {
    const { t } = await run(false);
    const space = getActiveSpace(t.session.document);
    expect(space.artboards).toHaveLength(2);
    expect(space.layers[0]!.children).toHaveLength(1);
  });
});

describe('resizing an artboard with smart guides', () => {
  const resize = async (smartGuides: boolean) => {
    const { createTestHost, drag } = await import('./fakeHost');
    const { createArtboardTool } = await import('../artboardTool');
    const t = createTestHost({ options: { smartGuides } });
    const board = getActiveSpace(t.session.document).artboards[0]!;
    const edge = board.x + board.w;
    const y = board.y + board.h / 2;
    t.rect(edge + 300, board.y + 10, 50, 50);
    drag(createArtboardTool(), t, { x: edge, y }, { x: edge + 297, y });
    return { width: getActiveSpace(t.session.document).artboards[0]!.w, board, t };
  };

  it('snaps the dragged edge to the artwork', async () => {
    const { width, board, t } = await resize(true);
    expect(width).toBeCloseTo(board.w + 300, 6);
    expect(t.host.setSnapLines).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ axis: 'x' })]));
  });

  it('does not snap when smart guides are off', async () => {
    const { width, board } = await resize(false);
    expect(width).toBeCloseTo(board.w + 297, 6);
  });
});
