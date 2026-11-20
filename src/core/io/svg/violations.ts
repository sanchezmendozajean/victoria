import { isPlainPointText } from '../../export/scene';
import { walkSpaceNodes } from '../../model/queries';
import type { Appearance, Document, Node } from '../../model/types';
import type { SvgGate } from './capabilities';

// What in a document an SVG file cannot hold (specs/02 · Modo SVG). The SVG mode runs this after every command and
// rejects one that would add something to the list: the controls are disabled with a tooltip, this is what makes it true.

const FILTER_MODIFIERS = new Set(['drop-shadow', 'outer-glow', 'blur']);

function appearanceGates(appearance: Appearance, into: Set<SvgGate>): void {
  let fills = 0;
  let strokes = 0;
  let strokeFirst = false;
  for (const item of appearance.items) {
    if (item.kind === 'modifier') {
      into.add(FILTER_MODIFIERS.has(item.mod.modifierId) ? 'effect.filter' : 'modifier.live');
      continue;
    }
    for (const mod of item.modifiers) into.add(FILTER_MODIFIERS.has(mod.modifierId) ? 'effect.filter' : 'modifier.live');
    if (item.visible === false) {
      into.add('appearance.hidden');
      continue;
    }
    if (item.kind === 'fill') {
      fills++;
      if (strokes > 0) strokeFirst = true;
    } else {
      strokes++;
      const s = item.stroke;
      if (s.align !== 'center') into.add('stroke.align');
      if (s.profile && s.profile !== 'uniform') into.add('stroke.profile');
      if (s.startArrow || s.endArrow) into.add('stroke.arrow');
    }
  }
  // One fill and one stroke, the stroke over the fill: that is all an SVG element says.
  if (fills > 1 || strokes > 1 || strokeFirst) into.add('appearance.multiple');
}

function nodeGates(node: Node, into: Set<SvgGate>): void {
  if (node.type === 'text') {
    if (node.kind === 'area') into.add('text.area');
    else if (node.kind === 'onPath') into.add('text.onPath');
    else if (!isPlainPointText(node)) into.add('text.advanced');
    return;
  }
  appearanceGates(node.appearance, into);
  switch (node.type) {
    case 'group':
      if (node.blend) into.add('blend.live');
      if (node.trace) into.add('trace.live');
      break;
    case 'path':
      if (node.anchors.some((a) => (a.cornerRadius ?? 0) > 0)) into.add('corner.live');
      break;
    case 'compound':
      if (node.children.some((c) => c.anchors.some((a) => (a.cornerRadius ?? 0) > 0))) into.add('corner.live');
      break;
    case 'shape':
      if (node.shape === 'rect' && (node.params.cornerType !== 'round' || !node.params.radii.every((r) => r === node.params.radii[0]))) into.add('corner.live');
      if ((node.shape === 'polygon' || node.shape === 'star') && node.params.cornerRadius > 0) into.add('corner.live');
      break;
    default:
  }
}

/** The gates of the features the document uses that an SVG cannot keep; empty when it can be saved as it is. */
export function svgViolations(document: Document): Set<SvgGate> {
  const found = new Set<SvgGate>();
  if (document.spaces.length > 1) found.add('space.multiple');
  for (const space of document.spaces) {
    if (space.artboards.length > 1) found.add('artboard.multiple');
    for (const node of walkSpaceNodes(space)) nodeGates(node, found);
  }
  return found;
}

const cache = new WeakMap<Document, Set<SvgGate>>();

/**
 * The rule of the SVG mode for `DocumentSession.setGuard`: a command may not add a gate that the document did not already
 * have. `onRefused` hears the first gate added, to tell the person why nothing happened.
 */
export function svgGuard(onRefused: (gate: SvgGate) => void): (next: Document, current: Document) => boolean {
  const of = (document: Document): Set<SvgGate> => {
    let found = cache.get(document);
    if (!found) {
      found = svgViolations(document);
      cache.set(document, found);
    }
    return found;
  };
  return (next, current) => {
    const after = of(next);
    if (after.size === 0) return true;
    const before = of(current);
    const added = [...after].find((gate) => !before.has(gate));
    if (added === undefined) return true;
    onRefused(added);
    return false;
  };
}
