import { createClipGroup, createCompound, createGroup, createPath, defaultStroke } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import { applyToPoint, IDENTITY, invert, multiply, rotation, scaling, translation } from '../model/matrix';
import type { Anchor, AppearanceItem, ClipGroupNode, Color, Matrix, Node, PathNode, StrokeStyle, Vec2 } from '../model/types';

// Reader of simple EPS files (specs/08 · Formatos EPS y AI). It is a small PostScript interpreter that
// understands what vector EPS files are made of: paths, solid colours, strokes, dashes, clipping, procedures
// and the compact operators of Adobe Illustrator's own EPS dialect (AI3–AI8). Images, text, shadings,
// patterns, gradients, fonts and binary sections are not supported: they are skipped and reported.

export interface EpsResult {
  /** Size of the bounding box, pt. */
  width: number;
  height: number;
  /** Top-level objects, bottom to top, in artboard coordinates (Y down, origin at the box corner). */
  nodes: Node[];
  /** What was skipped or approximated (already-translated strings are the caller's job: these are codes + detail). */
  warnings: EpsWarning[];
}

export type EpsWarning = { code: 'text' | 'image' | 'gradient' | 'pattern' | 'operator' | 'halted' | 'limit'; detail?: string };

export class EpsFormatError extends Error {}

type Str = { k: 'str'; v: string };
type Lit = { k: 'lit'; v: string };
type Op = { k: 'op'; v: string };
type Proc = { k: 'proc'; v: Item[] };
type Arr = { k: 'arr'; v: Val[] };
type Dict = { k: 'dict'; v: Map<string, Val> };
type Mark = { k: 'mark' };
type Val = number | boolean | Str | Lit | Proc | Arr | Dict | Mark;
type Item = Val | Op;

const MAX_STEPS = 4_000_000;
const MAX_NODES = 200_000;

// ── Text decoding ──

function latin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}

/** Unwraps a DOS EPS binary header (preview + PostScript sections) and returns the PostScript text. */
function postscriptOf(bytes: Uint8Array): string {
  if (bytes.length > 30 && bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6) {
    const u32 = (o: number) => (bytes[o] as number) + (bytes[o + 1] as number) * 256 + (bytes[o + 2] as number) * 65536 + (bytes[o + 3] as number) * 16777216;
    return latin1(bytes.subarray(u32(4), u32(4) + u32(8)));
  }
  return latin1(bytes);
}

function boundingBox(text: string): [number, number, number, number] {
  const find = (name: string): [number, number, number, number] | null => {
    const re = new RegExp(`^%%${name}:\\s*(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)`, 'gm');
    let last: RegExpExecArray | null = null;
    for (let m = re.exec(text); m; m = re.exec(text)) last = m;
    return last ? [Number(last[1]), Number(last[2]), Number(last[3]), Number(last[4])] : null;
  };
  const box = find('HiResBoundingBox') ?? find('BoundingBox');
  if (!box || box[2] <= box[0] || box[3] <= box[1]) throw new EpsFormatError('missing bounding box');
  return box;
}

/** Removes the regions an Illustrator EPS fills with its own prolog and with gradient/pattern definitions. */
function stripIllustrator(text: string, warnings: EpsWarning[]): string {
  const cut = (from: string, to: string, warning?: EpsWarning['code']) => {
    let out = '';
    let at = 0;
    for (;;) {
      const a = text.indexOf(from, at);
      if (a < 0) break;
      const b = text.indexOf(to, a);
      if (b < 0) break;
      out += text.slice(at, a);
      at = b + to.length;
      if (warning && !warnings.some((w) => w.code === warning)) warnings.push({ code: warning });
    }
    text = out + text.slice(at);
  };
  cut('%%BeginProlog', '%%EndProlog');
  cut('%%BeginSetup', '%%EndSetup');
  cut('%AI5_BeginGradient', '%AI5_EndGradient', 'gradient');
  cut('%AI5_BeginPattern', '%AI5_EndPattern', 'pattern');
  return text;
}

// ── Tokenizer ──

const WS = new Set([' ', '\t', '\n', '\r', '\f', '\0']);
const DELIM = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

function tokenize(text: string): Item[] {
  const root: Item[] = [];
  const stack: Item[][] = [root];
  const push = (item: Item) => (stack[stack.length - 1] as Item[]).push(item);
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i] as string;
    if (WS.has(c)) {
      i++;
    } else if (c === '%') {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i++;
    } else if (c === '(') {
      let depth = 1;
      let v = '';
      i++;
      while (i < n && depth > 0) {
        const d = text[i] as string;
        if (d === '\\') {
          v += text[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (d === '(') depth++;
        else if (d === ')') depth--;
        if (depth > 0) v += d;
        i++;
      }
      push({ k: 'str', v });
    } else if (c === '<' && text[i + 1] === '<') {
      push({ k: 'op', v: '<<' });
      i += 2;
    } else if (c === '>' && text[i + 1] === '>') {
      push({ k: 'op', v: '>>' });
      i += 2;
    } else if (c === '<') {
      const end = text.indexOf('>', i);
      if (end < 0) break;
      push({ k: 'str', v: text.slice(i + 1, end).replace(/\s+/g, '') });
      i = end + 1;
    } else if (c === '{') {
      stack.push([]);
      i++;
    } else if (c === '}') {
      if (stack.length > 1) {
        const body = stack.pop() as Item[];
        push({ k: 'proc', v: body });
      }
      i++;
    } else if (c === '[' || c === ']') {
      push({ k: 'op', v: c });
      i++;
    } else if (c === ')' || c === '>') {
      i++;
    } else if (c === '/') {
      let j = i + 1;
      while (j < n && !WS.has(text[j] as string) && !DELIM.has(text[j] as string)) j++;
      push({ k: 'lit', v: text.slice(i + 1, j) });
      i = j;
    } else {
      let j = i;
      while (j < n && !WS.has(text[j] as string) && !DELIM.has(text[j] as string)) j++;
      const word = text.slice(i, j);
      i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(word)) push(Number(word));
      else if (/^\d+#[0-9a-zA-Z]+$/.test(word)) {
        const [radix, digits] = word.split('#') as [string, string];
        push(parseInt(digits, Number(radix)));
      } else push({ k: 'op', v: word });
    }
  }
  while (stack.length > 1) {
    const body = stack.pop() as Item[];
    (stack[stack.length - 1] as Item[]).push({ k: 'proc', v: body });
  }
  return root;
}

// ── Interpreter ──

interface SubPath {
  anchors: Anchor[];
  closed: boolean;
}

interface GState {
  ctm: Matrix;
  fill: Color;
  stroke: Color;
  width: number;
  cap: StrokeStyle['cap'];
  join: StrokeStyle['join'];
  miter: number;
  dash: number[] | null;
  evenOdd: boolean;
  /** Depth of the container stack when this state was saved (a `clip` opens containers that `grestore` closes). */
  depth: number;
}

const BLACK: Color = { model: 'gray', values: [100] };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const rgb = (r: number, g: number, b: number): Color => ({ model: 'rgb', values: [clamp01(r) * 255, clamp01(g) * 255, clamp01(b) * 255].map((v) => Math.round(v * 100) / 100) });
const gray = (g: number): Color => ({ model: 'gray', values: [(1 - clamp01(g)) * 100] });
const cmyk = (c: number, m: number, y: number, k: number): Color => ({ model: 'cmyk', values: [c, m, y, k].map((v) => Math.round(clamp01(v) * 10000) / 100) });

class Halt extends Error {}
class ExitLoop extends Error {}

export function readEps(bytes: Uint8Array, ids: IdGenerator): EpsResult {
  let text = postscriptOf(bytes);
  if (!text.startsWith('%!')) throw new EpsFormatError('not a PostScript file');
  const [llx, lly, urx, ury] = boundingBox(text);
  const warnings: EpsWarning[] = [];
  const illustrator = /^%%Creator:.*Illustrator/m.test(text) || /^%AI\d*_/m.test(text);
  if (illustrator) text = stripIllustrator(text, warnings);
  const program = tokenize(text);

  // Output containers: where finished objects go. A clip opens a container that `grestore` (or `Q`) closes.
  const root: Node[] = [];
  const containers: Node[][] = [root];
  const top = () => containers[containers.length - 1] as Node[];
  let nodeCount = 0;

  const stack: Val[] = [];
  const dicts: Dict[] = [{ k: 'dict', v: new Map() }];
  const gstack: GState[] = [];
  let gs: GState = { ctm: IDENTITY, fill: BLACK, stroke: BLACK, width: 1, cap: 'butt', join: 'miter', miter: 10, dash: null, evenOdd: false, depth: 1 };
  let subpaths: SubPath[] = [];
  let open: SubPath | null = null;
  let cur: Vec2 | null = null;
  let start: Vec2 | null = null;
  /** AI compound path in progress: subpaths painted so far plus the appearance of the last one. */
  let compound: { paths: PathNode[]; items: AppearanceItem[]; evenOdd: boolean } | null = null;
  /** AI `q … Q` clipping groups waiting for their mask (`W`). */
  const aiClips: Array<{ group: ClipGroupNode; depth: number }> = [];
  const aiGroups: number[] = [];
  let steps = 0;
  let halted = false;

  const warn = (code: EpsWarning['code'], detail?: string) => {
    if (!warnings.some((w) => w.code === code && w.detail === detail)) warnings.push({ code, detail });
  };

  const pop = (): Val => {
    if (stack.length === 0) throw new EpsFormatError('stack underflow');
    return stack.pop() as Val;
  };
  const num = (): number => {
    const v = pop();
    if (typeof v !== 'number') throw new EpsFormatError('number expected');
    return v;
  };
  const nums = (count: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.unshift(num());
    return out;
  };

  const toDevice = (x: number, y: number): Vec2 => applyToPoint(gs.ctm, { x, y });
  const userOf = (p: Vec2): Vec2 => {
    const inv = invert(gs.ctm);
    return inv ? applyToPoint(inv, p) : p;
  };
  const scaleFactor = () => Math.sqrt(Math.abs(gs.ctm[0] * gs.ctm[3] - gs.ctm[1] * gs.ctm[2])) || 1;

  // ── Paths ──
  const corner = (p: Vec2): Anchor => ({ p, in: null, out: null, kind: 'corner' });
  const moveTo = (p: Vec2) => {
    open = { anchors: [corner(p)], closed: false };
    subpaths.push(open);
    cur = p;
    start = p;
  };
  const ensure = (): SubPath | null => {
    if (open && !open.closed) return open;
    if (!cur) return null; // PostScript raises nocurrentpoint
    open = { anchors: [corner(start ?? cur)], closed: false };
    subpaths.push(open);
    return open;
  };
  const lineTo = (p: Vec2) => {
    const sp = ensure();
    if (!sp) return;
    sp.anchors.push(corner(p));
    cur = p;
  };
  const curveTo = (c1: Vec2, c2: Vec2, p: Vec2) => {
    const sp = ensure();
    if (!sp) return;
    (sp.anchors[sp.anchors.length - 1] as Anchor).out = c1;
    sp.anchors.push({ p, in: c2, out: null, kind: 'corner' });
    cur = p;
  };
  const closePath = () => {
    if (open && !open.closed) {
      open.closed = true;
      cur = start;
    }
  };
  const newPath = () => {
    subpaths = [];
    open = null;
    cur = null;
    start = null;
  };

  /** Subpaths in artboard space (Y flipped), a closing duplicate of the first point folded into it. */
  const finishedPaths = (): PathNode[] => {
    const out: PathNode[] = [];
    for (const sp of subpaths) {
      if (sp.anchors.length === 0 || (sp.anchors.length === 1 && !sp.closed)) continue;
      const flip = (p: Vec2): Vec2 => ({ x: Math.round((p.x - llx) * 1000) / 1000, y: Math.round((ury - p.y) * 1000) / 1000 });
      let anchors: Anchor[] = sp.anchors.map((a) => ({ p: flip(a.p), in: a.in ? flip(a.in) : null, out: a.out ? flip(a.out) : null, kind: 'corner' as const }));
      if (sp.closed && anchors.length > 2) {
        const first = anchors[0] as Anchor;
        const last = anchors[anchors.length - 1] as Anchor;
        if (Math.abs(first.p.x - last.p.x) < 1e-6 && Math.abs(first.p.y - last.p.y) < 1e-6) {
          first.in = last.in;
          anchors = anchors.slice(0, -1);
        }
      }
      out.push(createPath(ids, anchors, sp.closed));
    }
    return out;
  };

  const strokeStyle = (): StrokeStyle => {
    const k = scaleFactor();
    return { ...defaultStroke(), width: Math.max(0, gs.width * k), cap: gs.cap, join: gs.join, miterLimit: gs.miter, dash: gs.dash && gs.dash.length > 0 ? gs.dash.map((d) => d * k) : null };
  };
  const itemsFor = (fill: boolean, stroke: boolean): AppearanceItem[] => {
    const items: AppearanceItem[] = [];
    if (fill) items.push({ kind: 'fill', paint: { type: 'solid', color: gs.fill }, opacity: 1, modifiers: [] });
    if (stroke) items.push({ kind: 'stroke', paint: { type: 'solid', color: gs.stroke }, stroke: strokeStyle(), opacity: 1, modifiers: [] });
    return items;
  };

  const emit = (node: Node) => {
    if (++nodeCount > MAX_NODES) {
      warn('limit');
      throw new Halt();
    }
    top().push(node);
  };

  /** Paints the current path; `evenOdd` is the fill rule for this operation. */
  const paint = (fill: boolean, stroke: boolean, evenOdd = gs.evenOdd) => {
    const paths = finishedPaths();
    if (paths.length === 0) return;
    const items = itemsFor(fill, stroke);
    if (compound) {
      compound.paths.push(...paths);
      compound.items = items;
      compound.evenOdd = evenOdd;
      return;
    }
    if (paths.length === 1) {
      const node = paths[0] as PathNode;
      node.appearance = { items };
      emit(node);
    } else {
      const node = createCompound(ids, paths, evenOdd ? 'evenodd' : 'nonzero');
      node.appearance = { items };
      emit(node);
    }
  };

  /** The current path becomes a clip: a clip group opens and the following objects go inside it. */
  const clip = (evenOdd: boolean, group?: ClipGroupNode) => {
    const paths = finishedPaths();
    if (paths.length === 0) return;
    const mask: Node = paths.length === 1 ? (paths[0] as PathNode) : createCompound(ids, paths, evenOdd ? 'evenodd' : 'nonzero');
    mask.appearance = { items: [] };
    const target = group ?? createClipGroup(ids, []);
    target.children = [mask] as ClipGroupNode['children'];
    if (!group) emit(target);
    containers.push(target.children as unknown as Node[]);
  };

  const grestoreTo = (depth: number) => {
    while (containers.length > depth) containers.pop();
  };

  // ── Execution ──
  const lookup = (name: string): Val | undefined => {
    for (let i = dicts.length - 1; i >= 0; i--) {
      const v = (dicts[i] as Dict).v.get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  const run = (items: readonly Item[], depth: number) => {
    if (depth > 200) throw new EpsFormatError('recursion too deep');
    for (let i = 0; i < items.length; i++) {
      if (halted) return;
      if (++steps > MAX_STEPS) {
        warn('limit');
        throw new Halt();
      }
      const item = items[i] as Item;
      if (typeof item === 'number' || typeof item === 'boolean') {
        stack.push(item);
        continue;
      }
      if (item.k === 'op') {
        exec(item.v, depth);
        continue;
      }
      // Procedures in the program are pushed, not run, unless the next operator runs them.
      stack.push(item);
    }
  };

  const runVal = (v: Val, depth: number) => {
    if (typeof v === 'object' && v.k === 'proc') run(v.v, depth + 1);
    else stack.push(v);
  };

  const ARITH: Record<string, (a: number, b: number) => number> = {
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    mul: (a, b) => a * b,
    div: (a, b) => (b === 0 ? 0 : a / b),
    idiv: (a, b) => (b === 0 ? 0 : Math.trunc(a / b)),
    mod: (a, b) => (b === 0 ? 0 : a % b),
    exp: (a, b) => a ** b,
    atan: (a, b) => ((Math.atan2(a, b) * 180) / Math.PI + 360) % 360,
  };
  const UNARY: Record<string, (a: number) => number> = {
    neg: (a) => -a,
    abs: Math.abs,
    sqrt: Math.sqrt,
    sin: (a) => Math.sin((a * Math.PI) / 180),
    cos: (a) => Math.cos((a * Math.PI) / 180),
    round: (a) => Math.round(a),
    floor: Math.floor,
    ceiling: Math.ceil,
    truncate: Math.trunc,
    cvi: Math.trunc,
    cvr: (a) => a,
    ln: Math.log,
    log: Math.log10,
  };
  const COMPARE: Record<string, (a: number, b: number) => boolean> = {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    gt: (a, b) => a > b,
    ge: (a, b) => a >= b,
    lt: (a, b) => a < b,
    le: (a, b) => a <= b,
  };
  const IGNORE_POP: Record<string, number> = {
    setflat: 1, i: 1, O: 1, R: 1, A: 1, XR: 1, setoverprint: 1, setstrokeadjust: 1, Xw: 1,
  };
  const IGNORED = new Set(['showpage', 'save', 'restore', 'initgraphics', 'initclip', 'clippath', 'flattenpath', 'bind', 'readonly', 'executeonly', 'LB', 'Lb', 'Ln', 'Bb', 'BB', 'Bg', 'Bc', 'Bh', 'Bm', 'Bd', 'BD', 'Bs', 'BS', 'Bn', 'Bf', 'XI', 'Xz', 'Xs', 'Np', 'Ns', 'TE', 'Tc', 'Pb', 'PB', 'Pn', 'Pc', 'Pe', 'Pr', 'Pt', 'PS', 'xt', 'Z', 'ps', 'gb', 'ge', 'Ap', 'AP', 'Ar', 'AR', 'Ac', 'AC']);
  const TEXT_OPS = new Set(['show', 'ashow', 'widthshow', 'awidthshow', 'kshow', 'xshow', 'yshow', 'xyshow', 'findfont', 'scalefont', 'setfont', 'selectfont', 'makefont', 'To', 'TO', 'Tp', 'TP', 'Tx', 'TX', 'Tj', 'Tr', 'Tf', 'Tl', 'Tm', 'Td', 'Ts', 'Tt', 'Tz', 'Ta', 'Tw', 'TA', 'TC', 'TW', 'TV', 'Tk', 'TL', 'TR', 'Tq', 'XT', 'Xt']);
  const IMAGE_OPS = new Set(['image', 'imagemask', 'colorimage', 'currentfile', 'eexec', 'readhexstring', 'readstring', 'filter', 'shfill', 'setpattern', 'makepattern', 'sethalftone', 'settransfer', 'Xh', 'XH', 'Xm', 'XM', 'XG', 'XF', 'XE', 'XD']);

  function exec(name: string, depth: number): void {
    // User definitions win over built-ins (PostScript prologs redefine `m`, `l`, …).
    const user = lookup(name);
    if (user !== undefined) {
      runVal(user, depth);
      return;
    }
    const ai = illustrator;
    switch (name) {
      // Stack
      case 'pop': pop(); return;
      case 'exch': { const b = pop(); const a = pop(); stack.push(b, a); return; }
      case 'dup': { const a = pop(); stack.push(a, a); return; }
      case 'clear': stack.length = 0; return;
      case 'count': stack.push(stack.length); return;
      case 'copy': { const n = num(); stack.push(...stack.slice(stack.length - n)); return; }
      case 'index': { const n = num(); stack.push(stack[stack.length - 1 - n] as Val); return; }
      case 'roll': {
        const j = num();
        const n = num();
        if (n <= 0 || n > stack.length) return;
        const part = stack.splice(stack.length - n, n);
        const k = ((j % n) + n) % n;
        stack.push(...part.slice(n - k), ...part.slice(0, n - k));
        return;
      }
      case 'mark': case '[': case '<<': stack.push({ k: 'mark' }); return;
      case ']': case '>>': {
        const at = stack.map((v) => typeof v === 'object' && v.k === 'mark').lastIndexOf(true);
        const items = stack.splice(at < 0 ? 0 : at + 1);
        if (at >= 0) stack.pop();
        stack.push(name === ']' ? { k: 'arr', v: items } : { k: 'dict', v: new Map() });
        return;
      }
      case 'true': stack.push(true); return;
      case 'false': stack.push(false); return;
      case 'matrix': stack.push({ k: 'arr', v: [1, 0, 0, 1, 0, 0] }); return;
      // Dictionaries and definitions
      case 'dict': pop(); stack.push({ k: 'dict', v: new Map() }); return;
      case 'begin': { const d = pop(); if (typeof d === 'object' && d.k === 'dict') dicts.push(d); return; }
      case 'end': if (dicts.length > 1) dicts.pop(); return;
      case 'userdict': case 'systemdict': case 'currentdict': case 'globaldict': stack.push(dicts[dicts.length - 1] as Dict); return;
      case 'def': { const v = pop(); const key = pop(); if (typeof key === 'object' && key.k === 'lit') (dicts[dicts.length - 1] as Dict).v.set(key.v, v); return; }
      case 'store': { const v = pop(); const key = pop(); if (typeof key === 'object' && key.k === 'lit') (dicts[dicts.length - 1] as Dict).v.set(key.v, v); return; }
      case 'load': { const key = pop(); if (typeof key === 'object' && key.k === 'lit') stack.push(lookup(key.v) ?? 0); return; }
      case 'known': { const key = pop(); const d = pop(); stack.push(typeof key === 'object' && key.k === 'lit' && typeof d === 'object' && d.k === 'dict' ? d.v.has(key.v) : false); return; }
      // Control
      case 'if': { const p = pop(); const c = pop(); if (c === true) runVal(p, depth); return; }
      case 'ifelse': { const b = pop(); const a = pop(); const c = pop(); runVal(c === true ? a : b, depth); return; }
      case 'repeat': { const p = pop(); const n = num(); try { for (let i = 0; i < n; i++) runVal(p, depth); } catch (e) { if (!(e instanceof ExitLoop)) throw e; } return; }
      case 'for': {
        const p = pop(); const limit = num(); const inc = num(); const init = num();
        try { for (let v = init; inc > 0 ? v <= limit : v >= limit; v += inc) { stack.push(v); runVal(p, depth); if (inc === 0) break; } } catch (e) { if (!(e instanceof ExitLoop)) throw e; }
        return;
      }
      case 'loop': { const p = pop(); try { for (;;) runVal(p, depth); } catch (e) { if (!(e instanceof ExitLoop)) throw e; } return; }
      case 'exit': throw new ExitLoop();
      case 'exec': runVal(pop(), depth); return;
      case 'and': { const b = pop(); const a = pop(); stack.push(typeof a === 'boolean' && typeof b === 'boolean' ? a && b : (a as number) & (b as number)); return; }
      case 'or': { const b = pop(); const a = pop(); stack.push(typeof a === 'boolean' && typeof b === 'boolean' ? a || b : (a as number) | (b as number)); return; }
      case 'not': { const a = pop(); stack.push(typeof a === 'boolean' ? !a : ~(a as number)); return; }
      // Graphics state
      case 'gsave': gstack.push({ ...gs, depth: containers.length }); return;
      case 'grestore': { const saved = gstack.pop(); if (saved) { gs = saved; grestoreTo(saved.depth); } return; }
      case 'translate': { const [x, y] = nums(2) as [number, number]; gs = { ...gs, ctm: multiply(gs.ctm, translation(x, y)) }; return; }
      case 'scale': { const [x, y] = nums(2) as [number, number]; gs = { ...gs, ctm: multiply(gs.ctm, scaling(x, y)) }; return; }
      case 'rotate': { const a = num(); gs = { ...gs, ctm: multiply(gs.ctm, rotation((a * Math.PI) / 180)) }; return; }
      case 'concat': { const m = pop(); if (typeof m === 'object' && m.k === 'arr' && m.v.length === 6) gs = { ...gs, ctm: multiply(gs.ctm, m.v as Matrix) }; return; }
      case 'setmatrix': { const m = pop(); if (typeof m === 'object' && m.k === 'arr' && m.v.length === 6) gs = { ...gs, ctm: m.v as Matrix }; return; }
      case 'currentmatrix': case 'defaultmatrix': { pop(); stack.push({ k: 'arr', v: [...(name === 'defaultmatrix' ? IDENTITY : gs.ctm)] }); return; }
      case 'setlinewidth': case 'w': gs = { ...gs, width: num() }; return;
      case 'setlinecap': case 'J': gs = { ...gs, cap: (['butt', 'round', 'square'] as const)[num()] ?? 'butt' }; return;
      case 'setlinejoin': case 'j': gs = { ...gs, join: (['miter', 'round', 'bevel'] as const)[num()] ?? 'miter' }; return;
      case 'setmiterlimit': gs = { ...gs, miter: num() }; return;
      case 'setdash': case 'd': {
        pop(); // phase
        const a = pop();
        const d = typeof a === 'object' && a.k === 'arr' ? (a.v.filter((x): x is number => typeof x === 'number')) : [];
        gs = { ...gs, dash: d.length === 0 || d.every((x) => x === 0) ? null : d };
        return;
      }
      case 'setgray': { const g = gray(num()); gs = { ...gs, fill: g, stroke: g }; return; }
      case 'setrgbcolor': { const [r, g, b] = nums(3) as [number, number, number]; gs = { ...gs, fill: rgb(r, g, b), stroke: rgb(r, g, b) }; return; }
      case 'setcmykcolor': { const [c, m, y, k] = nums(4) as [number, number, number, number]; gs = { ...gs, fill: cmyk(c, m, y, k), stroke: cmyk(c, m, y, k) }; return; }
      // Paths and painting
      case 'newpath': newPath(); return;
      case 'moveto': { const [x, y] = nums(2) as [number, number]; moveTo(toDevice(x, y)); return; }
      case 'lineto': { const [x, y] = nums(2) as [number, number]; lineTo(toDevice(x, y)); return; }
      case 'curveto': { const [a, b, c, d, e, f] = nums(6) as [number, number, number, number, number, number]; curveTo(toDevice(a, b), toDevice(c, d), toDevice(e, f)); return; }
      case 'rmoveto': case 'rlineto': {
        const [dx, dy] = nums(2) as [number, number];
        const u = userOf(cur ?? { x: 0, y: 0 });
        const p = toDevice(u.x + dx, u.y + dy);
        if (name === 'rmoveto') moveTo(p); else lineTo(p);
        return;
      }
      case 'rcurveto': {
        const [a, b, c, d, e, f] = nums(6) as [number, number, number, number, number, number];
        const u = userOf(cur ?? { x: 0, y: 0 });
        curveTo(toDevice(u.x + a, u.y + b), toDevice(u.x + c, u.y + d), toDevice(u.x + e, u.y + f));
        return;
      }
      case 'closepath': closePath(); return;
      case 'currentpoint': { const u = userOf(cur ?? { x: 0, y: 0 }); stack.push(u.x, u.y); return; }
      case 'fill': paint(true, false, false); newPath(); return;
      case 'eofill': paint(true, false, true); newPath(); return;
      case 'stroke': paint(false, true); newPath(); return;
      case 'clip': clip(false); return;
      case 'eoclip': clip(true); return;
      case 'rectfill': case 'rectstroke': case 'rectclip': {
        const [x, y, w, h] = nums(4) as [number, number, number, number];
        newPath();
        moveTo(toDevice(x, y)); lineTo(toDevice(x + w, y)); lineTo(toDevice(x + w, y + h)); lineTo(toDevice(x, y + h)); closePath();
        if (name === 'rectfill') paint(true, false, false); else if (name === 'rectstroke') paint(false, true); else clip(false);
        if (name !== 'rectclip') newPath();
        return;
      }
      default:
    }

    if (ai) {
      switch (name) {
        // Illustrator's compact path operators
        case 'm': { const [x, y] = nums(2) as [number, number]; moveTo({ x, y }); return; }
        case 'l': case 'L': { const [x, y] = nums(2) as [number, number]; lineTo({ x, y }); return; }
        case 'c': case 'C': { const [a, b, c, d, e, f] = nums(6) as [number, number, number, number, number, number]; curveTo({ x: a, y: b }, { x: c, y: d }, { x: e, y: f }); return; }
        case 'v': case 'V': { const [c, d, e, f] = nums(4) as [number, number, number, number]; curveTo(cur ?? { x: c, y: d }, { x: c, y: d }, { x: e, y: f }); return; }
        case 'y': case 'Y': { const [a, b, e, f] = nums(4) as [number, number, number, number]; curveTo({ x: a, y: b }, { x: e, y: f }, { x: e, y: f }); return; }
        case 'h': closePath(); return;
        case 'H': return;
        case 'f': closePath(); paint(true, false); newPath(); return;
        case 'F': paint(true, false); newPath(); return;
        case 's': closePath(); paint(false, true); newPath(); return;
        case 'S': paint(false, true); newPath(); return;
        case 'b': closePath(); paint(true, true); newPath(); return;
        case 'B': paint(true, true); newPath(); return;
        // Inside a compound path, `n` / `N` end a subpath that is painted by the group's last operator.
        case 'n': case 'N': { if (name === 'n') closePath(); if (compound) compound.paths.push(...finishedPaths()); newPath(); return; }
        case 'W': {
          const pending = aiClips[aiClips.length - 1];
          if (pending) clip(gs.evenOdd, pending.group);
          return;
        }
        // Colours
        case 'g': gs = { ...gs, fill: gray(num()) }; return;
        case 'G': gs = { ...gs, stroke: gray(num()) }; return;
        case 'k': { const [c, m, y, k] = nums(4) as [number, number, number, number]; gs = { ...gs, fill: cmyk(c, m, y, k) }; return; }
        case 'K': { const [c, m, y, k] = nums(4) as [number, number, number, number]; gs = { ...gs, stroke: cmyk(c, m, y, k) }; return; }
        case 'Xa': { const [r, g, b] = nums(3) as [number, number, number]; gs = { ...gs, fill: rgb(r, g, b) }; return; }
        case 'XA': { const [r, g, b] = nums(3) as [number, number, number]; gs = { ...gs, stroke: rgb(r, g, b) }; return; }
        case 'x': case 'X': {
          const tint = num();
          pop(); // colour name
          const [c, m, y, k] = nums(4) as [number, number, number, number];
          const t = clamp01(1 - tint);
          const color = cmyk(c * t, m * t, y * t, k * t);
          gs = name === 'x' ? { ...gs, fill: color } : { ...gs, stroke: color };
          return;
        }
        case 'M': gs = { ...gs, miter: num() }; return;
        case 'D': gs = { ...gs, evenOdd: num() === 1 }; return;
        // Groups, compound paths and clipping groups
        case 'u': { const g = createGroup(ids, []); emit(g); aiGroups.push(containers.length); containers.push(g.children as unknown as Node[]); return; }
        case 'U': { const depth = aiGroups.pop(); if (depth !== undefined) grestoreTo(depth); return; }
        case '*u': compound = { paths: [], items: [], evenOdd: gs.evenOdd }; return;
        case '*U': {
          const c = compound;
          compound = null;
          if (c && c.paths.length > 0) {
            const node = c.paths.length === 1 ? (c.paths[0] as PathNode) : createCompound(ids, c.paths, c.evenOdd ? 'evenodd' : 'nonzero');
            node.appearance = { items: c.items };
            emit(node);
          }
          return;
        }
        case 'q': { const g = createClipGroup(ids, []); emit(g); aiClips.push({ group: g, depth: containers.length }); return; }
        case 'Q': { const c = aiClips.pop(); if (c) grestoreTo(c.depth); return; }
        default:
      }
    }

    if (name in ARITH) { const b = num(); const a = num(); stack.push((ARITH[name] as (a: number, b: number) => number)(a, b)); return; }
    if (name in UNARY) { stack.push((UNARY[name] as (a: number) => number)(num())); return; }
    if (name in COMPARE) { const b = num(); const a = num(); stack.push((COMPARE[name] as (a: number, b: number) => boolean)(a, b)); return; }
    if (name in IGNORE_POP) { for (let i = 0; i < (IGNORE_POP[name] as number); i++) pop(); return; }
    if (IGNORED.has(name)) { if (ai) stack.length = 0; return; }
    if (TEXT_OPS.has(name)) { warn('text'); stack.length = 0; return; }
    if (IMAGE_OPS.has(name)) {
      warn(/^(image|imagemask|colorimage|currentfile|readhexstring|readstring|filter|eexec)$/.test(name) ? 'image' : name === 'shfill' || name.startsWith('X') ? 'gradient' : 'pattern');
      // Data that follows an image or a filter cannot be tokenized safely: stop here and keep what was drawn.
      if (/^(image|imagemask|colorimage|currentfile|eexec)$/.test(name)) {
        warn('halted');
        halted = true;
        throw new Halt();
      }
      stack.length = 0;
      return;
    }
    warn('operator', name);
    stack.length = 0;
  }

  try {
    run(program, 0);
  } catch (error) {
    if (!(error instanceof Halt)) {
      // A malformed or unsupported program keeps what was drawn before the failure.
      if (nodeCount === 0) throw error instanceof EpsFormatError ? error : new EpsFormatError(String(error));
      warn('halted', error instanceof Error ? error.message : String(error));
    }
  }
  return { width: urx - llx, height: ury - lly, nodes: root, warnings };
}
