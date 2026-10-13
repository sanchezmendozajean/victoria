import es from './es.json';

export type TranslationKey = keyof typeof es;

/** Label of a history step (`space.rename` → "Renombrar Espacio"); falls back to the key itself. */
export function commandLabel(label: string): string {
  return (es as Record<string, string>)[`command.${label}`] ?? label;
}

/** All UI strings live in es.json; components never carry literals (CLAUDE.md · Idioma). */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const text: string = es[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
