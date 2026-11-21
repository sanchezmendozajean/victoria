import type { UpdateState, UpdateUnsupportedReason } from '../shared/ipc';

/** The part of electron-updater's `autoUpdater` that Victoria uses (a fake stands in for it in tests). */
export interface UpdaterBackend {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface SupportInput {
  platform: NodeJS.Platform;
  packaged: boolean;
  env: Record<string, string | undefined>;
}

/**
 * Only the installers update in place: the NSIS installer on Windows and the AppImage on Linux.
 * The portable build and the .deb/.rpm packages are replaced by hand (a package manager owns the latter).
 */
export function updateSupport({ platform, packaged, env }: SupportInput): UpdateUnsupportedReason | null {
  if (!packaged) return 'dev';
  if (platform === 'win32') return env.PORTABLE_EXECUTABLE_FILE ? 'portable' : null;
  if (platform === 'linux') return env.APPIMAGE ? null : 'package';
  return 'package';
}

export interface Updater {
  state(): UpdateState;
  /** Looks for a newer version; resolves with the state once the check is over (a download may still be running). */
  check(): Promise<UpdateState>;
  /** Marks the downloaded update to be installed as soon as the window has closed. False when nothing is ready. */
  requestInstall(): boolean;
  /** The user cancelled the close that `requestInstall` started (unsaved work): the update waits for the next close. */
  cancelInstall(): void;
  /** Call when the window has closed; installs and restarts when an install was requested. */
  windowClosed(): void;
}

export interface UpdaterOptions {
  backend: UpdaterBackend | null;
  unsupported: UpdateUnsupportedReason | null;
  /** Reports every change (the main process forwards it to the window). */
  onState(state: UpdateState): void;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

export function createUpdater({ backend, unsupported, onState }: UpdaterOptions): Updater {
  let current: UpdateState = unsupported ? { status: 'unsupported', reason: unsupported } : { status: 'idle' };
  let installRequested = false;
  let inFlight: Promise<UpdateState> | null = null;

  const set = (next: UpdateState) => {
    current = next;
    onState(next);
  };

  if (backend && !unsupported) {
    // Download quietly; a ready update installs on its own when the person quits, or on request.
    backend.autoDownload = true;
    backend.autoInstallOnAppQuit = true;
    backend.allowPrerelease = false;
    backend.allowDowngrade = false;
    backend.on('update-available', (info) => set({ status: 'downloading', version: info.version, percent: 0 }));
    backend.on('update-not-available', () => set({ status: 'none' }));
    backend.on('download-progress', (progress) => {
      if (current.status === 'downloading') set({ ...current, percent: Math.max(0, Math.min(100, Math.round(progress.percent))) });
    });
    backend.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }));
    backend.on('error', (error) => set({ status: 'error', message: message(error) }));
  }

  const check = (): Promise<UpdateState> => {
    if (!backend || unsupported) return Promise.resolve(current);
    // A downloaded update is final; a running check or download is not repeated.
    if (current.status === 'ready' || current.status === 'downloading') return Promise.resolve(current);
    if (inFlight) return inFlight;
    set({ status: 'checking' });
    inFlight = backend
      .checkForUpdates()
      .then(() => {
        // No event at all (the backend found nothing to report): treat it as up to date rather than leave "checking".
        if (current.status === 'checking') set({ status: 'none' });
        return current;
      })
      .catch((error: unknown) => {
        // The backend also emits 'error'; this covers a rejection that came without it.
        if (current.status === 'checking') set({ status: 'error', message: message(error) });
        return current;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return {
    state: () => current,
    check,
    requestInstall() {
      if (current.status !== 'ready') return false;
      installRequested = true;
      return true;
    },
    cancelInstall() {
      installRequested = false;
    },
    windowClosed() {
      if (!installRequested || !backend) return;
      installRequested = false;
      backend.quitAndInstall(true, true);
    },
  };
}
