// A small XML reader for SVG files: elements, attributes, text, CDATA, comments, entities. The core has no DOM
// (so no DOMParser). It is deliberately strict about structure (an unbalanced file is an error, not a guess)
// and ignores everything it does not need (DTDs, processing instructions, namespaces beyond the prefix).

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlError';
  }
}

export interface XmlElement {
  /** Qualified name as written: `svg`, `linearGradient`, `xlink:href` for attributes. */
  name: string;
  attrs: Record<string, string>;
  children: Array<XmlElement | string>;
}

const MAX_DEPTH = 256;

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return safeCodePoint(Number.parseInt(body.slice(2), 16)) ?? whole;
    if (body.startsWith('#')) return safeCodePoint(Number.parseInt(body.slice(1), 10)) ?? whole;
    return NAMED[body] ?? whole;
  });
}

function safeCodePoint(code: number): string | null {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : null;
}

const isNameChar = (ch: string) => /[A-Za-z0-9_:.-]/.test(ch);
const isSpace = (ch: string) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';

/** Parses a document and returns its root element. Throws XmlError on malformed input. */
export function parseXml(source: string): XmlElement {
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = source.length;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;

  const fail = (message: string): never => {
    throw new XmlError(`${message} (position ${i})`);
  };
  const skipSpace = () => {
    while (i < n && isSpace(source.charAt(i))) i++;
  };
  const readName = (): string => {
    const start = i;
    while (i < n && isNameChar(source.charAt(i))) i++;
    if (i === start) fail('Name expected');
    return source.slice(start, i);
  };
  const pushText = (text: string) => {
    const top = stack[stack.length - 1];
    if (top && text.length > 0) {
      const last = top.children[top.children.length - 1];
      if (typeof last === 'string') top.children[top.children.length - 1] = last + text;
      else top.children.push(text);
    }
  };

  while (i < n) {
    if (source.charAt(i) !== '<') {
      const end = source.indexOf('<', i);
      const stop = end === -1 ? n : end;
      pushText(decodeEntities(source.slice(i, stop)));
      i = stop;
      continue;
    }
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end === -1) fail('Unterminated comment');
      i = end + 3;
    } else if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9);
      if (end === -1) fail('Unterminated CDATA');
      pushText(source.slice(i + 9, end));
      i = end + 3;
    } else if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i + 2);
      if (end === -1) fail('Unterminated processing instruction');
      i = end + 2;
    } else if (source.startsWith('<!', i)) {
      // DOCTYPE, possibly with an internal subset in brackets: skipped, entities defined there are not supported.
      let depth = 0;
      i += 2;
      while (i < n && !(depth === 0 && source.charAt(i) === '>')) {
        if (source.charAt(i) === '[') depth++;
        if (source.charAt(i) === ']') depth--;
        i++;
      }
      i++;
    } else if (source.startsWith('</', i)) {
      i += 2;
      const name = readName();
      skipSpace();
      if (source.charAt(i) !== '>') fail('Malformed closing tag');
      i++;
      const open = stack.pop();
      if (!open || open.name !== name) fail(`Unexpected closing tag </${name}>`);
    } else {
      i++;
      const name = readName();
      const attrs: Record<string, string> = {};
      for (;;) {
        skipSpace();
        const ch = source.charAt(i);
        if (ch === '>' || ch === '/' || i >= n) break;
        const key = readName();
        skipSpace();
        if (source.charAt(i) !== '=') fail(`Attribute ${key} has no value`);
        i++;
        skipSpace();
        const quote = source.charAt(i);
        if (quote !== '"' && quote !== "'") fail(`Attribute ${key} is not quoted`);
        const end = source.indexOf(quote, i + 1);
        if (end === -1) fail('Unterminated attribute');
        attrs[key] = decodeEntities(source.slice(i + 1, end));
        i = end + 1;
      }
      const element: XmlElement = { name, attrs, children: [] };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(element);
      else if (root) fail('More than one root element');
      else root = element;
      if (source.charAt(i) === '/') {
        i++;
        if (source.charAt(i) !== '>') fail('Malformed empty tag');
        i++;
      } else if (source.charAt(i) === '>') {
        i++;
        if (stack.length >= MAX_DEPTH) fail('Nesting too deep');
        stack.push(element);
      } else {
        fail('Unterminated tag');
      }
    }
  }
  if (stack.length > 0) fail(`Element <${stack[stack.length - 1]?.name}> is not closed`);
  if (!root) throw new XmlError('No root element');
  return root;
}

/** Concatenated text of an element and everything inside it. */
export function textContent(el: XmlElement): string {
  return el.children.map((c) => (typeof c === 'string' ? c : textContent(c))).join('');
}
