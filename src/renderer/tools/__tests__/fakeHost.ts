import { vi } from 'vitest';
import {
  addNode,
  createEllipse,
  createGroup,
  createPath,
  createRect,
  defaultAppearance,
  DocumentSession,
  getActiveSpace,
  hitTest,
  sequentialIds,
  translation,
  type Anchor,
  type Appearance,
  type Hit,
  type Node,
  type PathNode,
  type SnapSources,
  type Space,
  type Units,
  type Vec2,
  type Viewport,
} from '../../../core';
import { createDocument } from '../../../core';
import type { ShapeToolKind } from '../shapeDrag';
import type { CanvasPointerEvent, Tool, ToolHost, TransformKind } from '../types';

export interface HostInit {
  view?: Viewport;
  isolation?: string | null;
  options?: Partial<{ smartGuides: boolean; snapGrid: boolean; guides: boolean; hideEdges: boolean; showHandles: boolean }>;
  confirmAnswer?: string;
  units?: Units;
}

/** A ToolHost over a real document session; screen coordinates equal document points at zoom 1. */
export function createTestHost(init: HostInit = {}) {
  const ids = sequentialIds('t');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 1000 });
  let gesture = 0;

  type MutableHost = { -readonly [K in keyof ToolHost]: ToolHost[K] };
  const host: MutableHost = {
    view: init.view ?? { zoom: 1, panX: 0, panY: 0 },
    size: { width: 1000, height: 700 },
    setView: vi.fn((v: Viewport) => {
      host.view = v;
    }),
    invalidateOverlay: vi.fn(),
    setHover: vi.fn(),
    hitAt: (doc: Vec2): Hit | null => host.hitTest(doc)[0] ?? null,
    session,
    get space(): Space {
      return getActiveSpace(session.document);
    },
    isolation: init.isolation ?? null,
    options: { smartGuides: false, snapGrid: false, guides: true, hideEdges: false, showHandles: true, ...init.options },
    units: init.units ?? 'pt',
    get pickTolerance(): number {
      return 4 / host.view.zoom;
    },
    hitTest: (doc: Vec2): Hit[] => hitTest(getActiveSpace(session.document), doc, { tolerance: host.pickTolerance, isolation: host.isolation }),
    snapSources(exclude: ReadonlySet<string>): SnapSources {
      const space = getActiveSpace(session.document);
      return {
        guides: host.options.guides ? space.guides : null,
        grid: host.options.snapGrid ? { size: space.grid.size, subdivisions: space.grid.subdivisions } : null,
        artboards: host.options.smartGuides ? space.artboards : null,
        objects: host.options.smartGuides ? { space, exclude } : null,
      };
    },
    setSnapLines: vi.fn(),
    setMeasure: vi.fn(),
    gestureKey: () => `k${++gesture}`,
    confirm: vi.fn(async () => init.confirmAnswer ?? 'convert'),
    setIsolation: vi.fn((id: string | null) => {
      host.isolation = id;
    }),
    newAppearance: () => defaultAppearance(),
    activePaint: 'fill',
    setNewAppearance: vi.fn<(appearance: Appearance) => void>(),
    get activeLayerId(): string | null {
      return getActiveSpace(session.document).layers[0]?.id ?? null;
    },
    openShapeDialog: vi.fn<(kind: ShapeToolKind, at: Vec2) => void>(),
    openTransformDialog: vi.fn<(kind: TransformKind, origin: Vec2 | null) => void>(),
    rememberTransform: vi.fn(),
  };

  const spaceId = () => getActiveSpace(session.document).id;
  const layerId = () => getActiveSpace(session.document).layers[0]!.id;
  const add = <T extends Node>(node: T): T => {
    session.run(addNode(spaceId(), layerId(), node));
    return node;
  };

  /** Nodes with a plain white fill and no stroke (so hits are about the fill only). */
  const solid = <T extends Node>(node: T): T => {
    node.appearance.items = node.appearance.items.filter((i) => i.kind === 'fill');
    return node;
  };
  interface Style {
    fill?: boolean;
    stroke?: number;
    locked?: boolean;
    hidden?: boolean;
  }
  const style = <T extends Node>(node: T, s: Style): T => {
    node.appearance.items = node.appearance.items.filter((i) => (i.kind === 'fill' ? s.fill !== false : s.stroke !== undefined));
    for (const i of node.appearance.items) if (i.kind === 'stroke' && s.stroke !== undefined) i.stroke.width = s.stroke;
    if (s.locked) node.locked = true;
    if (s.hidden) node.visible = false;
    return node;
  };
  /** A rectangle that is not in the document yet (to be put inside a group). */
  const newRect = (x: number, y: number, w = 100, h = 100, s: Style = {}) => {
    const r = style(createRect(ids, w, h), s);
    r.transform = translation(x, y);
    return r;
  };
  const rect = (x: number, y: number, w = 100, h = 100, s: Style = {}) => add(newRect(x, y, w, h, s));
  const ellipse = (x: number, y: number, w = 100, h = 100) => {
    const e = solid(createEllipse(ids, w, h));
    e.transform = translation(x, y);
    return add(e);
  };
  const group = (children: Node[], x = 0, y = 0) => {
    const g = createGroup(ids, children);
    g.transform = translation(x, y);
    return add(g);
  };
  const path = (anchors: Anchor[], closed = true, fill = true) => {
    const p = createPath(ids, anchors, closed) as PathNode;
    p.appearance.items = p.appearance.items.filter((i) => (i.kind === 'fill' ? fill : true));
    return add(p);
  };
  const space = (): Space => getActiveSpace(session.document);
  return { host, session, ids, add, rect, newRect, ellipse, group, path, spaceId, layerId, solid, space };
}

export type TestHost = ReturnType<typeof createTestHost>;

export const ev = (x: number, y: number, extra: Partial<CanvasPointerEvent> = {}): CanvasPointerEvent => ({
  screen: { x, y },
  doc: { x, y },
  button: 0,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  clickCount: 1,
  ...extra,
});

export const click = (tool: Tool, t: TestHost, x: number, y: number, extra: Partial<CanvasPointerEvent> = {}) => {
  tool.onPointerDown(ev(x, y, extra), t.host);
  tool.onPointerUp(ev(x, y, extra), t.host);
};

/** Press, move through `steps` intermediate points, release. */
export const drag = (tool: Tool, t: TestHost, from: Vec2, to: Vec2, extra: Partial<CanvasPointerEvent> = {}, steps = 4) => {
  tool.onPointerDown(ev(from.x, from.y, extra), t.host);
  for (let i = 1; i <= steps; i++) {
    tool.onPointerMove(ev(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, extra), t.host);
  }
  tool.onPointerUp(ev(to.x, to.y, extra), t.host);
};

export const selectedIds = (t: TestHost): string[] => t.session.selection.ids;
export const nodeX = (t: TestHost, id: string): number => {
  const space = getActiveSpace(t.session.document);
  const find = (children: readonly unknown[]): Node | null => {
    for (const c of children as Node[]) {
      if ((c as Node).id === id) return c as Node;
      if ((c as Node).type === 'group' || (c as Node).type === 'clipGroup') {
        const f = find((c as { children: Node[] }).children);
        if (f) return f;
      }
    }
    return null;
  };
  const node = find(space.layers[0]!.children);
  return node ? node.transform[4] : NaN;
};
export const nodeY = (t: TestHost, id: string): number => {
  const space = getActiveSpace(t.session.document);
  const node = (space.layers[0]!.children as Node[]).find((n) => n.id === id);
  return node ? node.transform[5] : NaN;
};
