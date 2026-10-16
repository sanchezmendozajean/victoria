import {
  commonStyle,
  createOutlines,
  selectOnly,
  paintTargets,
  paragraphsOfRange,
  plainText,
  styleParagraphs,
  styleText,
  type ParagraphStyle,
  type TextNode,
  type TextStyle,
} from '../../core';
import { actionContext } from './selectionActions';
import { useUi } from './store';

// What the Character and Paragraph panels read and write. They act on the text being edited (its selected
// range, or the next characters typed when the caret is collapsed), else on the selected text objects,
// else on the defaults of the next text created.

export type Field<T> = { mixed: false; value: T | undefined } | { mixed: true };

interface Scope {
  nodes: TextNode[];
  editing: { id: string; from: number; to: number } | null;
}

function scope(): (Scope & { c: NonNullable<ReturnType<typeof actionContext>> }) | null {
  const c = actionContext();
  if (!c) return null;
  const editing = useUi.getState().textEditing;
  const nodes = paintTargets(c.space, c.ids).filter((n): n is TextNode => n.type === 'text');
  const editedNode = editing ? nodes.find((n) => n.id === editing.id) : undefined;
  if (editing && editedNode) return { c, nodes: [editedNode], editing };
  return { c, nodes, editing: null };
}

/** The ids of the text objects the panels currently act on. */
export function selectedTextIds(): string[] {
  return scope()?.nodes.map((n) => n.id) ?? [];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The value of a character attribute for what is being edited or selected (mixed → blank in the panel). */
export function characterField<K extends keyof TextStyle>(key: K): Field<TextStyle[K]> {
  const ui = useUi.getState();
  const s = scope();
  if (!s || s.nodes.length === 0) return { mixed: false, value: ui.textStyle[key] };
  if (s.editing) {
    const node = s.nodes[0] as TextNode;
    const { from, to } = s.editing;
    if (from === to && ui.pendingTextStyle && key in ui.pendingTextStyle) return { mixed: false, value: ui.pendingTextStyle[key] };
    return commonStyle(node.story, from, to, key);
  }
  let first: TextStyle[K] | undefined;
  for (const [i, node] of s.nodes.entries()) {
    const field = commonStyle(node.story, 0, plainText(node.story).length, key);
    if (field.mixed) return field;
    if (i === 0) first = field.value;
    else if (!same(first, field.value)) return { mixed: true };
  }
  return { mixed: false, value: first };
}

/** Applies a character attribute (undefined removes it). */
export function applyCharacter(patch: Partial<TextStyle>, mergeKey?: string): void {
  const ui = useUi.getState();
  const s = scope();
  if (!s || s.nodes.length === 0) {
    ui.setTextStyle(patch);
    return;
  }
  const ids = s.nodes.map((n) => n.id);
  if (s.editing) {
    const { from, to } = s.editing;
    if (from === to) {
      ui.setPendingTextStyle({ ...(ui.pendingTextStyle ?? {}), ...patch });
      return;
    }
    s.c.session.run(styleText(s.c.space.id, ids, patch, new Map([[s.editing.id, [from, to] as const]]), mergeKey));
    return;
  }
  s.c.session.run(styleText(s.c.space.id, ids, patch, undefined, mergeKey));
}

/** Paragraph attribute for what is being edited or selected. */
export function paragraphField<K extends keyof ParagraphStyle>(key: K): Field<ParagraphStyle[K]> {
  const ui = useUi.getState();
  const s = scope();
  if (!s || s.nodes.length === 0) return { mixed: false, value: ui.paragraphStyle[key] };
  let first: ParagraphStyle[K] | undefined;
  let seen = false;
  for (const node of s.nodes) {
    const text = plainText(node.story);
    const which = s.editing ? paragraphsOfRange(text, s.editing.from, s.editing.to) : Array.from({ length: text.split('\n').length }, (_, i) => i);
    for (const i of which) {
      const v = node.paragraphs?.[i]?.[key];
      if (!seen) {
        first = v;
        seen = true;
      } else if (!same(first, v)) return { mixed: true };
    }
  }
  return { mixed: false, value: first };
}

export function applyParagraph(patch: Partial<ParagraphStyle>, mergeKey?: string): void {
  const s = scope();
  if (!s || s.nodes.length === 0) {
    useUi.getState().setParagraphStyle(patch);
    return;
  }
  const ids = s.nodes.map((n) => n.id);
  let which: Map<string, number[]> | undefined;
  if (s.editing) {
    const node = s.nodes[0] as TextNode;
    which = new Map([[node.id, paragraphsOfRange(plainText(node.story), s.editing.from, s.editing.to)]]);
  }
  s.c.session.run(styleParagraphs(s.c.space.id, ids, patch, which, mergeKey));
}

/** Texto › Crear contornos (Shift+Ctrl+O): the selected text becomes shapes. */
export function outlineSelection(): void {
  const s = scope();
  if (!s || s.nodes.length === 0) return;
  const created: string[] = [];
  s.c.session.run(createOutlines(s.c.space.id, s.nodes.map((n) => n.id), s.c.session.ids, created));
  s.c.session.select(selectOnly(s.c.space.id, created));
  useUi.getState().setTextEditing(null);
  useUi.getState().setActiveTool('tool-select');
}

/** The selected text on a path, for the options dialog. */
export function selectedPathText(): TextNode | null {
  const s = scope();
  const node = s?.nodes.length === 1 ? s.nodes[0] : undefined;
  return node && node.kind === 'onPath' ? node : null;
}
