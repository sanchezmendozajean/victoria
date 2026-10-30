import type { ToolId } from '../app/tools';
import { createAnchorAddTool, createAnchorDeleteTool, createConvertTool } from './anchorTools';
import { createCurvatureTool } from './curvatureTool';
import { createPencilTool } from './pencilTool';
import { createScissorsTool } from './scissorsTool';
import { createEyedropperTool } from './eyedropperTool';
import { createFreeTransformTool } from './freeTransformTool';
import { createGradientTool } from './gradientTool';
import { createDirectSelectionTool } from './directSelectionTool';
import { createHandTool } from './handTool';
import { createLassoTool } from './lassoTool';
import { createPenTool } from './penTool';
import { createCropAwareSelection } from './cropAwareSelection';
import { createShapeBuilderTool } from './shapeBuilderTool';
import { createShapeTool } from './shapeTools';
import { createTextTool } from './textTool';
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
      return createCropAwareSelection();
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
    case 'tool-pen':
      return createPenTool();
    case 'tool-anchor-add':
      return createAnchorAddTool();
    case 'tool-anchor-delete':
      return createAnchorDeleteTool();
    case 'tool-anchor-convert':
      return createConvertTool();
    case 'tool-curvature':
      return createCurvatureTool();
    case 'tool-pencil':
      return createPencilTool();
    case 'tool-scissors':
      return createScissorsTool();
    case 'tool-eyedropper':
      return createEyedropperTool();
    case 'tool-free-transform':
      return createFreeTransformTool();
    case 'tool-shape-builder':
      return createShapeBuilderTool();
    case 'tool-gradient':
      return createGradientTool();
    case 'tool-type':
      return createTextTool(id, 'point');
    case 'tool-area-type':
      return createTextTool(id, 'area');
    case 'tool-type-on-path':
      return createTextTool(id, 'onPath');
    case 'tool-rect':
      return createShapeTool(id, 'rect');
    case 'tool-rounded-rect':
      return createShapeTool(id, 'rounded-rect');
    case 'tool-ellipse':
      return createShapeTool(id, 'ellipse');
    case 'tool-polygon':
      return createShapeTool(id, 'polygon');
    case 'tool-star':
      return createShapeTool(id, 'star');
    case 'tool-line':
      return createShapeTool(id, 'line');
    default:
      return createIdleTool(id);
  }
}
