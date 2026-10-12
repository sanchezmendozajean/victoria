import { Menu } from 'electron';

/**
 * The visible menus are drawn by the renderer (they need per-item icons, specs/10).
 * Windows/Linux: no native application menu, so no stray menu bar.
 * macOS (compiles, unsupported): minimal menu so the standard edit shortcuts keep working.
 */
export function installApplicationMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    );
    return;
  }
  Menu.setApplicationMenu(null);
}
