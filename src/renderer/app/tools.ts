import type { IconId } from '../icons/catalog.generated';
import { SHORTCUTS, type ShortcutAction } from './shortcuts';

export type ToolId = Extract<IconId, `tool-${string}`>;

/** A toolbar slot shows its last-used tool; the others live in its flyout. */
export interface ToolSlot {
  /** The tool shown by default. */
  id: ToolId;
  /** All tools of the slot, default first. A slot with more than one tool is a group. */
  tools: readonly ToolId[];
}

const slot = (...tools: [ToolId, ...ToolId[]]): ToolSlot => ({ id: tools[0], tools });

/** Order and separators of specs/10 §3 (one array per separator-delimited section). */
export const TOOL_SECTIONS: readonly (readonly ToolSlot[])[] = [
  [slot('tool-select'), slot('tool-direct-select', 'tool-group-select'), slot('tool-lasso')],
  [
    slot('tool-pen', 'tool-anchor-add', 'tool-anchor-delete', 'tool-anchor-convert'),
    slot('tool-curvature'),
    slot('tool-pencil', 'tool-smooth', 'tool-blob', 'tool-eraser'),
  ],
  [
    slot('tool-type', 'tool-area-type', 'tool-type-on-path'),
    slot('tool-line'),
    slot('tool-rect', 'tool-rounded-rect', 'tool-ellipse', 'tool-polygon', 'tool-star'),
  ],
  [slot('tool-rotate', 'tool-reflect'), slot('tool-scale'), slot('tool-free-transform'), slot('tool-shape-builder')],
  [slot('tool-scissors', 'tool-knife'), slot('tool-gradient'), slot('tool-eyedropper')],
  [slot('tool-artboard')],
  [slot('tool-hand'), slot('tool-zoom')],
];

export const ALL_SLOTS: readonly ToolSlot[] = TOOL_SECTIONS.flat();

export function slotOf(tool: ToolId): ToolSlot {
  const found = ALL_SLOTS.find((s) => s.tools.includes(tool));
  if (!found) throw new Error(`Tool ${tool} is not in the toolbar`);
  return found;
}

/** Accelerator of a tool, if it has one (e.g. "Shift+M"). */
export function toolAccelerator(tool: ToolId): string | undefined {
  const action = `tool.${tool}` as const;
  return action in SHORTCUTS ? SHORTCUTS[action as ShortcutAction] : undefined;
}

export function toolFromAction(action: ShortcutAction): ToolId | null {
  return action.startsWith('tool.') ? (action.slice(5) as ToolId) : null;
}
