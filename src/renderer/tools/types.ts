import type { Hit, Vec2, Viewport } from '../../core';
import type { ToolId } from '../app/tools';
import type { CanvasTheme } from '../canvas/theme';

/** Pointer input already converted to canvas pixels and document points. */
export interface CanvasPointerEvent {
  /** CSS pixels relative to the drawing surface. */
  screen: Vec2;
  /** Space coordinates (pt). */
  doc: Vec2;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** What a tool may ask of the canvas (CLAUDE.md rule 5: tools are state machines over this interface). */
export interface ToolHost {
  readonly view: Viewport;
  readonly size: { width: number; height: number };
  setView(view: Viewport): void;
  invalidateOverlay(): void;
  /** Highlights the object under the cursor (null clears it). */
  setHover(hit: Hit | null): void;
  /** Topmost pickable object at a document point, using a screen-sized tolerance. */
  hitAt(doc: Vec2): Hit | null;
}

export interface Tool {
  readonly id: ToolId;
  /** CSS cursor for the current state. */
  cursor(altKey: boolean): string;
  onPointerDown(event: CanvasPointerEvent, host: ToolHost): void;
  onPointerMove(event: CanvasPointerEvent, host: ToolHost): void;
  onPointerUp(event: CanvasPointerEvent, host: ToolHost): void;
  /** Escape and the like. */
  onKey?(key: string, host: ToolHost): void;
  /** The pointer left the canvas. */
  onLeave?(host: ToolHost): void;
  /** Aborts a gesture in progress (window lost focus, tool switched). */
  cancel?(host: ToolHost): void;
  drawOverlay?(ctx: CanvasRenderingContext2D, host: ToolHost, theme: CanvasTheme): void;
}
