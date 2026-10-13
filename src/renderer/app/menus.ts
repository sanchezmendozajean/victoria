import type { Theme } from '../../shared/ipc';
import type { MenuEntry, MenuItem } from '../components/Menu';
import type { IconId } from '../components/Icon';
import { t, type TranslationKey } from '../i18n';
import { PANEL_ORDER, PANELS, type PanelId } from '../panels/registry';
import { commandLabel } from '../i18n';
import { hasHandler, runAction } from './actions';
import { formatAccelerator, SHORTCUTS, type OsFamily, type ShortcutAction } from './shortcuts';
import type { ViewOptions, WorkspaceId } from './store';

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
  const mod = (id: string, label: TranslationKey, icon: IconId, kind: 'structural' | 'appearance', v2 = false): MenuItem =>
    item(id, label, icon, undefined, { kind, badge: v2 ? 'v2' : undefined });

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
    item('apply-modifiers', 'menu.object.applyModifiers', 'mod-apply', 'object.applyModifiers'),
  ];

  const type: MenuEntry[] = [
    item('character', 'menu.type.character', 'type', 'type.character', { onSelect: () => ctx.openPanel('character') }),
    item('paragraph', 'menu.type.paragraph', 'pilcrow', 'type.paragraph', { onSelect: () => ctx.openPanel('paragraph') }),
    sep('s1'),
    item('outlines', 'menu.type.createOutlines', 'create-outlines', 'type.createOutlines'),
    sep('s2'),
    item('path-options', 'menu.type.pathOptions', 'text-on-path-options'),
    item('area-options', 'menu.type.areaOptions', 'area-type-options'),
  ];

  const select: MenuEntry[] = [
    item('all', 'menu.select.all', 'tool-select', 'select.all'),
    item('all-artboard', 'menu.select.allInArtboard', 'tool-artboard', 'select.allInArtboard'),
    item('none', 'menu.select.none', 'tool-direct-select', 'select.none'),
    item('reselect', 'menu.select.reselect', 'redo', 'select.reselect'),
  ];

  const modifier: MenuEntry[] = [
    item('apply-last', 'menu.modifier.applyLast', 'mod-apply', 'modifier.applyLast'),
    item('last-dialog', 'menu.modifier.lastDialog', 'fx', 'modifier.lastDialog'),
    sep('s1'),
    sub('path', 'menu.modifier.path', 'offset-path', [
      mod('offset-path', 'modifier.offsetPath', 'offset-path', 'structural'),
      mod('outline-stroke', 'modifier.outlineStroke', 'outline-stroke', 'structural'),
      mod('outline-object', 'modifier.outlineObject', 'outline-mode', 'structural', true),
    ]),
    sub('pathfinder', 'menu.modifier.pathfinder', 'pf-unite', [
      mod('pf-unite', 'modifier.pfUnite', 'pf-unite', 'structural'),
      mod('pf-minus-front', 'modifier.pfMinusFront', 'pf-minus-front', 'structural'),
      mod('pf-intersect', 'modifier.pfIntersect', 'pf-intersect', 'structural'),
      mod('pf-exclude', 'modifier.pfExclude', 'pf-exclude', 'structural'),
      sep('p1'),
      mod('pf-divide', 'modifier.pfDivide', 'pf-divide', 'structural', true),
      mod('pf-trim', 'modifier.pfTrim', 'pf-trim', 'structural', true),
      mod('pf-merge', 'modifier.pfMerge', 'pf-merge', 'structural', true),
      mod('pf-crop', 'modifier.pfCrop', 'pf-crop', 'structural', true),
      mod('pf-outline', 'modifier.pfOutline', 'pf-outline', 'structural', true),
      mod('pf-minus-back', 'modifier.pfMinusBack', 'pf-minus-back', 'structural', true),
    ]),
    sub('distort', 'menu.modifier.distort', 'pucker-bloat', [
      mod('round-corners', 'modifier.roundCorners', 'round-corners', 'structural'),
      mod('zigzag', 'modifier.zigzag', 'zigzag', 'structural'),
      mod('pucker-bloat', 'modifier.puckerBloat', 'pucker-bloat', 'structural'),
      mod('roughen', 'modifier.roughen', 'roughen', 'structural'),
      mod('transform', 'modifier.transform', 'mod-transform', 'structural'),
      sep('d1'),
      mod('twist', 'modifier.twist', 'twist', 'structural', true),
      mod('free-distort', 'modifier.freeDistort', 'free-distort', 'structural', true),
      mod('scribble', 'modifier.scribble', 'tool-pencil', 'structural', true),
    ]),
    sub('warp', 'menu.modifier.warp', 'warp-arc', [
      mod('warp-arc', 'modifier.warpArc', 'warp-arc', 'structural'),
      mod('warp-flag', 'modifier.warpFlag', 'warp-flag', 'structural'),
      mod('warp-wave', 'modifier.warpWave', 'warp-wave', 'structural'),
      mod('warp-inflate', 'modifier.warpInflate', 'warp-inflate', 'structural'),
      sep('w1'),
      mod('warp-arc-lower', 'modifier.warpArcLower', 'warp-arc-lower', 'structural', true),
      mod('warp-arc-upper', 'modifier.warpArcUpper', 'warp-arc-upper', 'structural', true),
      mod('warp-arch', 'modifier.warpArch', 'warp-arch', 'structural', true),
      mod('warp-bulge', 'modifier.warpBulge', 'warp-bulge', 'structural', true),
      mod('warp-shell-lower', 'modifier.warpShellLower', 'warp-shell-lower', 'structural', true),
      mod('warp-shell-upper', 'modifier.warpShellUpper', 'warp-shell-upper', 'structural', true),
      mod('warp-fish', 'modifier.warpFish', 'warp-fish', 'structural', true),
      mod('warp-rise', 'modifier.warpRise', 'warp-rise', 'structural', true),
      mod('warp-fisheye', 'modifier.warpFisheye', 'warp-fisheye', 'structural', true),
      mod('warp-squeeze', 'modifier.warpSqueeze', 'warp-squeeze', 'structural', true),
      mod('warp-twist', 'modifier.warpTwist', 'warp-twist', 'structural', true),
    ]),
    sub('convert', 'menu.modifier.convert', 'convert-rect', [
      mod('convert-rect', 'modifier.convertRect', 'convert-rect', 'structural', true),
      mod('convert-rounded', 'modifier.convertRounded', 'convert-rounded', 'structural', true),
      mod('convert-ellipse', 'modifier.convertEllipse', 'convert-ellipse', 'structural', true),
    ]),
    sub('stylize', 'menu.modifier.stylize', 'drop-shadow', [
      mod('drop-shadow', 'modifier.dropShadow', 'drop-shadow', 'appearance'),
      mod('outer-glow', 'modifier.outerGlow', 'outer-glow', 'appearance'),
      mod('inner-glow', 'modifier.innerGlow', 'inner-glow', 'appearance', true),
      mod('feather', 'modifier.feather', 'feather', 'appearance', true),
    ]),
    sep('s2'),
    item('save-preset', 'menu.modifier.savePreset', 'save'),
    sub('presets', 'menu.modifier.presets', 'swatches', [item('presets-none', 'menu.modifier.presetsEmpty', 'file')]),
  ];

  const v = ctx.viewOptions;
  const view: MenuEntry[] = [
    item('outline', v.outline ? 'menu.view.outlineBack' : 'menu.view.outline', 'outline-mode', 'view.outline'),
    item('pixel-preview', 'menu.view.pixelPreview', 'pixel-preview', 'view.pixelPreview'),
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
