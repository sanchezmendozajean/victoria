import { FORMAT_EXTENSION, type ExportFormat } from '../../core';
import type { ExportFile, ExportWriteResult } from '../../shared/ipc';
import { t, type TranslationKey } from '../i18n';

export type Destination = { kind: 'save'; format: ExportFormat } | { kind: 'folder'; folder: string; open: boolean };

/** What the user sees at the end: how many files were written, which failed and what had to be left out. */
export interface Delivery {
  written: string[];
  failed: ExportWriteResult['failed'];
}

/**
 * Puts the files on disk: one file goes through a Save dialog, several into the folder already chosen.
 * Returns null when the user cancels the Save dialog.
 */
export async function deliver(files: readonly ExportFile[], destination: Destination): Promise<Delivery | null> {
  if (destination.kind === 'save') {
    const file = files[0];
    if (!file) return { written: [], failed: [] };
    const saved = await window.victoria.exportSaveFile({
      title: t('export.saveTitle'),
      suggestedName: file.name,
      filterName: t(`export.format.${destination.format}` as TranslationKey),
      extension: FORMAT_EXTENSION[destination.format],
      bytes: file.bytes,
    });
    return saved ? { written: [saved.path], failed: [] } : null;
  }
  const result = await window.victoria.writeExportFiles(destination.folder, [...files]);
  if (destination.open && result.written.length > 0) await window.victoria.openExportFolder(destination.folder);
  return result;
}
