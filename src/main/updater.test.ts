import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateState } from '../shared/ipc';
import { createUpdater, updateSupport, type UpdaterBackend } from './updater';

class FakeBackend extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  allowDowngrade = true;
  quitAndInstall = vi.fn();
  checkForUpdates = vi.fn(async () => undefined as unknown);
}

function setup(unsupported: Parameters<typeof createUpdater>[0]['unsupported'] = null) {
  const backend = new FakeBackend();
  const states: UpdateState[] = [];
  const updater = createUpdater({ backend: backend as unknown as UpdaterBackend, unsupported, onState: (s) => states.push(s) });
  return { backend, states, updater };
}

describe('updateSupport', () => {
  const env = {};
  it('is off in development', () => expect(updateSupport({ platform: 'win32', packaged: false, env })).toBe('dev'));
  it('updates the Windows installer but not the portable build', () => {
    expect(updateSupport({ platform: 'win32', packaged: true, env })).toBeNull();
    expect(updateSupport({ platform: 'win32', packaged: true, env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Victoria.exe' } })).toBe('portable');
  });
  it('updates an AppImage but not a .deb or .rpm', () => {
    expect(updateSupport({ platform: 'linux', packaged: true, env: { APPIMAGE: '/home/a/Victoria.AppImage' } })).toBeNull();
    expect(updateSupport({ platform: 'linux', packaged: true, env })).toBe('package');
  });
  it('does not promise anything on macOS', () => expect(updateSupport({ platform: 'darwin', packaged: true, env })).toBe('package'));
});

describe('createUpdater', () => {
  it('configures a quiet, stable-only, forward-only backend', () => {
    const { backend } = setup();
    expect(backend.autoDownload).toBe(true);
    expect(backend.autoInstallOnAppQuit).toBe(true);
    expect(backend.allowPrerelease).toBe(false);
    expect(backend.allowDowngrade).toBe(false);
  });

  it('reports up to date', async () => {
    const { backend, updater } = setup();
    backend.checkForUpdates.mockImplementation(async () => backend.emit('update-not-available', { version: '0.1.8' }));
    expect(await updater.check()).toEqual({ status: 'none' });
  });

  it('does not stay in "checking" when the backend says nothing', async () => {
    const { updater } = setup();
    expect(await updater.check()).toEqual({ status: 'none' });
  });

  it('follows a download to ready', async () => {
    const { backend, states, updater } = setup();
    backend.checkForUpdates.mockImplementation(async () => backend.emit('update-available', { version: '0.2.0' }));
    expect(await updater.check()).toEqual({ status: 'downloading', version: '0.2.0', percent: 0 });
    backend.emit('download-progress', { percent: 41.6 });
    backend.emit('download-progress', { percent: 150 });
    backend.emit('update-downloaded', { version: '0.2.0' });
    expect(states.map((s) => s.status)).toEqual(['checking', 'downloading', 'downloading', 'downloading', 'ready']);
    expect(states[2]).toMatchObject({ percent: 42 });
    expect(states[3]).toMatchObject({ percent: 100 });
    expect(updater.state()).toEqual({ status: 'ready', version: '0.2.0' });
  });

  it('does not check again while an update is downloading or ready', async () => {
    const { backend, updater } = setup();
    backend.checkForUpdates.mockImplementation(async () => backend.emit('update-downloaded', { version: '0.2.0' }));
    await updater.check();
    await updater.check();
    expect(backend.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('shares one check between simultaneous callers', async () => {
    const { updater, backend } = setup();
    await Promise.all([updater.check(), updater.check()]);
    expect(backend.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('turns a failure into an error state (first line only) and can try again', async () => {
    const { backend, updater } = setup();
    backend.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED\n  at stack'));
    expect(await updater.check()).toEqual({ status: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' });
    expect(await updater.check()).toEqual({ status: 'none' });
  });

  it('keeps an error the backend emitted itself', async () => {
    const { backend, updater } = setup();
    backend.checkForUpdates.mockImplementation(async () => backend.emit('error', new Error('404')));
    expect(await updater.check()).toEqual({ status: 'error', message: '404' });
  });

  it('never touches the backend when updates are unsupported', async () => {
    const { backend, updater } = setup('portable');
    expect(await updater.check()).toEqual({ status: 'unsupported', reason: 'portable' });
    expect(backend.checkForUpdates).not.toHaveBeenCalled();
    expect(backend.autoDownload).toBe(false);
  });

  describe('install', () => {
    it('refuses when nothing is downloaded', () => {
      const { backend, updater } = setup();
      expect(updater.requestInstall()).toBe(false);
      updater.windowClosed();
      expect(backend.quitAndInstall).not.toHaveBeenCalled();
    });

    it('installs and relaunches once the window has closed', () => {
      const { backend, updater } = setup();
      backend.emit('update-downloaded', { version: '0.2.0' });
      expect(updater.requestInstall()).toBe(true);
      expect(backend.quitAndInstall).not.toHaveBeenCalled(); // the close may still be cancelled
      updater.windowClosed();
      expect(backend.quitAndInstall).toHaveBeenCalledWith(true, true);
    });

    it('does not install when the close was cancelled', () => {
      const { backend, updater } = setup();
      backend.emit('update-downloaded', { version: '0.2.0' });
      updater.requestInstall();
      updater.cancelInstall();
      updater.windowClosed();
      expect(backend.quitAndInstall).not.toHaveBeenCalled();
    });
  });
});
