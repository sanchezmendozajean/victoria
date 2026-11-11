import { nodeGeometry } from '../geometry/geometry';
import type { SubPath } from '../geometry/path';
import { createPath } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import { applyToPoint } from '../model/matrix';
import { isLayer } from '../model/queries';
import type { Anchor, BlendInfo, Document, GroupNode, LayerChild, Matrix, Node, PathNode, Space } from '../model/types';
import { blendAppearance, blendContours, blendLerp, blendPositions, clampBlendSteps, equidistantPositions } from './blend';
import { locateNode } from '../model/queries';

// A live blend (specs/03 · Mezcla) keeps its generated steps in the group, but they are derived data: after every
// command the session regenerates the steps of any blend whose key objects (or step count) changed, inside the
// same history step. That is what makes the blend react when a key object is moved, reshaped or recoloured.

const mapAnchor = (m: Matrix, a: Anchor): Anchor => ({ ...a, p: applyToPoint(m, a.p), in: a.in && applyToPoint(m, a.in), out: a.out && applyToPoint(m, a.out) });

/** The single contour of an object that can be blended (a path or a live shape), or null. */
export function contourOf(node: Node): SubPath | null {
  if (node.type !== 'path' && node.type !== 'shape') return null;
  const geometry = nodeGeometry(node);
  return geometry && geometry.subpaths.length === 1 ? (geometry.subpaths[0] as SubPath) : null;
}

/** The key objects of a live blend that still exist as paths, in blend order. */
export const blendKeys = (group: GroupNode): PathNode[] =>
  (group.blend?.keys ?? []).map((id) => group.children.find((c) => c.id === id)).filter((c): c is PathNode => !!c && c.type === 'path');

/** The key objects and, between each consecutive pair, the generated steps (all in the group's own space). */
export function assembleBlend(keys: readonly PathNode[], steps: number, newIds: IdGenerator, equidistant = false): Node[] {
  const out: Node[] = [];
  const place = (node: PathNode): SubPath => {
    const sub = contourOf(node) as SubPath;
    return { closed: sub.closed, anchors: sub.anchors.map((anchor) => mapAnchor(node.transform, anchor)) };
  };
  keys.forEach((key, i) => {
    out.push(key);
    const next = keys[i + 1];
    if (!next) return;
    const from = place(key);
    const to = place(next);
    const ts = (equidistant ? equidistantPositions(from, to, steps) : null) ?? blendPositions(steps);
    blendContours(from, to, ts).forEach((contour, n) => {
      const t = ts[n] as number;
      const path = createPath(newIds, contour.anchors, contour.closed);
      path.appearance = blendAppearance(key.appearance, next.appearance, t);
      path.opacity = blendLerp(key.opacity, next.opacity, t);
      path.blendMode = (t < 0.5 ? key : next).blendMode;
      out.push(path);
    });
  });
  return out;
}

/** Fingerprint of everything the generated steps depend on. */
export function blendSignature(steps: number, keys: readonly PathNode[], equidistant = false): string {
  const text = JSON.stringify([steps, equidistant, keys.map((k) => [k.transform, k.closed, k.anchors, k.appearance, k.opacity, k.blendMode])]);
  // Two independent 32-bit FNV-1a hashes: short enough to live in the document.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${text.length.toString(36)}`;
}

/** Fresh `blend` info for these keys. */
export const makeBlendInfo = (steps: number, keys: readonly PathNode[], equidistant = false): BlendInfo => ({ steps, keys: keys.map((k) => k.id), ...(equidistant ? { equidistant: true } : {}), sig: blendSignature(steps, keys, equidistant) });

export interface BlendRefresh {
  spaceId: string;
  groupId: string;
  /** null = the blend lost key objects and stops being live. */
  blend: BlendInfo | null;
  children: Node[];
}

/** The same group with its steps regenerated from its current key objects (null info when keys went missing). */
export function refreshOf(group: GroupNode, newIds: IdGenerator): { blend: BlendInfo | null; children: Node[] } {
  const info = group.blend as BlendInfo;
  const keys = blendKeys(group);
  if (keys.length < 2 || keys.length !== info.keys.length) return { blend: null, children: keys };
  // Reuse the ids of the previous steps so a refresh does not churn them.
  const spare = group.children.filter((c) => !info.keys.includes(c.id)).map((c) => c.id);
  const ids: IdGenerator = () => spare.shift() ?? newIds();
  const steps = clampBlendSteps(info.steps);
  return { blend: makeBlendInfo(steps, keys, info.equidistant === true), children: assembleBlend(keys, steps, ids, info.equidistant === true) };
}

const blendsOfSpace = new WeakMap<Space, GroupNode[]>();

function blendGroupsIn(space: Space): GroupNode[] {
  let found = blendsOfSpace.get(space);
  if (found) return found;
  found = [];
  const walk = (children: readonly LayerChild[]) => {
    for (const child of children) {
      if (isLayer(child)) walk(child.children);
      else if (child.type === 'group' || child.type === 'clipGroup') {
        if (child.type === 'group' && child.blend) found!.push(child);
        walk(child.children);
      }
    }
  };
  for (const layer of space.layers) walk(layer.children);
  blendsOfSpace.set(space, found);
  return found;
}

/** The live blends of `doc` whose steps no longer match their key objects. */
export function findStaleBlends(doc: Document, newIds: IdGenerator): BlendRefresh[] {
  const out: BlendRefresh[] = [];
  for (const space of doc.spaces) {
    for (const group of blendGroupsIn(space)) {
      const info = group.blend as BlendInfo;
      const keys = blendKeys(group);
      if (keys.length === info.keys.length && keys.length >= 2 && info.sig === blendSignature(clampBlendSteps(info.steps), keys, info.equidistant === true)) continue;
      out.push({ spaceId: space.id, groupId: group.id, ...refreshOf(group, newIds) });
    }
  }
  return out;
}

/** Writes the regenerated steps into a draft of the document. */
export function applyBlendRefreshes(draft: Document, refreshes: readonly BlendRefresh[]): void {
  for (const r of refreshes) {
    const space = draft.spaces.find((s) => s.id === r.spaceId);
    const found = space ? locateNode(space, r.groupId) : null;
    if (!found || found.node.type !== 'group') continue;
    found.node.children = r.children as never;
    if (r.blend) found.node.blend = r.blend;
    else delete found.node.blend;
  }
}
