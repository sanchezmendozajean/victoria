import { canvasApi } from '../canvas/api';
import { manager } from '../documents';
import { createNewSpace, goToSpaceIndex } from '../documents/spaceActions';
import {
  arrangeSelection,
  deleteSelection,
  groupSelection,
  hideSelection,
  makeClipSelection,
  releaseClipSelection,
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
import { copySelection, cutSelection, pasteClipboard } from './clipboardActions';
import { placeImages } from './imageActions';
import { averageSelection, joinSelection } from './pathActions';
import { defaultPaints, paintAsColor, paintAsGradient, paintAsNone, swapPaints } from './paintActions';
import type { ShortcutAction } from './shortcuts';
import { applyLastModifier, applyModifiersToSelection, lastModifierDialog } from './modifierActions';
import { outlineSelection } from './textActions';
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

const goTo = (index: number) => {
  const session = manager.active?.session;
  if (session) goToSpaceIndex(session, index);
};

/** Behaviour bound to menu entries and shortcuts. Actions without a handler are not implemented yet. */
const HANDLERS: Partial<Record<ShortcutAction, () => void | Promise<unknown>>> = {
  'file.new': () => void manager.newDocument(),
  'file.open': () => manager.open(),
  'file.place': placeImages,
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
  'view.pixelPreview': toggle('pixelPreview'),
  'view.rulers': toggle('rulers'),
  'view.guides': toggle('guides'),
  'view.lockGuides': toggle('lockGuides'),
  'view.grid': toggle('grid'),
  'view.snapGrid': toggle('snapGrid'),
  'view.smartGuides': toggle('smartGuides'),
  'view.hideArtboards': toggle('hideArtboards'),
  'view.hideEdges': toggle('hideEdges'),
  'edit.cut': cutSelection,
  'edit.copy': copySelection,
  'edit.paste': () => pasteClipboard('center'),
  'edit.pasteInPlace': () => pasteClipboard('inPlace'),
  'edit.pasteFront': () => pasteClipboard('front'),
  'edit.pasteBack': () => pasteClipboard('back'),
  'edit.pasteInAllArtboards': () => pasteClipboard('allArtboards'),
  'edit.delete': deleteSelection,
  'paint.default': defaultPaints,
  'paint.toggle': () => useUi.getState().setActivePaint(useUi.getState().activePaint === 'fill' ? 'stroke' : 'fill'),
  'paint.swap': swapPaints,
  'paint.color': () => paintAsColor(useUi.getState().activePaint),
  'paint.gradient': () => paintAsGradient(useUi.getState().activePaint),
  'paint.none': () => paintAsNone(useUi.getState().activePaint),
  'object.join': joinSelection,
  'object.average': () => void averageSelection(),
  'type.createOutlines': outlineSelection,
  'object.applyModifiers': () => void applyModifiersToSelection(),
  'modifier.applyLast': applyLastModifier,
  'modifier.lastDialog': lastModifierDialog,
  'object.clipMake': makeClipSelection,
  'object.clipRelease': releaseClipSelection,
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
  'space.go1': () => goTo(0),
  'space.go2': () => goTo(1),
  'space.go3': () => goTo(2),
  'space.go4': () => goTo(3),
  'space.go5': () => goTo(4),
  'space.go6': () => goTo(5),
  'space.go7': () => goTo(6),
  'space.go8': () => goTo(7),
  'space.go9': () => goTo(8),
};

export const hasHandler = (action: ShortcutAction): boolean => action in HANDLERS;

/** Returns true when the action exists (so the key press should be consumed). */
export function runAction(action: ShortcutAction): boolean {
  const handler = HANDLERS[action];
  if (!handler) return false;
  void handler();
  return true;
}
