import { t, type TranslationKey } from '../i18n';
import es from '../i18n/es.json';
import type { ShortcutAction } from './shortcuts';

const strings = es as Record<string, string>;

/** The translation key that names an action: the action itself (tools, panels), its menu entry, or a key made for it. */
export function shortcutLabelKey(action: ShortcutAction): TranslationKey | null {
  for (const key of [action, `menu.${action}`, `shortcut.${action}`]) if (key in strings) return key as TranslationKey;
  return null;
}

export const shortcutLabel = (action: ShortcutAction): string => {
  const key = shortcutLabelKey(action);
  return key ? t(key) : action;
};

/** Sections of the dialog, in the order of the spec (09 · Atajos), by the prefix of the action. */
export const SHORTCUT_SECTIONS = ['tool', 'paint', 'file', 'edit', 'object', 'type', 'select', 'modifier', 'view', 'space', 'panel'] as const;
export type ShortcutSection = (typeof SHORTCUT_SECTIONS)[number];
export const sectionOf = (action: ShortcutAction): ShortcutSection => action.split('.')[0] as ShortcutSection;
