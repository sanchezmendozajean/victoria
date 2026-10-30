import { BOOLEAN_WORKER_SEGMENTS, computePieces, finishPathfinder, hasLiveVersion, makeLivePathfinder, planPathfinder, planSegments, selectOnly, type PathfinderOp } from '../../core';
import { runBooleans } from '../geometry/booleanRunner';
import { t } from '../i18n';
import { useBusy } from './busy';
import { actionContext } from './selectionActions';

/**
 * Buscatrazos: applies an operation to the selection as one undo step; the result stays selected. Big operations
 * (many segments) run in a Worker with a Cancelar in the status bar, and are dropped if the document changed meanwhile.
 */
export async function runPathfinder(op: PathfinderOp, live = false): Promise<boolean> {
  const c = actionContext();
  if (!c || c.ids.length === 0) return false;
  // Alt+click on a shape mode makes it a live pathfinder (a modifier of a group), as in Illustrator.
  if (live && hasLiveVersion(op)) {
    const result = makeLivePathfinder(c.space, c.ids, op, c.session.ids);
    if (!result) return false;
    c.session.run(result.command, selectOnly(c.space.id, result.resultIds));
    return true;
  }
  const plan = planPathfinder(c.space, c.ids, op);
  if (!plan) return false;
  let computed;
  if (planSegments(plan) > BOOLEAN_WORKER_SEGMENTS) {
    const revision = c.session.revision;
    const job = runBooleans(op, plan.operands);
    useBusy.getState().start(t('busy.pathfinder'), job.cancel);
    try {
      computed = await job.result;
    } catch {
      return false; // cancelled, or the engine failed
    } finally {
      useBusy.getState().end();
    }
    if (c.session.revision !== revision) return false;
  } else {
    try {
      computed = computePieces(op, plan.operands);
    } catch {
      return false;
    }
  }
  const result = finishPathfinder(c.space, plan, computed, c.session.ids);
  if (!result) return false;
  c.session.run(result.command, selectOnly(c.space.id, result.resultIds));
  return true;
}
