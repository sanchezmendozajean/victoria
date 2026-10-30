import { app, BrowserWindow, screen, session } from 'electron';
import path from 'node:path';
import type { OverlayColors, PlatformInfo, WindowChrome } from '../shared/ipc';
import { IPC } from '../shared/ipc';
import { broadcastWindowState, registerIpc } from './ipc';
import { installApplicationMenu } from './menu';
import { getPlatform } from './platform';

app.setName('Victoria');
// Tests run beside a real session: a separate userData also gives them their own single-instance lock.
if (!app.isPackaged && process.env.VICTORIA_USER_DATA) app.setPath('userData', process.env.VICTORIA_USER_DATA);
const platform = getPlatform();

// Wayland when available, X11 otherwise (specs/01 · Multiplataforma).
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
// Dark tokens (--bg-app, --icon); the renderer re-sends the real values for the active theme on mount.
const INITIAL_COLORS: OverlayColors = { background: '#1E1F22', symbol: '#C9CBCE' };
// Until Preferences exist (Phase 12), Linux users opt in to the OS title bar with this variable.
// VICTORIA_CHROME forces a style in dev/tests so every layout can be checked on any OS.
function resolveChrome(): WindowChrome {
  const forced = process.env.VICTORIA_CHROME;
  if (!app.isPackaged && (forced === 'custom' || forced === 'system' || forced === 'native-overlay')) return forced;
  if (process.platform !== 'win32' && process.env.VICTORIA_SYSTEM_TITLEBAR === '1') return 'system';
  return platform.windowChrome;
}
const chrome = resolveChrome();

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const work = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1440, work.width),
    height: Math.min(900, work.height),
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Victoria',
    backgroundColor: INITIAL_COLORS.background,
    ...platform.frameOptions(chrome, INITIAL_COLORS),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Closing waits for the renderer to flush its autosaves ("nunca perder trabajo"), with a safety timeout.
  let closeApproved = false;
  const approveClose = () => {
    closeApproved = true;
    if (!win.isDestroyed()) win.close();
  };
  win.on('close', (event) => {
    if (closeApproved || win.webContents.isLoading() || win.webContents.isCrashed()) return;
    event.preventDefault();
    win.webContents.send(IPC.beforeClose);
    setTimeout(approveClose, 4000);
  });
  win.webContents.ipc.once(IPC.closeReady, approveClose);
  const notify = () => broadcastWindowState(win);
  // F12 / Ctrl+Shift+I / Ctrl+Alt+I toggle the developer tools (the app has no native menu to carry the accelerator).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const chord = input.control && (input.shift || input.alt) && input.key.toLowerCase() === 'i';
    if (input.key === 'F12' || chord) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });
  win.on('maximize', notify);
  win.on('unmaximize', notify);
  win.on('enter-full-screen', notify);
  win.on('leave-full-screen', notify);
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (DEV_URL) {
    void win.loadURL(DEV_URL);
    if (process.env.VICTORIA_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  return win;
}

function hardenSession(): void {
  // No web permissions are needed by the app.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!DEV_URL || !url.startsWith(DEV_URL)) event.preventDefault();
    });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    hardenSession();
    installApplicationMenu();
    platform.registerFileAssociation();

    const info: PlatformInfo = {
      os: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
      chrome: chrome === 'native-overlay' && process.platform !== 'win32' ? 'custom' : chrome,
      ...(process.env.XDG_CURRENT_DESKTOP ? { desktop: process.env.XDG_CURRENT_DESKTOP } : {}),
      testing: !app.isPackaged && !!process.env.VICTORIA_USER_DATA,
    };
    registerIpc({ platform, info, getWindow: () => mainWindow });
    mainWindow = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
