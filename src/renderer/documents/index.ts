import { useSyncExternalStore } from 'react';
import { askUser } from '../app/dialogs';
import { t, type TranslationKey } from '../i18n';
import { DocumentManager, type CloseChoice } from './manager';

/** The one manager of the window; talks to the main process through the typed preload API. */
export const manager = new DocumentManager({
  files: {
    openFile: (labels) => window.victoria.openFile(labels),
    saveFile: (request) => window.victoria.saveFile(request),
    autosaveWrite: (id, bytes) => window.victoria.autosaveWrite(id, bytes),
    autosaveDiscard: (id) => window.victoria.autosaveDiscard(id),
    autosaveList: () => window.victoria.autosaveList(),
    autosaveRead: (id) => window.victoria.autosaveRead(id),
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
    copyOf: (name) => t('doc.copyOf', { name }),
    saveFailed: t('doc.saveFailed'),
    openLabels: { title: t('doc.openTitle'), filterName: t('doc.fileDialog'), importFilterName: t('doc.epsDialog') },
    saveLabels: { title: t('doc.saveTitle'), filterName: t('doc.fileDialog') },
  },
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
});

/** Re-renders the component whenever any open document (or the set of documents) changes. */
export function useDocuments(): DocumentManager {
  useSyncExternalStore(manager.subscribe, manager.getVersion);
  return manager;
}
