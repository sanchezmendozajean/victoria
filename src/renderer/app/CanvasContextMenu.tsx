import { useShortcuts } from './useShortcuts';
import { useMemo } from 'react';
import { MenuPopup, type MenuEntry } from '../components/Menu';
import { t } from '../i18n';
import { runAction } from './actions';
import type { IconId } from '../components/Icon';
import { formatAccelerator, SHORTCUTS, type ShortcutAction } from './shortcuts';
import { canMoveToSpace, moveToSpaceEntries } from './spaceMenus';
import { actionContext, isClipSelection, isCompoundSelection } from './selectionActions';
import { embedSelectedImage, imageFactsOf, relinkSelectedImage, unembedSelectedImage } from './imageObjectActions';
import { useUi } from './store';

/** The link actions of a selected image: Incrustar when it is linked, Reubicar when its file is missing, Desincrustar when it is embedded. */
function imageEntries(): MenuEntry[] {
  const c = actionContext();
  const id = c && c.ids.length === 1 ? c.ids[0] : undefined;
  const facts = c && id ? imageFactsOf(c.session, c.space, id) : null;
  if (!facts) return [];
  const sep: MenuEntry = { type: 'separator', id: 's0' };
  if (facts.link === 'linked') {
    return [
      { id: 'image-embed', label: t('image.embed'), icon: 'embed', onSelect: embedSelectedImage },
      { id: 'image-relink', label: t('image.relink'), icon: 'folder', onSelect: () => void relinkSelectedImage() },
      sep,
    ];
  }
  if (facts.link === 'broken') return [{ id: 'image-relink', label: t('image.relink'), icon: 'folder', onSelect: () => void relinkSelectedImage() }, sep];
  return [{ id: 'image-unembed', label: t('image.unembed'), icon: 'unlink', onSelect: () => void unembedSelectedImage() }, sep];
}

/** Right click on the canvas: the quick actions of the selection, with "Mover a Espacio" (specs/04 · regla 6). */
export function CanvasContextMenu() {
  useShortcuts();
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
      ...imageEntries(),
      act('group', t('menu.object.group'), 'group', 'object.group'),
      isCompoundSelection()
        ? act('compound-release', t('menu.object.compoundReleaseFull'), 'compound-path', 'object.compoundRelease')
        : isClipSelection()
          ? act('clip-release', t('layers.clipRelease'), 'clip-mask', 'object.clipRelease')
          : act('ungroup', t('menu.object.ungroup'), 'ungroup', 'object.ungroup'),
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
