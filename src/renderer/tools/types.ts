import type { Appearance, DocumentSession, Hit, Matrix, Space, SnapLine, SnapSources, Units, Vec2, Viewport } from '../../core';
import type { ToolId } from '../app/tools';
import type { CanvasTheme } from '../canvas/theme';
import type { ShapeToolKind } from './shapeDrag';

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
  /** 1 for a click, 2 for a double click… */
  clickCount: number;
}

export interface ToolKeyEvent {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export type TransformKind = 'rotate' | 'scale' | 'reflect' | 'move';

export interface DialogSpec {
  title: string;
  message?: string;
  detail?: string;
  buttons: Array<{ id: string; label: string; variant?: 'primary' | 'danger' }>;
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

  readonly session: DocumentSession | null;
  /** The Space in front, null without a document. */
  readonly space: Space | null;
  /** Group being edited in isolation mode. */
  readonly isolation: string | null;
  readonly options: { smartGuides: boolean; snapGrid: boolean; guides: boolean; hideEdges: boolean; showHandles: boolean };
  readonly units: Units;
  /** 4 screen px in Space units. */
  readonly pickTolerance: number;
  /** All objects under the point, topmost first (respects isolation and locks). */
  hitTest(doc: Vec2): Hit[];
  /** What a drag may snap to right now (guides, grid, artboards, other objects), per the View menu. */
  snapSources(exclude: ReadonlySet<string>): SnapSources;
  /** Smart-guide lines to draw (null clears them). */
  setSnapLines(lines: SnapLine[] | null): void;
  /** Blue measurement label next to the cursor (screen position), null clears it. */
  setMeasure(text: string | null, at?: Vec2): void;
  /** A key that is unique per gesture, so each drag is one undo step. */
  gestureKey(): string;
  confirm(spec: DialogSpec): Promise<string>;
  setIsolation(id: string | null): void;
  openTransformDialog(kind: TransformKind, origin: Vec2 | null): void;
  /** Fill and stroke of the next object drawn (the toolbar / Fill panel current look). */
  newAppearance(): Appearance;
  /** The Eyedropper with nothing selected: the next objects take this fill and stroke. */
  setNewAppearance(appearance: Appearance): void;
  /** Align panel "objeto clave" mode: a click on a selected object marks it instead of narrowing the selection. */
  readonly keyObjectMode: boolean;
  readonly keyObject: string | null;
  setKeyObject(id: string): void;
  /** Which of fill and stroke the colour controls (and the Gradient tool) act on. */
  readonly activePaint: 'fill' | 'stroke';
  /** Layer that receives new objects: the layer of the selection, else the topmost unlocked one. */
  readonly activeLayerId: string | null;
  /** Click with a shape tool: asks for the exact size (the dialog creates the object at `at`). */
  openShapeDialog(kind: ShapeToolKind, at: Vec2): void;
  /** For Transform Again (Ctrl+D). */
  rememberTransform(transform: { matrix: Matrix; copy: boolean } | null): void;
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
  /** Keys with modifiers (arrows). Return true when handled. */
  onKeyDown?(event: ToolKeyEvent, host: ToolHost): boolean;
  /** Space held: true while a gesture wants it for itself (Pen, shapes: move what is being drawn) instead of the temporary Hand. */
  wantsSpace?(): boolean;
  /** Receives key presses (arrows, Space) while its own gesture is in progress, not only between gestures. */
  readonly gestureKeys?: boolean;
  /** A key was released (Space during a drag). */
  onKeyUp?(key: string, host: ToolHost): void;
  /** The pointer left the canvas. */
  onLeave?(host: ToolHost): void;
  /** Aborts a gesture in progress (window lost focus, tool switched). */
  cancel?(host: ToolHost): void;
  drawOverlay?(ctx: CanvasRenderingContext2D, host: ToolHost, theme: CanvasTheme): void;
}
