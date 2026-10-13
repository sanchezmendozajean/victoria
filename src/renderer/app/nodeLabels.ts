import type { Node } from '../../core';
import type { IconId } from '../components/Icon';
import { t, type TranslationKey } from '../i18n';

export function nodeTypeKey(node: Node): TranslationKey {
  switch (node.type) {
    case 'shape':
      return `type.${node.shape}`;
    case 'path':
      return 'type.path';
    case 'compound':
      return 'type.compound';
    case 'group':
      return 'type.group';
    case 'clipGroup':
      return 'type.clipGroup';
    case 'text':
      return 'type.text';
    case 'image':
      return 'type.image';
  }
}

/** User name of the object, or its type ("Rectángulo", "Grupo"…). */
export const nodeLabel = (node: Node): string => node.name ?? t(nodeTypeKey(node));

export function nodeIcon(node: Node): IconId {
  switch (node.type) {
    case 'shape':
      return node.shape === 'rect' ? 'tool-rect' : node.shape === 'ellipse' ? 'tool-ellipse' : node.shape === 'polygon' ? 'tool-polygon' : node.shape === 'star' ? 'tool-star' : 'tool-line';
    case 'path':
      return 'tool-pen';
    case 'compound':
      return 'compound-path';
    case 'group':
      return 'group';
    case 'clipGroup':
      return 'clip-mask';
    case 'text':
      return 'tool-type';
    case 'image':
      return 'image';
  }
}
