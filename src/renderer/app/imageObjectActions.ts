import {
  applyCrop,
  cropImage,
  cropOf,
  effectivePpi,
  frameOf,
  imageNodes,
  multiply,
  pixelWindow,
  recropImage,
  selectOnly,
  setImageSource,
  sniffImage,
  uncropImage,
  type CropInfo,
  type CropRect,
  type DocumentSession,
  type ImageNode,
  type ImageResource,
  type Matrix,
  type Space,
} from '../../core';
import { cropPicture } from '../canvas/cropBitmap';
import { t } from '../i18n';
import { askUser } from './dialogs';
import { actionContext } from './selectionActions';
import { useUi } from './store';

export type LinkState = 'embedded' | 'linked' | 'broken';

/** What the Image section of Properties shows about the selected object (an image, or an image under a crop). */
export interface ImageFacts {
  image: ImageNode;
  crop: CropInfo | null;
  /** Local → Space matrix of the image. */
  world: Matrix;
  resource: ImageResource | undefined;
  ppi: number;
  link: LinkState;
}

export function imageFactsOf(session: DocumentSession, space: Space, id: string): ImageFacts | null {
  const frame = frameOf(space, id);
  if (!frame) return null;
  const crop = cropOf(frame.node);
  const image = crop ? crop.image : frame.node.type === 'image' ? frame.node : null;
  if (!image) return null;
  const world = crop ? multiply(frame.world, image.transform) : frame.world;
  const resource = session.document.resources.images[image.resourceId];
  const link: LinkState = image.embedded ? 'embedded' : session.images.has(image.resourceId) ? 'linked' : 'broken';
  return { image, crop, world, resource, ppi: resource ? effectivePpi(world, image, resource) : Infinity, link };
}

function selectedFacts() {
  const c = actionContext();
  const id = c && c.ids.length === 1 ? c.ids[0] : undefined;
  const facts = c && id ? imageFactsOf(c.session, c.space, id) : null;
  return c && facts ? { c, facts } : null;
}

const alertOk = (message: string) => askUser({ title: t('dialog.error'), message, buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });

/** Recortar imagen: the image gets a rectangular mask the size of the image, ready to be pulled in. */
export function cropSelectedImage(): void {
  const s = selectedFacts();
  if (!s || s.facts.crop) return;
  const { c, facts } = s;
  const { command, clip } = cropImage(c.session.ids, c.space.id, facts.image, { x: 0, y: 0, w: facts.image.width, h: facts.image.height });
  c.session.run(command, selectOnly(c.space.id, [clip.id]));
  startCropMode(clip.id);
}

/** The handles live in the Selection tool, so it takes over. */
function startCropMode(clipId: string): void {
  const ui = useUi.getState();
  ui.setActiveTool('tool-select');
  ui.setCropMode(clipId);
}

/** Turns the on-canvas crop handles on or off for the selected crop. */
export function toggleCropMode(): void {
  const s = selectedFacts();
  if (!s?.facts.crop) return;
  const ui = useUi.getState();
  if (ui.cropMode === s.facts.crop.clip.id) ui.setCropMode(null);
  else startCropMode(s.facts.crop.clip.id);
}

/** Moves the edges of the crop; `insets` are distances from each side of the image, in image units. */
export function setCropInsets(insets: Partial<Record<'left' | 'top' | 'right' | 'bottom', number>>): void {
  const s = selectedFacts();
  if (!s?.facts.crop) return;
  const { c, facts } = s;
  const { rect } = facts.crop!;
  const image = facts.image;
  const left = insets.left ?? rect.x;
  const top = insets.top ?? rect.y;
  const right = insets.right ?? image.width - rect.x - rect.w;
  const bottom = insets.bottom ?? image.height - rect.y - rect.h;
  const next: CropRect = { x: left, y: top, w: image.width - left - right, h: image.height - top - bottom };
  c.session.run(recropImage(c.space.id, facts.crop!, next, 'crop-insets'));
}

/** Quitar recorte: the whole image again. */
export function removeSelectedCrop(): void {
  const s = selectedFacts();
  if (!s?.facts.crop) return;
  const { c, facts } = s;
  c.session.run(uncropImage(c.space.id, facts.crop!), selectOnly(c.space.id, [facts.image.id]));
}

/** Aplicar recorte: the pixels outside the window are thrown away; what stays is a new, smaller picture. */
export async function applySelectedCrop(): Promise<void> {
  const s = selectedFacts();
  if (!s?.facts.crop || !s.facts.resource) return;
  const { c, facts } = s;
  const crop = facts.crop!;
  const bytes = c.session.images.get(facts.image.resourceId);
  if (!bytes) return;
  const window = pixelWindow(crop, s.facts.resource);
  try {
    const cut = await cropPicture(bytes, window);
    const added = c.session.images.add(cut);
    if (!added) throw new Error('Not a picture');
    const { command, image } = applyCrop(c.session.ids, c.space.id, crop, window, added.hash, { width: added.info.width, height: added.info.height, format: added.info.format });
    c.session.run(command, selectOnly(c.space.id, [image.id]));
  } catch {
    await alertOk(t('image.cropFailed'));
  }
}

const EXTENSION = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;

/** Incrustar: the picture travels inside the document again. */
export function embedSelectedImage(): void {
  const s = selectedFacts();
  if (!s || s.facts.link !== 'linked' || !s.facts.resource) return;
  const { c, facts } = s;
  c.session.run(setImageSource([{ spaceId: c.space.id, node: facts.image }], { hash: facts.image.resourceId, resource: facts.resource!, embedded: true }));
}

/** Desincrustar: the picture is saved to a file the user picks, and the image links to it. */
export async function unembedSelectedImage(): Promise<void> {
  const s = selectedFacts();
  if (!s || s.facts.link !== 'embedded' || !s.facts.resource) return;
  const { c, facts } = s;
  const bytes = c.session.images.get(facts.image.resourceId);
  if (!bytes) return;
  const format = facts.resource!.format;
  const saved = await window.victoria.exportSaveFile({
    title: t('image.unembedTitle'),
    suggestedName: `${t('image.defaultName')}.${EXTENSION[format]}`,
    filterName: t('image.unembedFilter'),
    extension: EXTENSION[format],
    bytes,
  });
  if (!saved) return;
  c.session.run(setImageSource([{ spaceId: c.space.id, node: facts.image }], { hash: facts.image.resourceId, resource: facts.resource!, embedded: false, linkedPath: saved.path }));
}

/** Reubicar: another file stands for the missing one, in every image that was linked to the same path. */
export async function relinkSelectedImage(): Promise<void> {
  const s = selectedFacts();
  if (!s || s.facts.link === 'embedded') return;
  const { c, facts } = s;
  const picked = (await window.victoria.openImages({ title: t('image.relinkTitle'), filterName: t('image.relinkFilter') }))[0];
  if (!picked) return;
  const info = sniffImage(picked.bytes);
  const added = info ? c.session.images.add(picked.bytes) : null;
  if (!info || !added) {
    await alertOk(t('image.unsupported', { names: picked.path.split(/[\\/]/).pop() ?? picked.path }));
    return;
  }
  const old = facts.image.linkedPath;
  const targets = imageNodes(c.session.document).filter(({ node }) => node.id === facts.image.id || (!node.embedded && node.linkedPath === old && !c.session.images.has(node.resourceId)));
  c.session.run(setImageSource(targets, { hash: added.hash, resource: { width: info.width, height: info.height, format: info.format }, embedded: false, linkedPath: picked.path }));
}
