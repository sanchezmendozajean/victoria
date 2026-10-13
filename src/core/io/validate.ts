import { collectIds } from '../model/queries';
import type { Document, NodeType } from '../model/types';

export class DocumentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentFormatError';
  }
}

type Rec = Record<string, unknown>;

const NODE_TYPES: readonly NodeType[] = ['path', 'compound', 'shape', 'group', 'clipGroup', 'text', 'image'];
const UNITS = ['px', 'mm', 'cm', 'pt', 'in'];

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(path: string, expected: string): never {
  throw new DocumentFormatError(`${path}: expected ${expected}`);
}
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path, 'string'));
const bool = (v: unknown, path: string): boolean => (typeof v === 'boolean' ? v : fail(path, 'boolean'));
const num = (v: unknown, path: string): number => (typeof v === 'number' ? v : fail(path, 'number'));
const rec = (v: unknown, path: string): Rec => (isRec(v) ? v : fail(path, 'object'));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, 'array'));

/** JSON turns NaN/Infinity into null, which would corrupt a document silently. */
function assertFinite(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, 'a finite number');
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => assertFinite(item, `${path}[${i}]`));
  } else if (isRec(value)) {
    for (const [key, item] of Object.entries(value)) assertFinite(item, `${path}.${key}`);
  }
}

function checkMatrix(v: unknown, path: string): void {
  const m = arr(v, path);
  if (m.length !== 6) fail(path, 'a matrix of 6 numbers');
  m.forEach((n, i) => num(n, `${path}[${i}]`));
}

function checkNode(raw: unknown, path: string): void {
  const node = rec(raw, path);
  str(node.id, `${path}.id`);
  const type = str(node.type, `${path}.type`);
  if (!NODE_TYPES.includes(type as NodeType)) fail(`${path}.type`, `one of ${NODE_TYPES.join(', ')}`);
  bool(node.visible, `${path}.visible`);
  bool(node.locked, `${path}.locked`);
  num(node.opacity, `${path}.opacity`);
  str(node.blendMode, `${path}.blendMode`);
  checkMatrix(node.transform, `${path}.transform`);
  arr(rec(node.appearance, `${path}.appearance`).items, `${path}.appearance.items`);

  if (type === 'path') {
    bool(node.closed, `${path}.closed`);
    arr(node.anchors, `${path}.anchors`).forEach((a, i) => {
      const anchor = rec(a, `${path}.anchors[${i}]`);
      rec(anchor.p, `${path}.anchors[${i}].p`);
      str(anchor.kind, `${path}.anchors[${i}].kind`);
    });
  } else if (type === 'compound') {
    str(node.fillRule, `${path}.fillRule`);
    arr(node.children, `${path}.children`).forEach((c, i) => checkNode(c, `${path}.children[${i}]`));
  } else if (type === 'shape') {
    str(node.shape, `${path}.shape`);
    rec(node.params, `${path}.params`);
  } else if (type === 'group' || type === 'clipGroup') {
    arr(node.children, `${path}.children`).forEach((c, i) => checkNode(c, `${path}.children[${i}]`));
  } else if (type === 'text') {
    str(node.kind, `${path}.kind`);
    arr(node.story, `${path}.story`);
  } else if (type === 'image') {
    str(node.resourceId, `${path}.resourceId`);
  }
}

/** Structural check of `document.json`. Throws DocumentFormatError with the offending path. */
export function assertDocument(raw: unknown): asserts raw is Document {
  const doc = rec(raw, 'document');
  assertFinite(doc, 'document');

  const meta = rec(doc.meta, 'meta');
  str(meta.id, 'meta.id');
  str(meta.name, 'meta.name');
  num(meta.version, 'meta.version');
  str(meta.created, 'meta.created');
  str(meta.modified, 'meta.modified');
  if (!UNITS.includes(str(meta.units, 'meta.units'))) fail('meta.units', UNITS.join(' | '));
  str(meta.colorMode, 'meta.colorMode');

  const resources = rec(doc.resources, 'resources');
  for (const key of ['swatches', 'gradients', 'modifierPresets']) arr(resources[key], `resources.${key}`);
  rec(resources.images, 'resources.images');
  rec(resources.fonts, 'resources.fonts');

  const spaces = arr(doc.spaces, 'spaces');
  if (spaces.length === 0) fail('spaces', 'at least one Space');
  spaces.forEach((s, i) => {
    const path = `spaces[${i}]`;
    const space = rec(s, path);
    str(space.id, `${path}.id`);
    str(space.name, `${path}.name`);
    str(space.color, `${path}.color`);
    num(space.order, `${path}.order`);
    bool(space.excludeFromExport, `${path}.excludeFromExport`);
    rec(space.view, `${path}.view`);
    rec(space.grid, `${path}.grid`);
    arr(space.guides, `${path}.guides`);
    arr(space.artboards, `${path}.artboards`).forEach((a, j) => {
      const artboard = rec(a, `${path}.artboards[${j}]`);
      str(artboard.id, `${path}.artboards[${j}].id`);
      for (const k of ['x', 'y', 'w', 'h']) num(artboard[k], `${path}.artboards[${j}].${k}`);
    });
    arr(space.layers, `${path}.layers`).forEach((l, j) => {
      const layer = rec(l, `${path}.layers[${j}]`);
      str(layer.id, `${path}.layers[${j}].id`);
      bool(layer.visible, `${path}.layers[${j}].visible`);
      bool(layer.locked, `${path}.layers[${j}].locked`);
      arr(layer.children, `${path}.layers[${j}].children`).forEach((n, k) => checkNode(n, `${path}.layers[${j}].children[${k}]`));
    });
  });

  const active = str(doc.activeSpaceId, 'activeSpaceId');
  if (!(spaces as Rec[]).some((s) => s.id === active)) fail('activeSpaceId', 'the id of an existing Space');

  const ids = collectIds(raw as Document);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new DocumentFormatError(`duplicate id "${id}"`);
    seen.add(id);
  }
}
