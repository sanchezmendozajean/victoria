import { useSyncExternalStore } from 'react';
import { askUser } from '../app/dialogs';
import { getActiveSpace, type DocumentSession } from '../../core';
import { prepareAssets, rasterize } from '../export/raster';
import { t, type TranslationKey } from '../i18n';
import { getPreferences } from '../prefs/preferences';
import { DocumentManager, type CloseChoice } from './manager';

/** The one manager of the window; talks to the main process through the typed preload API. */
/** Longest side, in pixels, of the preview saved in a document. */
const THUMBNAIL_SIDE = 256;

async function thumbnailOf(session: DocumentSession): Promise<Uint8Array | null> {
  const space = getActiveSpace(session.document);
  const board = space.artboards[0];
  if (!board || board.w <= 0 || board.h <= 0) return null;
  await prepareAssets(space, session.images);
  return rasterize({
    space,
    resources: session.document.resources,
    images: session.images,
    region: { minX: board.x, minY: board.y, maxX: board.x + board.w, maxY: board.y + board.h },
    ppi: (72 * THUMBNAIL_SIDE) / Math.max(board.w, board.h),
    background: '#ffffff',
    format: 'png',
    quality: 90,
  });
}

export const manager = new DocumentManager({
  thumbnail: thumbnailOf,
  autosaveIntervalMs: () => getPreferences().autosaveMinutes * 60_000,
  files: {
    openFile: (labels) => window.victoria.openFile(labels),
    saveFile: (request) => window.victoria.saveFile(request),
    autosaveWrite: (id, bytes) => window.victoria.autosaveWrite(id, bytes),
    autosaveDiscard: (id) => window.victoria.autosaveDiscard(id),
    autosaveList: () => window.victoria.autosaveList(),
    autosaveRead: (id) => window.victoria.autosaveRead(id),
    readLinkedImage: (file) => window.victoria.readLinkedImage(file),
    openRecent: (file) => window.victoria.openRecentFile(file),
  },
  prompts: {
    askSaveBeforeClose: async (name) => {
      const answer = await askUser({
        title: t('doc.closeUnsaved', { name }),
        detail: t('doc.closeUnsavedDetail'),
        buttons: [
          { id: 'discard', label: t('dialog.discard') },
          { id: 'cancel', label: t('dialog.cancel') },
          { id: 'save', label: t('dialog.save'), variant: 'primary' },
        ],
      });
      return answer as CloseChoice;
    },
    reportError: async (message) => {
      await askUser({ title: t('dialog.error'), message, buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
    },
  },
  names: {
    untitled: (n) => t('doc.untitled', { n }),
    space: (n) => t('doc.defaultSpace', { n }),
    artboard: (n) => t('doc.defaultArtboard', { n }),
    layer: (n) => t('doc.defaultLayer', { n }),
    openFailed: (reason) => t('doc.openFailed', { reason }),
    epsSkipped: (items) => t('doc.epsSkipped', { items }),
    epsItem: (code) => t(`doc.epsItem.${code}` as TranslationKey),
    importSkipped: (items) => t('doc.importSkipped', { items }),
    brokenLinks: (count) => t('image.brokenLinks', { count }),
    importItem: (code) => t(`import.warn.${code}` as TranslationKey),
    copyOf: (name) => t('doc.copyOf', { name }),
    saveFailed: t('doc.saveFailed'),
    openLabels: { title: t('doc.openTitle'), filterName: t('doc.fileDialog'), importFilterName: t('doc.epsDialog') },
    saveLabels: { title: t('doc.saveTitle'), filterName: t('doc.fileDialog') },
  },
  pdf: {
    read: async (bytes, ids) => {
      const { loadPdfJs, readPdf } = await import('../import/pdfjs');
      return readPdf(bytes, ids, await loadPdfJs());
    },
  },
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
});

/** Re-renders the component whenever any open document (or the set of documents) changes. */
export function useDocuments(): DocumentManager {
  useSyncExternalStore(manager.subscribe, manager.getVersion);
  return manager;
}
