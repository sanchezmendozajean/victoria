import { create } from 'zustand';
import type { Matrix, Vec2 } from '../../core';
import type { PlatformInfo, Theme } from '../../shared/ipc';
import type { TransformKind } from '../tools/types';
import type { ShapeToolKind } from '../tools/shapeDrag';
import {
  activatePanel,
  defaultLayout,
  locatePanel,
  movePanelToGroup,
  movePanelToNewGroup,
  movePanelToStrip,
  selectTab,
  toggleGroup,
  type PanelLayout,
} from '../panels/layout';
import type { PanelId } from '../panels/registry';
import { ALL_SLOTS, slotOf, type ToolId } from './tools';

export type WorkspaceId = 'essentials' | 'icons' | 'print' | 'text';

/** View menu toggles (specs/09 · Vista). Per window for now; Illustrator keeps them per document. */
export interface ViewOptions {
  outline: boolean;
  rulers: boolean;
  guides: boolean;
  lockGuides: boolean;
  grid: boolean;
  snapGrid: boolean;
  smartGuides: boolean;
  hideArtboards: boolean;
  hideEdges: boolean;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  outline: false,
  rulers: true,
  guides: true,
  lockGuides: false,
  grid: false,
  snapGrid: false,
  smartGuides: true,
  hideArtboards: false,
  hideEdges: false,
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

  panels: PanelLayout;
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
  shapeDialog: { kind: ShapeToolKind; at: Vec2 } | null;

  setIsolation(spaceId: string, groupId: string | null): void;
  setLastTransform(transform: { matrix: Matrix; copy: boolean } | null): void;
  setReferencePoint(point: Vec2): void;
  toggleLinkProportions(): void;
  openTransformDialog(kind: TransformKind, origin: Vec2 | null): void;
  closeTransformDialog(): void;
  openShapeDialog(kind: ShapeToolKind, at: Vec2): void;
  closeShapeDialog(): void;

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

export const useUi = create<UiState>()((set, get) => ({
  platform: { os: 'win32', chrome: 'native-overlay' },
  maximized: false,
  theme: 'dark',
  workspace: 'essentials',

  activeTool: 'tool-pen',
  slotTool: {},
  toolbarTwoColumns: loadToolbarColumns(),

  panels: defaultLayout(),
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
  shapeDialog: null,

  setIsolation: (spaceId, groupId) => set((s) => ({ isolation: { ...s.isolation, [spaceId]: groupId } })),
  setLastTransform: (lastTransform) => set({ lastTransform }),
  setReferencePoint: (referencePoint) => set({ referencePoint }),
  toggleLinkProportions: () => set((s) => ({ linkProportions: !s.linkProportions })),
  openTransformDialog: (kind, origin) => set({ transformDialog: { kind, origin } }),
  closeTransformDialog: () => set({ transformDialog: null }),
  openShapeDialog: (kind, at) => set({ shapeDialog: { kind, at } }),
  closeShapeDialog: () => set({ shapeDialog: null }),

  toggleViewOption: (key) => set((s) => ({ viewOptions: { ...s.viewOptions, [key]: !s.viewOptions[key] } })),
  setActiveArtboard: (spaceId, artboardId) => set((s) => ({ activeArtboard: { ...s.activeArtboard, [spaceId]: artboardId } })),
  setZoom: (zoom) => set({ zoom }),
  setCursor: (cursor) => set({ cursor }),

  setPlatform: (platform) => set({ platform }),
  setMaximized: (maximized) => set({ maximized }),
  setTheme: (theme) => set({ theme }),
  setWorkspace: (workspace) => set({ workspace }),

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
  resetPanels: () => set({ panels: defaultLayout(), stripOpen: null }),
  setStripOpen: (stripOpen) => set({ stripOpen }),
}));

/** Tool shown in a slot: the last one used, or its default. */
export function currentSlotTool(slotTool: UiState['slotTool'], slotId: ToolId): ToolId {
  return slotTool[slotId] ?? ALL_SLOTS.find((s) => s.id === slotId)?.id ?? slotId;
}
