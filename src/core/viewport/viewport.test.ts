import { describe, expect, it } from 'vitest';
import { colorToCss, colorToRgb } from '../model/color';
import {
  clampZoom,
  docToScreen,
  fitRect,
  isUntouchedView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToDoc,
  stepZoom,
  visibleRect,
  zoomAt,
  zoomToScreenRect,
} from './viewport';

const view = { zoom: 2, panX: 100, panY: 50 };

describe('viewport', () => {
  it('maps document and screen coordinates both ways', () => {
    expect(docToScreen(view, { x: 10, y: 10 })).toEqual({ x: 120, y: 70 });
    expect(screenToDoc(view, { x: 120, y: 70 })).toEqual({ x: 10, y: 10 });
  });

  it('1 pt is 1 px at 100 %', () => {
    expect(docToScreen({ zoom: 1, panX: 0, panY: 0 }, { x: 72, y: 36 })).toEqual({ x: 72, y: 36 });
  });

  it('zooms at the cursor: the point under it does not move', () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToDoc(view, anchor);
    for (const z of [0.5, 3, 40]) {
      const next = zoomAt(view, z, anchor);
      expect(next.zoom).toBe(z);
      const after = screenToDoc(next, anchor);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it('clamps the zoom to 3 % – 64 000 %', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(10_000)).toBe(MAX_ZOOM);
    expect(MIN_ZOOM).toBe(0.03);
    expect(MAX_ZOOM).toBe(640);
    expect(zoomAt(view, 1e9, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it('pans by screen pixels', () => {
    expect(panBy(view, -10, 5)).toEqual({ zoom: 2, panX: 90, panY: 55 });
  });

  it('steps along the zoom ladder and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBeCloseTo(0.6667, 4);
    expect(stepZoom(0.9, 1)).toBe(1);
    expect(stepZoom(0.9, -1)).toBeCloseTo(0.6667, 4);
    expect(stepZoom(640, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(0.03, -1)).toBe(MIN_ZOOM);
  });

  it('fits a rectangle centred with padding', () => {
    const fitted = fitRect(1000, 800, { minX: 0, minY: 0, maxX: 200, maxY: 100 }, 50);
    expect(fitted.zoom).toBeCloseTo(4.5, 9); // limited by width: (1000 − 100) / 200
    const centre = docToScreen(fitted, { x: 100, y: 50 });
    expect(centre.x).toBeCloseTo(500, 9);
    expect(centre.y).toBeCloseTo(400, 9);
  });

  it('never fits beyond the maximum zoom, even for a tiny rectangle', () => {
    expect(fitRect(1000, 800, { minX: 0, minY: 0, maxX: 0, maxY: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it('zooms to a dragged rectangle', () => {
    const next = zoomToScreenRect({ zoom: 1, panX: 0, panY: 0 }, 1000, 500, { minX: 100, minY: 100, maxX: 200, maxY: 150 });
    expect(next.zoom).toBeCloseTo(10, 9);
    const centre = docToScreen(next, { x: 150, y: 125 });
    expect(centre.x).toBeCloseTo(500, 9);
    expect(centre.y).toBeCloseTo(250, 9);
  });

  it('knows the visible part of the Space', () => {
    expect(visibleRect(view, 400, 300)).toEqual({ minX: -50, minY: -25, maxX: 150, maxY: 125 });
  });

  it('recognises a view nobody has touched yet', () => {
    expect(isUntouchedView({ zoom: 1, panX: 0, panY: 0 })).toBe(true);
    expect(isUntouchedView(view)).toBe(false);
  });
});

describe('colour', () => {
  it('converts every model to rgb', () => {
    expect(colorToRgb({ model: 'rgb', values: [10, 20, 30] })).toEqual([10, 20, 30]);
    expect(colorToRgb({ model: 'gray', values: [0] })).toEqual([255, 255, 255]);
    expect(colorToRgb({ model: 'gray', values: [100] })).toEqual([0, 0, 0]);
    expect(colorToRgb({ model: 'cmyk', values: [0, 100, 100, 0] })).toEqual([255, 0, 0]);
    expect(colorToRgb({ model: 'cmyk', values: [0, 0, 0, 100] })).toEqual([0, 0, 0]);
    expect(colorToRgb({ model: 'hsb', values: [120, 100, 100] }).map(Math.round)).toEqual([0, 255, 0]);
    expect(colorToRgb({ model: 'hsb', values: [0, 0, 50] }).map(Math.round)).toEqual([128, 128, 128]);
  });

  it('clamps out-of-range values', () => {
    expect(colorToRgb({ model: 'rgb', values: [-5, 300, 0] })).toEqual([0, 255, 0]);
  });

  it('writes css with alpha only when needed', () => {
    expect(colorToCss({ model: 'rgb', values: [255, 0, 0] })).toBe('rgb(255,0,0)');
    expect(colorToCss({ model: 'rgb', values: [255, 0, 0], alpha: 0.5 })).toBe('rgba(255,0,0,0.5)');
    expect(colorToCss({ model: 'rgb', values: [255, 0, 0] }, 0.25)).toBe('rgba(255,0,0,0.25)');
  });
});
