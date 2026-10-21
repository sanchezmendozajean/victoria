import {
  addModifier,
  defaultParams,
  expandModifiers,
  getModifier,
  hasModifiers,
  locateNode,
  newModifier,
  selectOnly,
  type ModifierTarget,
  type Params,
} from '../../core';
import { MODIFIER_MENU } from './modifierCatalog';
import { actionContext } from './selectionActions';
import { useUi } from './store';

/** Display name of a modifier (the menu label without its trailing "…"). */
export function modifierLabelKey(modifierId: string) {
  for (const category of MODIFIER_MENU) {
    const found = category.items.find((i) => i.id === modifierId);
    if (found) return found.label;
  }
  return null;
}

/** Opens the dialog of a modifier for the selected objects (Modificador › …); `target` picks a fill or stroke instead of the whole object. */
export function openModifier(modifierId: string, target?: ModifierTarget): void {
  const c = actionContext();
  if (!c || c.ids.length === 0 || !getModifier(modifierId)) return;
  useUi.getState().openModifierDialog({ modifierId, nodeIds: [...c.ids], edit: null, ...(target ? { target } : {}) });
}

/** Double click on a modifier row: edits it with its dialog. */
export function editModifier(nodeId: string, modId: string, modifierId: string): void {
  useUi.getState().openModifierDialog({ modifierId, nodeIds: [nodeId], edit: { nodeId, modId } });
}

/** Adds a modifier with the given parameters to the selected objects (no dialog). */
export function addModifierToSelection(modifierId: string, params: Params = defaultParams(modifierId)): boolean {
  const c = actionContext();
  if (!c || c.ids.length === 0 || !getModifier(modifierId)) return false;
  const additions = c.ids.map((nodeId) => ({ nodeId, mod: newModifier(c.session.ids, modifierId, params) }));
  c.session.run(addModifier(c.space.id, additions));
  useUi.getState().setLastModifier({ modifierId, params });
  return true;
}

/** Mayús+Ctrl+E: the last modifier again, with the same parameters. */
export function applyLastModifier(): void {
  const last = useUi.getState().lastModifier;
  if (last) addModifierToSelection(last.modifierId, last.params);
}

/** Alt+Mayús+Ctrl+E: the dialog of the last modifier. */
export function lastModifierDialog(): void {
  const last = useUi.getState().lastModifier;
  if (last) openModifier(last.modifierId);
}

/** True when something selected has modifiers to apply. */
export function selectionHasModifiers(): boolean {
  const c = actionContext();
  return !!c && c.ids.some((id) => {
    const node = locateNode(c.space, id)?.node;
    return !!node && hasModifiers(node);
  });
}

/** Objeto › Aplicar modificadores (Alt+Ctrl+E): the result of the modifiers becomes real geometry. */
export function applyModifiersToSelection(): boolean {
  const c = actionContext();
  if (!c || c.ids.length === 0) return false;
  const result = expandModifiers(c.space, c.ids, c.session.ids);
  if (!result) return false;
  c.session.run(result.command, selectOnly(c.space.id, result.resultIds));
  return true;
}
