import {
  anchorToWorld,
  convertShapeToPath,
  pathFrameOf,
  pathsOfNodes,
  projectOnSubPath,
  visibleLeafIds,
  worldToLocal,
  type Anchor,
  type Matrix,
  type PathFrame,
  type Rect,
  type Vec2,
} from '../../core';
import { currentSelection } from './shared';
import type { ToolHost } from './types';

/** Pick distance of anchors, handles and segments, in screen pixels. */
export const PICK_PX = 5;

export const pickRadius = (host: ToolHost): number => PICK_PX / host.view.zoom;

/** Frames (paths) of the selected objects; live shapes appear as read-only contours. */
export function selectedFrames(host: ToolHost): PathFrame[] {
  const selection = currentSelection(host);
  return selection && host.space ? pathsOfNodes(host.space, selection.ids) : [];
}

/** Frames of every visible, unlocked path near `p` (not only the selected ones). */
export function framesNear(host: ToolHost, p: Vec2, radius = pickRadius(host) * 2): PathFrame[] {
  const space = host.space;
  if (!space) return [];
  const rect: Rect = { minX: p.x - radius, minY: p.y - radius, maxX: p.x + radius, maxY: p.y + radius };
  return pathsOfNodes(space, visibleLeafIds(space, rect)).filter((f) => !f.layer.locked && !f.owner.locked);
}

export interface AnchorHit {
  frame: PathFrame;
  index: number;
  distance: number;
}

export function anchorAt(host: ToolHost, frames: readonly PathFrame[], p: Vec2): AnchorHit | null {
  let best: AnchorHit | null = null;
  const radius = pickRadius(host);
  for (const frame of frames) {
    frame.path.anchors.forEach((a, index) => {
      const w = anchorToWorld(frame.world, a.p);
      const distance = Math.hypot(w.x - p.x, w.y - p.y);
      if (distance <= radius && (!best || distance < best.distance)) best = { frame, index, distance };
    });
  }
  return best;
}

export interface HandleHit {
  frame: PathFrame;
  index: number;
  which: 'in' | 'out';
}

/** A handle of any anchor of the frames. */
export function handleAt(host: ToolHost, frames: readonly PathFrame[], p: Vec2): HandleHit | null {
  const radius = pickRadius(host);
  for (const frame of frames) {
    for (let index = 0; index < frame.path.anchors.length; index++) {
      const a = frame.path.anchors[index] as Anchor;
      for (const which of ['in', 'out'] as const) {
        const h = a[which];
        if (!h) continue;
        const w = anchorToWorld(frame.world, h);
        if (Math.hypot(w.x - p.x, w.y - p.y) <= radius) return { frame, index, which };
      }
    }
  }
  return null;
}

export interface SegmentHit {
  frame: PathFrame;
  segment: number;
  t: number;
  distance: number;
}

export function segmentAt(host: ToolHost, frames: readonly PathFrame[], p: Vec2): SegmentHit | null {
  let best: SegmentHit | null = null;
  for (const frame of frames) {
    const local = worldToLocal(frame.world, p);
    const hit = projectOnSubPath({ anchors: frame.path.anchors, closed: frame.path.closed }, local);
    if (!hit) continue;
    const scale = Math.sqrt(Math.abs(frame.world[0] * frame.world[3] - frame.world[1] * frame.world[2])) || 1;
    const distance = hit.distance * scale;
    if (distance <= pickRadius(host) * 1.5 && (!best || distance < best.distance)) best = { frame, segment: hit.segmentIndex, t: hit.t, distance };
  }
  return best;
}

export interface EndpointHit {
  frame: PathFrame;
  end: 'start' | 'end';
}

/** An end anchor of an open, standalone path (live shapes and compound sub-paths are not continued). */
export function endpointAt(host: ToolHost, p: Vec2, exclude?: string): EndpointHit | null {
  const radius = pickRadius(host);
  for (const frame of framesNear(host, p)) {
    const { path } = frame;
    if (frame.live || frame.owner.type !== 'path' || path.closed || path.id === exclude || path.anchors.length === 0) continue;
    const first = anchorToWorld(frame.world, (path.anchors[0] as Anchor).p);
    const last = anchorToWorld(frame.world, (path.anchors[path.anchors.length - 1] as Anchor).p);
    if (Math.hypot(last.x - p.x, last.y - p.y) <= radius) return { frame, end: 'end' };
    if (Math.hypot(first.x - p.x, first.y - p.y) <= radius) return { frame, end: 'start' };
  }
  return null;
}

/** Local → world and back for a path frame. */
export const toWorldPoint = (world: Matrix, p: Vec2): Vec2 => anchorToWorld(world, p);
export const toLocalPoint = (world: Matrix, p: Vec2): Vec2 => worldToLocal(world, p);

/**
 * The anchor tools edit nodes directly: a live shape is turned into a path first, as part of the same
 * undo step (the warning of specs/03 belongs to Direct Selection). Returns the editable frame.
 */
export function editableFrame(host: ToolHost, frame: PathFrame, key: string): PathFrame | null {
  const { session, space } = host;
  if (!session || !space) return null;
  if (frame.live) session.run(convertShapeToPath(space.id, frame.owner.id, key));
  return host.space ? pathFrameOf(host.space, frame.path.id) : null;
}
