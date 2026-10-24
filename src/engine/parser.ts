import {
  BUILTIN_ARITY,
  type BinOpName,
  type BuiltinName,
  type Expr,
  type FluxError,
  type ProvenanceMeta,
  type SourceRole,
  type Span,
} from './types';

export type TokenType = 'num' | 'ident' | 'kw' | 'sym' | 'eof';

export interface Token {
  type: TokenType;
  text: string;
  span: Span;
  num?: number;
}

export class FluxSyntaxError extends Error {
  readonly flux: FluxError;
  constructor(message: string, phase: 'lex' | 'parse', span?: Span) {
    super(span ? `${message} (line ${span.line}, col ${span.col})` : message);
    this.flux = { message: this.message, phase, span };
  }
}

const KEYWORDS = new Set(['let', 'in', 'if', 'then', 'else', 'true', 'false']);
export const BUILTINS = new Set<string>(Object.keys(BUILTIN_ARITY));
const SYMBOLS = ['->', '==', '!=', '<=', '>=', '&&', '||', '\\', '(', ')', '[', ']', ',', ';', '=', '+', '-', '*', '/', '%', '<', '>', ':'];

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const spanOf = (start: number, end: number, l: number, ls: number): Span => ({
    start,
    end,
    line: l,
    col: start - ls + 1,
  });

  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') {
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    if ((ch === '-' && src[i + 1] === '-') || (ch === '/' && src[i + 1] === '/')) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < src.length && /[0-9]/.test(src[i])) i++;
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) {
        i++;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
      }
      const text = src.slice(start, i);
      tokens.push({ type: 'num', text, num: Number(text), span: spanOf(start, i, line, lineStart) });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < src.length && /[A-Za-z0-9_']/.test(src[i])) i++;
      const text = src.slice(start, i);
      tokens.push({ type: KEYWORDS.has(text) ? 'kw' : 'ident', text, span: spanOf(start, i, line, lineStart) });
      continue;
    }
    const sym = SYMBOLS.find((s) => src.startsWith(s, i));
    if (sym) {
      tokens.push({ type: 'sym', text: sym, span: spanOf(i, i + sym.length, line, lineStart) });
      i += sym.length;
      continue;
    }
    throw new FluxSyntaxError(`Unexpected character '${ch}'`, 'lex', spanOf(i, i + 1, line, lineStart));
  }
  tokens.push({ type: 'eof', text: '<end of input>', span: spanOf(src.length, src.length, line, lineStart) });
  return tokens;
}

export class IdGen {
  private n = 0;
  next(): string {
    return `node_${this.n++}`;
  }
  get count(): number {
    return this.n;
  }
}

const BINARY_LEVELS: { ops: BinOpName[]; assoc: 'left' | 'right' }[] = [
  { ops: ['||'], assoc: 'left' },
  { ops: ['&&'], assoc: 'left' },
  { ops: ['==', '!=', '<', '>', '<=', '>='], assoc: 'left' },
  { ops: [':'], assoc: 'right' },
  { ops: ['+', '-'], assoc: 'left' },
  { ops: ['*', '/', '%'], assoc: 'left' },
];
const SECTION_OPS = new Set<string>(['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', ':', '&&', '||']);

export interface ParseResult {
  ast: Expr;
  ids: IdGen;
  source: string;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly src: string,
    readonly ids: IdGen,
  ) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }
  private advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }
  private is(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return (t.type === 'sym' || t.type === 'kw') && t.text === text;
  }
  private expect(text: string, context: string): Token {
    const t = this.peek();
    if ((t.type === 'sym' || t.type === 'kw') && t.text === text) return this.advance();
    throw new FluxSyntaxError(`Expected '${text}' ${context} but found '${t.text}'`, 'parse', t.span);
  }
  private expectIdent(context: string): Token {
    const t = this.peek();
    if (t.type !== 'ident') {
      throw new FluxSyntaxError(`Expected a variable name ${context} but found '${t.text}'`, 'parse', t.span);
    }
    if (BUILTINS.has(t.text)) {
      throw new FluxSyntaxError(`'${t.text}' is a built-in function and cannot be rebound`, 'parse', t.span);
    }
    return this.advance();
  }

  private meta(span: Span | undefined, literal = false): ProvenanceMeta {
    const id = this.ids.next();
    const text = span ? this.src.slice(span.start, span.end) : '';
    return {
      id,
      stepCreated: 0,
      rule: literal ? 'Source Literal' : 'Source',
      formula: literal ? `${text} (line ${span?.line ?? '?'})` : text.replace(/\s+/g, ' ').slice(0, 80),
      parentIds: [],
      sourceAstId: literal ? id : undefined,
      operator: literal ? 'literal' : 'structure',
    };
  }
  private join(a: Span, b: Span): Span {
    return { start: a.start, end: b.end, line: a.line, col: a.col };
  }

  parseProgram(): Expr {
    const e = this.parseExpr();
    const t = this.peek();
    if (t.type !== 'eof') {
      throw new FluxSyntaxError(`Unexpected '${t.text}' after end of expression`, 'parse', t.span);
    }
    return e;
  }

  parseExpr(): Expr {
    if (this.is('let')) return this.parseLet();
    if (this.is('if')) return this.parseIf();
    if (this.is('\\')) return this.parseLambda();
    return this.parseBinary(0);
  }

  private atBindingStart(): boolean {
    let k = 0;
    if (this.peek(k).type !== 'ident') return false;
    const prev = this.tokens[this.pos - 1];
    const fresh = !prev || prev.span.line < this.peek().span.line || prev.text === ';' || prev.text === ',';
    if (!fresh) return false;
    while (this.peek(k).type === 'ident') k++;
    return this.is('=', k);
  }

  private parseLet(): Expr {
    const letTok = this.expect('let', 'to start a binding');
    const bindings: { name: string; value: Expr; span: Span }[] = [];
    do {
      const nameTok = this.expectIdent("after 'let'");
      const params: string[] = [];
      while (this.peek().type === 'ident') params.push(this.expectIdent('as a parameter').text);
      this.expect('=', `in the binding of '${nameTok.text}'`);
      let value = this.parseExpr();
      if (params.length > 0) {
        const span = this.join(nameTok.span, value.span ?? nameTok.span);
        value = { kind: 'lam', params, body: value, span, meta: this.meta(span) };
      }
      bindings.push({ name: nameTok.text, value, span: nameTok.span });
      if (this.is(';') || this.is(',')) this.advance();
    } while (this.atBindingStart());
    this.expect('in', 'after let bindings');
    const body = this.parseExpr();
    let result = body;
    for (let i = bindings.length - 1; i >= 0; i--) {
      const b = bindings[i];
      const span = this.join(i === 0 ? letTok.span : b.span, result.span ?? b.span);
      result = { kind: 'let', name: b.name, value: b.value, body: result, span, meta: this.meta(span) };
    }
    return result;
  }

  private parseIf(): Expr {
    const ifTok = this.expect('if', '');
    const cond = this.parseExpr();
    this.expect('then', 'after the if-condition');
    const thenE = this.parseExpr();
    this.expect('else', 'after the then-branch');
    const elseE = this.parseExpr();
    const span = this.join(ifTok.span, elseE.span ?? ifTok.span);
    return { kind: 'if', cond, then: thenE, else: elseE, span, meta: this.meta(span) };
  }

  private parseLambda(): Expr {
    const lamTok = this.expect('\\', '');
    const params: string[] = [];
    while (this.peek().type === 'ident') params.push(this.expectIdent('as a lambda parameter').text);
    if (params.length === 0) {
      throw new FluxSyntaxError("A lambda needs at least one parameter: \\x -> ...", 'parse', this.peek().span);
    }
    this.expect('->', 'after lambda parameters');
    const body = this.parseExpr();
    const span = this.join(lamTok.span, body.span ?? lamTok.span);
    return { kind: 'lam', params, body, span, meta: this.meta(span) };
  }

  private parseBinary(level: number): Expr {
    if (level >= BINARY_LEVELS.length) return this.parseUnary();
    const { ops, assoc } = BINARY_LEVELS[level];
    const left = this.parseBinary(level + 1);
    const t = this.peek();
    if (t.type === 'sym' && (ops as string[]).includes(t.text)) {
      if (assoc === 'right') {
        this.advance();
        const right = this.parseOperand(level);
        return this.mkBin(t.text as BinOpName, left, right);
      }
      let acc = left;
      while (this.peek().type === 'sym' && (ops as string[]).includes(this.peek().text)) {
        const op = this.advance().text as BinOpName;
        const right = this.parseOperand(level + 1);
        acc = this.mkBin(op, acc, right);
      }
      return acc;
    }
    return left;
  }

  private parseOperand(level: number): Expr {
    if (this.is('let') || this.is('if') || this.is('\\')) return this.parseExpr();
    return this.parseBinary(level);
  }

  private mkBin(op: BinOpName, left: Expr, right: Expr): Expr {
    const span = left.span && right.span ? this.join(left.span, right.span) : left.span ?? right.span;
    return { kind: 'binop', op, left, right, span, meta: this.meta(span) };
  }

  private parseUnary(): Expr {
    if (this.is('-')) {
      const minus = this.advance();
      const next = this.peek();
      if (next.type === 'num' && next.span.start === minus.span.end) {
        this.advance();
        const span = this.join(minus.span, next.span);
        return { kind: 'num', value: -(next.num as number), span, meta: this.meta(span, true) };
      }
      const operand = this.parseUnary();
      const span = this.join(minus.span, operand.span ?? minus.span);
      const zero: Expr = {
        kind: 'num',
        value: 0,
        meta: { ...this.meta(undefined), rule: 'Negation (implicit 0)', formula: '0', operator: 'structure' },
      };
      return { kind: 'binop', op: '-', left: zero, right: operand, span, meta: this.meta(span) };
    }
    return this.parseApp();
  }

  private startsAtom(): boolean {
    const t = this.peek();
    if (t.type === 'num' || t.type === 'ident') return !this.atBindingStart();
    if (t.type === 'kw') return t.text === 'true' || t.text === 'false';
    return t.type === 'sym' && (t.text === '(' || t.text === '[');
  }

  private parseApp(): Expr {
    const fn = this.parseAtom();
    const args: Expr[] = [];
    while (this.startsAtom() || this.is('\\')) {
      if (this.is('\\')) {
        args.push(this.parseLambda());
        break;
      }
      args.push(this.parseAtom());
    }
    if (args.length === 0) return fn;
    const last = args[args.length - 1];
    const span = fn.span && last.span ? this.join(fn.span, last.span) : fn.span;
    return { kind: 'app', fn, args, span, meta: this.meta(span) };
  }

  private parseAtom(): Expr {
    const t = this.peek();
    if (t.type === 'num') {
      this.advance();
      return { kind: 'num', value: t.num as number, span: t.span, meta: this.meta(t.span, true) };
    }
    if (t.type === 'kw' && (t.text === 'true' || t.text === 'false')) {
      this.advance();
      return { kind: 'bool', value: t.text === 'true', span: t.span, meta: this.meta(t.span, true) };
    }
    if (t.type === 'ident') {
      this.advance();
      if (BUILTINS.has(t.text)) {
        return { kind: 'builtin', name: t.text as BuiltinName, span: t.span, meta: this.meta(t.span) };
      }
      return { kind: 'var', name: t.text, span: t.span, meta: this.meta(t.span) };
    }
    if (this.is('(')) {
      const open = this.advance();
      const opTok = this.peek();
      if (opTok.type === 'sym' && SECTION_OPS.has(opTok.text) && this.is(')', 1)) {
        this.advance();
        const close = this.advance();
        const span = this.join(open.span, close.span);
        const a: Expr = { kind: 'var', name: '_a', meta: this.meta(undefined) };
        const b: Expr = { kind: 'var', name: '_b', meta: this.meta(undefined) };
        const body: Expr = { kind: 'binop', op: opTok.text as BinOpName, left: a, right: b, meta: this.meta(span) };
        return { kind: 'lam', params: ['_a', '_b'], body, span, meta: this.meta(span) };
      }
      const first = this.parseExpr();
      if (this.is(',')) {
        const items = [first];
        while (this.is(',')) {
          this.advance();
          items.push(this.parseExpr());
        }
        const close = this.expect(')', 'to close the tuple');
        const span = this.join(open.span, close.span);
        return { kind: 'tuple', items, span, meta: this.meta(span) };
      }
      this.expect(')', 'to close the parenthesis');
      return first;
    }
    if (this.is('[')) {
      const open = this.advance();
      const items: Expr[] = [];
      if (!this.is(']')) {
        items.push(this.parseExpr());
        while (this.is(',')) {
          this.advance();
          items.push(this.parseExpr());
        }
      }
      const close = this.expect(']', 'to close the list');
      const span = this.join(open.span, close.span);
      return { kind: 'list', items, span, meta: this.meta(span) };
    }
    throw new FluxSyntaxError(`Unexpected '${t.text}'`, 'parse', t.span);
  }
}

export function parse(source: string, ids: IdGen = new IdGen()): ParseResult {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, source, ids);
  const ast = parser.parseProgram();
  return { ast, ids, source };
}

function shortText(src: string, span: Span | undefined, max = 28): string {
  if (!span) return '';
  const t = src.slice(span.start, span.end).replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const BUILTIN_ARG_NAMES: Record<BuiltinName, string[]> = {
  map: ['function', 'input list'],
  fold: ['function', 'initial accumulator', 'input list'],
  filter: ['predicate', 'input list'],
  reverse: ['input list'],
  zip: ['left list', 'right list'],
  range: ['range start', 'range end'],
  fst: ['pair'],
  snd: ['pair'],
};

export function collectSourceRoles(ast: Expr, src: string): Map<string, SourceRole> {
  const roles = new Map<string, SourceRole>();
  interface Ctx {
    lambda?: string;
    binding?: string;
    list?: string;
    arg?: string;
  }
  const visit = (e: Expr, ctx: Ctx): void => {
    switch (e.kind) {
      case 'num':
      case 'bool': {
        if (!e.span) return;
        let role: SourceRole;
        if (ctx.list) role = { kind: 'list-element', description: ctx.list };
        else if (ctx.lambda) role = { kind: 'lambda-constant', description: `constant in lambda ${ctx.lambda}` };
        else if (ctx.binding) role = { kind: 'let-binding', description: `let-bound value '${ctx.binding}'` };
        else if (ctx.arg) role = { kind: 'argument', description: ctx.arg };
        else role = { kind: 'constant', description: 'constant' };
        roles.set(e.meta.id, role);
        return;
      }
      case 'list':
        e.items.forEach((item, i) => {
          const owner = ctx.binding ? `'${ctx.binding}'` : ctx.arg ? `the ${ctx.arg}` : 'list';
          const desc =
            item.kind === 'list'
              ? `row ${i} of ${owner}`
              : ctx.list
                ? `${ctx.list}, column ${i}`
                : `element #${i} of ${owner}`;
          if (item.kind === 'list') {
            item.items.forEach((cell, j) => visit(cell, { ...ctx, list: `${desc}, column ${j}` }));
          } else {
            visit(item, { ...ctx, list: desc });
          }
        });
        return;
      case 'tuple':
        e.items.forEach((item, i) => visit(item, { ...ctx, list: `component ${i} of tuple ${shortText(src, e.span)}` }));
        return;
      case 'lam':
        visit(e.body, { lambda: shortText(src, e.span), binding: ctx.binding });
        return;
      case 'let':
        visit(e.value, { binding: e.name, lambda: ctx.lambda });
        visit(e.body, ctx);
        return;
      case 'app': {
        visit(e.fn, ctx);
        const names = e.fn.kind === 'builtin' ? BUILTIN_ARG_NAMES[e.fn.name] : undefined;
        e.args.forEach((a, i) => {
          const argName = names?.[i] ? `${names[i]} of ${(e.fn as { name: string }).name}` : `argument ${i + 1} of ${shortText(src, e.fn.span, 16)}`;
          visit(a, { ...ctx, list: undefined, arg: argName, binding: ctx.binding && !ctx.lambda ? ctx.binding : undefined });
        });
        return;
      }
      case 'binop':
        visit(e.left, ctx);
        visit(e.right, ctx);
        return;
      case 'if':
        visit(e.cond, ctx);
        visit(e.then, ctx);
        visit(e.else, ctx);
        return;
      default:
        return;
    }
  };
  visit(ast, {});
  return roles;
}
