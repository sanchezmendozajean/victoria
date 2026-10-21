import { hasLiveVersion, makeLivePathfinder, pathfinder, selectOnly, type PathfinderOp } from '../../core';
import { actionContext } from './selectionActions';

/** Buscatrazos: applies an operation to the selection as one undo step; the result stays selected. */
export function runPathfinder(op: PathfinderOp, live = false): boolean {
  const c = actionContext();
  if (!c || c.ids.length === 0) return false;
  // Alt+click on a shape mode makes it a live pathfinder (a modifier of a group), as in Illustrator.
  const result = live && hasLiveVersion(op) ? makeLivePathfinder(c.space, c.ids, op, c.session.ids) : pathfinder(c.space, c.ids, op, c.session.ids);
  if (!result) return false;
  c.session.run(result.command, selectOnly(c.space.id, result.resultIds));
  return true;
}
