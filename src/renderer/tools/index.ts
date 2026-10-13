import type { ToolId } from '../app/tools';
import { createHandTool } from './handTool';
import type { Tool } from './types';
import { createZoomTool } from './zoomTool';

const SELECTION_TOOLS: readonly ToolId[] = ['tool-select', 'tool-direct-select', 'tool-group-select', 'tool-lasso'];

/**
 * Selection tools only highlight what is under the cursor for now (specs/03 · Selección › Hover);
 * picking, moving and the bounding box arrive in Phase 4.
 */
function createHoverTool(id: ToolId): Tool {
  return {
    id,
    cursor: () => 'default',
    onPointerDown() {},
    onPointerMove(event, host) {
      host.setHover(host.hitAt(event.doc));
    },
    onPointerUp() {},
    onLeave(host) {
      host.setHover(null);
    },
    cancel(host) {
      host.setHover(null);
    },
  };
}

/** Tools whose behaviour is built in later phases: they only set the cursor. */
function createIdleTool(id: ToolId): Tool {
  const cursor = id === 'tool-type' || id === 'tool-area-type' || id === 'tool-type-on-path' ? 'text' : 'crosshair';
  return { id, cursor: () => cursor, onPointerDown() {}, onPointerMove() {}, onPointerUp() {} };
}

export function createTool(id: ToolId): Tool {
  if (id === 'tool-hand') return createHandTool();
  if (id === 'tool-zoom') return createZoomTool();
  if (SELECTION_TOOLS.includes(id)) return createHoverTool(id);
  return createIdleTool(id);
}
