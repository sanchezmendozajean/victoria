import { arrange, flattenGeometry, pointInFill, selectOnly, shapeBuilderEdit, type Arrangement, type Polyline, type Vec2 } from '../../core';
import { shapeBuilderCursor } from './cursors';
import { dragged, selectedTopLevel } from './shared';
import type { Tool, ToolHost } from './types';

// Shape Builder (Shift+M, specs/03): the selected objects are split into the regions they form. Hover shows
// the region, a click makes every region its own object, dragging across regions unites them (the first one
// gives the look), Alt + click or drag deletes them. Geometry: core/commands/pathfinder.ts (Béziers preserved).

const FLATTEN_TOLERANCE = 0.1;

interface Cache {
  key: string;
  revision: number;
  arrangement: Arrangement;
  polylines: Polyline[][];
}

type Drag = { mode: 'merge' | 'delete'; screen: Vec2; visited: number[]; trail: Vec2[] };

export function createShapeBuilderTool(): Tool {
  let cache: Cache | null = null;
  let hover = -1;
  let drag: Drag | null = null;
  let pattern: CanvasPattern | null = null;

  /** The regions of the current selection, recomputed when the selection or the document changes. */
  function regions(host: ToolHost): Cache | null {
    const { session, space } = host;
    if (!session || !space) return null;
    const ids = selectedTopLevel(host);
    if (ids.length === 0) return null;
    const key = [...ids].sort().join('|');
    if (cache && cache.key === key && cache.revision === session.revision) return cache;
    const arrangement = arrange(space, ids);
    if (!arrangement) return null;
    const polylines = arrangement.faces.map((f) => flattenGeometry({ subpaths: f.subpaths, fillRule: f.fillRule }, FLATTEN_TOLERANCE));
    cache = { key, revision: session.revision, arrangement, polylines };
    return cache;
  }

  const faceAt = (c: Cache, p: Vec2): number => c.arrangement.faces.findIndex((f, i) => pointInFill(c.polylines[i] as Polyline[], p, f.fillRule));

  function apply(host: ToolHost, c: Cache, d: Drag): void {
    const { session, space } = host;
    if (!session || !space || d.visited.length === 0) return;
    const removed = d.mode === 'delete' ? new Set(d.visited) : new Set<number>();
    const groups = d.mode === 'merge' && d.visited.length > 1 ? [d.visited] : [];
    const result = shapeBuilderEdit(space, c.arrangement, groups, removed, session.ids);
    if (!result) return;
    session.run(result.command, selectOnly(space.id, result.resultIds));
    cache = null;
    hover = -1;
  }

  const dots = (ctx: CanvasRenderingContext2D): CanvasPattern | null => {
    if (pattern) return pattern;
    const tile = document.createElement('canvas');
    tile.width = 6;
    tile.height = 6;
    const t = tile.getContext('2d');
    if (!t) return null;
    t.fillStyle = 'rgba(120,120,120,0.55)';
    t.fillRect(0, 0, 2, 2);
    t.fillRect(3, 3, 2, 2);
    pattern = ctx.createPattern(tile, 'repeat');
    return pattern;
  };

  return {
    id: 'tool-shape-builder',
    cursor: (alt) => shapeBuilderCursor(drag ? drag.mode : alt ? 'delete' : 'merge'),

    onPointerDown(event, host) {
      if (event.button !== 0) return;
      const c = regions(host);
      if (!c) return;
      const index = faceAt(c, event.doc);
      drag = { mode: event.altKey ? 'delete' : 'merge', screen: event.screen, visited: index >= 0 ? [index] : [], trail: [event.doc] };
      host.invalidateOverlay();
    },

    onPointerMove(event, host) {
      const c = regions(host);
      if (!c) {
        if (hover !== -1) {
          hover = -1;
          host.invalidateOverlay();
        }
        return;
      }
      const index = faceAt(c, event.doc);
      if (drag) {
        drag.trail.push(event.doc);
        if (index >= 0 && !drag.visited.includes(index)) drag.visited.push(index);
      }
      if (index !== hover || drag) {
        hover = index;
        host.invalidateOverlay();
      }
    },

    onPointerUp(event, host) {
      const d = drag;
      drag = null;
      const c = cache;
      if (d && c) {
        // A click (no real drag) on a region applies to that region alone.
        if (!dragged(event.screen, d.screen) && d.visited.length > 1) d.visited = d.visited.slice(0, 1);
        apply(host, c, d);
      }
      host.invalidateOverlay();
    },

    onKey(key, host) {
      if (key === 'Escape' && drag) {
        drag = null;
        host.invalidateOverlay();
      }
    },

    onLeave(host) {
      hover = -1;
      host.invalidateOverlay();
    },

    cancel() {
      drag = null;
      hover = -1;
      cache = null;
    },

    drawOverlay(ctx, host, theme) {
      const c = cache;
      if (!c) return;
      const { zoom, panX, panY } = host.view;
      const trace = (index: number) => {
        ctx.beginPath();
        for (const line of c.polylines[index] as Polyline[]) {
          line.points.forEach((p, i) => {
            const x = p.x * zoom + panX;
            const y = p.y * zoom + panY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          if (line.closed) ctx.closePath();
        }
      };
      ctx.save();
      const marked = new Set<number>(drag ? drag.visited : hover >= 0 ? [hover] : []);
      for (const index of marked) {
        trace(index);
        const fill = dots(ctx);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill('evenodd');
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = drag?.mode === 'delete' ? '#e5484d' : theme.accent;
        ctx.stroke();
      }
      if (drag && drag.trail.length > 1) {
        ctx.beginPath();
        drag.trail.forEach((p, i) => {
          const x = p.x * zoom + panX;
          const y = p.y * zoom + panY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#e5484d';
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}
