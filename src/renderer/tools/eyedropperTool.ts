import { cloneAppearance, copyAppearance, copyPaint, paintTargets, primaryItem, type Appearance, type Node, type Paint } from '../../core';
import { currentSelection, topLevelIds } from './shared';
import type { Tool, ToolHost } from './types';

/** Fill and stroke items of an object: what the Eyedropper carries. Modifiers belong to Phase 9. */
function lookOf(node: Node, host: ToolHost): Appearance {
  const full = cloneAppearance(node.appearance, host.session ? host.session.ids : () => 'x');
  return { items: full.items.filter((i) => i.kind !== 'modifier') };
}

/**
 * Eyedropper (I): a click copies the appearance of the object under the cursor to the selection (to the
 * next objects when nothing is selected); Alt+click does the opposite, applying the selection's
 * appearance to the clicked object; Shift+click copies only the colour of the part clicked
 * (specs/03 · Cuentagotas).
 */
export function createEyedropperTool(): Tool {
  return {
    id: 'tool-eyedropper',
    cursor: () => 'crosshair',

    onPointerDown(event, host) {
      const { session, space } = host;
      if (event.button !== 0 || !session || !space) return;
      const hit = host.hitTest(event.doc)[0];
      if (!hit) return;
      const clicked = hit.node;
      const selection = currentSelection(host);
      const selected = selection && selection.ids.length > 0 ? paintTargets(space, topLevelIds(space, selection.ids)) : [];

      if (event.altKey) {
        // Apply what is selected (or the look of the next objects) to the clicked object.
        const source = selected[0];
        if (!source) return;
        session.run(copyAppearance(space.id, [clicked.id], lookOf(source, host), { opacity: source.opacity, blendMode: source.blendMode }));
        return;
      }

      if (event.shiftKey) {
        // Only the colour of the part that was clicked: its fill or its stroke.
        const target = hit.part === 'stroke' ? 'stroke' : 'fill';
        const paint: Paint | undefined = primaryItem(clicked.appearance, target)?.paint;
        if (!paint) return;
        if (selected.length > 0) session.run(copyPaint(space.id, selection ? topLevelIds(space, selection.ids) : [], target, paint));
        else {
          const look = lookOf({ ...clicked, appearance: host.newAppearance() } as Node, host);
          const item = look.items.find((i) => i.kind === target);
          if (item && item.kind !== 'modifier') item.paint = JSON.parse(JSON.stringify(paint));
          host.setNewAppearance(look);
        }
        return;
      }

      const look = lookOf(clicked, host);
      if (selected.length > 0) {
        session.run(copyAppearance(space.id, selection ? topLevelIds(space, selection.ids) : [], look, { opacity: clicked.opacity, blendMode: clicked.blendMode }));
      } else {
        host.setNewAppearance(look);
      }
    },

    onPointerMove(event, host) {
      host.setHover(host.hitAt(event.doc));
    },
    onPointerUp() {},
    onLeave(host) {
      host.setHover(null);
    },
  };
}
