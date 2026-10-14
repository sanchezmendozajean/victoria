import { cutPath, replaceNode, selectOnly, type PathNode } from '../../core';
import { anchorAt, editableFrame, framesNear, segmentAt, selectedFrames } from './pathHits';
import type { Tool, ToolHost } from './types';

/**
 * Scissors (C): a click on a segment or an anchor cuts the path there, leaving two coincident anchors.
 * An open path becomes two; a closed one becomes one open path (specs/03 · Tijeras).
 */
export function createScissorsTool(): Tool {
  const targets = (host: ToolHost, p: { x: number; y: number }) => {
    const near = framesNear(host, p).filter((f) => f.owner.type === 'path' || f.live);
    const ids = new Set(near.map((f) => f.path.id));
    return [...selectedFrames(host).filter((f) => (f.owner.type === 'path' || f.live) && !ids.has(f.path.id)), ...near];
  };

  return {
    id: 'tool-scissors',
    cursor: () => 'crosshair',

    onPointerDown(event, host) {
      const { session, space } = host;
      if (event.button !== 0 || !session || !space) return;
      const frames = targets(host, event.doc);
      const anchor = anchorAt(host, frames, event.doc);
      const segment = anchor ? null : segmentAt(host, frames, event.doc);
      const hit = anchor?.frame ?? segment?.frame;
      if (!hit) return;
      const key = host.gestureKey();
      const editable = editableFrame(host, hit, key);
      if (!editable || editable.owner.type !== 'path') return;
      const parts = cutPath(editable.path.anchors, editable.path.closed, anchor ? { anchor: anchor.index } : { segment: (segment as NonNullable<typeof segment>).segment, t: (segment as NonNullable<typeof segment>).t });
      if (!parts) return;
      const original = editable.owner as PathNode;
      const nodes: PathNode[] = parts.map((anchors, i) => ({
        ...(i === 0 ? original : { ...JSON.parse(JSON.stringify(original)), id: session.ids() }),
        type: 'path',
        closed: false,
        anchors,
      }));
      session.run(
        replaceNode(space.id, original.id, nodes),
        selectOnly(
          space.id,
          nodes.map((n) => n.id),
        ),
      );
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
