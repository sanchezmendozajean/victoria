import { pathfinder, selectOnly, type PathfinderOp } from '../../core';
import { actionContext } from './selectionActions';

/** Buscatrazos: applies an operation to the selection as one undo step; the result stays selected. */
export function runPathfinder(op: PathfinderOp): boolean {
  const c = actionContext();
  if (!c || c.ids.length === 0) return false;
  const result = pathfinder(c.space, c.ids, op, c.session.ids);
  if (!result) return false;
  c.session.run(result.command, selectOnly(c.space.id, result.resultIds));
  return true;
}
