import { manager } from '../documents';
import { createNewSpace } from '../documents/spaceActions';
import type { ShortcutAction } from './shortcuts';

function stepSpace(delta: number): void {
  const session = manager.active?.session;
  if (!session) return;
  const { spaces, activeSpaceId } = session.document;
  const index = spaces.findIndex((s) => s.id === activeSpaceId);
  const next = spaces[(index + delta + spaces.length) % spaces.length];
  if (next) session.setActiveSpace(next.id);
}

/** Behaviour bound to menu entries and shortcuts. Actions without a handler are not implemented yet. */
const HANDLERS: Partial<Record<ShortcutAction, () => void | Promise<unknown>>> = {
  'file.new': () => void manager.newDocument(),
  'file.open': () => manager.open(),
  'file.save': () => manager.save(),
  'file.saveAs': () => manager.saveAs(),
  'file.close': () => manager.close(),
  'edit.undo': () => void manager.active?.session.undo(),
  'edit.redo': () => void manager.active?.session.redo(),
  'space.new': () => {
    const session = manager.active?.session;
    if (session) createNewSpace(session);
  },
  'space.previous': () => stepSpace(-1),
  'space.next': () => stepSpace(1),
};

export const hasHandler = (action: ShortcutAction): boolean => action in HANDLERS;

/** Returns true when the action exists (so the key press should be consumed). */
export function runAction(action: ShortcutAction): boolean {
  const handler = HANDLERS[action];
  if (!handler) return false;
  void handler();
  return true;
}
