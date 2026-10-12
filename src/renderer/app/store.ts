import { create } from 'zustand';
import type { PlatformInfo, Theme } from '../../shared/ipc';
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
import { PLACEHOLDER_DOCUMENTS } from './placeholder';
import { ALL_SLOTS, slotOf, type ToolId } from './tools';

export type WorkspaceId = 'essentials' | 'icons' | 'print' | 'text';

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

  activeDocument: number;
  activeSpace: number;

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
  setActiveDocument(index: number): void;
  setActiveSpace(index: number): void;
}

export const useUi = create<UiState>()((set, get) => ({
  platform: { os: 'win32', chrome: 'native-overlay' },
  maximized: false,
  theme: 'dark',
  workspace: 'essentials',

  activeTool: 'tool-pen',
  slotTool: {},
  toolbarTwoColumns: false,

  panels: defaultLayout(),
  stripOpen: null,

  activeDocument: 0,
  activeSpace: 0,

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
  toggleToolbarColumns: () => set((s) => ({ toolbarTwoColumns: !s.toolbarTwoColumns })),

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

  setActiveDocument: (index) =>
    set({ activeDocument: Math.max(0, Math.min(index, PLACEHOLDER_DOCUMENTS.length - 1)), activeSpace: 0 }),
  setActiveSpace: (index) => set({ activeSpace: index }),
}));

/** Tool shown in a slot: the last one used, or its default. */
export function currentSlotTool(slotTool: UiState['slotTool'], slotId: ToolId): ToolId {
  return slotTool[slotId] ?? ALL_SLOTS.find((s) => s.id === slotId)?.id ?? slotId;
}
