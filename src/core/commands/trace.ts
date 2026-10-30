import { createCompound, createGroup, createPath } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import type { Anchor, CompoundNode, GroupNode, ImageNode, Node } from '../model/types';
import type { TraceParams, TraceView } from '../trace/params';
import type { TraceResult } from '../trace/trace';
import { patchNode, replaceNode } from './node';
import type { Command } from './command';

const scaled = (anchors: readonly Anchor[], sx: number, sy: number): Anchor[] =>
  anchors.map((a) => ({
    ...a,
    p: { x: a.p.x * sx, y: a.p.y * sy },
    in: a.in && { x: a.in.x * sx, y: a.in.y * sy },
    out: a.out && { x: a.out.x * sx, y: a.out.y * sy },
  }));

/** The traced colours as flat-filled compound paths, bottom to top, scaled from pixels to the box of the image. */
export function traceChildren(ids: IdGenerator, result: TraceResult, width: number, height: number): CompoundNode[] {
  const sx = width / result.width;
  const sy = height / result.height;
  return result.layers.map((layer) => {
    const compound = createCompound(
      ids,
      layer.paths.map((anchors) => createPath(ids, scaled(anchors, sx, sy), true)),
      'evenodd',
    );
    compound.appearance = { items: [{ kind: 'fill', paint: { type: 'solid', color: { model: 'rgb', values: [...layer.color] } }, opacity: 1, modifiers: [] }] };
    return compound;
  });
}

/** Calco de imagen: the image becomes a live group of flat-colour paths (same place, size and look). One undo step. */
export function makeTrace(ids: IdGenerator, spaceId: string, image: ImageNode, params: TraceParams, result: TraceResult): { command: Command; group: GroupNode } {
  const group = createGroup(ids, traceChildren(ids, result, image.width, image.height));
  group.transform = image.transform;
  group.opacity = image.opacity;
  group.blendMode = image.blendMode;
  group.appearance = { items: [] };
  group.trace = { resourceId: image.resourceId, width: image.width, height: image.height, params };
  return { command: { ...replaceNode(spaceId, image.id, [group]), label: 'trace.make' }, group };
}

/** Changing the settings of a live trace: the paths are replaced by the new result. */
export function retrace(ids: IdGenerator, spaceId: string, group: GroupNode, params: TraceParams, result: TraceResult): Command {
  const info = group.trace;
  if (!info) throw new Error('Not a live trace');
  const children: Node[] = traceChildren(ids, result, info.width, info.height);
  return { ...patchNode<GroupNode>(spaceId, group.id, { children, trace: { ...info, params } }), label: 'trace.update' };
}

/** Vista of the live trace: what the canvas shows (result, outlines, the original image…). */
export function setTraceView(spaceId: string, group: GroupNode, view: TraceView): Command {
  const info = group.trace;
  if (!info) throw new Error('Not a live trace');
  return { ...patchNode<GroupNode>(spaceId, group.id, { trace: { ...info, view } }), label: 'trace.view' };
}

/** Expandir: the group keeps its paths and stops being live. */
export function expandTrace(spaceId: string, group: GroupNode): Command {
  return { ...patchNode<GroupNode>(spaceId, group.id, { trace: undefined }), label: 'trace.expand' };
}
