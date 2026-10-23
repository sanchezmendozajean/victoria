import {
  addSpace,
  cloneSpace,
  countObjects,
  createArtboard,
  createLayer,
  createSpace,
  emptySelection,
  findPreset,
  getActiveSpace,
  moveNodesToNewSpace,
  moveNodesToSpace,
  removeSpace,
  reorderSpace,
  renameSpace,
  setSpaceColor,
  setSpaceExcluded,
  type DocumentSession,
} from '../../core';
import { askUser } from '../app/dialogs';
import { t } from '../i18n';

/** "Espacio N" with the first number not used by another Space. */
function nextSpaceName(session: DocumentSession): string {
  const used = new Set(session.document.spaces.map((s) => s.name));
  let n = session.document.spaces.length + 1;
  while (used.has(t('doc.defaultSpace', { n }))) n++;
  return t('doc.defaultSpace', { n });
}

/** Ctrl+Alt+N: a Space with one A4 artboard and one layer, made active. */
export function createNewSpace(session: DocumentSession): void {
  const a4 = findPreset('A4');
  const space = createSpace(session.ids, {
    name: nextSpaceName(session),
    order: session.document.spaces.length,
    artboards: [createArtboard(session.ids, { name: t('doc.defaultArtboard', { n: 1 }), w: a4?.w ?? 595, h: a4?.h ?? 842, preset: 'A4' })],
    layers: [createLayer(session.ids, t('doc.defaultLayer', { n: 1 }))],
  });
  session.run(addSpace(space));
}

export function duplicateSpaceOf(session: DocumentSession, spaceId: string): void {
  const source = session.document.spaces.find((s) => s.id === spaceId);
  if (!source) return;
  session.run(addSpace(cloneSpace(source, session.ids, t('doc.copySuffix', { name: source.name }), session.document.spaces.length)));
}

/** Asks first when the Space has content (specs/04 · Menú de Espacio). The last Space cannot be removed. */
export async function deleteSpaceOf(session: DocumentSession, spaceId: string): Promise<void> {
  const space = session.document.spaces.find((s) => s.id === spaceId);
  if (!space || session.document.spaces.length <= 1) return;
  const objects = countObjects(space);
  if (objects > 0) {
    const answer = await askUser({
      title: t('space.deleteConfirm', { name: space.name }),
      detail: t('space.deleteConfirmDetail', { count: objects }),
      buttons: [
        { id: 'cancel', label: t('dialog.cancel') },
        { id: 'delete', label: t('dialog.delete'), variant: 'danger' },
      ],
    });
    if (answer !== 'delete') return;
  }
  session.run(removeSpace(spaceId));
}

export const renameSpaceOf = (session: DocumentSession, spaceId: string, name: string): void => {
  const clean = name.trim();
  if (clean) session.run(renameSpace(spaceId, clean));
};

export const recolorSpace = (session: DocumentSession, spaceId: string, color: string): void => {
  session.run(setSpaceColor(spaceId, color));
};

export const toggleSpaceExcluded = (session: DocumentSession, spaceId: string): void => {
  const space = session.document.spaces.find((s) => s.id === spaceId);
  if (space) session.run(setSpaceExcluded(spaceId, !space.excludeFromExport));
};

/** Brings the Space at a position (0-based) to the front; Ctrl+Alt+1…9. */
export function goToSpaceIndex(session: DocumentSession, index: number): void {
  const target = session.document.spaces[index];
  if (target) session.setActiveSpace(target.id);
}

/** Moves a Space one place up or down the list (panel Espacios). */
export function shiftSpace(session: DocumentSession, spaceId: string, delta: -1 | 1): void {
  const index = session.document.spaces.findIndex((s) => s.id === spaceId);
  if (index === -1) return;
  const to = index + delta;
  if (to < 0 || to >= session.document.spaces.length) return;
  session.run(reorderSpace(spaceId, to));
}

/**
 * "Mover a Espacio…": the objects keep their coordinates and land on the first layer of the target (a new Space for
 * `'new'`). The view stays on the source Space and the selection is cleared, as the objects are no longer there.
 */
export function moveToSpace(session: DocumentSession, ids: readonly string[], target: string | 'new'): void {
  const from = getActiveSpace(session.document);
  if (ids.length === 0) return;
  if (target === 'new') {
    const a4 = findPreset('A4');
    const space = createSpace(session.ids, {
      name: nextSpaceName(session),
      order: session.document.spaces.length,
      artboards: [createArtboard(session.ids, { name: t('doc.defaultArtboard', { n: 1 }), w: a4?.w ?? 595, h: a4?.h ?? 842, preset: 'A4' })],
      layers: [createLayer(session.ids, t('doc.defaultLayer', { n: 1 }))],
    });
    session.run(moveNodesToNewSpace(from.id, ids, space), emptySelection(from.id));
    return;
  }
  const to = session.document.spaces.find((s) => s.id === target);
  const layer = to?.layers[0];
  if (!to || !layer || to.id === from.id) return;
  session.run(moveNodesToSpace(from.id, ids, to.id, layer.id), emptySelection(from.id));
}
