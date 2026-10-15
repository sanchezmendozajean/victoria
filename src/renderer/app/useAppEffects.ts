import { useEffect } from 'react';
import { manager } from '../documents';
import { fontManager } from '../text/fontManager';
import { adoptSelectionLook } from './paintActions';
import { runAction } from './actions';
import { PANEL_BY_ACTION } from './menus';
import { findShortcutAction } from './shortcuts';
import { useUi } from './store';
import { toolFromAction } from './tools';

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));

/** Bridges the shell to the main process and the keyboard. Mounted once by <App>. */
export function useAppEffects() {
  const theme = useUi((s) => s.theme);
  const setPlatform = useUi((s) => s.setPlatform);
  const setMaximized = useUi((s) => s.setMaximized);

  // System fonts: listed once at start; faces load on demand as text asks for them.
  useEffect(() => {
    void fontManager.init();
  }, []);

  // Platform info and window state come from main through the typed preload API.
  useEffect(() => {
    const api = window.victoria;
    let cancelled = false;
    void api.getPlatformInfo().then((info) => {
      if (!cancelled && info) setPlatform(info);
    });
    const unsubscribe = api.onWindowStateChange((state) => setMaximized(state.maximized));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setPlatform, setMaximized]);

  // Theme: tokens switch through [data-theme]; native caption buttons must follow.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    const styles = getComputedStyle(root);
    window.victoria.setOverlayColors({
      background: styles.getPropertyValue('--bg-app').trim(),
      symbol: styles.getPropertyValue('--icon').trim(),
    });
  }, [theme]);

  // What you draw next takes the look of the last selected object (Illustrator's current attributes).
  useEffect(() => {
    let lastKey = '';
    const check = () => {
      const session = manager.active?.session;
      const key = session ? session.selection.ids.join('|') : '';
      if (key === lastKey) return;
      lastKey = key;
      if (key !== '') adoptSelectionLook();
    };
    return manager.subscribe(check);
  }, []);

  // Keyboard: Phase 1 binds tools and panels only.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditable(event.target)) return;
      const { platform, setActiveTool, openPanel } = useUi.getState();
      const action = findShortcutAction(event, platform.os);
      if (!action) return;
      const tool = toolFromAction(action);
      if (tool) {
        setActiveTool(tool);
        event.preventDefault();
        return;
      }
      const panel = PANEL_BY_ACTION[action];
      if (panel) {
        openPanel(panel);
        event.preventDefault();
        return;
      }
      if (runAction(action)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
