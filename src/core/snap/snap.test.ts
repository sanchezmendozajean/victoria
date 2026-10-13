import { describe, expect, it } from 'vitest';
import { createArtboard, createLayer, createRect, createSpace } from '../model/factory';
import { sequentialIds } from '../model/ids';
import { translation } from '../model/matrix';
import type { Guide, Node } from '../model/types';
import { snapPoint, snapRect, SNAP_PIXELS } from './snap';

const ids = sequentialIds('snap');
const rect = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

function spaceWith(...nodes: Node[]) {
  const layer = createLayer(ids, 'L');
  layer.children.push(...nodes);
  return createSpace(ids, { name: 'S', layers: [layer] });
}

const box = (x: number, y: number, w = 100, h = 50): Node => {
  const r = createRect(ids, w, h);
  r.appearance.items = r.appearance.items.filter((i) => i.kind === 'fill');
  r.transform = translation(x, y);
  return r;
};

describe('snapping', () => {
  it('uses 4 screen pixels', () => {
    expect(SNAP_PIXELS).toBe(4);
  });

  it('snaps to a vertical guide with the closest edge or centre', () => {
    const guide: Guide = { id: 'g', orientation: 'vertical', position: 200, locked: false };
    const result = snapRect(rect(103, 0, 197.5, 10), { guides: [guide] }, 4);
    expect(result.dx).toBeCloseTo(2.5, 9); // right edge 197.5 → 200
    expect(result.dy).toBe(0);
    expect(result.lines).toMatchObject([{ axis: 'x', value: 200, kind: 'guide', label: null }]);
  });

  it('does not snap beyond the tolerance', () => {
    const guide: Guide = { id: 'g', orientation: 'vertical', position: 200, locked: false };
    const result = snapRect(rect(100, 0, 195.9, 10), { guides: [guide] }, 4);
    expect(result).toEqual({ dx: 0, dy: 0, lines: [] });
  });

  it('snaps both axes independently', () => {
    const guides: Guide[] = [
      { id: 'v', orientation: 'vertical', position: 50, locked: false },
      { id: 'h', orientation: 'horizontal', position: 80, locked: false },
    ];
    const result = snapRect(rect(52, 77, 90, 120), { guides }, 4);
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(3);
    expect(result.lines.map((l) => l.axis).sort()).toEqual(['x', 'y']);
  });

  it('snaps to the grid every size / subdivisions', () => {
    const result = snapRect(rect(70, 13, 120, 60), { grid: { size: 72, subdivisions: 8 } }, 4); // step 9
    // x: 70→72 (+2), 95→99 (+4), 120→117 (−3): the closest wins. y: 36.5→36 (−0.5).
    expect(result.dx).toBe(2);
    expect(result.dy).toBeCloseTo(-0.5, 9);
  });

  it('snaps to artboard edges and centre, labelling the centre', () => {
    const board = createArtboard(ids, { name: 'B', x: 0, y: 0, w: 200, h: 100 });
    const edge = snapRect(rect(-3, 40, 50, 60), { artboards: [board] }, 4);
    expect(edge.dx).toBe(3);
    expect(edge.lines[0]).toMatchObject({ kind: 'artboard', value: 0 });
    const centre = snapRect(rect(90, 10, 109, 30), { artboards: [board] }, 4); // centre x = 99.5 → 100
    expect(centre.dx).toBeCloseTo(0.5, 9);
    expect(centre.lines.find((l) => l.axis === 'x')).toMatchObject({ kind: 'center', label: 'center' });
  });

  it('aligns with the edges and centres of other objects ("alinear", "centro")', () => {
    const other = box(300, 200); // x 300–400, y 200–250
    const space = spaceWith(other);
    const edge = snapRect(rect(298, 0, 330, 20), { objects: { space, exclude: new Set() } }, 4);
    expect(edge.dx).toBe(2);
    expect(edge.lines.find((l) => l.axis === 'x')).toMatchObject({ kind: 'edge', label: 'align', value: 300 });

    const centre = snapRect(rect(330, 0, 370.5, 20), { objects: { space, exclude: new Set() } }, 4); // centre 350.25 → 350
    expect(centre.dx).toBeCloseTo(-0.25, 9);
    expect(centre.lines.find((l) => l.axis === 'x')).toMatchObject({ kind: 'center', label: 'center' });
  });

  it('ignores the objects being moved, and everything inside a moved group', () => {
    const moving = box(300, 200);
    const space = spaceWith(moving);
    const result = snapRect(rect(298, 0, 330, 20), { objects: { space, exclude: new Set([moving.id]) } }, 4);
    expect(result.lines).toEqual([]);
  });

  it('lines extend from the moving rectangle to the target object', () => {
    const space = spaceWith(box(300, 200));
    const result = snapRect(rect(300, 0, 330, 20), { objects: { space, exclude: new Set() } }, 4);
    const line = result.lines.find((l) => l.axis === 'x' && l.value === 300)!;
    expect(line.from).toBe(0);
    expect(line.to).toBe(250);
  });

  it('prefers the closest snap and, on a tie, guides over the grid', () => {
    const guide: Guide = { id: 'g', orientation: 'vertical', position: 100, locked: false };
    const result = snapRect(rect(98, 0, 150, 10), { guides: [guide], grid: { size: 100, subdivisions: 1 } }, 4);
    expect(result.dx).toBe(2);
    expect(new Set(result.lines.map((l) => l.kind))).toEqual(new Set(['grid', 'guide'])); // both lines are reported
    const closer = snapRect(rect(98, 0, 150, 10), { guides: [{ ...guide, position: 101.5 }], grid: { size: 100, subdivisions: 1 } }, 4);
    expect(closer.dx).toBe(2); // the grid (100) is closer than the guide (101.5)
  });

  it('snaps a point to anchors on either axis', () => {
    const result = snapPoint({ x: 99, y: 203 }, { anchors: [{ x: 100, y: 500 }, { x: 300, y: 200 }] }, 4);
    expect(result.dx).toBe(1);
    expect(result.dy).toBe(-3);
    expect(result.lines.every((l) => l.label === 'anchor')).toBe(true);
  });

  it('with nothing to snap to it does nothing', () => {
    expect(snapRect(rect(0, 0, 10, 10), {}, 4)).toEqual({ dx: 0, dy: 0, lines: [] });
  });
});
