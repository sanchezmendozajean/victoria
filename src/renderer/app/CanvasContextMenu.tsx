import { useMemo } from 'react';
import { MenuPopup, type MenuEntry } from '../components/Menu';
import { t } from '../i18n';
import { runAction } from './actions';
import type { IconId } from '../components/Icon';
import { formatAccelerator, SHORTCUTS, type ShortcutAction } from './shortcuts';
import { canMoveToSpace, moveToSpaceEntries } from './spaceMenus';
import { actionContext } from './selectionActions';
import { useUi } from './store';

/** Right click on the canvas: the quick actions of the selection, with "Mover a Espacio" (specs/04 · regla 6). */
export function CanvasContextMenu() {
  const menu = useUi((s) => s.canvasMenu);
  const close = useUi((s) => s.closeCanvasMenu);
  const os = useUi((s) => s.platform.os);
  const entries = useMemo<MenuEntry[]>(() => {
    if (!menu) return [];
    const hasSelection = (actionContext()?.ids.length ?? 0) > 0;
    const act = (id: string, label: string, icon: IconId, action: ShortcutAction): MenuEntry => ({
      id,
      label,
      icon,
      shortcut: formatAccelerator(SHORTCUTS[action], os),
      disabled: !hasSelection,
      onSelect: () => runAction(action),
    });
    return [
      act('group', t('menu.object.group'), 'group', 'object.group'),
      act('ungroup', t('menu.object.ungroup'), 'ungroup', 'object.ungroup'),
      { type: 'separator', id: 's1' },
      act('front', t('menu.object.bringToFront'), 'arrange-front', 'object.bringToFront'),
      act('back', t('menu.object.sendToBack'), 'arrange-back', 'object.sendToBack'),
      { type: 'separator', id: 's2' },
      { id: 'move-to-space', label: t('space.moveTo'), icon: 'space-move-to', disabled: !canMoveToSpace(), submenu: moveToSpaceEntries() },
    ];
  }, [menu, os]);
  if (!menu) return null;
  return <MenuPopup entries={entries} anchor={{ rect: { left: menu.x, top: menu.y, right: menu.x, bottom: menu.y }, placement: 'below' }} onClose={close} minWidth={220} />;
}
