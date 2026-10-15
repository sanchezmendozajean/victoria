import type { ParagraphStyle, TextRun, TextStyle } from '../model/types';
import { plainText } from './layout';

// Pure editing operations on a story (the list of runs) used by the text editor, the Character panel
// and the commands. Indices are positions in the plain text; stories are never mutated.

const sameStyle = (a: TextStyle, b: TextStyle): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Merges adjacent runs with the same style and drops empty ones (keeping a single empty run so the style survives). */
export function normalizeStory(story: readonly TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of story) {
    if (run.text === '') continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last.style, run.style)) last.text += run.text;
    else out.push({ text: run.text, style: { ...run.style } });
  }
  if (out.length === 0 && story[0]) out.push({ text: '', style: { ...story[0].style } });
  return out;
}

/** Style typed at `index`: that of the character before it (or after it at the very start). */
export function styleAt(story: readonly TextRun[], index: number): TextStyle {
  let offset = 0;
  let before: TextStyle | null = null;
  for (const run of story) {
    const end = offset + run.text.length;
    if (index > offset && index <= end) return run.style;
    if (index <= offset && !before) return run.style;
    before = run.style;
    offset = end;
  }
  return before ?? (story[0] as TextRun).style;
}

/** The part of the story between two indices. */
export function sliceStory(story: readonly TextRun[], from: number, to: number): TextRun[] {
  const out: TextRun[] = [];
  let offset = 0;
  for (const run of story) {
    const start = Math.max(from, offset);
    const end = Math.min(to, offset + run.text.length);
    if (end > start) out.push({ text: run.text.slice(start - offset, end - offset), style: { ...run.style } });
    offset += run.text.length;
  }
  return out;
}

/** Replaces [from, to) by `text` typed in `style` (default: the style at `from`). */
export function replaceRange(story: readonly TextRun[], from: number, to: number, text: string, style?: TextStyle): TextRun[] {
  const total = plainText(story).length;
  const a = Math.max(0, Math.min(from, total));
  const b = Math.max(a, Math.min(to, total));
  const typing = style ?? styleAt(story, a);
  const head = sliceStory(story, 0, a);
  const tail = sliceStory(story, b, total);
  const middle: TextRun[] = text === '' ? [] : [{ text, style: { ...typing } }];
  const result = normalizeStory([...head, ...middle, ...tail]);
  // Deleting everything keeps the style of the box.
  if (plainText(result) === '' && result[0]) result[0].style = { ...typing };
  return result.length > 0 ? result : [{ text: '', style: { ...typing } }];
}

export const insertText = (story: readonly TextRun[], index: number, text: string, style?: TextStyle): TextRun[] => replaceRange(story, index, index, text, style);
export const deleteRange = (story: readonly TextRun[], from: number, to: number): TextRun[] => replaceRange(story, from, to, '');

/** Applies a style patch to [from, to); `undefined` values remove an optional attribute. */
export function styleRange(story: readonly TextRun[], from: number, to: number, patch: Partial<TextStyle>): TextRun[] {
  const total = plainText(story).length;
  const a = Math.max(0, Math.min(from, total));
  const b = Math.max(a, Math.min(to, total));
  if (a === b) return story.map((r) => ({ text: r.text, style: { ...r.style } }));
  const apply = (style: TextStyle): TextStyle => {
    const next = { ...style } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next as unknown as TextStyle;
  };
  const parts = [...sliceStory(story, 0, a), ...sliceStory(story, a, b).map((r) => ({ text: r.text, style: apply(r.style) })), ...sliceStory(story, b, total)];
  return normalizeStory(parts);
}

/** Style patch over the whole story (a text object selected with the Selection tool). */
export const styleAll = (story: readonly TextRun[], patch: Partial<TextStyle>): TextRun[] => styleRange(story, 0, plainText(story).length, patch);

/** The value of one attribute over a range: shared, or `mixed`. */
export function commonStyle<K extends keyof TextStyle>(story: readonly TextRun[], from: number, to: number, key: K): { mixed: false; value: TextStyle[K] } | { mixed: true } {
  const runs = from === to ? [{ text: '', style: styleAt(story, from) }] : sliceStory(story, from, to);
  const first = runs[0];
  if (!first) return { mixed: false, value: (story[0] as TextRun).style[key] };
  const value = first.style[key];
  return runs.every((r) => JSON.stringify(r.style[key]) === JSON.stringify(value)) ? { mixed: false, value } : { mixed: true };
}

// ── Paragraphs ──────────────────────────────────────────────────────────────────

/** Index of the paragraph that holds plain-text position `index`. */
export function paragraphIndexAt(text: string, index: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(index, text.length); i++) if (text[i] === '\n') n++;
  return n;
}

/** Paragraph indices touched by [from, to]. */
export function paragraphsOfRange(text: string, from: number, to: number): number[] {
  const first = paragraphIndexAt(text, from);
  const last = paragraphIndexAt(text, Math.max(from, to));
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/**
 * Paragraph styles after replacing [from, to) of `text` by `inserted`: removed paragraph breaks drop
 * the style of the paragraph that was merged away; new breaks copy the style of the paragraph they split.
 */
export function editParagraphs(paragraphs: readonly ParagraphStyle[] | undefined, text: string, from: number, to: number, inserted: string): ParagraphStyle[] | undefined {
  if (!paragraphs || paragraphs.length === 0) return paragraphs?.slice();
  const first = paragraphIndexAt(text, from);
  const removed = (text.slice(from, to).match(/\n/g) ?? []).length;
  const added = (inserted.match(/\n/g) ?? []).length;
  const next = paragraphs.map((p) => ({ ...p }));
  while (next.length <= first + removed) next.push({});
  next.splice(first + 1, removed); // merged paragraphs keep the style of the first
  const base = next[first] ?? {};
  next.splice(first + 1, 0, ...Array.from({ length: added }, () => ({ ...base })));
  return next;
}

/** A story typed in one style. */
export const storyFromText = (text: string, style: TextStyle): TextRun[] => [{ text, style: { ...style } }];

/** Word boundaries around an index (double click selects a word). */
export function wordAt(text: string, index: number): [number, number] {
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
  let a = Math.min(index, text.length);
  let b: number;
  if (!isWord(text[a]) && isWord(text[a - 1])) a--;
  if (isWord(text[a])) {
    while (a > 0 && isWord(text[a - 1])) a--;
    b = a;
    while (b < text.length && isWord(text[b])) b++;
    return [a, b];
  }
  return [a, Math.min(text.length, a + 1)];
}

/** Paragraph boundaries around an index (triple click). */
export function paragraphRangeAt(text: string, index: number): [number, number] {
  const start = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const nl = text.indexOf('\n', index);
  return [index === 0 ? 0 : start, nl === -1 ? text.length : nl];
}
