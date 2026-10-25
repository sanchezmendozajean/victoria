import { copyObjects, decodeClip, encodeClip, pasteCommand, selectOnly, type PasteMode } from '../../core';
import { canvasApi } from '../canvas/api';
import { deleteSelection, actionContext } from './selectionActions';
import { placeImageFiles, targetLayerId } from './imageActions';
import { useUi } from './store';

/** While text is being edited the hidden text input owns copy, cut and paste (the browser handles them). */
const editingText = () => useUi.getState().textEditing !== null;

/** Edición › Copiar: the selected objects go to the system clipboard in Victoria's own format. Returns whether anything was copied. */
export async function copySelection(): Promise<boolean> {
  if (editingText()) return false;
  const c = actionContext();
  if (!c || c.ids.length === 0) return false;
  const payload = copyObjects(c.session.document, c.space, c.ids);
  if (!payload) return false;
  await window.victoria.writeClipboard(encodeClip(payload, c.session.images));
  return true;
}

/** Edición › Cortar: copy, then delete. Nothing is deleted if the copy failed. */
export async function cutSelection(): Promise<void> {
  if (await copySelection()) deleteSelection();
}

/**
 * Edición › Pegar and its variants. Victoria objects come back with their swatches, gradients and images;
 * a picture copied elsewhere is placed as an image (only for a plain paste).
 */
export async function pasteClipboard(mode: PasteMode): Promise<void> {
  if (editingText()) return;
  const c = actionContext();
  if (!c) return;
  const contents = await window.victoria.readClipboard();
  const decoded = contents.clip ? decodeClip(contents.clip) : null;
  if (!decoded) {
    if (contents.image && mode === 'center') await placeImageFiles([{ name: 'portapapeles.png', bytes: contents.image }], canvasApi.current?.viewCenter());
    return;
  }
  const layerId = targetLayerId(c.space, c.session);
  if (!layerId) return;
  for (const [hash, bytes] of Object.entries(decoded.images)) if (!c.session.images.has(hash)) c.session.images.set(hash, bytes);
  const result = pasteCommand(c.session.document, c.space, decoded.payload, c.session.ids, {
    mode,
    viewCenter: canvasApi.current?.viewCenter() ?? { x: 0, y: 0 },
    selectedIds: c.ids,
    layerId,
  });
  if (result) c.session.run(result.command, selectOnly(c.space.id, result.ids));
}
