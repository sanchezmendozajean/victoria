import {
  closeOpenPath,
  convertToCorner,
  convertToSmooth,
  deepClone,
  editPaths,
  joinPathNodes,
  joinPaths,
  pathFrameOf,
  removeAnchors,
  replaceNodes,
  selectOnly,
  selectedAnchorIndices,
  splitAtAnchors,
  type Anchor,
  type PathEdit,
  type PathFrame,
  type PathNode,
  type Selection,
  type Space,
  type Vec2,
} from '../../core';
import { t } from '../i18n';
import { actionContext, type ActionContext } from './selectionActions';
import { askUser } from './dialogs';

interface AnchorTarget {
  frame: PathFrame;
  indices: number[];
}

/** Anchors picked with Direct Selection, grouped by path. */
function anchorTargets(c: ActionContext): AnchorTarget[] {
  const out: AnchorTarget[] = [];
  for (const pathId of Object.keys(c.selection.anchors ?? {})) {
    const frame = pathFrameOf(c.space, pathId);
    const indices = selectedAnchorIndices(c.selection, pathId);
    if (frame && indices.length > 0 && !frame.layer.locked && !frame.owner.locked) out.push({ frame, indices });
  }
  return out;
}

/** The selected objects that are open standalone paths (what Join works on when no anchors are picked). */
function openPaths(c: ActionContext): PathFrame[] {
  return c.ids
    .map((id) => pathFrameOf(c.space, id))
    .filter((f): f is PathFrame => !!f && !f.live && f.owner.type === 'path' && !f.path.closed && f.path.anchors.length > 0);
}

/** Selection that keeps the owners but forgets anchor indices (they change after structural edits). */
const ownersOnly = (space: Space, selection: Selection): Selection => selectOnly(space.id, selection.ids);

/** Delete with anchors selected removes them; the path stays (and disappears only when too few anchors remain). */
export function deleteSelectedAnchors(): boolean {
  const c = actionContext();
  if (!c) return false;
  const targets = anchorTargets(c);
  if (targets.length === 0) return false;
  const edits: PathEdit[] = targets.map(({ frame, indices }) => ({ pathId: frame.path.id, anchors: removeAnchors(frame.path.anchors, indices) }));
  const removedOwners = new Set(targets.filter((_, i) => edits[i]?.anchors === null).map((x) => x.frame.owner.id));
  const remaining = c.selection.ids.filter((id) => !removedOwners.has(id));
  c.session.run(editPaths(c.space.id, edits, 'path.deleteAnchors'), selectOnly(c.space.id, remaining));
  return true;
}

export function convertSelectedAnchors(kind: 'corner' | 'smooth'): void {
  const c = actionContext();
  if (!c) return;
  const targets = anchorTargets(c);
  if (targets.length === 0) return;
  const edits: PathEdit[] = targets.map(({ frame, indices }) => ({
    pathId: frame.path.id,
    anchors: kind === 'corner' ? convertToCorner(frame.path.anchors, indices) : convertToSmooth(frame.path.anchors, frame.path.closed, indices),
  }));
  c.session.run(editPaths(c.space.id, edits, 'path.convertAnchors'));
}

/** Cut path at the selected anchors (control bar). */
export function cutAtSelectedAnchors(): void {
  const c = actionContext();
  if (!c) return;
  const targets = anchorTargets(c).filter((x) => x.frame.owner.type === 'path' || x.frame.live);
  if (targets.length === 0) return;
  const ready: Array<{ id: string; nodes: PathNode[] }> = [];
  const converts: PathEdit[] = [];
  const kept: string[] = [];
  for (const { frame, indices } of targets) {
    const base = frame.live ? frame.path : (frame.owner as PathNode);
    const pieces = splitAtAnchors(frame.path.anchors, frame.path.closed, indices);
    if (pieces.length === 1 && !frame.path.closed) continue;
    if (frame.live) converts.push({ pathId: frame.path.id, anchors: frame.path.anchors, closed: frame.path.closed });
    const nodes: PathNode[] = pieces.map((anchors, i) => ({
      ...(i === 0 ? deepClone(base) : { ...deepClone(base), id: c.session.ids() }),
      type: 'path' as const,
      closed: false,
      anchors,
    }));
    ready.push({ id: frame.owner.id, nodes });
    kept.push(...nodes.map((n) => n.id));
  }
  if (ready.length === 0) return;
  // One step: convert live shapes first, then replace each path by its pieces.
  c.session.run(
    {
      label: 'path.cut',
      spaceId: c.space.id,
      apply: (d) => {
        editPaths(c.space.id, converts).apply(d);
        replaceNodes(c.space.id, ready).apply(d);
      },
    },
    selectOnly(c.space.id, kept),
  );
}

/** Distance between two points. */
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Objeto › Unir (Ctrl+J). With two end anchors picked: joins them (one path → closes it). With open paths
 * selected: one path is closed; several are chained, always joining the nearest pair of ends.
 */
export function joinSelection(): void {
  const c = actionContext();
  if (!c) return;

  // 1. Two picked end anchors.
  const ends = anchorTargets(c).flatMap(({ frame, indices }) =>
    frame.owner.type === 'path' && !frame.live && !frame.path.closed
      ? indices.filter((i) => i === 0 || i === frame.path.anchors.length - 1).map((i) => ({ frame, end: (i === 0 ? 'start' : 'end') as 'start' | 'end', index: i }))
      : [],
  );
  if (ends.length === 2) {
    const [a, b] = ends as [(typeof ends)[number], (typeof ends)[number]];
    if (a.frame.path.id === b.frame.path.id) {
      c.session.run(joinPathNodes(c.space.id, a.frame.path.id, [], closeOpenPath(a.frame.path.anchors), true), ownersOnly(c.space, c.selection));
    } else {
      const joined = joinPaths(a.frame.path.anchors, a.end, b.frame.path.anchors, b.end);
      c.session.run(joinPathNodes(c.space.id, a.frame.path.id, [b.frame.path.id], joined, false), selectOnly(c.space.id, [a.frame.path.id]));
    }
    return;
  }

  // 2. Whole open paths.
  const paths = openPaths(c);
  const first = paths[0];
  if (!first) return;
  if (paths.length === 1) {
    if (first.path.anchors.length < 2) return;
    c.session.run(joinPathNodes(c.space.id, first.path.id, [], closeOpenPath(first.path.anchors), true), selectOnly(c.space.id, [first.path.id]));
    return;
  }
  let chain: Anchor[] = deepClone(first.path.anchors);
  const pending = paths.slice(1);
  const removed: string[] = [];
  while (pending.length > 0) {
    const head = (chain[0] as Anchor).p;
    const tail = (chain[chain.length - 1] as Anchor).p;
    let best: { index: number; chainEnd: 'start' | 'end'; otherEnd: 'start' | 'end'; distance: number } | null = null as { index: number; chainEnd: 'start' | 'end'; otherEnd: 'start' | 'end'; distance: number } | null;
    for (let index = 0; index < pending.length; index++) {
      const own = (pending[index] as PathFrame).path.anchors;
      const pts = { start: (own[0] as Anchor).p, end: (own[own.length - 1] as Anchor).p };
      for (const chainEnd of ['start', 'end'] as const) {
        for (const otherEnd of ['start', 'end'] as const) {
          const distance = dist(chainEnd === 'start' ? head : tail, pts[otherEnd]);
          if (!best || distance < best.distance) best = { index, chainEnd, otherEnd, distance };
        }
      }
    }
    const pick = best as unknown as { index: number; chainEnd: 'start' | 'end'; otherEnd: 'start' | 'end' };
    const [next] = pending.splice(pick.index, 1);
    if (!next) break;
    chain = joinPaths(chain, pick.chainEnd, next.path.anchors, pick.otherEnd);
    removed.push(next.path.id);
  }
  c.session.run(joinPathNodes(c.space.id, first.path.id, removed, chain, false), selectOnly(c.space.id, [first.path.id]));
}

/** Objeto › Promediar (Alt+Ctrl+J): asks the axis, then aligns the picked anchors (all anchors of the selected paths when none are picked). */
export async function averageSelection(): Promise<void> {
  const c = actionContext();
  if (!c) return;
  let targets = anchorTargets(c);
  if (targets.length === 0) {
    targets = c.ids
      .map((id) => pathFrameOf(c.space, id))
      .filter((f): f is PathFrame => !!f && !f.live && f.owner.type === 'path')
      .map((frame) => ({ frame, indices: frame.path.anchors.map((_, i) => i) }));
  }
  const total = targets.reduce((n, x) => n + x.indices.length, 0);
  if (total < 2) return;
  const answer = await askUser({
    title: t('average.title'),
    detail: t('average.detail'),
    buttons: [
      { id: 'cancel', label: t('dialog.cancel') },
      { id: 'horizontal', label: t('average.horizontal') },
      { id: 'vertical', label: t('average.vertical') },
      { id: 'both', label: t('average.both'), variant: 'primary' },
    ],
  });
  if (answer === 'cancel') return;
  averageAnchorsOf(targets, answer === 'horizontal' ? 'horizontal' : answer === 'vertical' ? 'vertical' : 'both');
}

/** Average of world positions, applied in each path's own space. Exposed for tests. */
export function averageAnchorsOf(targets: AnchorTarget[], axis: 'horizontal' | 'vertical' | 'both'): void {
  const c = actionContext();
  if (!c || targets.length === 0) return;
  const world = (frame: PathFrame, p: Vec2): Vec2 => ({ x: frame.world[0] * p.x + frame.world[2] * p.y + frame.world[4], y: frame.world[1] * p.x + frame.world[3] * p.y + frame.world[5] });
  const mean = { x: 0, y: 0 };
  let count = 0;
  for (const { frame, indices } of targets) {
    for (const i of indices) {
      const w = world(frame, (frame.path.anchors[i] as Anchor).p);
      mean.x += w.x;
      mean.y += w.y;
      count++;
    }
  }
  if (count === 0) return;
  mean.x /= count;
  mean.y /= count;
  const edits: PathEdit[] = targets.map(({ frame, indices }) => {
    // Horizontal axis = same Y for all the points; vertical axis = same X.
    const result = frame.path.anchors.map((a, i) => {
      if (!indices.includes(i)) return a;
      const w = world(frame, a.p);
      const target = { x: axis === 'horizontal' ? w.x : mean.x, y: axis === 'vertical' ? w.y : mean.y };
      const d = { x: target.x - w.x, y: target.y - w.y };
      const det = frame.world[0] * frame.world[3] - frame.world[1] * frame.world[2];
      const dl = det === 0 ? d : { x: (frame.world[3] * d.x - frame.world[2] * d.y) / det, y: (-frame.world[1] * d.x + frame.world[0] * d.y) / det };
      return { ...a, p: { x: a.p.x + dl.x, y: a.p.y + dl.y }, in: a.in && { x: a.in.x + dl.x, y: a.in.y + dl.y }, out: a.out && { x: a.out.x + dl.x, y: a.out.y + dl.y } };
    });
    return { pathId: frame.path.id, anchors: result };
  });
  c.session.run(editPaths(c.space.id, edits, 'path.average'));
}

/** Helper for tests and other callers: the frames targeted by the current anchor selection. */
export const selectedAnchorTargets = (): AnchorTarget[] => {
  const c = actionContext();
  return c ? anchorTargets(c) : [];
};

