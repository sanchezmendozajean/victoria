import es from './es.json';

export type TranslationKey = keyof typeof es;

/** All UI strings live in es.json; components never carry literals (CLAUDE.md · Idioma). */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const text: string = es[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
