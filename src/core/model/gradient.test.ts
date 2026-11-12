import { describe, expect, it } from 'vitest';
import { dragGradientStop } from './gradient';
import type { GradientStop } from './types';

const stop = (offset: number, r: number): GradientStop => ({ offset, color: { model: 'rgb', values: [r, 0, 0] }, opacity: 1 });
const reds = (g: { stops: GradientStop[] }) => g.stops.map((s) => s.color.values[0]);

describe('dragGradientStop', () => {
  it('moves the stop and keeps the list sorted', () => {
    const g = { stops: [stop(0, 0), stop(0.5, 128), stop(1, 255)] };
    expect(dragGradientStop(g, 1, 0.25)).toBe(1);
    expect(g.stops.map((s) => s.offset)).toEqual([0, 0.25, 1]);
  });

  it('follows the stop when it passes a neighbour', () => {
    const g = { stops: [stop(0, 0), stop(0.5, 128), stop(1, 255)] };
    const index = dragGradientStop(g, 0, 0.75);
    expect(index).toBe(1);
    expect(reds(g)).toEqual([128, 0, 255]);
    // The next move of the same drag uses the returned index.
    expect(dragGradientStop(g, index, 0.1)).toBe(0);
    expect(reds(g)).toEqual([0, 128, 255]);
  });

  it('with duplicate, leaves the original and moves a copy of the same colour', () => {
    const g = { stops: [stop(0, 0), stop(1, 255)] };
    const index = dragGradientStop(g, 0, 0.4, true);
    expect(g.stops).toHaveLength(3);
    expect(g.stops.map((s) => s.offset)).toEqual([0, 0.4, 1]);
    expect(reds(g)).toEqual([0, 0, 255]);
    expect(index).toBe(1);
    // The copy is independent of the original.
    g.stops[1]!.color.values[0] = 99;
    expect(g.stops[0]!.color.values[0]).toBe(0);
    // Later moves only move the copy.
    dragGradientStop(g, index, 0.6);
    expect(g.stops.map((s) => s.offset)).toEqual([0, 0.6, 1]);
  });

  it('clamps and rounds the offset; an unknown index changes nothing', () => {
    const g = { stops: [stop(0, 0), stop(1, 255)] };
    dragGradientStop(g, 1, 1.7);
    expect(g.stops[1]!.offset).toBe(1);
    dragGradientStop(g, 0, 0.12345);
    expect(g.stops[0]!.offset).toBe(0.123);
    expect(dragGradientStop(g, 5, 0.5)).toBe(5);
    expect(g.stops).toHaveLength(2);
  });
});
