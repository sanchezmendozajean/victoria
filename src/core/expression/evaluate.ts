/**
 * Arithmetic in numeric fields, as Illustrator allows: `15 + 5` → `20`, `2 cm + 5 mm` → `25` (mm).
 * A small recursive-descent parser: no `eval`, no `Function` (specs/10 · Comportamiento de los campos numéricos).
 */

export interface EvaluateOptions {
  /** Size of each unit in any common base (e.g. points): `{ mm: 2.834, cm: 28.34, pt: 1 }`. */
  units?: Readonly<Record<string, number>>;
  /** Unit of the result and of bare numbers. Needs `units` to contain it. */
  defaultUnit?: string;
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'unit'; name: string }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | '^' | '(' | ')' };

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.,]/.test(ch)) {
      const match = /^(\d+([.,]\d*)?|[.,]\d+)/.exec(text.slice(i));
      if (!match) return null;
      tokens.push({ type: 'num', value: Number.parseFloat(match[0].replace(',', '.')) });
      i += match[0].length;
    } else if (/[a-zA-Z"]/.test(ch)) {
      const match = /^([a-zA-Z]+|")/.exec(text.slice(i));
      if (!match) return null;
      tokens.push({ type: 'unit', name: match[0] === '"' ? 'in' : match[0].toLowerCase() });
      i += match[0].length;
    } else if ('+-*/^()'.includes(ch)) {
      tokens.push({ type: 'op', op: ch as '+' });
      i++;
    } else if (ch === '×') {
      tokens.push({ type: 'op', op: '*' });
      i++;
    } else if (ch === '÷' || ch === '−') {
      tokens.push({ type: 'op', op: ch === '÷' ? '/' : '-' });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly options: EvaluateOptions,
  ) {}

  parse(): number | null {
    const value = this.expression();
    return value !== null && this.pos === this.tokens.length && Number.isFinite(value) ? value : null;
  }

  private peekOp(): string | null {
    const t = this.tokens[this.pos];
    return t?.type === 'op' ? t.op : null;
  }

  private expression(): number | null {
    let left = this.term();
    while (left !== null && (this.peekOp() === '+' || this.peekOp() === '-')) {
      const op = this.peekOp();
      this.pos++;
      const right = this.term();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private term(): number | null {
    let left = this.unary();
    while (left !== null && (this.peekOp() === '*' || this.peekOp() === '/')) {
      const op = this.peekOp();
      this.pos++;
      const right = this.unary();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private unary(): number | null {
    const op = this.peekOp();
    if (op === '-' || op === '+') {
      this.pos++;
      const value = this.unary();
      return value === null ? null : op === '-' ? -value : value;
    }
    return this.power();
  }

  private power(): number | null {
    const base = this.atom();
    if (base !== null && this.peekOp() === '^') {
      this.pos++;
      const exponent = this.unary();
      return exponent === null ? null : base ** exponent;
    }
    return base;
  }

  private atom(): number | null {
    const token = this.tokens[this.pos];
    if (!token) return null;
    if (token.type === 'op' && token.op === '(') {
      this.pos++;
      const value = this.expression();
      if (value === null || this.peekOp() !== ')') return null;
      this.pos++;
      return value;
    }
    if (token.type !== 'num') return null;
    this.pos++;
    const next = this.tokens[this.pos];
    if (next?.type !== 'unit') return token.value;
    this.pos++;
    return this.convert(token.value, next.name);
  }

  /** A number with a unit, expressed in the default unit. */
  private convert(value: number, unit: string): number | null {
    const { units, defaultUnit } = this.options;
    if (!units || !defaultUnit) return null;
    const from = units[unit];
    const to = units[defaultUnit];
    return from === undefined || to === undefined || to === 0 ? null : (value * from) / to;
  }
}

/** Returns the value (in `defaultUnit` when given) or null when the text is not a valid expression. */
export function evaluateExpression(text: string, options: EvaluateOptions = {}): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const tokens = tokenize(trimmed);
  return tokens ? new Parser(tokens, options).parse() : null;
}
