import { canvasApi } from '../canvas/api';
import { manager } from '../documents';
import { createNewSpace } from '../documents/spaceActions';
import {
  arrangeSelection,
  deleteSelection,
  groupSelection,
  hideSelection,
  lockSelection,
  reselect,
  selectAll,
  selectAllInArtboard,
  selectNone,
  showAll,
  transformAgain,
  unlockAll,
  ungroupSelection,
} from './selectionActions';
import type { ShortcutAction } from './shortcuts';
import { useUi, type ViewOptions } from './store';

const toggle = (key: keyof ViewOptions) => () => useUi.getState().toggleViewOption(key);

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
  'view.zoomIn': () => canvasApi.current?.zoomIn(),
  'view.zoomOut': () => canvasApi.current?.zoomOut(),
  'view.fitArtboard': () => canvasApi.current?.fitArtboard(),
  'view.fitAll': () => canvasApi.current?.fitAll(),
  'view.actualSize': () => canvasApi.current?.actualSize(),
  'view.outline': toggle('outline'),
  'view.rulers': toggle('rulers'),
  'view.guides': toggle('guides'),
  'view.lockGuides': toggle('lockGuides'),
  'view.grid': toggle('grid'),
  'view.snapGrid': toggle('snapGrid'),
  'view.smartGuides': toggle('smartGuides'),
  'view.hideArtboards': toggle('hideArtboards'),
  'view.hideEdges': toggle('hideEdges'),
  'edit.delete': deleteSelection,
  'object.group': groupSelection,
  'object.ungroup': ungroupSelection,
  'object.lock': lockSelection,
  'object.unlockAll': unlockAll,
  'object.hide': hideSelection,
  'object.showAll': showAll,
  'object.bringToFront': () => arrangeSelection('front'),
  'object.bringForward': () => arrangeSelection('forward'),
  'object.sendBackward': () => arrangeSelection('backward'),
  'object.sendToBack': () => arrangeSelection('back'),
  'object.transformAgain': transformAgain,
  'object.move': () => useUi.getState().openTransformDialog('move', null),
  'select.all': selectAll,
  'select.allInArtboard': selectAllInArtboard,
  'select.none': selectNone,
  'select.reselect': reselect,
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
