import {
  alignItems,
  distributeItems,
  distributeSpacing,
  fitToArea,
  gridItems,
  nodeWorldBounds,
  translateNodes,
  unionOf,
  type AlignKind,
  type Axis,
  type Deltas,
  type DistributeKind,
  type GridOptions,
  type Item,
  type Margins,
  type Rect,
} from '../../core';
import { actionContext, type ActionContext } from './selectionActions';
import { useUi } from './store';

/** Bounds of the selected objects (with strokes when "use preview bounds" is on). */
export function selectionItems(c: ActionContext): Item[] {
  const stroke = useUi.getState().alignPreviewBounds;
  const items: Item[] = [];
  for (const id of c.ids) {
    const rect = nodeWorldBounds(c.space, id, { stroke });
    if (rect) items.push({ id, rect });
  }
  return items;
}

export function activeArtboardRect(c: ActionContext): Rect | null {
  const id = useUi.getState().activeArtboard[c.space.id];
  const board = c.space.artboards.find((a) => a.id === id) ?? c.space.artboards[0];
  return board ? { minX: board.x, minY: board.y, maxX: board.x + board.w, maxY: board.y + board.h } : null;
}

/** What "Alinear a" points at: the selection, the key object or the artboard. */
export function alignTarget(c: ActionContext, items: readonly Item[]): Rect | null {
  const { alignTo, keyObject } = useUi.getState();
  if (alignTo === 'artboard') return activeArtboardRect(c);
  if (alignTo === 'key') {
    const key = items.find((i) => i.id === keyObject);
    if (key) return key.rect;
  }
  return unionOf(items);
}

const run = (c: ActionContext, deltas: Deltas, label: string) => {
  if (deltas.size > 0) c.session.run(translateNodes(c.space.id, deltas, label));
};

export function alignSelection(kind: AlignKind): void {
  const c = actionContext();
  if (!c) return;
  const items = selectionItems(c);
  const target = alignTarget(c, items);
  const { alignTo } = useUi.getState();
  if (!target || (alignTo !== 'artboard' && items.length < 2)) return;
  run(c, alignItems(items, kind, target), 'node.align');
}

export function distributeSelection(kind: DistributeKind): void {
  const c = actionContext();
  if (!c) return;
  run(c, distributeItems(selectionItems(c), kind, useUi.getState().keyObject), 'node.distribute');
}

/** Distribute spacing along an axis: `gap` in pt, or null for Auto. */
export function spaceSelection(axis: Axis, gap: number | null): void {
  const c = actionContext();
  if (!c) return;
  const { alignTo, keyObject } = useUi.getState();
  run(c, distributeSpacing(selectionItems(c), axis, gap, alignTo === 'key' ? keyObject : null), 'node.spacing');
}

export function gridSelection(options: GridOptions): void {
  const c = actionContext();
  if (!c) return;
  run(c, gridItems(selectionItems(c), options), 'node.grid');
}

export function fitSelectionToArtboard(margins: Margins): void {
  const c = actionContext();
  const area = c ? activeArtboardRect(c) : null;
  if (c && area) run(c, fitToArea(selectionItems(c), area, margins), 'node.fitArtboard');
}
