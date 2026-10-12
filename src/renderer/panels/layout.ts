import type { PanelId } from './registry';

export interface PanelGroup {
  id: string;
  tabs: PanelId[];
  active: PanelId;
  /** An open group shows the body of its active tab; a closed one shows only the tab row. */
  open: boolean;
}

export interface PanelLayout {
  groups: PanelGroup[];
  /** Panels collapsed to icons in the 36 px strip. */
  strip: PanelId[];
}

const group = (id: string, tabs: PanelId[], active: PanelId = tabs[0] as PanelId, open = false): PanelGroup => ({
  id,
  tabs,
  active,
  open,
});

/** Default "Esenciales" layout of specs/10 §7, with the open groups of mockup screen 3. */
export function defaultLayout(): PanelLayout {
  return {
    groups: [
      group('g1', ['properties', 'layers', 'spaces'], 'layers', true),
      group('g2', ['fill', 'swatches', 'gradient']),
      group('g3', ['stroke', 'appearance'], 'stroke', true),
      group('g4', ['character', 'paragraph']),
      group('g5', ['align', 'spacing', 'transform', 'pathfinder']),
    ],
    strip: ['artboards', 'trace'],
  };
}

export function findGroup(layout: PanelLayout, panel: PanelId): PanelGroup | undefined {
  return layout.groups.find((g) => g.tabs.includes(panel));
}

/** Removes a panel from wherever it lives; empty groups disappear and the active tab is repaired. */
function detach(layout: PanelLayout, panel: PanelId): PanelLayout {
  const groups = layout.groups
    .map((g) => {
      if (!g.tabs.includes(panel)) return g;
      const tabs = g.tabs.filter((p) => p !== panel);
      const active = g.active === panel ? (tabs[Math.min(g.tabs.indexOf(panel), tabs.length - 1)] as PanelId) : g.active;
      return { ...g, tabs, active };
    })
    .filter((g) => g.tabs.length > 0);
  return { groups, strip: layout.strip.filter((p) => p !== panel) };
}

/** Brings a panel to the front: activates its tab and opens its group. Strip panels return to a group. */
export function activatePanel(layout: PanelLayout, panel: PanelId): PanelLayout {
  const owner = findGroup(layout, panel);
  if (!owner) return layout;
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === owner.id ? { ...g, active: panel, open: true } : g)),
  };
}

export function selectTab(layout: PanelLayout, groupId: string, panel: PanelId): PanelLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === groupId && g.tabs.includes(panel) ? { ...g, active: panel, open: true } : g)),
  };
}

export function toggleGroup(layout: PanelLayout, groupId: string): PanelLayout {
  return { ...layout, groups: layout.groups.map((g) => (g.id === groupId ? { ...g, open: !g.open } : g)) };
}

/** Moves a panel into a group (appended, or at `index`) and makes it the active tab. */
export function movePanelToGroup(layout: PanelLayout, panel: PanelId, targetGroupId: string, index?: number): PanelLayout {
  const target = layout.groups.find((g) => g.id === targetGroupId);
  if (!target) return layout;
  const without = detach(layout, panel);
  const base = without.groups.find((g) => g.id === targetGroupId);
  // Moving the only tab of the target group onto itself leaves nothing to do.
  if (!base) return layout;
  const tabs = [...base.tabs];
  tabs.splice(index ?? tabs.length, 0, panel);
  return {
    ...without,
    groups: without.groups.map((g) => (g.id === targetGroupId ? { ...g, tabs, active: panel, open: true } : g)),
  };
}

/** Collapses a panel to the icon strip. */
export function movePanelToStrip(layout: PanelLayout, panel: PanelId): PanelLayout {
  if (layout.strip.includes(panel)) return layout;
  const without = detach(layout, panel);
  return { ...without, strip: [...without.strip, panel] };
}

/** Creates a new group for a panel at `index` in the column (used when a strip icon is docked). */
export function movePanelToNewGroup(layout: PanelLayout, panel: PanelId, index: number): PanelLayout {
  const without = detach(layout, panel);
  const id = `g${Math.max(0, ...layout.groups.map((g) => Number(g.id.slice(1)) || 0)) + 1}`;
  const groups = [...without.groups];
  groups.splice(index, 0, group(id, [panel], panel, true));
  return { ...without, groups };
}

/** Where a panel currently lives. */
export function locatePanel(layout: PanelLayout, panel: PanelId): 'group' | 'strip' | 'none' {
  if (findGroup(layout, panel)) return 'group';
  return layout.strip.includes(panel) ? 'strip' : 'none';
}
