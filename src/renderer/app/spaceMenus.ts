import { moveToSpace } from '../documents/spaceActions';
import { t } from '../i18n';
import type { MenuEntry } from '../components/Menu';
import { actionContext } from './selectionActions';

/** "Mover a Espacio…" submenu: the other Spaces of the document plus a new one (specs/04 · regla 6). */
export function moveToSpaceEntries(): MenuEntry[] {
  const c = actionContext();
  if (!c || c.ids.length === 0) return [];
  const ids = [...c.ids];
  const others: MenuEntry[] = c.session.document.spaces
    .filter((s) => s.id !== c.space.id)
    .map((s) => ({ id: `move-${s.id}`, label: s.name, icon: 'space-move-to' as const, onSelect: () => moveToSpace(c.session, ids, s.id) }));
  return [
    ...others,
    ...(others.length > 0 ? [{ type: 'separator' as const, id: 'move-sep' }] : []),
    { id: 'move-new', label: t('space.moveToNew'), icon: 'space-add' as const, onSelect: () => moveToSpace(c.session, ids, 'new') },
  ];
}

/** True when there are objects selected that could be moved. */
export const canMoveToSpace = (): boolean => (actionContext()?.ids.length ?? 0) > 0;
