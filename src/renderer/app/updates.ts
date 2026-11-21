import type { UpdateState } from '../../shared/ipc';
import { t } from '../i18n';
import { getPreferences } from '../prefs/preferences';
import { askUser } from './dialogs';

/** Wait this long after start before the automatic check, so it never competes with opening the work. */
const AUTO_CHECK_DELAY_MS = 8000;

let offeredVersion: string | null = null;

/** Tells the person an update is ready; "Reiniciar ahora" closes Victoria (asking about unsaved work), installs and relaunches. */
async function offerInstall(version: string, force: boolean): Promise<void> {
  if (!force && offeredVersion === version) return; // the automatic flow asks once per version
  offeredVersion = version;
  const answer = await askUser({
    title: t('update.readyTitle', { version }),
    detail: t('update.readyDetail'),
    buttons: [
      { id: 'later', label: t('update.later') },
      { id: 'restart', label: t('update.restart'), variant: 'primary' },
    ],
    escapeId: 'later',
  });
  if (answer === 'restart') window.victoria.installUpdate();
}

/** Mounted once: offers the install when a download finishes, and checks on start when the preference allows it. */
export function watchUpdates(): () => void {
  const unsubscribe = window.victoria.onUpdateState((state) => {
    if (state.status === 'ready') void offerInstall(state.version, false);
  });
  const timer = setTimeout(() => {
    if (getPreferences().autoUpdate) void window.victoria.checkForUpdates();
  }, AUTO_CHECK_DELAY_MS);
  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}

/** Ayuda › Buscar actualizaciones…: unlike the automatic check, this one always answers. */
export async function checkForUpdatesNow(): Promise<void> {
  await report(await window.victoria.checkForUpdates());
}

async function report(state: UpdateState): Promise<void> {
  const ok = [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' as const }];
  switch (state.status) {
    case 'ready':
      return offerInstall(state.version, true);
    case 'downloading':
      await askUser({ title: t('update.downloadingTitle', { version: state.version }), detail: t('update.downloadingDetail'), buttons: ok });
      return;
    case 'unsupported':
      await askUser({ title: t('menu.help.checkUpdates').replace('…', ''), message: t(`update.unsupported.${state.reason}`), buttons: ok });
      return;
    case 'error':
      await askUser({ title: t('update.errorTitle'), message: state.message, buttons: ok });
      return;
    default:
      await askUser({ title: t('update.upToDateTitle'), detail: t('update.upToDateDetail', { version: __APP_VERSION__ }), buttons: ok });
  }
}
