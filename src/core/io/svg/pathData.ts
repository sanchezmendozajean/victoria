import type { Anchor, Vec2 } from '../../model/types';

/** One contour read from a path's `d` attribute. */
export interface PathContour {
  anchors: Anchor[];
  closed: boolean;
}

const EPS = 1e-6;
const CMD_ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

type Token = { cmd: string } | { num: number };

/** Numbers as SVG allows them: `1.5.5`, `-1-2`, `1e-3`, and arc flags written without separators (`a1 1 0 00.5.5`). */
function tokenize(d: string): Token[] | null {
  const out: Token[] = [];
  const re = /\s*,?\s*([MmLlHhVvCcSsQqTtAaZz])|\s*,?\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
  let last = 0;
  let argIndex = 0; // position within an arc's seven arguments, to read flags
  let inArc = false;
  while (last < d.length) {
    const rest = d.slice(last);
    if (/^\s*$/.test(rest)) break;
    if (inArc && (argIndex === 3 || argIndex === 4)) {
      const flag = /^\s*,?\s*([01])/.exec(rest);
      if (!flag) return null;
      out.push({ num: Number(flag[1]) });
      last += flag[0].length;
      argIndex = (argIndex + 1) % 7;
      continue;
    }
    re.lastIndex = last;
    const m = re.exec(d);
    if (!m) return null;
    last = re.lastIndex;
    if (m[1]) {
      out.push({ cmd: m[1] });
      inArc = m[1] === 'a' || m[1] === 'A';
      argIndex = 0;
    } else {
      out.push({ num: Number(m[2]) });
      if (inArc) argIndex = (argIndex + 1) % 7;
    }
  }
  return out;
}

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const near = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** An elliptical arc as cubic Béziers (at most a quarter turn each), from SVG's endpoint form. */
function arcToCubics(from: Vec2, rx: number, ry: number, rotationDeg: number, large: boolean, sweep: boolean, to: Vec2): Array<[Vec2, Vec2, Vec2]> {
  if (near(from, to)) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < EPS || ry < EPS) return [[from, to, to]]; // a degenerate arc is a straight line
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (scale > 1) {
    const s = Math.sqrt(scale);
    rx *= s;
    ry *= s;
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (from.x + to.x) / 2;
  const cy = sin * cxp + cos * cyp + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number, ox: number, oy: number): Vec2 => ({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin + ox, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos + oy });
  const out: Array<[Vec2, Vec2, Vec2]> = [];
  for (let i = 0; i < count; i++) {
    const t0 = theta1 + i * step;
    const t1 = t0 + step;
    const derivative = (t: number): Vec2 => ({ x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos });
    const p0 = point(t0, 0, 0);
    const p1 = point(t1, 0, 0);
    const d0 = derivative(t0);
    const d1 = derivative(t1);
    out.push([add(p0, { x: k * d0.x, y: k * d0.y }), add(p1, { x: -k * d1.x, y: -k * d1.y }), i === count - 1 ? to : p1]);
  }
  return out;
}

/** `smooth` when both handles exist and are collinear on opposite sides of the point, else `corner`. */
export function anchorKind(a: Anchor): Anchor['kind'] {
  if (!a.in || !a.out) return 'corner';
  const ix = a.in.x - a.p.x;
  const iy = a.in.y - a.p.y;
  const ox = a.out.x - a.p.x;
  const oy = a.out.y - a.p.y;
  const cross = ix * oy - iy * ox;
  const dot = ix * ox + iy * oy;
  const scale = Math.hypot(ix, iy) * Math.hypot(ox, oy);
  return scale > EPS && Math.abs(cross) < 1e-4 * scale && dot < 0 ? 'smooth' : 'corner';
}

/**
 * Reads a path's `d` into contours with their handles. Returns what could be read before an error (as browsers do),
 * and whether there was one. All commands, absolute and relative; arcs and quadratics become cubics.
 */
export function parsePathData(d: string): { contours: PathContour[]; error: boolean } {
  const tokens = tokenize(d);
  const contours: PathContour[] = [];
  if (!tokens) return { contours, error: true };

  let current: PathContour | null = null;
  let pos: Vec2 = { x: 0, y: 0 };
  let start: Vec2 = { x: 0, y: 0 };
  let lastCubicControl: Vec2 | null = null;
  let lastQuadControl: Vec2 | null = null;
  let error = false;

  const open = (p: Vec2) => {
    current = { anchors: [{ p, in: null, out: null, kind: 'corner' }], closed: false };
    contours.push(current);
    start = p;
  };
  const ensure = () => {
    if (!current || current.closed) open(pos);
    return current as unknown as PathContour;
  };
  const lineTo = (p: Vec2) => {
    ensure().anchors.push({ p, in: null, out: null, kind: 'corner' });
    pos = p;
  };
  const cubicTo = (c1: Vec2, c2: Vec2, p: Vec2) => {
    const c = ensure();
    const prev = c.anchors[c.anchors.length - 1] as Anchor;
    prev.out = c1;
    c.anchors.push({ p, in: c2, out: null, kind: 'corner' });
    pos = p;
    lastCubicControl = c2;
  };

  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    const t = tokens[i] as Token;
    if ('cmd' in t) {
      cmd = t.cmd;
      i++;
      if (cmd === 'z' || cmd === 'Z') {
        if (current && !(current as PathContour).closed) {
          (current as PathContour).closed = true;
          pos = start;
        }
        lastCubicControl = null;
        lastQuadControl = null;
        continue;
      }
    } else if (!cmd || cmd === 'z' || cmd === 'Z') {
      error = true;
      break;
    }
    // A path must start with a moveto; anything else is an error and nothing is drawn.
    if (!current && cmd.toLowerCase() !== 'm') {
      error = true;
      break;
    }
    const need = CMD_ARGS[cmd.toLowerCase()] ?? 0;
    const args: number[] = [];
    for (let k = 0; k < need; k++) {
      const a = tokens[i + k];
      if (!a || !('num' in a)) {
        error = true;
        break;
      }
      args.push(a.num);
    }
    if (error || args.length < need) {
      error = true;
      break;
    }
    i += need;
    const rel = cmd === cmd.toLowerCase();
    const base = rel ? pos : { x: 0, y: 0 };
    const abs = (x: number, y: number): Vec2 => ({ x: base.x + x, y: base.y + y });
    const [a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0, a6 = 0] = args;
    switch (cmd.toLowerCase()) {
      case 'm': {
        const p = abs(a0, a1);
        open(p);
        pos = p;
        // Further coordinate pairs after a moveto are implicit linetos.
        cmd = rel ? 'l' : 'L';
        lastCubicControl = null;
        lastQuadControl = null;
        continue;
      }
      case 'l':
        lineTo(abs(a0, a1));
        lastCubicControl = lastQuadControl = null;
        break;
      case 'h':
        lineTo({ x: rel ? pos.x + a0 : a0, y: pos.y });
        lastCubicControl = lastQuadControl = null;
        break;
      case 'v':
        lineTo({ x: pos.x, y: rel ? pos.y + a0 : a0 });
        lastCubicControl = lastQuadControl = null;
        break;
      case 'c':
        cubicTo(abs(a0, a1), abs(a2, a3), abs(a4, a5));
        lastQuadControl = null;
        break;
      case 's': {
        const reflected = lastCubicControl ? { x: 2 * pos.x - (lastCubicControl as Vec2).x, y: 2 * pos.y - (lastCubicControl as Vec2).y } : pos;
        cubicTo(reflected, abs(a0, a1), abs(a2, a3));
        lastQuadControl = null;
        break;
      }
      case 'q':
      case 't': {
        const q: Vec2 =
          cmd.toLowerCase() === 'q'
            ? abs(a0, a1)
            : lastQuadControl
              ? { x: 2 * pos.x - (lastQuadControl as Vec2).x, y: 2 * pos.y - (lastQuadControl as Vec2).y }
              : pos;
        const p = cmd.toLowerCase() === 'q' ? abs(a2, a3) : abs(a0, a1);
        const from = pos;
        cubicTo({ x: from.x + (2 / 3) * (q.x - from.x), y: from.y + (2 / 3) * (q.y - from.y) }, { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, p);
        lastQuadControl = q;
        lastCubicControl = null;
        break;
      }
      case 'a': {
        const p = abs(a5, a6);
        const from = pos;
        const arcs = arcToCubics(from, a0, a1, a2, a3 !== 0, a4 !== 0, p);
        if (arcs.length === 0) {
          // Same start and end: nothing is drawn.
        } else if (arcs.length === 1 && near(arcs[0]?.[1] as Vec2, p) && near(arcs[0]?.[2] as Vec2, p)) {
          lineTo(p);
        } else {
          for (const [c1, c2, end] of arcs) cubicTo(c1, c2, end);
        }
        pos = p;
        lastCubicControl = lastQuadControl = null;
        break;
      }
    }
  }

  // A closed contour whose last point returns to the first is one anchor fewer: the closing joins them.
  for (const c of contours) {
    if (c.closed && c.anchors.length > 1) {
      const first = c.anchors[0] as Anchor;
      const last = c.anchors[c.anchors.length - 1] as Anchor;
      if (near(first.p, last.p)) {
        first.in = last.in;
        c.anchors.pop();
      }
    }
    for (const a of c.anchors) a.kind = anchorKind(a);
  }
  return { contours: contours.filter((c) => c.anchors.length > 1 || (c.anchors.length === 1 && c.closed)), error };
}
