import { describe, expect, it } from 'vitest';
import {
  activatePanel,
  defaultLayout,
  findGroup,
  locatePanel,
  movePanelToGroup,
  movePanelToNewGroup,
  movePanelToStrip,
  selectTab,
  toggleGroup,
  type PanelLayout,
} from './layout';
import { PANEL_ORDER } from './registry';

const allPanels = (layout: PanelLayout) => [...layout.groups.flatMap((g) => g.tabs), ...layout.strip].sort();

describe('default panel layout', () => {
  it('follows the Esenciales groups of specs/10 §7 and keeps the extras in the strip', () => {
    const layout = defaultLayout();
    expect(layout.groups.map((g) => g.tabs)).toEqual([
      ['properties', 'layers', 'spaces'],
      ['fill', 'swatches', 'gradient'],
      ['stroke', 'appearance'],
      ['character', 'paragraph'],
      ['align', 'spacing', 'transform', 'pathfinder'],
    ]);
    expect(layout.strip).toEqual(['artboards', 'trace']);
  });

  it('places every registered panel exactly once', () => {
    expect(allPanels(defaultLayout())).toEqual([...PANEL_ORDER].sort());
  });
});

describe('panel layout operations', () => {
  it('activating a panel selects its tab and opens its group', () => {
    const layout = activatePanel(defaultLayout(), 'swatches');
    const group = findGroup(layout, 'swatches');
    expect(group?.active).toBe('swatches');
    expect(group?.open).toBe(true);
  });

  it('leaves strip panels alone when activated (they open as floating windows)', () => {
    const layout = defaultLayout();
    expect(activatePanel(layout, 'trace')).toBe(layout);
  });

  it('selects tabs and toggles groups', () => {
    const base = defaultLayout();
    const selected = selectTab(base, 'g2', 'gradient');
    expect(selected.groups[1]?.active).toBe('gradient');
    expect(selected.groups[1]?.open).toBe(true);
    expect(toggleGroup(selected, 'g2').groups[1]?.open).toBe(false);
  });

  it('moves a tab between groups without losing or duplicating panels', () => {
    const layout = movePanelToGroup(defaultLayout(), 'swatches', 'g4', 0);
    expect(layout.groups.find((g) => g.id === 'g4')?.tabs).toEqual(['swatches', 'character', 'paragraph']);
    expect(layout.groups.find((g) => g.id === 'g2')?.tabs).toEqual(['fill', 'gradient']);
    expect(allPanels(layout)).toEqual([...PANEL_ORDER].sort());
  });

  it('repairs the active tab of the group a panel leaves', () => {
    const base = selectTab(defaultLayout(), 'g2', 'swatches');
    const layout = movePanelToGroup(base, 'swatches', 'g4');
    expect(layout.groups.find((g) => g.id === 'g2')?.active).toBe('gradient');
  });

  it('removes a group when its last tab leaves', () => {
    let layout = movePanelToStrip(defaultLayout(), 'stroke');
    layout = movePanelToStrip(layout, 'appearance');
    expect(layout.groups.map((g) => g.id)).toEqual(['g1', 'g2', 'g4', 'g5']);
    expect(layout.strip).toEqual(['artboards', 'trace', 'stroke', 'appearance']);
  });

  it('docks a strip panel as a new group at a given position', () => {
    const layout = movePanelToNewGroup(defaultLayout(), 'trace', 1);
    expect(layout.groups[1]?.tabs).toEqual(['trace']);
    expect(layout.groups[1]?.open).toBe(true);
    expect(layout.strip).toEqual(['artboards']);
    expect(allPanels(layout)).toEqual([...PANEL_ORDER].sort());
  });

  it('docks a strip panel into an existing group', () => {
    const layout = movePanelToGroup(defaultLayout(), 'artboards', 'g1');
    expect(findGroup(layout, 'artboards')?.id).toBe('g1');
    expect(locatePanel(layout, 'artboards')).toBe('group');
  });

  it('ignores moves into a group that does not exist', () => {
    const layout = defaultLayout();
    expect(movePanelToGroup(layout, 'fill', 'nope')).toBe(layout);
  });

  it('keeps the layout intact when the only tab of a group is dropped on itself', () => {
    const solo = movePanelToNewGroup(defaultLayout(), 'trace', 5);
    const id = solo.groups[5]?.id as string;
    expect(movePanelToGroup(solo, 'trace', id)).toBe(solo);
  });
});
