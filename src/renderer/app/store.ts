import { create } from 'zustand';
import { defaultAppearance, type Appearance, type Color, type Matrix, type ModifierTarget,
  type Params, type ParagraphStyle, type TextStyle, type Vec2 } from '../../core';
import type { PlatformInfo, Theme } from '../../shared/ipc';
import type { TransformKind } from '../tools/types';
import type { ShapeToolKind } from '../tools/shapeDrag';
import {
  activatePanel,
  WORKSPACE_IDS,
  isValidLayout,
  locatePanel,
  movePanelToGroup,
  movePanelToNewGroup,
  movePanelToStrip,
  selectTab,
  toggleGroup,
  workspaceLayout,
  type PanelLayout,
  type WorkspaceId,
} from '../panels/layout';
import { PANEL_ORDER, type PanelId } from '../panels/registry';
import { ALL_SLOTS, slotOf, type ToolId } from './tools';

export type { WorkspaceId };

/** View menu toggles (specs/09 · Vista). Per window for now; Illustrator keeps them per document. */
export interface ViewOptions {
  outline: boolean;
  /** Previsualizar píxeles: the artwork as it looks rasterised at 72 ppi. */
  pixelPreview: boolean;
  rulers: boolean;
  guides: boolean;
  lockGuides: boolean;
  grid: boolean;
  snapGrid: boolean;
  smartGuides: boolean;
  hideArtboards: boolean;
  hideEdges: boolean;
  /** Direct Selection and the pen tools draw the handles of the anchors they show (control bar toggle). */
  showHandles: boolean;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  outline: false,
  pixelPreview: false,
  rulers: true,
  guides: true,
  lockGuides: false,
  grid: false,
  snapGrid: false,
  smartGuides: true,
  hideArtboards: false,
  hideEdges: false,
  showHandles: true,
};

interface UiState {
  platform: PlatformInfo;
  maximized: boolean;
  theme: Theme;
  workspace: WorkspaceId;

  activeTool: ToolId;
  /** Last tool used in each grouped slot, keyed by the slot's default tool. */
  slotTool: Partial<Record<ToolId, ToolId>>;
  toolbarTwoColumns: boolean;
  /** Id of the crop group whose window can be pulled on the canvas ("Recortar imagen" is on), else null. */
  cropMode: string | null;

  panels: PanelLayout;
  /** Layouts of the workspaces that are not the current one (the current one is `panels`). */
  savedLayouts: Partial<Record<WorkspaceId, PanelLayout>>;
  /** Strip panel whose floating window is open. */
  stripOpen: PanelId | null;

  viewOptions: ViewOptions;
  /** Active artboard of each Space (ephemeral UI state, not part of the document). */
  activeArtboard: Record<string, string>;
  /** Zoom of the visible Space, 1 = 100 %. */
  zoom: number;
  /** Cursor over the canvas, in Space points. */
  cursor: { x: number; y: number } | null;

  /** Group being edited in isolation, per Space. */
  isolation: Record<string, string | null>;
  /** Last transform, for Transform Again (Ctrl+D). */
  lastTransform: { matrix: Matrix; copy: boolean } | null;
  /** Reference point of the control bar X/Y/W/H fields: 0 / 0.5 / 1 on each axis. */
  referencePoint: Vec2;
  linkProportions: boolean;
  transformDialog: { kind: TransformKind; origin: Vec2 | null } | null;
  /** Fill and stroke of the next object drawn (and what the toolbar shows with nothing selected). */
  newLook: Appearance;
  /** Colour picker dialog (double click on the fill or stroke chip). */
  colorPicker: { target: 'fill' | 'stroke'; anchor: { left: number; top: number; right: number; bottom: number }; item?: { nodeId: string; index: number; color: Color } } | null;
  /** Layer that receives new objects when nothing is selected, per Space (Layers panel). */
  activeLayer: Record<string, string>;
  /** Character and paragraph attributes of the next text created (and shown by the panels with no text selected). */
  textStyle: TextStyle;
  paragraphStyle: ParagraphStyle;
  pendingTextStyle: Partial<TextStyle> | null;
  /** The text being edited on the canvas, with its selection (null when none). */
  textEditing: { id: string; from: number; to: number } | null;
  textEditRequest: { id: string; at: Vec2 } | null;
  /** Which of fill and stroke the colour controls edit. */
  activePaint: 'fill' | 'stroke';
  /** Align panel: the object the others align to when "Alinear a objeto clave" is chosen. */
  keyObject: string | null;
  alignTo: 'selection' | 'key' | 'artboard';
  /** Use preview bounds (strokes included) in Align and Spacing. */
  alignPreviewBounds: boolean;
  /** Transform panel: strokes and effects scale with the object. */
  scaleStrokes: boolean;
  pathTextDialog: boolean;
  modifierDialog: { modifierId: string; nodeIds: string[]; edit: { nodeId: string; modId: string } | null; target?: ModifierTarget } | null;
  /** The last modifier applied, with its parameters (Mayús+Ctrl+E repeats it). */
  lastModifier: { modifierId: string; params: Params } | null;
  shapeDialog: { kind: ShapeToolKind; at: Vec2 } | null;
  /** Archivo › Exportar… ('as') or Exportar para pantallas… ('screens'). */
  exportDialog: 'as' | 'screens' | null;
  /** Archivo › Imprimir… */
  printDialog: boolean;
  preferencesDialog: boolean;
  /** Right click on the canvas: where the context menu opens (screen px). */
  canvasMenu: { x: number; y: number } | null;
  /** Properties dialog of a Space (grid and canvas colour), by id. */
  spaceProps: string | null;

  setIsolation(spaceId: string, groupId: string | null): void;
  setLastTransform(transform: { matrix: Matrix; copy: boolean } | null): void;
  setReferencePoint(point: Vec2): void;
  toggleLinkProportions(): void;
  openTransformDialog(kind: TransformKind, origin: Vec2 | null): void;
  closeTransformDialog(): void;
  setNewLook(look: Appearance): void;
  setTextStyle(patch: Partial<TextStyle>): void;
  setParagraphStyle(patch: Partial<ParagraphStyle>): void;
  setPendingTextStyle(patch: Partial<TextStyle> | null): void;
  setTextEditing(editing: { id: string; from: number; to: number } | null): void;
  setTextEditRequest(request: { id: string; at: Vec2 } | null): void;
  setActiveLayer(spaceId: string, layerId: string): void;
  /** Opens the colour popover next to `anchor` (the chip that was clicked). */
  /** `item` points the picker at one fill or stroke of an object (panel Apariencia) instead of the selection's look. */
  openColorPicker(target: 'fill' | 'stroke', anchor: Element, item?: { nodeId: string; index: number; color: Color }): void;
  closeColorPicker(): void;
  setActivePaint(target: 'fill' | 'stroke'): void;
  setKeyObject(id: string | null): void;
  setAlignTo(mode: 'selection' | 'key' | 'artboard'): void;
  setAlignPreviewBounds(on: boolean): void;
  setScaleStrokes(on: boolean): void;
  openShapeDialog(kind: ShapeToolKind, at: Vec2): void;
  openExportDialog(mode: 'as' | 'screens'): void;
  openPrintDialog(): void;
  openPreferencesDialog(): void;
  closePreferencesDialog(): void;
  closePrintDialog(): void;
  closeExportDialog(): void;
  closeShapeDialog(): void;
  openCanvasMenu(x: number, y: number): void;
  closeCanvasMenu(): void;
  openSpaceProps(spaceId: string): void;
  closeSpaceProps(): void;
  openModifierDialog(dialog: NonNullable<UiState['modifierDialog']>): void;
  closeModifierDialog(): void;
  setLastModifier(modifier: NonNullable<UiState['lastModifier']>): void;
  setPathTextDialog(open: boolean): void;

  toggleViewOption(key: keyof ViewOptions): void;
  setActiveArtboard(spaceId: string, artboardId: string): void;
  setZoom(zoom: number): void;
  setCursor(cursor: { x: number; y: number } | null): void;

  setPlatform(platform: PlatformInfo): void;
  setMaximized(maximized: boolean): void;
  setTheme(theme: Theme): void;
  setWorkspace(workspace: WorkspaceId): void;
  setActiveTool(tool: ToolId): void;
  toggleToolbarColumns(): void;
  openPanel(panel: PanelId): void;
  selectPanelTab(groupId: string, panel: PanelId): void;
  toggleGroup(groupId: string): void;
  dockPanel(panel: PanelId, groupId: string, index?: number): void;
  dockPanelAsGroup(panel: PanelId, index: number): void;
  collapsePanel(panel: PanelId): void;
  resetPanels(): void;
  setStripOpen(panel: PanelId | null): void;
  setCropMode(id: string | null): void;
}

/** Interface preference (not document data): the toolbar's column count survives restarts. */
const TOOLBAR_COLUMNS_KEY = 'victoria.toolbarTwoColumns';
const loadToolbarColumns = (): boolean => {
  try {
    return localStorage.getItem(TOOLBAR_COLUMNS_KEY) === '1';
  } catch {
    return false;
  }
};
const saveToolbarColumns = (two: boolean): void => {
  try {
    localStorage.setItem(TOOLBAR_COLUMNS_KEY, two ? '1' : '0');
  } catch {
    // Storage unavailable: the preference lasts for the session only.
  }
};

/** Workspace and panel arrangements survive restarts. What comes back from storage is checked panel by panel. */
const WORKSPACES_KEY = 'victoria.workspaces';
interface StoredWorkspaces {
  workspace: WorkspaceId;
  panels: PanelLayout;
  saved: Partial<Record<WorkspaceId, PanelLayout>>;
}
function loadWorkspaces(): StoredWorkspaces {
  const fresh: StoredWorkspaces = { workspace: 'essentials', panels: workspaceLayout('essentials'), saved: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(WORKSPACES_KEY) ?? 'null') as Partial<{ workspace: unknown; layouts: Record<string, unknown> }> | null;
    if (!raw || typeof raw.layouts !== 'object' || raw.layouts === null) return fresh;
    const valid = (id: WorkspaceId) => (isValidLayout(raw.layouts?.[id], PANEL_ORDER) ? (raw.layouts?.[id] as PanelLayout) : undefined);
    const workspace = WORKSPACE_IDS.find((id) => id === raw.workspace) ?? 'essentials';
    const saved: StoredWorkspaces['saved'] = {};
    for (const id of WORKSPACE_IDS) if (id !== workspace) saved[id] = valid(id);
    return { workspace, panels: valid(workspace) ?? workspaceLayout(workspace), saved };
  } catch {
    return fresh;
  }
}
const stored = loadWorkspaces();

export const useUi = create<UiState>()((set, get) => ({
  platform: { os: 'win32', chrome: 'native-overlay' },
  maximized: false,
  theme: 'dark',
  workspace: stored.workspace,

  activeTool: 'tool-pen',
  slotTool: {},
  toolbarTwoColumns: loadToolbarColumns(),
  cropMode: null,

  panels: stored.panels,
  savedLayouts: stored.saved,
  stripOpen: null,

  viewOptions: DEFAULT_VIEW_OPTIONS,
  activeArtboard: {},
  zoom: 1,
  cursor: null,

  isolation: {},
  lastTransform: null,
  referencePoint: { x: 0.5, y: 0.5 },
  linkProportions: false,
  transformDialog: null,
  newLook: defaultAppearance(),
  colorPicker: null,
  textStyle: { fontFamily: 'Arial', fontStyle: 'Regular', size: 12 },
  paragraphStyle: {},
  pendingTextStyle: null,
  textEditing: null,
  textEditRequest: null,
  activeLayer: {},
  activePaint: 'fill',
  keyObject: null,
  alignTo: 'selection',
  alignPreviewBounds: false,
  scaleStrokes: false,
  pathTextDialog: false,
  modifierDialog: null,
  lastModifier: null,
  shapeDialog: null,
  exportDialog: null,
  printDialog: false,
  preferencesDialog: false,
  canvasMenu: null,
  spaceProps: null,

  setIsolation: (spaceId, groupId) => set((s) => ({ isolation: { ...s.isolation, [spaceId]: groupId } })),
  setLastTransform: (lastTransform) => set({ lastTransform }),
  setReferencePoint: (referencePoint) => set({ referencePoint }),
  toggleLinkProportions: () => set((s) => ({ linkProportions: !s.linkProportions })),
  openTransformDialog: (kind, origin) => set({ transformDialog: { kind, origin } }),
  closeTransformDialog: () => set({ transformDialog: null }),
  setNewLook: (newLook) => set({ newLook }),
  setTextStyle: (patch) =>
    set((s) => {
      const next = { ...s.textStyle } as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      return { textStyle: next as unknown as TextStyle };
    }),
  setParagraphStyle: (patch) =>
    set((s) => {
      const next = { ...s.paragraphStyle } as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      return { paragraphStyle: next as ParagraphStyle };
    }),
  setPendingTextStyle: (pendingTextStyle) => set({ pendingTextStyle }),
  setTextEditing: (textEditing) => set({ textEditing }),
  setTextEditRequest: (textEditRequest) => set({ textEditRequest }),
  setActiveLayer: (spaceId, layerId) => set((s) => ({ activeLayer: { ...s.activeLayer, [spaceId]: layerId } })),
  openColorPicker: (target, anchor, item) => {
    const r = anchor.getBoundingClientRect();
    set({ colorPicker: { target, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, ...(item ? { item } : {}) }, activePaint: target });
  },
  closeColorPicker: () => set({ colorPicker: null }),
  setActivePaint: (activePaint) => set({ activePaint }),
  setKeyObject: (keyObject) => set({ keyObject }),
  setAlignTo: (alignTo) => set({ alignTo }),
  setAlignPreviewBounds: (alignPreviewBounds) => set({ alignPreviewBounds }),
  setScaleStrokes: (scaleStrokes) => set({ scaleStrokes }),
  openShapeDialog: (kind, at) => set({ shapeDialog: { kind, at } }),
  openExportDialog: (mode) => set({ exportDialog: mode }),
  openPrintDialog: () => set({ printDialog: true }),
  openPreferencesDialog: () => set({ preferencesDialog: true }),
  closePreferencesDialog: () => set({ preferencesDialog: false }),
  closePrintDialog: () => set({ printDialog: false }),
  closeExportDialog: () => set({ exportDialog: null }),
  openModifierDialog: (modifierDialog) => set({ modifierDialog }),
  closeModifierDialog: () => set({ modifierDialog: null }),
  setLastModifier: (lastModifier) => set({ lastModifier }),
  closeShapeDialog: () => set({ shapeDialog: null }),
  openCanvasMenu: (x, y) => set({ canvasMenu: { x, y } }),
  closeCanvasMenu: () => set({ canvasMenu: null }),
  openSpaceProps: (spaceProps) => set({ spaceProps }),
  closeSpaceProps: () => set({ spaceProps: null }),
  setPathTextDialog: (pathTextDialog) => set({ pathTextDialog }),

  toggleViewOption: (key) => set((s) => ({ viewOptions: { ...s.viewOptions, [key]: !s.viewOptions[key] } })),
  setActiveArtboard: (spaceId, artboardId) => set((s) => ({ activeArtboard: { ...s.activeArtboard, [spaceId]: artboardId } })),
  setZoom: (zoom) => set({ zoom }),
  setCursor: (cursor) => set({ cursor }),

  setPlatform: (platform) => set({ platform }),
  setMaximized: (maximized) => set({ maximized }),
  setTheme: (theme) => set({ theme }),
  setWorkspace: (workspace) =>
    set((s) => {
      if (workspace === s.workspace) return s;
      // The panels you arranged stay with the workspace you leave; the new one comes back as you left it.
      const saved = { ...s.savedLayouts, [s.workspace]: s.panels };
      return { workspace, panels: saved[workspace] ?? workspaceLayout(workspace), savedLayouts: saved, stripOpen: null };
    }),

  setActiveTool: (tool) => {
    const slot = slotOf(tool);
    set((s) => ({
      activeTool: tool,
      slotTool: slot.tools.length > 1 ? { ...s.slotTool, [slot.id]: tool } : s.slotTool,
    }));
  },
  toggleToolbarColumns: () => {
    const next = !get().toolbarTwoColumns;
    saveToolbarColumns(next);
    set({ toolbarTwoColumns: next });
  },

  openPanel: (panel) => {
    const { panels } = get();
    if (locatePanel(panels, panel) === 'strip') set({ stripOpen: panel });
    else set({ panels: activatePanel(panels, panel), stripOpen: null });
  },
  selectPanelTab: (groupId, panel) => set((s) => ({ panels: selectTab(s.panels, groupId, panel) })),
  toggleGroup: (groupId) => set((s) => ({ panels: toggleGroup(s.panels, groupId) })),
  dockPanel: (panel, groupId, index) =>
    set((s) => ({ panels: movePanelToGroup(s.panels, panel, groupId, index), stripOpen: null })),
  dockPanelAsGroup: (panel, index) =>
    set((s) => ({ panels: movePanelToNewGroup(s.panels, panel, index), stripOpen: null })),
  collapsePanel: (panel) => set((s) => ({ panels: movePanelToStrip(s.panels, panel), stripOpen: null })),
  resetPanels: () => set((s) => ({ panels: workspaceLayout(s.workspace), stripOpen: null })),
  setStripOpen: (stripOpen) => set({ stripOpen }),
  setCropMode: (cropMode) => set({ cropMode }),
}));

/** Tool shown in a slot: the last one used, or its default. */
export function currentSlotTool(slotTool: UiState['slotTool'], slotId: ToolId): ToolId {
  return slotTool[slotId] ?? ALL_SLOTS.find((s) => s.id === slotId)?.id ?? slotId;
}

// Remember the workspace and every arrangement as they change.
useUi.subscribe((state, previous) => {
  if (state.workspace === previous.workspace && state.panels === previous.panels && state.savedLayouts === previous.savedLayouts) return;
  try {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify({ workspace: state.workspace, layouts: { ...state.savedLayouts, [state.workspace]: state.panels } }));
  } catch {
    // Storage unavailable: the arrangement lasts for the session only.
  }
});
