import { usePreferences } from '../prefs/preferences';

/**
 * Subscribes a component to the user's shortcut changes. `SHORTCUTS` is a live object, so anything that prints a
 * shortcut (menus, tooltips) only has to render again when it changes; the value returned is that change set.
 */
export const useShortcuts = (): Record<string, string> => usePreferences((s) => s.prefs.shortcuts);
