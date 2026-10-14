import type { Draft } from 'immer';
import type { Document } from '../model/types';

/**
 * A reversible document mutation (specs/02 · Comandos e historial).
 *
 * `apply` is an Immer recipe: the session records the resulting patches and inverse patches, so
 * undo/redo never re-run commands and are exact. Commands are plain data + a recipe, created by the
 * factories in this folder; nothing outside `core/commands` mutates a document (CLAUDE.md rule 2).
 */
export interface Command {
  /** Stable key such as `space.add`; the UI maps it to a Spanish label (`command.space.add`). */
  label: string;
  /** Space the command acts on. Undo/redo of a command switches to this Space (specs/04 · regla 4). */
  spaceId?: string;
  /** Consecutive commands with the same key merge into one history step (arrow-key moves, scrubbing). */
  mergeKey?: string;
  apply(draft: Draft<Document>): void;
}

/** Several commands as one: one history entry, merged under the first command's merge key. */
export function combineCommands(label: string, commands: readonly Command[]): Command {
  const first = commands[0];
  return {
    label,
    ...(first?.spaceId ? { spaceId: first.spaceId } : {}),
    ...(first?.mergeKey ? { mergeKey: first.mergeKey } : {}),
    apply: (d) => {
      for (const command of commands) command.apply(d);
    },
  };
}
