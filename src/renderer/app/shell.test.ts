import { describe, expect, it } from 'vitest';
import type { MenuEntry } from '../components/Menu';
import { t } from '../i18n';
import { ICONS } from '../icons/catalog.generated';
import { buildMenus, WORKSPACES } from './menus';
import { ALL_SLOTS, TOOL_SECTIONS, toolAccelerator } from './tools';

const walk = (entries: MenuEntry[]): MenuEntry[] =>
  entries.flatMap((e) => (e.type === 'separator' ? [e] : [e, ...walk(e.submenu ?? [])]));

const menus = buildMenus({
  os: 'linux',
  theme: 'dark',
  workspace: 'essentials',
  setTheme: () => undefined,
  setWorkspace: () => undefined,
  openPanel: () => undefined,
  resetPanels: () => undefined,
});

describe('menus', () => {
  it('has the nine menus of the title bar', () => {
    expect(menus.map((m) => m.label)).toEqual([
      'Archivo',
      'Edición',
      'Objeto',
      'Texto',
      'Selección',
      'Modificador',
      'Ver',
      'Ventana',
      'Ayuda',
    ]);
  });

  it('gives every entry a label and an icon that exists in the catalog (CLAUDE.md rule 8)', () => {
    for (const menu of menus) {
      for (const entry of walk(menu.entries)) {
        if (entry.type === 'separator') continue;
        expect(entry.label, `${menu.id}/${entry.id}`).not.toBe('');
        expect(ICONS, `${menu.id}/${entry.id}`).toHaveProperty(entry.icon);
      }
    }
  });

  it('keeps entry ids unique inside each menu level', () => {
    const level = (entries: MenuEntry[]) => {
      const ids = entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const e of entries) if (e.type !== 'separator' && e.submenu) level(e.submenu);
    };
    menus.forEach((m) => level(m.entries));
  });

  it('shows shortcuts in Illustrator style', () => {
    const file = menus.find((m) => m.id === 'file')?.entries ?? [];
    const saveAs = file.find((e) => e.id === 'save-as');
    expect(saveAs && saveAs.type !== 'separator' && saveAs.shortcut).toBe('Mayús+Ctrl+S');
  });

  it('leaves Aplicar modificadores without shortcut while specs/09 and mockup 14 disagree', () => {
    const object = menus.find((m) => m.id === 'object')?.entries ?? [];
    const apply = object.find((e) => e.id === 'apply-modifiers');
    expect(apply && apply.type !== 'separator' && apply.shortcut).toBeUndefined();
  });
});

describe('toolbar', () => {
  it('lists the tools of specs/10 §3 in seven sections', () => {
    expect(TOOL_SECTIONS.map((s) => s.map((slot) => slot.id))).toEqual([
      ['tool-select', 'tool-direct-select', 'tool-lasso'],
      ['tool-pen', 'tool-curvature', 'tool-pencil'],
      ['tool-type', 'tool-line', 'tool-rect'],
      ['tool-rotate', 'tool-scale', 'tool-free-transform', 'tool-shape-builder'],
      ['tool-scissors', 'tool-gradient', 'tool-eyedropper'],
      ['tool-artboard'],
      ['tool-hand', 'tool-zoom'],
    ]);
  });

  it('has an icon for every tool and no tool in two slots', () => {
    const tools = ALL_SLOTS.flatMap((s) => s.tools);
    expect(new Set(tools).size).toBe(tools.length);
    tools.forEach((tool) => expect(ICONS).toHaveProperty(tool));
  });

  it('uses the shortcuts of specs/09', () => {
    expect(toolAccelerator('tool-pen')).toBe('P');
    expect(toolAccelerator('tool-shape-builder')).toBe('Shift+M');
    expect(toolAccelerator('tool-ellipse')).toBe('L');
    expect(toolAccelerator('tool-smooth')).toBeUndefined();
  });
});

describe('workspaces', () => {
  it('are named in Spanish', () => {
    expect(WORKSPACES.map((w) => t(`workspace.${w}`))).toEqual(['Esenciales', 'Íconos', 'Impresión', 'Texto']);
  });
});
