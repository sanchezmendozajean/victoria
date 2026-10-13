import {
  addGuide,
  fitRect,
  frameOf,
  hitTest,
  multiply,
  isUntouchedView,
  moveGuide,
  panBy,
  removeGuide,
  sameView,
  screenToDoc,
  stepZoom,
  unionRect,
  visibleRect,
  zoomAt,
  type DocumentSession,
  type Guide,
  type Hit,
  type Matrix,
  type Node,
  type Rect,
  type SnapLine,
  type SnapSources,
  type Space,
  type Units,
  type Vec2,
  type Viewport,
} from '../../core';
import type { ToolId } from '../app/tools';
import { createTool } from '../tools';
import { createHandTool } from '../tools/handTool';
import type { CanvasPointerEvent, DialogSpec, Tool, ToolHost, TransformKind } from '../tools/types';
import { t } from '../i18n';
import { renderContent } from './contentRenderer';
import { renderOverlay, type HoverTarget } from './overlayRenderer';
import { renderRuler, RULER_SIZE } from './rulerRenderer';
import { readCanvasTheme, type CanvasTheme } from './theme';
import type { CanvasApi } from './api';

export interface CanvasElements {
  surface: HTMLElement;
  content: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  rulerH: HTMLCanvasElement;
  rulerV: HTMLCanvasElement;
}

export interface CanvasOptions {
  outline: boolean;
  guides: boolean;
  lockGuides: boolean;
  grid: boolean;
  hideArtboards: boolean;
  snapGrid: boolean;
  smartGuides: boolean;
  hideEdges: boolean;
}

export interface CanvasInput {
  session: DocumentSession | null;
  toolId: ToolId;
  options: CanvasOptions;
  activeArtboardId: string | null;
  units: Units;
  /** Changes when the theme does, to re-read the colour tokens. */
  themeName: string;
  /** Group being edited in isolation mode. */
  isolation: string | null;
}

export interface CanvasCallbacks {
  /** Every view change (zoom shown in the status bar). */
  onView(view: Viewport): void;
  /** Cursor position in Space points, or null when it leaves the canvas. */
  onCursor(doc: Vec2 | null): void;
  /** Modal question (live shape conversion…). */
  confirm(spec: DialogSpec): Promise<string>;
  onIsolation(id: string | null): void;
  onTransformDialog(kind: TransformKind, origin: Vec2 | null): void;
  onRememberTransform(transform: { matrix: Matrix; copy: boolean } | null): void;
}

const GUIDE_PICK_PX = 3;
const HOVER_PICK_PX = 4;
/** Above this average content render time (ms), pan and zoom reuse the last bitmap while the gesture lasts. */
const FAST_PATH_MS = 8;
const REFINE_DELAY_MS = 110;
const COMMIT_VIEW_MS = 300;
const WHEEL_ZOOM_SENSITIVITY = 0.0022;
const CLICK_MS = 400;
const MAX_SELECTION_OUTLINES = 400;

type GuideDrag = { id: string | null; orientation: Guide['orientation']; position: number; fromRuler: boolean };

/**
 * Owns the canvases of one window: size and DPR, the view, rendering, pointer input and the active
 * tool. Pure DOM + core; React only mounts it and feeds it state (`update`).
 */
export class CanvasController implements ToolHost, CanvasApi {
  private input: CanvasInput | null = null;
  private theme: CanvasTheme;
  private viewValue: Viewport = { zoom: 1, panX: 0, panY: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;

  private tool: Tool;
  private readonly handTool = createHandTool();
  private activeGestureTool: Tool | null = null;
  private spaceHeld = false;
  private altHeld = false;
  private inside = false;

  private hover: HoverTarget | null = null;
  private snapLinesValue: SnapLine[] | null = null;
  private measureValue: { text: string; at: Vec2 } | null = null;
  private gestureCounter = 0;
  private lastDown = { time: 0, x: 0, y: 0, count: 0 };
  private hoveredGuideId: string | null = null;
  private guideDrag: GuideDrag | null = null;

  private currentSpaceId: string | null = null;
  private pendingFit = false;
  private unsubscribe: (() => void) | null = null;

  private frame = 0;
  private dirty = { content: true, overlay: true, rulers: true };
  private contentFromViewOnly = false;
  private renderMs = 0;
  private snapshot: { canvas: HTMLCanvasElement; view: Viewport } | null = null;
  private lastRenderedView: Viewport | null = null;
  private refineTimer: number | undefined;
  private commitTimer: number | undefined;
  private readonly observer: ResizeObserver;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly el: CanvasElements,
    private readonly callbacks: CanvasCallbacks,
  ) {
    this.theme = readCanvasTheme();
    this.tool = createTool('tool-select');
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(el.surface);
    this.measure();
    this.bindEvents();
  }

  // ── Public API (React side) ──

  get view(): Viewport {
    return this.viewValue;
  }
  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Feeds the latest app state. Cheap to call on every React render. */
  update(input: CanvasInput): void {
    const previous = this.input;
    this.input = input;
    const sameOptions =
      !!previous &&
      previous.options.outline === input.options.outline &&
      previous.options.guides === input.options.guides &&
      previous.options.lockGuides === input.options.lockGuides &&
      previous.options.grid === input.options.grid &&
      previous.options.hideArtboards === input.options.hideArtboards &&
      previous.options.snapGrid === input.options.snapGrid &&
      previous.options.smartGuides === input.options.smartGuides &&
      previous.options.hideEdges === input.options.hideEdges &&
      previous.isolation === input.isolation;
    const unchanged =
      !!previous &&
      sameOptions &&
      previous.session === input.session &&
      previous.activeArtboardId === input.activeArtboardId &&
      previous.units === input.units &&
      previous.themeName === input.themeName &&
      previous.toolId === input.toolId;
    if (unchanged) return;

    if (!previous || previous.themeName !== input.themeName) this.theme = readCanvasTheme();
    if (!previous || previous.toolId !== input.toolId) this.setTool(input.toolId);

    const session = input.session;
    if (!previous || previous.session !== session) {
      this.unsubscribe?.();
      this.unsubscribe = session?.subscribe((change) => this.onSessionChange(change.kind)) ?? null;
      this.currentSpaceId = null;
    }
    this.syncSpace();
    this.invalidate('content');
    this.invalidate('overlay');
    this.invalidate('rulers');
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.refineTimer);
    window.clearTimeout(this.commitTimer);
    this.commitViewNow();
    this.unsubscribe?.();
    this.observer.disconnect();
    for (const cleanup of this.cleanups) cleanup();
  }

  // ── CanvasApi ──

  zoomIn(): void {
    this.zoomStep(1);
  }
  zoomOut(): void {
    this.zoomStep(-1);
  }
  zoomTo(zoom: number): void {
    this.setView(zoomAt(this.viewValue, zoom, { x: this.width / 2, y: this.height / 2 }));
  }
  actualSize(): void {
    this.zoomTo(1);
  }
  fitArtboard(): void {
    const space = this.currentSpace();
    if (!space) return;
    const board = space.artboards.find((a) => a.id === this.input?.activeArtboardId) ?? space.artboards[0];
    if (board) this.fitTo(artboardRect(board));
  }
  fitArtboardById(id: string): void {
    const board = this.currentSpace()?.artboards.find((a) => a.id === id);
    if (board) this.fitTo(artboardRect(board));
  }
  fitAll(): void {
    const space = this.currentSpace();
    if (!space) return;
    let all: Rect | null = null;
    for (const board of space.artboards) all = unionRect(all, artboardRect(board));
    if (all) this.fitTo(all);
  }

  /** Starts a guide from a ruler (the React ruler canvases call this on pointer down). */
  beginGuideFromRuler(orientation: Guide['orientation'], event: PointerEvent): void {
    const session = this.input?.session;
    if (!session || !this.input?.options.guides) return;
    this.guideDrag = { id: null, orientation, position: this.guidePosition(orientation, event), fromRuler: true };
    this.invalidate('overlay');
    this.trackGuideDrag(event.pointerId);
  }

  // ── ToolHost ──

  setView(view: Viewport): void {
    if (sameView(view, this.viewValue)) return;
    this.viewValue = view;
    this.contentFromViewOnly = !this.dirty.content || this.contentFromViewOnly;
    this.invalidate('content');
    this.invalidate('overlay');
    this.invalidate('rulers');
    this.callbacks.onView(view);
    window.clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commitViewNow(), COMMIT_VIEW_MS);
  }

  invalidateOverlay(): void {
    this.invalidate('overlay');
  }

  setHover(hit: Hit | null): void {
    const next: HoverTarget | null = hit ? { node: hit.node, world: hit.world, color: hit.layer.color } : null;
    if (next?.node === this.hover?.node && next?.world === this.hover?.world) return;
    this.hover = next;
    this.invalidate('overlay');
  }

  hitAt(doc: Vec2): Hit | null {
    return this.hitTest(doc)[0] ?? null;
  }

  get session(): DocumentSession | null {
    return this.input?.session ?? null;
  }
  get space(): Space | null {
    return this.currentSpace();
  }
  get isolation(): string | null {
    return this.input?.isolation ?? null;
  }
  get options(): { smartGuides: boolean; snapGrid: boolean; guides: boolean; hideEdges: boolean } {
    const o = this.input?.options;
    return { smartGuides: o?.smartGuides ?? true, snapGrid: o?.snapGrid ?? false, guides: o?.guides ?? true, hideEdges: o?.hideEdges ?? false };
  }
  get units(): Units {
    return this.input?.units ?? 'mm';
  }
  get pickTolerance(): number {
    return HOVER_PICK_PX / this.viewValue.zoom;
  }

  hitTest(doc: Vec2): Hit[] {
    const space = this.currentSpace();
    if (!space) return [];
    return hitTest(space, doc, { tolerance: this.pickTolerance, isolation: this.isolation });
  }

  snapSources(exclude: ReadonlySet<string>): SnapSources {
    const space = this.currentSpace();
    const o = this.options;
    if (!space) return {};
    return {
      guides: o.guides ? space.guides : null,
      grid: o.snapGrid ? { size: space.grid.size, subdivisions: space.grid.subdivisions } : null,
      artboards: o.smartGuides ? space.artboards : null,
      objects: o.smartGuides ? { space, exclude } : null,
    };
  }

  setSnapLines(lines: SnapLine[] | null): void {
    this.snapLinesValue = lines;
    this.invalidate('overlay');
  }

  setMeasure(text: string | null, at: Vec2 = { x: 0, y: 0 }): void {
    this.measureValue = text === null ? null : { text, at };
    this.invalidate('overlay');
  }

  gestureKey(): string {
    return `g${++this.gestureCounter}`;
  }

  confirm(spec: DialogSpec): Promise<string> {
    return this.callbacks.confirm(spec);
  }

  setIsolation(id: string | null): void {
    this.callbacks.onIsolation(id);
  }

  openTransformDialog(kind: TransformKind, origin: Vec2 | null): void {
    this.callbacks.onTransformDialog(kind, origin);
  }

  rememberTransform(transform: { matrix: Matrix; copy: boolean } | null): void {
    this.callbacks.onRememberTransform(transform);
  }

  // ── Internals: state ──

  private currentSpace(): Space | null {
    const session = this.input?.session;
    if (!session) return null;
    return session.document.spaces.find((s) => s.id === session.document.activeSpaceId) ?? null;
  }

  private onSessionChange(kind: string): void {
    if (kind === 'view') return; // our own commits
    if (kind === 'select') {
      this.invalidate('overlay');
      return;
    }
    this.syncSpace();
    this.hover = null;
    this.contentFromViewOnly = false;
    this.invalidate('content');
    this.invalidate('overlay');
    this.invalidate('rulers');
  }

  /** Loads the view of the Space that came to the front, fitting it the first time it is shown. */
  private syncSpace(): void {
    const space = this.currentSpace();
    const id = space?.id ?? null;
    if (id === this.currentSpaceId) return;
    this.commitViewNow();
    this.currentSpaceId = id;
    this.hover = null;
    if (!space) return;
    this.viewValue = space.view;
    this.pendingFit = isUntouchedView(space.view);
    this.snapshot = null;
    this.callbacks.onView(this.viewValue);
    this.applyPendingFit();
  }

  private applyPendingFit(): void {
    if (!this.pendingFit || this.width === 0 || this.height === 0) return;
    this.pendingFit = false;
    this.fitArtboard();
    this.commitViewNow();
  }

  private commitViewNow(): void {
    window.clearTimeout(this.commitTimer);
    const session = this.input?.session;
    const id = this.currentSpaceId;
    if (!session || !id) return;
    const space = session.document.spaces.find((s) => s.id === id);
    if (space && !sameView(space.view, this.viewValue)) session.setSpaceView(id, this.viewValue);
  }

  private fitTo(rect: Rect): void {
    this.setView(fitRect(this.width, this.height, rect, 56));
  }

  private zoomStep(direction: 1 | -1): void {
    this.zoomTo(stepZoom(this.viewValue.zoom, direction));
  }

  private setTool(id: ToolId): void {
    this.activeGestureTool?.cancel?.(this);
    this.tool.cancel?.(this);
    this.tool = createTool(id);
    this.hover = null;
    this.updateCursor();
  }

  private currentTool(): Tool {
    return this.spaceHeld ? this.handTool : this.tool;
  }

  private updateCursor(): void {
    let cursor = this.currentTool().cursor(this.altHeld);
    if (this.hoveredGuideId || this.guideDrag) {
      const orientation = this.guideDrag?.orientation ?? this.currentSpace()?.guides.find((g) => g.id === this.hoveredGuideId)?.orientation;
      cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    }
    this.el.overlay.style.cursor = cursor;
  }

  // ── Internals: sizing and rendering ──

  private measure(): void {
    const rect = this.el.surface.getBoundingClientRect();
    const width = Math.max(0, Math.round(rect.width));
    const height = Math.max(0, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    const size = (canvas: HTMLCanvasElement, w: number, h: number) => {
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    size(this.el.content, width, height);
    size(this.el.overlay, width, height);
    size(this.el.rulerH, width, RULER_SIZE);
    size(this.el.rulerV, RULER_SIZE, height);
    this.snapshot = null;
    this.contentFromViewOnly = false;
    this.applyPendingFit();
    this.invalidate('content');
    this.invalidate('overlay');
    this.invalidate('rulers');
  }

  private invalidate(what: 'content' | 'overlay' | 'rulers'): void {
    this.dirty[what] = true;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.paint());
  }

  private paint(): void {
    this.frame = 0;
    const space = this.currentSpace();
    if (this.dirty.content) {
      this.dirty.content = false;
      this.paintContent(space);
    }
    if (this.dirty.overlay) {
      this.dirty.overlay = false;
      this.paintOverlay(space);
    }
    if (this.dirty.rulers) {
      this.dirty.rulers = false;
      this.paintRulers(space);
    }
  }

  private paintContent(space: Space | null): void {
    const ctx = this.el.content.getContext('2d');
    const input = this.input;
    if (!ctx || !input?.session) return;
    if (!space) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.el.content.width, this.el.content.height);
      return;
    }

    // Heavy documents: while panning/zooming, move the last bitmap instead of repainting every frame.
    const viewOnly = this.contentFromViewOnly;
    this.contentFromViewOnly = false;
    if (viewOnly && this.renderMs > FAST_PATH_MS && this.lastRenderedView) {
      this.paintFromSnapshot(ctx);
      window.clearTimeout(this.refineTimer);
      this.refineTimer = window.setTimeout(() => {
        this.snapshot = null;
        this.invalidate('content');
      }, REFINE_DELAY_MS);
      return;
    }

    const start = performance.now();
    renderContent(ctx, {
      space,
      resources: input.session.document.resources,
      view: this.viewValue,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      outline: input.options.outline,
      showArtboards: !input.options.hideArtboards,
      showGrid: input.options.grid,
      activeArtboardId: input.activeArtboardId,
      theme: this.theme,
      isolatedId: input.isolation,
    });
    this.renderMs = this.renderMs === 0 ? performance.now() - start : this.renderMs * 0.6 + (performance.now() - start) * 0.4;
    // Diagnostics (read by the performance test): cost of the last full repaint and of the smoothed average.
    this.el.content.dataset.renderMs = (performance.now() - start).toFixed(2);
    this.el.content.dataset.renderAvgMs = this.renderMs.toFixed(2);
    this.lastRenderedView = this.viewValue;
    this.snapshot = null;
  }

  private paintFromSnapshot(ctx: CanvasRenderingContext2D): void {
    const from = this.lastRenderedView as Viewport;
    if (!this.snapshot) {
      const canvas = document.createElement('canvas');
      canvas.width = this.el.content.width;
      canvas.height = this.el.content.height;
      canvas.getContext('2d')?.drawImage(this.el.content, 0, 0);
      this.snapshot = { canvas, view: from };
    }
    const { canvas, view } = this.snapshot;
    const s = this.viewValue.zoom / view.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.el.content.width, this.el.content.height);
    ctx.drawImage(canvas, (this.viewValue.panX - view.panX * s) * this.dpr, (this.viewValue.panY - view.panY * s) * this.dpr, canvas.width * s, canvas.height * s);
  }

  private paintOverlay(space: Space | null): void {
    const ctx = this.el.overlay.getContext('2d');
    if (!ctx) return;
    const input = this.input;
    renderOverlay(ctx, {
      view: this.viewValue,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      theme: this.theme,
      guides: space?.guides ?? [],
      showGuides: input?.options.guides ?? true,
      hoveredGuideId: this.hoveredGuideId,
      hover: this.hover,
      selection: this.selectionTargets(space),
      snapLines: this.snapLinesValue,
      snapLabels: { align: t('snap.align'), center: t('snap.center'), anchor: t('snap.anchor') },
      measure: this.measureValue,
      draggingGuide: this.guideDrag && (this.guideDrag.id === null || this.guideDrag.fromRuler) ? this.guideDrag : null,
      drawTool: this.currentTool().drawOverlay ? (c) => this.currentTool().drawOverlay?.(c, this, this.theme) : null,
    });
  }

  /** Selected objects as outlines in their layer colour (groups contribute their leaves; very large selections skip it). */
  private selectionTargets(space: Space | null): HoverTarget[] {
    const session = this.input?.session;
    if (!space || !session || this.input?.options.hideEdges) return [];
    const selection = session.selection;
    if (selection.spaceId !== space.id) return [];
    const out: HoverTarget[] = [];
    const visit = (node: Node, world: Matrix, color: string): void => {
      if (out.length > MAX_SELECTION_OUTLINES) return;
      if (node.type === 'group' || node.type === 'clipGroup') {
        for (const child of node.children) visit(child, multiply(world, child.transform), color);
      } else {
        out.push({ node, world, color });
      }
    };
    for (const id of selection.ids) {
      const frame = frameOf(space, id);
      if (frame) visit(frame.node, frame.world, frame.layer.color);
    }
    return out.length > MAX_SELECTION_OUTLINES ? [] : out;
  }

  private paintRulers(space: Space | null): void {
    const input = this.input;
    if (!input) return;
    const board = space?.artboards.find((a) => a.id === input.activeArtboardId) ?? space?.artboards[0];
    const originX = board?.x ?? 0;
    const originY = board?.y ?? 0;
    const h = this.el.rulerH.getContext('2d');
    const v = this.el.rulerV.getContext('2d');
    if (h) renderRuler(h, 'horizontal', this.width, this.dpr, this.viewValue, originX, input.units, this.theme);
    if (v) renderRuler(v, 'vertical', this.height, this.dpr, this.viewValue, originY, input.units, this.theme);
  }

  // ── Internals: input ──

  private bindEvents(): void {
    const overlay = this.el.overlay;
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler, options);
      this.cleanups.push(() => target.removeEventListener(type, handler, options));
    };
    on(overlay, 'pointerdown', (e) => this.onPointerDown(e));
    on(overlay, 'pointermove', (e) => this.onPointerMove(e));
    on(overlay, 'pointerup', (e) => this.onPointerUp(e));
    on(overlay, 'pointercancel', () => this.cancelGestures());
    on(overlay, 'pointerleave', () => this.onLeave());
    on(overlay, 'pointerenter', () => (this.inside = true));
    on(overlay, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(overlay, 'contextmenu', (e) => e.preventDefault());

    const onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
    const onBlur = () => {
      this.spaceHeld = false;
      this.altHeld = false;
      this.cancelGestures();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    });
  }

  private toEvent(e: PointerEvent): CanvasPointerEvent {
    const rect = this.el.overlay.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return { screen, doc: screenToDoc(this.viewValue, screen), button: e.button, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, clickCount: this.lastDown.count || 1 };
  }

  private guidePosition(orientation: Guide['orientation'], e: PointerEvent): number {
    const rect = this.el.overlay.getBoundingClientRect();
    const doc = screenToDoc(this.viewValue, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    return orientation === 'vertical' ? doc.x : doc.y;
  }

  private nearestGuide(screen: Vec2): Guide | null {
    const space = this.currentSpace();
    const opts = this.input?.options;
    if (!space || !opts?.guides || opts.lockGuides) return null;
    let best: Guide | null = null;
    let bestDistance = GUIDE_PICK_PX + 0.5;
    for (const guide of space.guides) {
      if (guide.locked) continue;
      const at = guide.orientation === 'vertical' ? guide.position * this.viewValue.zoom + this.viewValue.panX : guide.position * this.viewValue.zoom + this.viewValue.panY;
      const d = Math.abs(at - (guide.orientation === 'vertical' ? screen.x : screen.y));
      if (d < bestDistance) {
        best = guide;
        bestDistance = d;
      }
    }
    return best;
  }

  private onPointerDown(e: PointerEvent): void {
    this.el.overlay.setPointerCapture(e.pointerId);
    const now = performance.now();
    const near = Math.hypot(e.clientX - this.lastDown.x, e.clientY - this.lastDown.y) < 5;
    this.lastDown = { time: now, x: e.clientX, y: e.clientY, count: near && now - this.lastDown.time < CLICK_MS ? this.lastDown.count + 1 : 1 };
    const event = this.toEvent(e);

    const viewTool = e.button === 1 || this.spaceHeld || this.tool.id === 'tool-hand' || this.tool.id === 'tool-zoom';
    if (e.button === 0 && !viewTool) {
      const guide = this.nearestGuide(event.screen);
      if (guide) {
        this.guideDrag = { id: guide.id, orientation: guide.orientation, position: guide.position, fromRuler: false };
        this.updateCursor();
        return;
      }
    }

    const tool = e.button === 1 ? this.handTool : this.currentTool();
    if (e.button !== 0 && e.button !== 1) return;
    this.activeGestureTool = tool;
    tool.onPointerDown(event, this);
    this.updateCursor();
  }

  private onPointerMove(e: PointerEvent): void {
    const event = this.toEvent(e);
    this.inside = true;
    this.callbacks.onCursor(event.doc);

    if (this.guideDrag && !this.guideDrag.fromRuler) {
      this.dragGuideTo(event.screen);
      return;
    }
    if (this.activeGestureTool) {
      this.activeGestureTool.onPointerMove(event, this);
      this.updateCursor();
      return;
    }
    const guide = this.nearestGuide(event.screen);
    if (guide?.id !== this.hoveredGuideId) {
      this.hoveredGuideId = guide?.id ?? null;
      this.invalidate('overlay');
      this.updateCursor();
    }
    this.currentTool().onPointerMove(event, this);
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.guideDrag && !this.guideDrag.fromRuler) {
      this.finishGuideDrag(this.toEvent(e).screen);
      return;
    }
    const tool = this.activeGestureTool;
    this.activeGestureTool = null;
    tool?.onPointerUp(this.toEvent(e), this);
    this.updateCursor();
  }

  private onLeave(): void {
    this.inside = false;
    if (!this.activeGestureTool && !this.guideDrag) {
      this.callbacks.onCursor(null);
      this.currentTool().onLeave?.(this);
      if (this.hoveredGuideId) {
        this.hoveredGuideId = null;
        this.invalidate('overlay');
      }
    }
  }

  private cancelGestures(): void {
    this.activeGestureTool?.cancel?.(this);
    this.activeGestureTool = null;
    this.guideDrag = null;
    this.invalidate('overlay');
    this.updateCursor();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.el.overlay.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.ctrlKey || e.metaKey) {
      // Zoom at the cursor (specs/03): also what a trackpad pinch sends.
      this.setView(zoomAt(this.viewValue, this.viewValue.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY), anchor));
      return;
    }
    const unit = e.deltaMode === 1 ? 16 : 1; // lines → px
    if (e.shiftKey) this.setView(panBy(this.viewValue, -(e.deltaY || e.deltaX) * unit, 0));
    else this.setView(panBy(this.viewValue, -e.deltaX * unit, -e.deltaY * unit));
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target;
    return t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.isTyping(e)) return;
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); // Space is "hand", not "press the focused button"
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        this.updateCursor();
      }
      return;
    }
    if (e.key === 'Alt') {
      this.altHeld = true;
      this.updateCursor();
    }
    if (e.key === 'Escape') {
      this.currentTool().onKey?.('Escape', this);
      if (this.guideDrag) this.cancelGestures();
      return;
    }
    if (!this.activeGestureTool && this.currentTool().onKeyDown?.({ key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey }, this)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ') {
      this.spaceHeld = false;
      this.updateCursor();
    } else if (e.key === 'Alt') {
      this.altHeld = false;
      this.updateCursor();
    }
  }

  // ── Guides ──

  private dragGuideTo(screen: Vec2): void {
    const drag = this.guideDrag;
    const session = this.input?.session;
    const space = this.currentSpace();
    if (!drag || !drag.id || !session || !space) return;
    const doc = screenToDoc(this.viewValue, screen);
    drag.position = drag.orientation === 'vertical' ? doc.x : doc.y;
    session.run(moveGuide(space.id, drag.id, drag.position));
    this.invalidate('overlay');
  }

  private finishGuideDrag(screen: Vec2): void {
    const drag = this.guideDrag;
    const session = this.input?.session;
    const space = this.currentSpace();
    this.guideDrag = null;
    if (drag?.id && session && space) {
      // Dropping a guide back on its ruler deletes it.
      const outside = drag.orientation === 'vertical' ? screen.x < 0 : screen.y < 0;
      if (outside) session.run(removeGuide(space.id, drag.id));
    }
    this.hoveredGuideId = null;
    this.invalidate('overlay');
    this.updateCursor();
  }

  /** Window-level tracking while a guide is pulled out of a ruler (the pointer leaves the ruler canvas). */
  private trackGuideDrag(pointerId: number): void {
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || !this.guideDrag) return;
      this.guideDrag.position = this.guidePosition(this.guideDrag.orientation, e);
      this.callbacks.onCursor(this.toEvent(e).doc);
      this.invalidate('overlay');
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      const drag = this.guideDrag;
      this.guideDrag = null;
      const rect = this.el.surface.getBoundingClientRect();
      const droppedOnCanvas = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const session = this.input?.session;
      const space = this.currentSpace();
      if (drag && droppedOnCanvas && e.type === 'pointerup' && session && space) {
        const guide: Guide = { id: session.ids(), orientation: drag.orientation, position: drag.position, locked: false };
        session.run(addGuide(space.id, guide));
      }
      this.invalidate('overlay');
      this.updateCursor();
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  }

  /** For tests and the status bar: the Space rectangle currently visible. */
  visibleArea(): Rect {
    return visibleRect(this.viewValue, this.width, this.height);
  }
}

const artboardRect = (a: { x: number; y: number; w: number; h: number }): Rect => ({ minX: a.x, minY: a.y, maxX: a.x + a.w, maxY: a.y + a.h });
