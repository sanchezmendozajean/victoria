/** Deep copy of plain JSON-like data (also works on Immer drafts, which `structuredClone` rejects). */
export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as T;
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = deepClone(item);
    return copy as T;
  }
  return value;
}
