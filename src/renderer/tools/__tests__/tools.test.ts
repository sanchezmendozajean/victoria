import { describe, expect, it, vi } from 'vitest';
import type { Hit, Viewport } from '../../../core';
import { createTool } from '..';
import { createHandTool } from '../handTool';
import type { CanvasPointerEvent, ToolHost } from '../types';
import { createZoomTool, MARQUEE_THRESHOLD } from '../zoomTool';

function fakeHost(view: Viewport = { zoom: 1, panX: 0, panY: 0 }, hit: Hit | null = null) {
  const host = {
    view,
    size: { width: 1000, height: 600 },
    setView: vi.fn((v: Viewport) => {
      host.view = v;
    }),
    invalidateOverlay: vi.fn(),
    setHover: vi.fn(),
    hitAt: vi.fn(() => hit),
  };
  return host satisfies ToolHost;
}

const ev = (x: number, y: number, extra: Partial<CanvasPointerEvent> = {}): CanvasPointerEvent => ({
  screen: { x, y },
  doc: { x, y },
  button: 0,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...extra,
});

describe('hand tool', () => {
  it('pans with the drag and keeps the zoom', () => {
    const host = fakeHost({ zoom: 2, panX: 10, panY: 20 });
    const tool = createHandTool();
    tool.onPointerDown(ev(100, 100), host);
    tool.onPointerMove(ev(130, 90), host);
    expect(host.view).toEqual({ zoom: 2, panX: 40, panY: 10 });
    tool.onPointerMove(ev(100, 100), host); // back to the start: view returns too
    expect(host.view).toEqual({ zoom: 2, panX: 10, panY: 20 });
  });

  it('ignores moves without a press and stops after release', () => {
    const host = fakeHost();
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
    tool.onPointerDown(ev(0, 0), fakeHost());
    expect(tool.cursor(false)).toBe('grabbing');
    tool.cancel?.(fakeHost());
    expect(tool.cursor(false)).toBe('grab');
  });
});

describe('zoom tool', () => {
  it('a click zooms in one step on the cursor; Alt+click zooms out', () => {
    const host = fakeHost({ zoom: 1, panX: 0, panY: 0 });
    const tool = createZoomTool();
    tool.onPointerDown(ev(400, 300), host);
    tool.onPointerUp(ev(400, 300), host);
    expect(host.view.zoom).toBe(1.5);
    // The point under the cursor stays under the cursor.
    expect(400 * 1 === (400 - host.view.panX) / host.view.zoom + 0 || Math.abs((400 - host.view.panX) / 1.5 - 400) < 1e-9).toBe(true);

    tool.onPointerDown(ev(400, 300, { altKey: true }), host);
    tool.onPointerUp(ev(400, 300, { altKey: true }), host);
    expect(host.view.zoom).toBe(1);
  });

  it('a drag past the threshold becomes a marquee that zooms to its rectangle', () => {
    const host = fakeHost();
    const tool = createZoomTool();
    tool.onPointerDown(ev(100, 100), host);
    tool.onPointerMove(ev(100 + MARQUEE_THRESHOLD - 1, 100), host);
    expect(host.invalidateOverlay).not.toHaveBeenCalled(); // still a click
    tool.onPointerMove(ev(300, 200), host);
    expect(host.invalidateOverlay).toHaveBeenCalled();
    tool.onPointerUp(ev(300, 200), host);
    // 200 × 100 px marquee in a 1000 × 600 window: fits by width → zoom 5.
    expect(host.view.zoom).toBeCloseTo(5, 9);
  });

  it('Escape cancels a marquee without zooming', () => {
    const host = fakeHost();
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
    const host = fakeHost();
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

describe('selection tools (hover only until Phase 4)', () => {
  const hit = { id: 'n1' } as Hit;

  it('highlight what is under the cursor and clear on leave', () => {
    const host = fakeHost(undefined, hit);
    const tool = createTool('tool-select');
    tool.onPointerMove(ev(5, 5), host);
    expect(host.setHover).toHaveBeenLastCalledWith(hit);
    tool.onLeave?.(host);
    expect(host.setHover).toHaveBeenLastCalledWith(null);
  });

  it('every selection tool behaves the same for now', () => {
    for (const id of ['tool-select', 'tool-direct-select', 'tool-group-select', 'tool-lasso'] as const) {
      const host = fakeHost(undefined, hit);
      createTool(id).onPointerMove(ev(1, 1), host);
      expect(host.hitAt).toHaveBeenCalled();
    }
  });
});

describe('tool registry', () => {
  it('builds the right tool for each id and a crosshair for the unbuilt drawing tools', () => {
    expect(createTool('tool-hand').id).toBe('tool-hand');
    expect(createTool('tool-zoom').id).toBe('tool-zoom');
    expect(createTool('tool-pen').cursor(false)).toBe('crosshair');
    expect(createTool('tool-type').cursor(false)).toBe('text');
  });
});
