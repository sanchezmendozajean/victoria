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
    const { useUi } = await import('../../app/store');
    useUi.setState({ moveArtworkWithArtboard: withArtwork });
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
