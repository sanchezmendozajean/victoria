import type { Draft } from 'immer';
import { locateNode } from '../model/queries';
import { createGroup } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import type { CompoundNode, Document, GroupNode, LayerChild, Node, ParagraphStyle, PathNode, PathTextOptions, Space, TextNode, TextPath, TextRun, TextStyle } from '../model/types';
import { editParagraphs, styleAll, styleRange } from '../text/edit';
import { glyphSubPaths, textGeometry } from '../text/geometry';
import { plainText } from '../text/layout';
import type { Command } from './command';

type DraftSpace = Draft<Space>;
type TextMatrix = [number, number, number, number, number, number];
const findSpace = (d: Draft<Document>, id: string): DraftSpace | undefined => d.spaces.find((s) => s.id === id);
const textOf = (space: DraftSpace | undefined, id: string): Draft<TextNode> | null => {
  const found = space ? locateNode(space, id) : null;
  return found && found.node.type === 'text' ? (found.node as Draft<TextNode>) : null;
};
const mergeKeyOf = (label: string, key?: string) => (key ? { mergeKey: `${label}:${key}` } : {});

/** Typing, deleting and pasting: replaces the story (and keeps paragraph styles in step with the breaks). */
export const setTextContent = (spaceId: string, id: string, story: TextRun[], edit?: { from: number; to: number; inserted: string }, mergeKey?: string): Command => ({
  label: 'text.edit',
  spaceId,
  ...mergeKeyOf('text.edit', mergeKey ? `${id}:${mergeKey}` : undefined),
  apply: (d) => {
    const node = textOf(findSpace(d, spaceId), id);
    if (!node) return;
    if (edit && node.paragraphs) node.paragraphs = editParagraphs(node.paragraphs as ParagraphStyle[], plainText(node.story as TextRun[]), edit.from, edit.to, edit.inserted) as Draft<ParagraphStyle[]>;
    node.story = story as Draft<TextRun[]>;
  },
});

export type TextRanges = ReadonlyMap<string, readonly [number, number]>;

/** Character attributes of the whole of each text object, or of a range of it (while editing). */
export const styleText = (spaceId: string, ids: readonly string[], patch: Partial<TextStyle>, ranges?: TextRanges, mergeKey?: string): Command => ({
  label: 'text.style',
  spaceId,
  ...mergeKeyOf('text.style', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    for (const id of ids) {
      const node = textOf(space, id);
      if (!node) continue;
      const range = ranges?.get(id);
      node.story = (range ? styleRange(node.story as TextRun[], range[0], range[1], patch) : styleAll(node.story as TextRun[], patch)) as Draft<TextRun[]>;
    }
  },
});

/** Paragraph attributes for the given paragraph indices of each text object (all paragraphs when `which` is omitted). */
export const styleParagraphs = (spaceId: string, ids: readonly string[], patch: Partial<ParagraphStyle>, which?: ReadonlyMap<string, readonly number[]>, mergeKey?: string): Command => ({
  label: 'text.paragraph',
  spaceId,
  ...mergeKeyOf('text.paragraph', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    for (const id of ids) {
      const node = textOf(space, id);
      if (!node) continue;
      const count = plainText(node.story as TextRun[]).split('\n').length;
      const list = (node.paragraphs ?? []) as ParagraphStyle[];
      const next = Array.from({ length: Math.max(count, list.length) }, (_, i) => ({ ...(list[i] ?? {}) }));
      for (const i of which?.get(id) ?? next.keys()) {
        const target = next[i] as Record<string, unknown> | undefined;
        if (!target) continue;
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) delete target[k];
          else target[k] = v;
        }
      }
      node.paragraphs = next as Draft<ParagraphStyle[]>;
    }
  },
});

/** Options of text on a path (effect, alignment, spacing, flip, bracket positions). */
export const setPathTextOptions = (spaceId: string, id: string, patch: Partial<PathTextOptions>, mergeKey?: string): Command => ({
  label: 'text.pathOptions',
  spaceId,
  ...mergeKeyOf('text.pathOptions', mergeKey ? `${id}:${mergeKey}` : undefined),
  apply: (d) => {
    const node = textOf(findSpace(d, spaceId), id);
    if (!node || !node.pathOptions) return;
    Object.assign(node.pathOptions, patch);
  },
});

/** Resizes the frame of area text (the shape is replaced as a whole). */
export const setTextFrame = (spaceId: string, id: string, frame: TextPath, mergeKey?: string): Command => ({
  label: 'text.frame',
  spaceId,
  ...mergeKeyOf('text.frame', mergeKey ? `${id}:${mergeKey}` : undefined),
  apply: (d) => {
    const node = textOf(findSpace(d, spaceId), id);
    if (node) node.frame = frame as Draft<TextPath>;
  },
});

/** Point ↔ area (the widget on the right of the box): a point text gets a frame as wide as it is, an area text drops it. */
export const convertTextKind = (spaceId: string, id: string, to: 'point' | 'area'): Command => ({
  label: 'text.convert',
  spaceId,
  apply: (d) => {
    const node = textOf(findSpace(d, spaceId), id);
    if (!node || node.kind === 'onPath' || node.kind === to) return;
    if (to === 'point') {
      // The first baseline of the area text becomes the origin of the point text.
      const geometry = textGeometry(node as TextNode);
      const first = geometry.layout?.lines[0];
      const bounds = geometry.bounds;
      node.kind = 'point';
      if (first) {
        const dx = bounds ? bounds.minX : 0;
        node.transform = [node.transform[0], node.transform[1], node.transform[2], node.transform[3], node.transform[4] + node.transform[0] * dx + node.transform[2] * first.y, node.transform[5] + node.transform[1] * dx + node.transform[3] * first.y];
      }
      delete node.frame;
      return;
    }
    const geometry = textGeometry(node as TextNode);
    const b = geometry.bounds ?? { minX: 0, minY: -10, maxX: 100, maxY: 10 };
    const width = Math.max(40, b.maxX - b.minX);
    const height = Math.max(20, b.maxY - b.minY);
    const top = b.minY;
    node.kind = 'area';
    node.frame = {
      anchors: [
        { p: { x: b.minX, y: top }, in: null, out: null, kind: 'corner' },
        { p: { x: b.minX + width, y: top }, in: null, out: null, kind: 'corner' },
        { p: { x: b.minX + width, y: top + height }, in: null, out: null, kind: 'corner' },
        { p: { x: b.minX, y: top + height }, in: null, out: null, kind: 'corner' },
      ],
      closed: true,
    } as Draft<TextPath>;
  },
});

/**
 * Texto › Crear contornos (Mayús+Ctrl+O): each text object becomes a group with one compound path per
 * character (the counters of "o", "a"… are holes), painted like the text. Spaces vanish.
 */
export const createOutlines = (spaceId: string, ids: readonly string[], newIds: IdGenerator): Command => ({
  label: 'text.outlines',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const id of ids) {
      const found = space ? locateNode(space, id) : null;
      if (!found || found.node.type !== 'text') continue;
      const node = found.node as TextNode;
      const geometry = textGeometry(JSON.parse(JSON.stringify(node)) as TextNode);
      const placed = geometry.pathGlyphs ?? (geometry.layout?.glyphs ?? []).map((glyph) => ({ glyph, matrix: undefined as TextMatrix | undefined }));
      const children: Node[] = [];
      for (const { glyph, matrix } of placed) {
        const subs = glyphSubPaths(glyph, matrix);
        if (subs.length === 0) continue;
        const paths: PathNode[] = subs.map((sp) => ({
          id: newIds(),
          type: 'path',
          visible: true,
          locked: false,
          transform: [1, 0, 0, 1, 0, 0],
          appearance: { items: [] },
          opacity: 1,
          blendMode: 'normal',
          closed: sp.closed,
          anchors: sp.anchors,
        }));
        const compound: CompoundNode = {
          id: newIds(),
          type: 'compound',
          visible: true,
          locked: false,
          transform: [1, 0, 0, 1, 0, 0],
          appearance: JSON.parse(JSON.stringify(node.appearance)) as CompoundNode['appearance'],
          opacity: 1,
          blendMode: 'normal',
          children: paths,
          fillRule: 'nonzero',
        };
        children.push(compound);
      }
      // Decorations (underline, strikethrough) follow the glyphs as plain filled rectangles.
      if (!geometry.pathGlyphs) {
        for (const deco of geometry.layout?.decorations ?? []) {
          const y0 = deco.y - deco.thickness / 2;
          const y1 = deco.y + deco.thickness / 2;
          const corner = (x: number, y: number) => ({ p: { x, y }, in: null, out: null, kind: 'corner' as const });
          children.push({
            id: newIds(),
            type: 'path',
            visible: true,
            locked: false,
            transform: [1, 0, 0, 1, 0, 0],
            appearance: JSON.parse(JSON.stringify(node.appearance)) as PathNode['appearance'],
            opacity: 1,
            blendMode: 'normal',
            closed: true,
            anchors: [corner(deco.x0, y0), corner(deco.x1, y0), corner(deco.x1, y1), corner(deco.x0, y1)],
          });
        }
      }
      const group: GroupNode = { ...createGroup(newIds, children as GroupNode['children']), transform: [...node.transform] as GroupNode['transform'], opacity: node.opacity, blendMode: node.blendMode, name: node.name ?? 'Texto' };
      found.siblings.splice(found.index, 1, group as unknown as Draft<LayerChild>);
    }
  },
});

