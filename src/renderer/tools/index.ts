import type { ToolId } from '../app/tools';
import { createDirectSelectionTool } from './directSelectionTool';
import { createHandTool } from './handTool';
import { createLassoTool } from './lassoTool';
import { createSelectionTool } from './selectionTool';
import { createTransformTool } from './transformTools';
import type { Tool } from './types';
import { createZoomTool } from './zoomTool';

/** Tools whose behaviour is built in later phases: they only set the cursor. */
function createIdleTool(id: ToolId): Tool {
  const cursor = id === 'tool-type' || id === 'tool-area-type' || id === 'tool-type-on-path' ? 'text' : 'crosshair';
  return { id, cursor: () => cursor, onPointerDown() {}, onPointerMove() {}, onPointerUp() {} };
}

export function createTool(id: ToolId): Tool {
  switch (id) {
    case 'tool-hand':
      return createHandTool();
    case 'tool-zoom':
      return createZoomTool();
    case 'tool-select':
      return createSelectionTool();
    case 'tool-direct-select':
    case 'tool-group-select':
      return createDirectSelectionTool(id);
    case 'tool-lasso':
      return createLassoTool();
    case 'tool-rotate':
      return createTransformTool('rotate');
    case 'tool-scale':
      return createTransformTool('scale');
    case 'tool-reflect':
      return createTransformTool('reflect');
    default:
      return createIdleTool(id);
  }
}
