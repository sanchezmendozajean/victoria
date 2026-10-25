import type { Theme } from '../../shared/ipc';
import type { MenuEntry, MenuItem } from '../components/Menu';
import type { IconId } from '../components/Icon';
import { t, type TranslationKey } from '../i18n';
import { PANEL_ORDER, PANELS, type PanelId } from '../panels/registry';
import { commandLabel } from '../i18n';
import { hasHandler, runAction } from './actions';
import { formatAccelerator, SHORTCUTS, type OsFamily, type ShortcutAction } from './shortcuts';
import { useUi, type ViewOptions, type WorkspaceId } from './store';
import { selectedPathText, selectedTextIds } from './textActions';
import { MODIFIER_MENU } from './modifierCatalog';
import { openModifier, selectionHasModifiers } from './modifierActions';
import { actionContext } from './selectionActions';
import { moveToSpaceEntries } from './spaceMenus';
import { goToSpaceIndex } from '../documents/spaceActions';
import { manager } from '../documents';

export interface MenuContext {
  os: OsFamily;
  theme: Theme;
  workspace: WorkspaceId;
  setTheme(theme: Theme): void;
  setWorkspace(workspace: WorkspaceId): void;
  openPanel(panel: PanelId): void;
  resetPanels(): void;
  /** History state of the active document, for Edit › Undo/Redo. */
  undoLabel: string | null;
  redoLabel: string | null;
  viewOptions: ViewOptions;
  openTransformDialog(kind: 'rotate' | 'scale' | 'reflect' | 'move'): void;
}

export type MenuId = 'file' | 'edit' | 'object' | 'type' | 'select' | 'modifier' | 'view' | 'window' | 'help';

export interface MenuDef {
  id: MenuId;
  label: string;
  entries: MenuEntry[];
}

export const WORKSPACES: readonly WorkspaceId[] = ['essentials', 'icons', 'print', 'text'];

const PANEL_ACTION: Partial<Record<PanelId, ShortcutAction>> = {
  fill: 'panel.fill',
  layers: 'panel.layers',
  stroke: 'panel.stroke',
  gradient: 'panel.gradient',
  appearance: 'panel.appearance',
  align: 'panel.align',
  transform: 'panel.transform',
  pathfinder: 'panel.pathfinder',
  character: 'type.character',
  paragraph: 'type.paragraph',
};

/** Panels reachable by shortcut, used by the keyboard handler. */
export const PANEL_BY_ACTION: Partial<Record<ShortcutAction, PanelId>> = Object.fromEntries(
  Object.entries(PANEL_ACTION).map(([panel, action]) => [action, panel]),
) as Partial<Record<ShortcutAction, PanelId>>;

export function buildMenus(ctx: MenuContext): MenuDef[] {
  const keys = (action: ShortcutAction) => formatAccelerator(SHORTCUTS[action], ctx.os);

  // Phase 1: entries have no behaviour yet except the ones wired through `onSelect`.
  const item = (id: string, label: TranslationKey, icon: IconId, action?: ShortcutAction, extra?: Partial<MenuItem>): MenuItem => ({
    id,
    label: t(label),
    icon,
    shortcut: action ? keys(action) : undefined,
    ...(action && hasHandler(action) ? { onSelect: () => runAction(action) } : {}),
    ...extra,
  });
  const sep = (id: string): MenuEntry => ({ type: 'separator', id });
  const sub = (id: string, label: TranslationKey, icon: IconId, submenu: MenuEntry[]): MenuItem => item(id, label, icon, undefined, { submenu });

  const hasSelection = (actionContext()?.ids.length ?? 0) > 0;

  const file: MenuEntry[] = [
    item('new', 'menu.file.new', 'new', 'file.new'),
    item('open', 'menu.file.open', 'open', 'file.open'),
    item('recent', 'menu.file.recent', 'recent', undefined, { submenu: [item('recent-none', 'menu.file.recentEmpty', 'file')] }),
    sep('s1'),
    item('save', 'menu.file.save', 'save', 'file.save'),
    item('save-as', 'menu.file.saveAs', 'save-as', 'file.saveAs'),
    item('save-copy', 'menu.file.saveCopy', 'copy', 'file.saveCopy'),
    sep('s2'),
    item('place', 'menu.file.place', 'place', 'file.place'),
    item('export', 'menu.file.export', 'export'),
    item('export-screens', 'menu.file.exportScreens', 'export-screens'),
    sep('s3'),
    item('document-setup', 'menu.file.documentSetup', 'document-setup', 'file.documentSetup'),
    item('print', 'menu.file.print', 'print', 'file.print'),
    sep('s4'),
    item('close', 'menu.file.close', 'close', 'file.close'),
  ];

  const edit: MenuEntry[] = [
    item('undo', 'menu.edit.undo', 'undo', 'edit.undo', {
      disabled: ctx.undoLabel === null,
      ...(ctx.undoLabel ? { label: t('edit.undoLabeled', { label: commandLabel(ctx.undoLabel) }) } : {}),
    }),
    item('redo', 'menu.edit.redo', 'redo', 'edit.redo', {
      disabled: ctx.redoLabel === null,
      ...(ctx.redoLabel ? { label: t('edit.redoLabeled', { label: commandLabel(ctx.redoLabel) }) } : {}),
    }),
    sep('s1'),
    item('cut', 'menu.edit.cut', 'cut', 'edit.cut'),
    item('copy', 'menu.edit.copy', 'copy', 'edit.copy'),
    item('paste', 'menu.edit.paste', 'paste', 'edit.paste'),
    item('paste-front', 'menu.edit.pasteFront', 'paste-front', 'edit.pasteFront'),
    item('paste-back', 'menu.edit.pasteBack', 'paste-back', 'edit.pasteBack'),
    item('paste-in-place', 'menu.edit.pasteInPlace', 'paste-in-place', 'edit.pasteInPlace'),
    item('paste-all', 'menu.edit.pasteInAllArtboards', 'paste-in-place', 'edit.pasteInAllArtboards'),
    sep('s2'),
    item('delete', 'menu.edit.delete', 'delete', 'edit.delete'),
    sep('s3'),
    item('preferences', 'menu.edit.preferences', 'preferences', 'edit.preferences'),
  ];

  const object: MenuEntry[] = [
    item('transform-again', 'menu.object.transformAgain', 'transform', 'object.transformAgain'),
    sub('transform', 'menu.object.transform', 'transform', [
      item('rotate', 'menu.object.rotate', 'tool-rotate', undefined, { onSelect: () => ctx.openTransformDialog('rotate') }),
      item('reflect', 'menu.object.reflect', 'tool-reflect', undefined, { onSelect: () => ctx.openTransformDialog('reflect') }),
      item('scale', 'menu.object.scale', 'tool-scale', undefined, { onSelect: () => ctx.openTransformDialog('scale') }),
    ]),
    item('move', 'menu.object.move', 'transform', 'object.move'),
    item('move-to-space', 'menu.object.moveToSpace', 'space-move-to', undefined, { submenu: moveToSpaceEntries(), disabled: !hasSelection }),
    sep('s1'),
    item('group', 'menu.object.group', 'group', 'object.group'),
    item('ungroup', 'menu.object.ungroup', 'ungroup', 'object.ungroup'),
    sep('s2'),
    sub('arrange', 'menu.object.arrange', 'arrange-front', [
      item('front', 'menu.object.bringToFront', 'arrange-front', 'object.bringToFront'),
      item('forward', 'menu.object.bringForward', 'arrange-forward', 'object.bringForward'),
      item('backward', 'menu.object.sendBackward', 'arrange-backward', 'object.sendBackward'),
      item('back', 'menu.object.sendToBack', 'arrange-back', 'object.sendToBack'),
    ]),
    item('lock', 'menu.object.lock', 'lock-sel', 'object.lock'),
    item('unlock-all', 'menu.object.unlockAll', 'lock-open', 'object.unlockAll'),
    item('hide', 'menu.object.hide', 'hide-sel', 'object.hide'),
    item('show-all', 'menu.object.showAll', 'visibility', 'object.showAll'),
    sep('s3'),
    item('join', 'menu.object.join', 'join', 'object.join'),
    item('average', 'menu.object.average', 'average', 'object.average'),
    sub('compound', 'menu.object.compound', 'compound-path', [
      item('compound-make', 'menu.object.compoundMake', 'compound-path', 'object.compoundMake'),
      item('compound-release', 'menu.object.compoundRelease', 'compound-path', 'object.compoundRelease'),
    ]),
    sub('clip', 'menu.object.clip', 'clip-mask', [
      item('clip-make', 'menu.object.clipMake', 'clip-mask', 'object.clipMake'),
      item('clip-release', 'menu.object.clipRelease', 'clip-mask', 'object.clipRelease'),
    ]),
    sep('s4'),
    item('apply-modifiers', 'menu.object.applyModifiers', 'mod-apply', 'object.applyModifiers', { disabled: !selectionHasModifiers() }),
  ];

  const type: MenuEntry[] = [
    item('character', 'menu.type.character', 'type', 'type.character', { onSelect: () => ctx.openPanel('character') }),
    item('paragraph', 'menu.type.paragraph', 'pilcrow', 'type.paragraph', { onSelect: () => ctx.openPanel('paragraph') }),
    sep('s1'),
    item('outlines', 'menu.type.createOutlines', 'create-outlines', 'type.createOutlines', { disabled: selectedTextIds().length === 0 }),
    sep('s2'),
    item('path-options', 'menu.type.pathOptions', 'text-on-path-options', undefined, { disabled: !selectedPathText(), onSelect: () => useUi.getState().setPathTextDialog(true) }),
    item('area-options', 'menu.type.areaOptions', 'area-type-options', undefined, { disabled: true }),
  ];

  const select: MenuEntry[] = [
    item('all', 'menu.select.all', 'tool-select', 'select.all'),
    item('all-artboard', 'menu.select.allInArtboard', 'tool-artboard', 'select.allInArtboard'),
    item('none', 'menu.select.none', 'tool-direct-select', 'select.none'),
    item('reselect', 'menu.select.reselect', 'redo', 'select.reselect'),
  ];

  // Modifier entries are generated from the catalog; the ones of v1 open their dialog on the selection.
  const modifierCategories: MenuEntry[] = MODIFIER_MENU.map((category) => {
    const entries: MenuEntry[] = [];
    category.items.forEach((entry, index) => {
      if (entry.v2 && index > 0 && !(category.items[index - 1] as { v2: boolean }).v2) entries.push(sep(`${category.id}-v2`));
      entries.push(
        item(entry.id, entry.label, entry.icon, undefined, {
          kind: entry.kind,
          badge: entry.v2 ? 'v2' : undefined,
          disabled: entry.v2 || !hasSelection,
          ...(entry.v2 ? {} : { onSelect: () => openModifier(entry.id) }),
        }),
      );
    });
    return sub(category.id, ('menu.modifier.' + category.id) as TranslationKey, category.icon, entries);
  });

  const modifier: MenuEntry[] = [
    item('apply-last', 'menu.modifier.applyLast', 'mod-apply', 'modifier.applyLast', { disabled: !useUi.getState().lastModifier || !hasSelection }),
    item('last-dialog', 'menu.modifier.lastDialog', 'fx', 'modifier.lastDialog', { disabled: !useUi.getState().lastModifier || !hasSelection }),
    sep('s1'),
    ...modifierCategories,
    sep('s2'),
    item('save-preset', 'menu.modifier.savePreset', 'save'),
    sub('presets', 'menu.modifier.presets', 'swatches', [item('presets-none', 'menu.modifier.presetsEmpty', 'file')]),
  ];

  const v = ctx.viewOptions;
  const view: MenuEntry[] = [
    item('outline', v.outline ? 'menu.view.outlineBack' : 'menu.view.outline', 'outline-mode', 'view.outline'),
    item('pixel-preview', 'menu.view.pixelPreview', 'pixel-preview', 'view.pixelPreview', { checked: v.pixelPreview }),
    sep('s1'),
    item('zoom-in', 'menu.view.zoomIn', 'zoom-in', 'view.zoomIn'),
    item('zoom-out', 'menu.view.zoomOut', 'zoom-out', 'view.zoomOut'),
    item('fit-artboard', 'menu.view.fitArtboard', 'fit-artboard', 'view.fitArtboard'),
    item('fit-all', 'menu.view.fitAll', 'fit-all', 'view.fitAll'),
    item('actual-size', 'menu.view.actualSize', 'actual-size', 'view.actualSize'),
    sep('s2'),
    item('rulers', 'menu.view.rulers', 'rulers', 'view.rulers', { checked: v.rulers }),
    item('guides', 'menu.view.guides', 'guides', 'view.guides', { checked: v.guides }),
    item('lock-guides', 'menu.view.lockGuides', 'lock', 'view.lockGuides', { checked: v.lockGuides }),
    item('smart-guides', 'menu.view.smartGuides', 'smart-guides', 'view.smartGuides', { checked: v.smartGuides }),
    item('grid', 'menu.view.grid', 'grid', 'view.grid', { checked: v.grid }),
    item('snap-grid', 'menu.view.snapGrid', 'snap-grid', 'view.snapGrid', { checked: v.snapGrid }),
    sep('s3'),
    item('hide-edges', 'menu.view.hideEdges', 'visibility-off', 'view.hideEdges', { checked: v.hideEdges }),
    item('hide-artboards', 'menu.view.hideArtboards', 'tool-artboard', 'view.hideArtboards', { checked: v.hideArtboards }),
  ];

  const window_: MenuEntry[] = [
    sub(
      'workspace',
      'menu.window.workspace',
      'workspace',
      WORKSPACES.map((id) =>
        item(`ws-${id}`, `workspace.${id}`, 'workspace', undefined, { checked: ctx.workspace === id, onSelect: () => ctx.setWorkspace(id) }),
      ),
    ),
    sub('theme', 'menu.window.theme', 'theme', [
      item('theme-dark', 'menu.window.themeDark', 'theme', undefined, { checked: ctx.theme === 'dark', onSelect: () => ctx.setTheme('dark') }),
      item('theme-light', 'menu.window.themeLight', 'theme', undefined, { checked: ctx.theme === 'light', onSelect: () => ctx.setTheme('light') }),
    ]),
    sub('spaces', 'menu.window.spaces', 'spaces', [
      item('space-new', 'space.new', 'space-add', 'space.new', { disabled: !manager.active }),
      item('space-prev', 'spaces.previous', 'chevron-left', 'space.previous', { disabled: !manager.active }),
      item('space-next', 'spaces.next', 'chevron-right', 'space.next', { disabled: !manager.active }),
      sep('space-sep'),
      ...(manager.active?.session.document.spaces ?? []).slice(0, 9).map((space, index) =>
        item(`space-go-${space.id}`, 'menu.window.goToSpace', 'spaces', undefined, {
          label: space.name,
          shortcut: formatAccelerator(SHORTCUTS[`space.go${index + 1}` as ShortcutAction], ctx.os),
          checked: manager.active?.session.document.activeSpaceId === space.id,
          onSelect: () => manager.active && goToSpaceIndex(manager.active.session, index),
        }),
      ),
    ]),
    item('reset-panels', 'menu.window.resetPanels', 'restore-backup', undefined, { onSelect: ctx.resetPanels }),
    sep('s1'),
    ...PANEL_ORDER.map((panel): MenuEntry => {
      const action = PANEL_ACTION[panel];
      return {
        id: `panel-${panel}`,
        label: t(PANELS[panel].title),
        icon: PANELS[panel].icon,
        shortcut: action ? keys(action) : undefined,
        onSelect: () => ctx.openPanel(panel),
      };
    }),
  ];

  const help: MenuEntry[] = [
    item('help', 'menu.help.help', 'help'),
    item('shortcuts', 'menu.help.shortcuts', 'keyboard'),
    sep('s1'),
    item('about', 'menu.help.about', 'info'),
  ];

  return [
    { id: 'file', label: t('menu.file'), entries: file },
    { id: 'edit', label: t('menu.edit'), entries: edit },
    { id: 'object', label: t('menu.object'), entries: object },
    { id: 'type', label: t('menu.type'), entries: type },
    { id: 'select', label: t('menu.select'), entries: select },
    { id: 'modifier', label: t('menu.modifier'), entries: modifier },
    { id: 'view', label: t('menu.view'), entries: view },
    { id: 'window', label: t('menu.window'), entries: window_ },
    { id: 'help', label: t('menu.help'), entries: help },
  ];
}
