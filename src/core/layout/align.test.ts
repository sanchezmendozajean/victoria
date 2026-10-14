import { describe, expect, it } from 'vitest';
import { alignItems, currentSpacing, distributeItems, distributeSpacing, fitToArea, gapsOf, gridItems, unionOf, type Item } from '..';

const box = (id: string, x: number, y: number, w: number, h: number): Item => ({ id, rect: { minX: x, minY: y, maxX: x + w, maxY: y + h } });
const delta = (m: Map<string, { x: number; y: number }>, id: string) => m.get(id) ?? { x: 0, y: 0 };

describe('align', () => {
  const items = [box('a', 0, 0, 10, 10), box('b', 20, 30, 30, 20), box('c', 60, 5, 20, 40)];
  const target = unionOf(items)!;

  it('aligns to the edges and centres of the target', () => {
    expect(delta(alignItems(items, 'left', target), 'b')).toEqual({ x: -20, y: 0 });
    expect(delta(alignItems(items, 'right', target), 'a')).toEqual({ x: 70, y: 0 });
    expect(delta(alignItems(items, 'hcenter', target), 'a')).toEqual({ x: 35, y: 0 });
    expect(delta(alignItems(items, 'top', target), 'b')).toEqual({ x: 0, y: -30 });
    expect(delta(alignItems(items, 'bottom', target), 'a')).toEqual({ x: 0, y: 40 });
    expect(delta(alignItems(items, 'vcenter', target), 'c')).toEqual({ x: 0, y: 0 }); // already centred on 5..45? centre 25 = target centre
  });

  it('only reports objects that move', () => {
    expect(alignItems(items, 'left', target).has('a')).toBe(false);
  });

  it('aligns to a key object or an artboard', () => {
    const artboard = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
    expect(delta(alignItems(items, 'hcenter', artboard), 'a')).toEqual({ x: 95, y: 0 });
    expect(delta(alignItems(items, 'left', items[1]!.rect), 'a')).toEqual({ x: 20, y: 0 });
  });

  it('measures the union', () => {
    expect(unionOf(items)).toEqual({ minX: 0, minY: 0, maxX: 80, maxY: 50 });
    expect(unionOf([])).toBeNull();
  });
});

describe('distribute', () => {
  it('spaces the chosen edge evenly, keeping the outermost objects', () => {
    const items = [box('a', 0, 0, 10, 10), box('b', 15, 0, 10, 10), box('c', 100, 0, 10, 10)];
    const d = distributeItems(items, 'left');
    expect(delta(d, 'b')).toEqual({ x: 35, y: 0 });
    expect(d.has('a')).toBe(false);
    expect(d.has('c')).toBe(false);
  });

  it('works by centres and vertically', () => {
    const items = [box('a', 0, 0, 10, 10), box('b', 0, 12, 10, 30), box('c', 0, 100, 10, 10)];
    expect(delta(distributeItems(items, 'vcenter'), 'b').y).toBe(55 - 27);
    expect(delta(distributeItems(items, 'bottom'), 'b').y).toBe(60 - 42);
  });

  it('needs at least three objects', () => {
    expect(distributeItems([box('a', 0, 0, 1, 1), box('b', 9, 0, 1, 1)], 'left').size).toBe(0);
  });
});

describe('spacing', () => {
  const items = [box('a', 0, 0, 10, 10), box('b', 15, 0, 20, 10), box('c', 60, 0, 10, 10)];

  it('reports the gaps, the shared value, or mixed', () => {
    expect(gapsOf(items, 'h')).toEqual([5, 25]);
    expect(currentSpacing(items, 'h')).toEqual({ value: null, mixed: true });
    expect(currentSpacing([box('a', 0, 0, 10, 10), box('b', 20, 0, 10, 10), box('c', 40, 0, 10, 10)], 'h')).toEqual({ value: 10, mixed: false });
    expect(currentSpacing([box('a', 0, 0, 1, 1)], 'h')).toEqual({ value: null, mixed: false });
  });

  it('auto spacing spreads evenly between the outermost objects', () => {
    const d = distributeSpacing(items, 'h', null);
    // total 70, objects 40 wide → 15 each gap: b at 25
    expect(delta(d, 'b')).toEqual({ x: 10, y: 0 });
    expect(d.has('a')).toBe(false);
    expect(d.has('c')).toBe(false);
  });

  it('an exact gap keeps the first object, or the key object, in place', () => {
    const d = distributeSpacing(items, 'h', 8);
    expect(d.has('a')).toBe(false);
    expect(delta(d, 'b')).toEqual({ x: 3, y: 0 });
    expect(delta(d, 'c')).toEqual({ x: 46 - 60, y: 0 });
    const key = distributeSpacing(items, 'h', 8, 'c');
    expect(key.has('c')).toBe(false);
    expect(delta(key, 'b').x).toBe(60 - 8 - 20 - 15);
    expect(delta(key, 'a').x).toBe(60 - 8 - 20 - 8 - 10 - 0);
  });

  it('works vertically and ignores a single object', () => {
    const v = [box('a', 0, 0, 10, 10), box('b', 0, 30, 10, 10)];
    expect(delta(distributeSpacing(v, 'v', 5), 'b')).toEqual({ x: 0, y: -15 });
    expect(distributeSpacing([v[0]!], 'v', 5).size).toBe(0);
  });
});

describe('grid', () => {
  it('arranges in reading order with cells as large as the biggest object', () => {
    const items = [box('a', 100, 0, 10, 10), box('b', 0, 0, 20, 10), box('c', 50, 50, 10, 30), box('d', 0, 55, 10, 10)];
    const d = gridItems(items, { columns: 2, gapX: 5, gapY: 4 });
    // sorted: b (cx 10), a (cx 105) in row 1; d (cy 60), c (cy 65) in row 2 → d first by x
    expect(delta(d, 'b')).toEqual({ x: 0, y: 0 });
    expect(delta(d, 'a')).toEqual({ x: 25 - 100, y: 0 });
    expect(delta(d, 'd')).toEqual({ x: 0, y: 34 - 55 });
    expect(delta(d, 'c')).toEqual({ x: 25 - 50, y: 34 - 50 });
  });

  it('takes an origin and handles one column', () => {
    const items = [box('a', 5, 5, 10, 10), box('b', 5, 40, 10, 10)];
    const d = gridItems(items, { columns: 1, gapX: 0, gapY: 2, origin: { x: 100, y: 100 } });
    expect(delta(d, 'a')).toEqual({ x: 95, y: 95 });
    expect(delta(d, 'b')).toEqual({ x: 95, y: 112 - 40 });
    expect(gridItems([], { columns: 3, gapX: 1, gapY: 1 }).size).toBe(0);
  });
});

describe('fit to area with margins', () => {
  it('puts the outermost objects on the margins and spaces the rest evenly', () => {
    const items = [box('a', 40, 40, 10, 10), box('b', 60, 40, 10, 10), box('c', 70, 40, 10, 10)];
    const d = fitToArea(items, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, { top: 10, right: 10, bottom: 10, left: 10 });
    expect(delta(d, 'a').x).toBe(10 - 40);
    expect(delta(d, 'c').x).toBe(90 - 10 - 70);
    expect(delta(d, 'b').x).toBe(45 - 60);
    // One row: all objects end up at the top margin (vertical axis spreads one object to the top margin).
    expect(delta(d, 'a').y).toBe(10 - 40);
  });

  it('centres nothing for an empty selection', () => {
    expect(fitToArea([], { minX: 0, minY: 0, maxX: 10, maxY: 10 }, { top: 0, right: 0, bottom: 0, left: 0 }).size).toBe(0);
  });
});
