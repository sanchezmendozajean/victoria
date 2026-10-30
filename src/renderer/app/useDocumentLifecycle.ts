import { useEffect } from 'react';
import { manager } from '../documents';
import { t } from '../i18n';
import { getPreferences } from '../prefs/preferences';
import { askUser } from './dialogs';

const AUTOSAVE_TICK_MS = 5000;
let started = false;

/** First document, recovery of unsaved work, periodic autosave and the flush on window close. */
async function start(): Promise<void> {
  const found = await manager.findRecoverable();
  if (found.length > 0) {
    const answer = await askUser({
      title: t('recovery.title'),
      message: t('recovery.message'),
      items: found.map((f) => t('recovery.item', { name: f.name, date: new Date(f.modified).toLocaleString('es') })),
      buttons: [
        { id: 'discard', label: t('dialog.discard') },
        { id: 'recover', label: t('dialog.recover'), variant: 'primary' },
      ],
    });
    for (const entry of found) {
      if (answer === 'recover') await manager.recover(entry.docId);
      else await manager.discardRecoverable(entry.docId);
    }
  }
  if (manager.documents.length === 0 && !getPreferences().startScreen) manager.newDocument();
}

export function useDocumentLifecycle(): void {
  useEffect(() => {
    if (!started) {
      started = true; // React StrictMode runs effects twice in development
      void start();
    }
    const timer = window.setInterval(() => void manager.tickAutosave(), AUTOSAVE_TICK_MS);
    const offClose = window.victoria.onBeforeClose(() => manager.flushAutosaves());
    return () => {
      window.clearInterval(timer);
      offClose();
    };
  }, []);
}
