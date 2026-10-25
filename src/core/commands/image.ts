import { IDENTITY } from '../model/matrix';
import type { IdGenerator } from '../model/ids';
import type { ImageNode, ImageResource, Matrix } from '../model/types';
import { addNode } from './node';
import { addImageResource } from './resources';
import { combineCommands, type Command } from './command';

/** A bare image object: no fill, no stroke (an image is its pixels). */
export function createImage(ids: IdGenerator, hash: string, width: number, height: number, transform: Matrix = IDENTITY): ImageNode {
  return {
    id: ids(),
    type: 'image',
    visible: true,
    locked: false,
    transform,
    appearance: { items: [] },
    opacity: 1,
    blendMode: 'normal',
    resourceId: hash,
    width,
    height,
    embedded: true,
  };
}

/** Lists the resource (if new) and puts the image on a layer: one undo step (Archivo › Colocar). */
export function placeImage(spaceId: string, layerId: string, node: ImageNode, resource: ImageResource): Command {
  return combineCommands('image.place', [addImageResource(node.resourceId, resource), addNode(spaceId, layerId, node)]);
}
