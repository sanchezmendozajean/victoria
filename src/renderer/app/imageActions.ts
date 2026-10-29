import {
  createImage,
  drawingPayload,
  importSvg,
  pasteCommand,
  type ImportedDrawing,
  frameOf,
  locateLayer,
  naturalSize,
  placeImage,
  selectOnly,
  translation,
  type DocumentSession,
  type Space,
  type Vec2,
} from '../../core';
import { manager } from '../documents';
import { t, type TranslationKey } from '../i18n';
import { askUser } from './dialogs';
import { actionContext } from './selectionActions';
import { useUi } from './store';

/** Distance between consecutive images placed in one go, so none hides another. */
const CASCADE = 24;

export interface PickedImage {
  name: string;
  bytes: Uint8Array;
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Layer that receives a placed image: that of the selection, the one chosen in Layers, else the topmost free one. */
export function targetLayerId(space: Space, session: DocumentSession): string | null {
  const selected = session.selection.spaceId === space.id ? session.selection.ids[0] : undefined;
  const frame = selected ? frameOf(space, selected) : null;
  if (frame && !frame.layer.locked) return frame.layer.id;
  const chosen = useUi.getState().activeLayer[space.id];
  const picked = chosen ? locateLayer(space, chosen)?.layer : undefined;
  if (picked && !picked.locked && picked.visible) return picked.id;
  for (let i = space.layers.length - 1; i >= 0; i--) {
    const layer = space.layers[i];
    if (layer && !layer.locked && layer.visible) return layer.id;
  }
  return null;
}

function artboardCentre(space: Space): Vec2 {
  const active = useUi.getState().activeArtboard[space.id];
  const board = space.artboards.find((a) => a.id === active) ?? space.artboards[0];
  return board ? { x: board.x + board.w / 2, y: board.y + board.h / 2 } : { x: 0, y: 0 };
}

const vectorKind = (name: string): 'svg' | 'pdf' | null => (/\.svg$/i.test(name) ? 'svg' : /\.pdf$/i.test(name) ? 'pdf' : null);

/** An SVG, or the first page of a PDF, as a drawing; null when it cannot be read. */
async function readDrawing(kind: 'svg' | 'pdf', bytes: Uint8Array, ids: DocumentSession['ids']): Promise<{ drawing: ImportedDrawing; codes: string[] } | null> {
  try {
    if (kind === 'svg') {
      const result = importSvg(bytes, ids);
      return { drawing: result, codes: result.warnings.map((w) => w.code) };
    }
    const { loadPdfJs, readPdf } = await import('../import/pdfjs');
    const { pages, pageCount } = await readPdf(bytes, ids, await loadPdfJs());
    const first = pages[0];
    return first ? { drawing: first, codes: [...first.warnings.map((w) => w.code), ...(pageCount > 1 ? ['pages'] : [])] } : null;
  } catch {
    return null;
  }
}

/**
 * Archivo › Colocar and drag and drop: each file becomes an embedded image object at its natural size
 * (its own resolution when it declares one, else 72 ppp), centred on `at` or on the active artboard.
 * One undo step per image; the placed images end up selected. Returns how many were placed.
 */
export async function placeImageFiles(files: readonly PickedImage[], at?: Vec2): Promise<number> {
  const c = actionContext();
  if (!c || files.length === 0) return 0;
  const layerId = targetLayerId(c.space, c.session);
  if (!layerId) return 0;
  const centre = at ?? artboardCentre(c.space);
  const placed: string[] = [];
  const failed: string[] = [];
  const skipped = new Set<string>();
  for (const file of files) {
    const kind = vectorKind(file.name);
    if (kind) {
      // A drawing (SVG, first page of a PDF) goes in as one group, framed by its own size.
      const read = await readDrawing(kind, file.bytes, c.session.ids);
      if (!read) {
        failed.push(file.name);
        continue;
      }
      for (const [hash, image] of Object.entries(read.drawing.images)) c.session.images.set(hash, image.bytes);
      const shift = placed.length * CASCADE;
      const pasted = pasteCommand(c.session.document, c.space, drawingPayload(read.drawing, file.name, c.session.ids), c.session.ids, {
        mode: 'center',
        viewCenter: { x: centre.x + shift, y: centre.y + shift },
        selectedIds: [],
        layerId,
      });
      if (pasted) {
        c.session.run(pasted.command, selectOnly(c.space.id, [...placed, ...pasted.ids]));
        placed.push(...pasted.ids);
      }
      for (const code of read.codes) skipped.add(t(`import.warn.${code}` as TranslationKey));
      continue;
    }
    const added = c.session.images.add(file.bytes);
    if (!added) {
      failed.push(file.name);
      continue;
    }
    const size = naturalSize(added.info);
    const offset = placed.length * CASCADE;
    const node = createImage(c.session.ids, added.hash, size.width, size.height, translation(centre.x - size.width / 2 + offset, centre.y - size.height / 2 + offset));
    c.session.run(
      placeImage(c.space.id, layerId, node, { width: added.info.width, height: added.info.height, format: added.info.format }),
      selectOnly(c.space.id, [...placed, node.id]),
    );
    placed.push(node.id);
  }
  if (failed.length > 0) {
    await askUser({ title: t('dialog.error'), message: t('image.unsupported', { names: failed.join(', ') }), buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
  }
  if (skipped.size > 0) {
    await askUser({ title: t('dialog.error'), message: t('doc.importSkipped', { items: [...skipped].join(', ') }), buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
  }
  return placed.length;
}

/** Archivo › Colocar (Mayús+Ctrl+P). */
export async function placeImages(): Promise<void> {
  if (!manager.active) return;
  const picked = await window.victoria.openImages({ title: t('image.pickTitle'), filterName: t('image.fileDialog') });
  await placeImageFiles(picked.map((p) => ({ name: baseName(p.path), bytes: p.bytes })));
}
