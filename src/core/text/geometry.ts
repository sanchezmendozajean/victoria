import { subPathBounds, type SubPath } from '../geometry/path';
import { unionRect, type Rect } from '../geometry/rect';
import type { Anchor, Matrix, TextNode, Vec2 } from '../model/types';
import { fontEpoch, type PathCmd } from './font';
import { layoutText, framePolygons, type PlacedGlyph, type TextLayout } from './layout';
import { DEFAULT_PATH_OPTIONS, layoutTextOnPath, type PathGlyph } from './onPath';

const corner = (p: Vec2, inn: Vec2 | null = null, out: Vec2 | null = null): Anchor => ({ p, in: inn, out, kind: 'corner' });
const same = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;

/** Font-unit outline → contours with cubic handles. `place` maps a font-unit point into text space. */
export function commandsToSubPaths(commands: readonly PathCmd[], place: (x: number, y: number) => Vec2): SubPath[] {
  const out: SubPath[] = [];
  let anchors: Anchor[] = [];
  const finish = (closed: boolean) => {
    if (anchors.length === 0) return;
    if (closed && anchors.length > 1 && same((anchors[0] as Anchor).p, (anchors[anchors.length - 1] as Anchor).p)) {
      const last = anchors.pop() as Anchor;
      (anchors[0] as Anchor).in = last.in;
    }
    if (anchors.length > 1) out.push({ anchors, closed });
    anchors = [];
  };
  const link = (c1: Vec2 | null, c2: Vec2 | null, p: Vec2) => {
    const prev = anchors[anchors.length - 1] as Anchor;
    if (c1) prev.out = c1;
    anchors.push(corner(p, c2));
  };
  let current: Vec2 = { x: 0, y: 0 };
  for (const c of commands) {
    switch (c.t) {
      case 'M':
        finish(false);
        current = place(c.x, c.y);
        anchors.push(corner(current));
        break;
      case 'L': {
        const p = place(c.x, c.y);
        link(null, null, p);
        current = p;
        break;
      }
      case 'Q': {
        const q = place(c.x1, c.y1);
        const p = place(c.x, c.y);
        link({ x: current.x + (2 / 3) * (q.x - current.x), y: current.y + (2 / 3) * (q.y - current.y) }, { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, p);
        current = p;
        break;
      }
      case 'C': {
        const p = place(c.x, c.y);
        link(place(c.x1, c.y1), place(c.x2, c.y2), p);
        current = p;
        break;
      }
      case 'Z':
        finish(true);
        break;
    }
  }
  finish(false);
  return out;
}

/** The contours of one placed glyph in text space; `matrix` (text on a path) maps glyph-relative coordinates, otherwise the glyph sits at its own position. */
export function glyphSubPaths(g: PlacedGlyph, matrix?: Matrix): SubPath[] {
  const data = g.font.glyph(g.ch);
  if (data.commands.length === 0) return [];
  const rot = ((g.style.charRotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const scaleX = (g.size / g.font.unitsPerEm) * g.sx;
  const scaleY = (g.size / g.font.unitsPerEm) * g.sy;
  const half = g.advance / 2;
  return commandsToSubPaths(data.commands, (x, y) => {
    // Glyph space: x along the baseline, y down. Characters rotate around the middle of their advance.
    let lx = x * scaleX;
    let ly = -y * scaleY;
    if (rot !== 0) {
      const dx = lx - half;
      lx = half + dx * cos - ly * sin;
      ly = dx * sin + ly * cos;
    }
    if (matrix) return { x: matrix[0] * lx + matrix[2] * ly + matrix[4], y: matrix[1] * lx + matrix[3] * ly + matrix[5] };
    return { x: g.x + lx, y: g.y + ly };
  });
}

export interface TextGeometry {
  /** Glyph outlines (and decoration rules): what is painted. */
  subpaths: SubPath[];
  /** Closed polygons that count as "the text" when clicking: line boxes, or the frame of area text. */
  boxes: Vec2[][];
  /** Local bounds of the object as selected: the frame of area text, otherwise the lines or glyphs. */
  bounds: Rect | null;
  layout: TextLayout | null;
  /** Glyph matrices for text on a path. */
  pathGlyphs: PathGlyph[] | null;
  overflowAt: number | null;
  missingFont: boolean;
}

const rectPoly = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function compute(node: TextNode): TextGeometry {
  const subpaths: SubPath[] = [];
  const boxes: Vec2[][] = [];
  let bounds: Rect | null = null;
  const add = (r: Rect | null) => {
    bounds = unionRect(bounds, r);
  };

  if (node.kind === 'onPath' && node.path && node.path.anchors.length > 1) {
    const result = layoutTextOnPath(node.story, node.path, node.pathOptions ?? DEFAULT_PATH_OPTIONS, node.paragraphs);
    for (const pg of result.glyphs) {
      for (const sp of glyphSubPaths(pg.glyph, pg.matrix)) {
        subpaths.push(sp);
        add(subPathBounds(sp));
      }
      const m = pg.matrix;
      const a = pg.glyph.advance;
      const top = -pg.glyph.size * 0.9;
      const bottom = pg.glyph.size * 0.25;
      boxes.push([
        [0, top],
        [a, top],
        [a, bottom],
        [0, bottom],
      ].map(([x, y]) => ({ x: m[0] * (x as number) + m[2] * (y as number) + m[4], y: m[1] * (x as number) + m[3] * (y as number) + m[5] })));
    }
    return { subpaths, boxes, bounds, layout: result.layout, pathGlyphs: result.glyphs, overflowAt: result.overflowAt, missingFont: result.layout.missingFont };
  }

  const frame = node.kind === 'area' ? node.frame : undefined;
  const layout = layoutText({ story: node.story, kind: node.kind === 'area' && frame ? 'area' : 'point', ...(node.paragraphs ? { paragraphs: node.paragraphs } : {}), ...(frame ? { frame } : {}) });
  for (const g of layout.glyphs) {
    for (const sp of glyphSubPaths(g)) {
      subpaths.push(sp);
    }
  }
  for (const d of layout.decorations) {
    const sp: SubPath = {
      anchors: [corner({ x: d.x0, y: d.y - d.thickness / 2 }), corner({ x: d.x1, y: d.y - d.thickness / 2 }), corner({ x: d.x1, y: d.y + d.thickness / 2 }), corner({ x: d.x0, y: d.y + d.thickness / 2 })],
      closed: true,
    };
    subpaths.push(sp);
  }
  for (const line of layout.lines) boxes.push(rectPoly(line.x, line.y - line.ascent, line.x + Math.max(line.width, 1), line.y + line.descent));
  if (frame && frame.anchors.length >= 3) {
    for (const poly of framePolygons(frame)) {
      boxes.push(poly);
      add({ minX: Math.min(...poly.map((p) => p.x)), minY: Math.min(...poly.map((p) => p.y)), maxX: Math.max(...poly.map((p) => p.x)), maxY: Math.max(...poly.map((p) => p.y)) });
    }
  } else if (layout.lines.length > 0) {
    add(layout.bounds);
  }
  if (!bounds) {
    // An empty text box still has a place: a hair-thin box at its origin.
    add({ minX: 0, minY: -8, maxX: 1, maxY: 2 });
  }
  return { subpaths, boxes, bounds, layout, pathGlyphs: null, overflowAt: layout.overflowAt, missingFont: layout.missingFont };
}

const cache = new WeakMap<TextNode, { epoch: number; geometry: TextGeometry }>();

/** Geometry of a text object in its local space. Cached per immutable node and per set of loaded fonts. */
export function textGeometry(node: TextNode): TextGeometry {
  const epoch = fontEpoch();
  const hit = cache.get(node);
  if (hit && hit.epoch === epoch) return hit.geometry;
  const geometry = compute(node);
  cache.set(node, { epoch, geometry });
  return geometry;
}
