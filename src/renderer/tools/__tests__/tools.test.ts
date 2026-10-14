import { describe, expect, it, vi } from 'vitest';
import type { Viewport } from '../../../core';
import { createTool } from '..';
import { createHandTool } from '../handTool';
import { createZoomTool, MARQUEE_THRESHOLD } from '../zoomTool';
import { createTestHost, ev } from './fakeHost';

const hostAt = (view: Viewport = { zoom: 1, panX: 0, panY: 0 }) => createTestHost({ view }).host;

describe('hand tool', () => {
  it('pans with the drag and keeps the zoom', () => {
    const host = hostAt({ zoom: 2, panX: 10, panY: 20 });
    const tool = createHandTool();
    tool.onPointerDown(ev(100, 100), host);
    tool.onPointerMove(ev(130, 90), host);
    expect(host.view).toEqual({ zoom: 2, panX: 40, panY: 10 });
    tool.onPointerMove(ev(100, 100), host); // back to the start: view returns too
    expect(host.view).toEqual({ zoom: 2, panX: 10, panY: 20 });
  });

  it('ignores moves without a press and stops after release', () => {
    const host = hostAt();
    const tool = createHandTool();
    tool.onPointerMove(ev(50, 50), host);
    expect(host.setView).not.toHaveBeenCalled();
    tool.onPointerDown(ev(0, 0), host);
    tool.onPointerUp(ev(10, 10), host);
    tool.onPointerMove(ev(80, 80), host);
    expect(host.setView).not.toHaveBeenCalled();
  });

  it('shows grab, and grabbing while dragging', () => {
    const tool = createHandTool();
    expect(tool.cursor(false)).toBe('grab');
    tool.onPointerDown(ev(0, 0), hostAt());
    expect(tool.cursor(false)).toBe('grabbing');
    tool.cancel?.(hostAt());
    expect(tool.cursor(false)).toBe('grab');
  });
});

describe('zoom tool', () => {
  it('a click zooms in one step on the cursor; Alt+click zooms out', () => {
    const host = hostAt();
    const tool = createZoomTool();
    tool.onPointerDown(ev(400, 300), host);
    tool.onPointerUp(ev(400, 300), host);
    expect(host.view.zoom).toBe(1.5);
    expect(Math.abs((400 - host.view.panX) / 1.5 - 400)).toBeLessThan(1e-9); // the point under the cursor stays under it

    tool.onPointerDown(ev(400, 300, { altKey: true }), host);
    tool.onPointerUp(ev(400, 300, { altKey: true }), host);
    expect(host.view.zoom).toBe(1);
  });

  it('a drag past the threshold becomes a marquee that zooms to its rectangle', () => {
    const host = hostAt();
    const tool = createZoomTool();
    tool.onPointerDown(ev(100, 100), host);
    tool.onPointerMove(ev(100 + MARQUEE_THRESHOLD - 1, 100), host);
    expect(host.invalidateOverlay).not.toHaveBeenCalled(); // still a click
    tool.onPointerMove(ev(300, 200), host);
    expect(host.invalidateOverlay).toHaveBeenCalled();
    tool.onPointerUp(ev(300, 200), host);
    // 200 × 100 px marquee in a 1000 × 700 window: fits by width → zoom 5.
    expect(host.view.zoom).toBeCloseTo(5, 9);
  });

  it('Escape cancels a marquee without zooming', () => {
    const host = hostAt();
    const tool = createZoomTool();
    tool.onPointerDown(ev(100, 100), host);
    tool.onPointerMove(ev(300, 200), host);
    tool.onKey?.('Escape', host);
    tool.onPointerUp(ev(300, 200), host);
    expect(host.setView).not.toHaveBeenCalled();
  });

  it('shows zoom-in, and zoom-out while Alt is held', () => {
    const tool = createZoomTool();
    expect(tool.cursor(false)).toBe('zoom-in');
    expect(tool.cursor(true)).toBe('zoom-out');
  });

  it('draws the marquee only while dragging one', () => {
    const host = hostAt();
    const tool = createZoomTool();
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(), lineWidth: 0, strokeStyle: '', fillStyle: '' };
    const theme = { accent: '#00f', accentSoft: '#00f3' } as never;
    tool.drawOverlay?.(ctx as never, host, theme);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    tool.onPointerDown(ev(10, 10), host);
    tool.onPointerMove(ev(100, 100), host);
    tool.drawOverlay?.(ctx as never, host, theme);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });
});

describe('tool registry', () => {
  it('builds the right tool for each id and a crosshair for the unbuilt drawing tools', () => {
    expect(createTool('tool-hand').id).toBe('tool-hand');
    expect(createTool('tool-zoom').id).toBe('tool-zoom');
    expect(createTool('tool-select').id).toBe('tool-select');
    expect(createTool('tool-direct-select').id).toBe('tool-direct-select');
    expect(createTool('tool-lasso').id).toBe('tool-lasso');
    expect(createTool('tool-rotate').id).toBe('tool-rotate');
    expect(createTool('tool-scale').id).toBe('tool-scale');
    expect(createTool('tool-reflect').id).toBe('tool-reflect');
    expect(createTool('tool-pen').id).toBe('tool-pen');
    expect(createTool('tool-gradient').cursor(false)).toBe('crosshair');
    expect(createTool('tool-type').cursor(false)).toBe('text');
  });
});
