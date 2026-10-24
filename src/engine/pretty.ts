import type { BinOpName, Expr } from './types';

export interface PNode {
  id?: string;
  cls?: 'kw' | 'num' | 'bool' | 'op' | 'var' | 'builtin' | 'punct' | 'meta' | 'dim';
  children: (string | PNode)[];
}

export function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(6)));
}

const BIN_PREC: Record<BinOpName, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 3,
  '>': 3,
  '<=': 3,
  '>=': 3,
  ':': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};
const APP_PREC = 9;
const ATOM_PREC = 10;

function precOf(e: Expr): number {
  switch (e.kind) {
    case 'guard':
      return precOf(e.body);
    case 'binop':
      return BIN_PREC[e.op];
    case 'app':
      return APP_PREC;
    case 'lam':
    case 'let':
    case 'if':
      return 0;
    case 'num':
      return e.value < 0 ? 8 : ATOM_PREC;
    case 'hof':
      return e.op === 'fold' ? APP_PREC : 7;
    default:
      return ATOM_PREC;
  }
}

const leaf = (text: string, cls?: PNode['cls'], id?: string): PNode => ({ id, cls, children: [text] });

function wrap(e: Expr, minPrec: number): PNode {
  const inner = tree(e);
  if (precOf(e) >= minPrec) return inner;
  return { children: [leaf('(', 'punct'), inner, leaf(')', 'punct')] };
}

function commaList(items: PNode[], open: string, close: string): PNode[] {
  const out: PNode[] = [leaf(open, 'punct')];
  items.forEach((it, i) => {
    if (i > 0) out.push(leaf(', ', 'punct'));
    out.push(it);
  });
  out.push(leaf(close, 'punct'));
  return out;
}

function sectionOp(e: Expr): string | null {
  if (e.kind !== 'lam' || e.params.length !== 2 || e.params[0] !== '_a' || e.params[1] !== '_b') return null;
  const b = e.body;
  if (b.kind === 'binop' && b.left.kind === 'var' && b.left.name === '_a' && b.right.kind === 'var' && b.right.name === '_b') {
    return b.op;
  }
  return null;
}

export function tree(e: Expr): PNode {
  const id = e.meta.id;
  switch (e.kind) {
    case 'guard':
      return { id, children: [tree(e.body)] };
    case 'num':
      return leaf(fmtNum(e.value), 'num', id);
    case 'bool':
      return leaf(e.value ? 'true' : 'false', 'bool', id);
    case 'var':
      return leaf(e.name, 'var', id);
    case 'builtin':
      return leaf(e.name, 'builtin', id);
    case 'list':
      return { id, children: commaList(e.items.map(tree), '[', ']') };
    case 'tuple':
      return { id, children: commaList(e.items.map(tree), '(', ')') };
    case 'lam': {
      const sec = sectionOp(e);
      if (sec) return leaf(`(${sec})`, 'op', id);
      return { id, children: [leaf('\\', 'kw'), leaf(e.params.join(' '), 'var'), leaf(' -> ', 'kw'), tree(e.body)] };
    }
    case 'app': {
      const parts: (string | PNode)[] = [wrap(e.fn, APP_PREC)];
      for (const a of e.args) parts.push(' ', wrap(a, ATOM_PREC));
      return { id, children: parts };
    }
    case 'binop': {
      const p = BIN_PREC[e.op];
      const rightAssoc = e.op === ':';
      return {
        id,
        children: [
          wrap(e.left, rightAssoc ? p + 1 : p),
          leaf(` ${e.op} `, 'op'),
          wrap(e.right, rightAssoc ? p : p + 1),
        ],
      };
    }
    case 'if':
      return {
        id,
        children: [leaf('if ', 'kw'), tree(e.cond), leaf(' then ', 'kw'), tree(e.then), leaf(' else ', 'kw'), tree(e.else)],
      };
    case 'let':
      return {
        id,
        children: [leaf('let ', 'kw'), leaf(e.name, 'var'), leaf(' = ', 'op'), tree(e.value), leaf(' in', 'kw'), '\n', tree(e.body)],
      };
    case 'hof': {
      if (e.op === 'fold') {
        const rest = e.source.slice(e.index + 1);
        return {
          id,
          children: [
            leaf('fold ', 'builtin'),
            wrap(e.fn, ATOM_PREC),
            ' ',
            wrap(e.current, ATOM_PREC),
            ' ',
            { children: commaList(rest.map(tree), '[', ']') },
          ],
        };
      }
      const cells: PNode[] = [];
      if (e.op === 'map') {
        e.results.forEach((r) => cells.push(tree(r)));
        cells.push(tree(e.current));
        e.source.slice(e.index + 1).forEach((s) => cells.push({ cls: 'dim', children: [tree(s)] }));
      } else {
        e.source.forEach((s, i) => {
          if (i < e.index) {
            cells.push({ cls: e.verdicts[i] ? undefined : 'dim', children: [leaf(e.verdicts[i] ? '✓' : '✗', 'meta'), tree(s)] });
          } else if (i === e.index) {
            cells.push({ children: [leaf('?', 'meta'), tree(s)] });
          } else {
            cells.push({ cls: 'dim', children: [tree(s)] });
          }
        });
      }
      return {
        id,
        children: [leaf(`${e.op} `, 'builtin'), wrap(e.fn, ATOM_PREC), leaf(' ▸ ', 'meta'), { children: commaList(cells, '[', ']') }],
      };
    }
  }
}

export function flatten(n: PNode | string): string {
  if (typeof n === 'string') return n;
  return n.children.map(flatten).join('');
}

export function prettyString(e: Expr, max = Infinity): string {
  const s = flatten(tree(e)).replace(/\s*\n\s*/g, ' ');
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}

export function prettyMultiline(e: Expr): string {
  return flatten(tree(e));
}
