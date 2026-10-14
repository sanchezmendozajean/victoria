import {
  commonItemOpacity,
  commonPaint,
  commonValue,
  NO_PAINT,
  primaryItem,
  type Appearance,
  type BlendMode,
  type Mixed,
  type Node,
  type Paint,
} from '../../core';

/**
 * What the colour controls show: the shared fill and stroke of the selected objects (or `mixed`), or
 * the look of the next object drawn when nothing is selected.
 */
export interface Look {
  fill: Mixed<Paint>;
  stroke: Mixed<Paint>;
  fillOpacity: Mixed<number>;
  strokeOpacity: Mixed<number>;
  /** Object opacity (0..1) and blend mode. */
  opacity: Mixed<number>;
  blend: Mixed<BlendMode>;
  fromSelection: boolean;
}

const single = <T>(value: T): Mixed<T> => ({ mixed: false, value });

export function lookOf(nodes: readonly Node[], newLook: Appearance): Look {
  if (nodes.length === 0) {
    return {
      fill: single(primaryItem(newLook, 'fill')?.paint ?? NO_PAINT),
      stroke: single(primaryItem(newLook, 'stroke')?.paint ?? NO_PAINT),
      fillOpacity: single(primaryItem(newLook, 'fill')?.opacity ?? 1),
      strokeOpacity: single(primaryItem(newLook, 'stroke')?.opacity ?? 1),
      opacity: single(1),
      blend: single('normal'),
      fromSelection: false,
    };
  }
  return {
    fill: commonPaint(nodes, 'fill') ?? single(NO_PAINT),
    stroke: commonPaint(nodes, 'stroke') ?? single(NO_PAINT),
    fillOpacity: commonItemOpacity(nodes, 'fill') ?? single(1),
    strokeOpacity: commonItemOpacity(nodes, 'stroke') ?? single(1),
    opacity: commonValue(nodes.map((n) => n.opacity)) ?? single(1),
    blend: commonValue(nodes.map((n) => n.blendMode)) ?? single('normal'),
    fromSelection: true,
  };
}

/** Fill and stroke items of an object, as the template for the next ones (modifiers are not carried over). */
export function lookFromNode(node: Node): Appearance {
  return {
    items: node.appearance.items
      .filter((i) => i.kind !== 'modifier')
      .map((i) => JSON.parse(JSON.stringify({ ...i, modifiers: [] })) as Appearance['items'][number]),
  };
}
